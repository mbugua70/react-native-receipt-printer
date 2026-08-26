package com.receiptprinter

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "ReceiptPrinterUsb"

/**
 * USB Host (Android only) ESC/POS bulk-transfer printing, ported from the
 * mzigo_app Expo module's MzigoUsbPrinterModule. Never caches
 * UsbDevice/UsbInterface objects across calls - devices are re-enumerated
 * from UsbManager.deviceList every time, so a replug (which changes
 * UsbDevice.deviceId) can never leave us holding a stale handle.
 */
class UsbPrinterHelper(private val reactContext: ReactApplicationContext) {

  companion object {
    private const val CHUNK_SIZE = 4096
    private const val BULK_TRANSFER_TIMEOUT_MS = 5000
    // Safety net only - a normal ACTION_USB_PERMISSION response (grant or
    // deny) arrives in well under a second.
    private const val PERMISSION_TIMEOUT_MS = 30_000L
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val printExecutor = Executors.newSingleThreadExecutor()

  private val usbManager: UsbManager?
    get() = reactContext.getSystemService(Context.USB_SERVICE) as? UsbManager

  // App-package-scoped so it can never collide with another app's identically
  // named broadcast action on the same device.
  private val usbPermissionAction: String
    get() = "${reactContext.packageName}.receiptprinter.USB_PERMISSION"

  // ---------------------------------------------------------------- discovery

  private data class PrinterMatch(val device: UsbDevice, val usbInterface: UsbInterface)

  /** Every USB_CLASS_PRINTER (7) interface on every currently attached device. */
  private fun findPrinterInterfaces(): List<PrinterMatch> {
    val manager = usbManager ?: return emptyList()
    val matches = mutableListOf<PrinterMatch>()
    for (device in manager.deviceList.values) {
      for (i in 0 until device.interfaceCount) {
        val intf = device.getInterface(i)
        if (intf.interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
          matches.add(PrinterMatch(device, intf))
        }
      }
    }
    return matches
  }

  // deviceId changes on replug, so this id is only good for the lifetime of
  // a single discover -> requestPermission -> print sequence, by design.
  private fun buildId(device: UsbDevice): String =
    "usb:${device.vendorId}:${device.productId}:${device.deviceId}"

  private fun parseId(id: String): Triple<Int, Int, Int>? {
    val parts = id.split(":")
    if (parts.size != 4 || parts[0] != "usb") return null
    val vendorId = parts[1].toIntOrNull() ?: return null
    val productId = parts[2].toIntOrNull() ?: return null
    val deviceId = parts[3].toIntOrNull() ?: return null
    return Triple(vendorId, productId, deviceId)
  }

  private fun findMatch(id: String): PrinterMatch? {
    val (vendorId, productId, deviceId) = parseId(id) ?: return null
    return findPrinterInterfaces().firstOrNull { (device, _) ->
      device.vendorId == vendorId && device.productId == productId && device.deviceId == deviceId
    }
  }

  private fun findBulkOutEndpoint(intf: UsbInterface): UsbEndpoint? {
    for (i in 0 until intf.endpointCount) {
      val ep = intf.getEndpoint(i)
      if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) {
        return ep
      }
    }
    return null
  }

  fun discoverPrinters(): WritableArray {
    val result = Arguments.createArray()
    for ((device, intf) in findPrinterInterfaces()) {
      val record = Arguments.createMap()
      record.putString("id", buildId(device))
      record.putString("deviceName", device.deviceName)
      record.putString("manufacturerName", runCatching { device.manufacturerName }.getOrNull())
      record.putString("productName", runCatching { device.productName }.getOrNull())
      record.putInt("vendorId", device.vendorId)
      record.putInt("productId", device.productId)
      record.putInt("interfaceId", intf.id)
      record.putInt("interfaceClass", intf.interfaceClass)
      record.putInt("interfaceSubclass", intf.interfaceSubclass)
      record.putInt("interfaceProtocol", intf.interfaceProtocol)
      result.pushMap(record)
    }
    return result
  }

  fun hasUsbPrinter(): Boolean = findPrinterInterfaces().isNotEmpty()

  // ---------------------------------------------------------------- permission

  fun requestUsbPermission(id: String, promise: Promise) {
    val manager = usbManager
    if (manager == null) {
      promise.resolve(
        permissionResult(granted = false, code = "NOT_SUPPORTED", error = "USB Host is not supported on this device.")
      )
      return
    }

    val match = findMatch(id)
    if (match == null) {
      Log.w(TAG, "requestUsbPermission: no attached printer matches id=$id")
      promise.resolve(
        permissionResult(granted = false, code = "NO_PRINTER_FOUND", error = "The selected USB printer is no longer attached.")
      )
      return
    }
    val device = match.device

    if (manager.hasPermission(device)) {
      promise.resolve(permissionResult(granted = true))
      return
    }

    val action = usbPermissionAction
    val resolved = AtomicBoolean(false)
    var receiverRef: BroadcastReceiver? = null

    val timeoutRunnable = Runnable {
      if (resolved.compareAndSet(false, true)) {
        Log.w(TAG, "requestUsbPermission: timed out waiting for a system dialog response for ${device.deviceName}")
        receiverRef?.let { runCatching { reactContext.unregisterReceiver(it) } }
        promise.resolve(
          permissionResult(granted = false, code = "PERMISSION_DENIED", error = "Permission request timed out.")
        )
      }
    }

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != action) return
        if (!resolved.compareAndSet(false, true)) return
        mainHandler.removeCallbacks(timeoutRunnable)
        runCatching { reactContext.unregisterReceiver(this) }

        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        if (granted) {
          promise.resolve(permissionResult(granted = true))
        } else {
          promise.resolve(
            permissionResult(granted = false, code = "PERMISSION_DENIED", error = "The user denied USB permission.")
          )
        }
      }
    }
    receiverRef = receiver

    ContextCompat.registerReceiver(reactContext, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)

    // FLAG_MUTABLE is REQUIRED here (not FLAG_IMMUTABLE): the system fills in
    // EXTRA_PERMISSION_GRANTED on the Intent it delivers back through this
    // PendingIntent, which it cannot do if the PendingIntent is immutable.
    val permissionIntent = PendingIntent.getBroadcast(
      reactContext,
      0,
      Intent(action).setPackage(reactContext.packageName),
      PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    mainHandler.postDelayed(timeoutRunnable, PERMISSION_TIMEOUT_MS)
    manager.requestPermission(device, permissionIntent)
  }

  private fun permissionResult(granted: Boolean, code: String? = null, error: String? = null): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("granted", granted)
    code?.let { map.putString("code", it) }
    error?.let { map.putString("error", it) }
    return map
  }

  // ---------------------------------------------------------------- printing

  fun printUsb(id: String, bytesBase64: String, promise: Promise) {
    printExecutor.execute {
      val result = try {
        performPrint(id, bytesBase64)
      } catch (e: Exception) {
        // Belt-and-suspenders: performPrint() already catches everything it
        // knows about, but nothing crosses the bridge as a raw throw.
        Log.e(TAG, "printUsb: unexpected exception", e)
        printFailure(e.message ?: "Unexpected error while printing.", "UNKNOWN_ERROR")
      }
      promise.resolve(result)
    }
  }

  private fun performPrint(id: String, bytesBase64: String): WritableMap {
    val manager = usbManager
      ?: return printFailure("USB Host is not supported on this device.", "NOT_SUPPORTED")

    val data = try {
      Base64.decode(bytesBase64, Base64.DEFAULT)
    } catch (e: IllegalArgumentException) {
      return printFailure("bytesBase64 is not valid base64.", "INVALID_ARGUMENT")
    }
    if (data.isEmpty()) {
      return printFailure("No bytes to print.", "INVALID_ARGUMENT")
    }

    val match = findMatch(id)
      ?: return printFailure("The selected USB printer is no longer attached.", "NO_PRINTER_FOUND")
    val device = match.device
    val intf = match.usbInterface

    if (!manager.hasPermission(device)) {
      Log.w(TAG, "printUsb: permission not granted for ${device.deviceName}")
      return printFailure(
        "USB permission has not been granted for this printer. Call requestUsbPermission first.",
        "PERMISSION_DENIED"
      )
    }

    val outEndpoint = findBulkOutEndpoint(intf)
      ?: return printFailure("No bulk OUT endpoint found on the printer's USB interface.", "NO_BULK_OUT_ENDPOINT")

    val connection: UsbDeviceConnection = manager.openDevice(device)
      ?: return printFailure("Failed to open the USB device.", "OPEN_DEVICE_FAILED")

    try {
      // force=true is mandatory on some hardware: the interface may already
      // be bound to the kernel's usblp driver, and force=true tells the
      // kernel to detach that driver so we can claim the interface
      // exclusively - without it, claimInterface() simply fails.
      if (!connection.claimInterface(intf, true)) {
        return printFailure("Failed to claim the USB printer interface.", "CLAIM_INTERFACE_FAILED")
      }

      var offset = 0
      while (offset < data.size) {
        val length = minOf(CHUNK_SIZE, data.size - offset)
        val sent = connection.bulkTransfer(outEndpoint, data, offset, length, BULK_TRANSFER_TIMEOUT_MS)
        if (sent <= 0) {
          Log.w(TAG, "printUsb: bulkTransfer failed at offset=$offset of ${data.size} (returned $sent)")
          // A detach mid-transfer and a generic stall both surface as a
          // non-positive return from bulkTransfer with no thrown exception -
          // disambiguate by checking whether the device is still enumerated.
          val stillAttached = findMatch(id) != null
          return printFailure(
            "USB transfer failed after $offset of ${data.size} bytes.",
            if (stillAttached) "BULK_TRANSFER_FAILED" else "DEVICE_DETACHED"
          )
        }
        offset += sent
      }
      val success = Arguments.createMap()
      success.putBoolean("success", true)
      return success
    } finally {
      // Always run, even on early return or exception, so the interface is
      // never left claimed by this process.
      runCatching { connection.releaseInterface(intf) }
      runCatching { connection.close() }
    }
  }

  private fun printFailure(message: String, code: String): WritableMap {
    val map = Arguments.createMap()
    map.putBoolean("success", false)
    map.putString("error", message)
    map.putString("code", code)
    return map
  }
}
