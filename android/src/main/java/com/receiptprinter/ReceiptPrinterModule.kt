package com.receiptprinter

import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class ReceiptPrinterModule(reactContext: ReactApplicationContext) :
  NativeReceiptPrinterSpec(reactContext) {

  private val imageDecoder = ImageDecoderHelper(reactContext)

  // Downloads and decoding run off the JS and native-modules threads.
  private val imageExecutor: ExecutorService = Executors.newFixedThreadPool(2)

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  override fun decodeImage(source: String, sourceType: String, minWidth: Double, promise: Promise) {
    imageExecutor.execute {
      try {
        val image = imageDecoder.decode(source, sourceType, minWidth.toInt())
        val result = Arguments.createMap().apply {
          putInt("width", image.width)
          putInt("height", image.height)
          putString("data", Base64.encodeToString(image.pixels, Base64.NO_WRAP))
        }
        promise.resolve(result)
      } catch (e: ImageDecoderHelper.DecodeException) {
        promise.reject(e.code, e.message, e)
      } catch (e: OutOfMemoryError) {
        promise.reject("TOO_LARGE", "Not enough memory to process the image.")
      } catch (e: Exception) {
        promise.reject("DECODE_FAILED", e.message ?: "The image could not be processed.", e)
      }
    }
  }

  override fun invalidate() {
    imageExecutor.shutdownNow()
    super.invalidate()
  }

  companion object {
    const val NAME = NativeReceiptPrinterSpec.NAME
  }
}
