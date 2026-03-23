package com.receiptprinter

import com.facebook.react.bridge.ReactApplicationContext

class ReceiptPrinterModule(reactContext: ReactApplicationContext) :
  NativeReceiptPrinterSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeReceiptPrinterSpec.NAME
  }
}
