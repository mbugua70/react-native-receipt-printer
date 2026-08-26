package com.receiptprinter

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class ReceiptPrinterModule(reactContext: ReactApplicationContext) :
  NativeReceiptPrinterSpec(reactContext) {

  private val usbPrinterHelper = UsbPrinterHelper(reactContext)

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  override fun discoverUsbPrinters(promise: Promise) {
    promise.resolve(usbPrinterHelper.discoverPrinters())
  }

  override fun hasUsbPrinter(promise: Promise) {
    promise.resolve(usbPrinterHelper.hasUsbPrinter())
  }

  override fun requestUsbPermission(id: String, promise: Promise) {
    usbPrinterHelper.requestUsbPermission(id, promise)
  }

  override fun printUsb(id: String, bytesBase64: String, promise: Promise) {
    usbPrinterHelper.printUsb(id, bytesBase64, promise)
  }

  companion object {
    const val NAME = NativeReceiptPrinterSpec.NAME
  }
}
