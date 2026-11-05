package com.receiptprinter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads an image and turns it into 8-bit grayscale for the JS print pipeline.
 *
 * - Sources: http(s) URLs, file://, content://, android.resource://, base64,
 *   and bare resource names (what `require('./logo.png')` resolves to in
 *   release builds).
 * - Transparent pixels are flattened onto white.
 * - Big images are subsampled while decoding (never below `minWidth` wide)
 *   so a large photo doesn't blow up memory on low-end POS devices.
 *
 * Resizing to the exact size, dithering and ESC/POS packing happen in JS.
 */
class ImageDecoderHelper(private val context: Context) {

  class DecodeException(val code: String, message: String, cause: Throwable? = null) :
    Exception(message, cause)

  class GrayImage(val width: Int, val height: Int, val pixels: ByteArray)

  fun decode(source: String, sourceType: String, minWidth: Int): GrayImage {
    val bytes = when (sourceType) {
      "base64" -> decodeBase64(source)
      "uri" -> loadUri(source)
      else -> throw DecodeException("INVALID_SOURCE", "Unknown image source type \"$sourceType\".")
    }
    return toGray(bytes, minWidth.coerceAtLeast(1))
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  private fun decodeBase64(source: String): ByteArray {
    try {
      val bytes = Base64.decode(source, Base64.DEFAULT)
      if (bytes.isEmpty()) throw DecodeException("INVALID_SOURCE", "Image base64 is empty.")
      return bytes
    } catch (e: IllegalArgumentException) {
      throw DecodeException("INVALID_SOURCE", "Image base64 is not valid.", e)
    }
  }

  private fun loadUri(source: String): ByteArray {
    val uri = Uri.parse(source)
    return when (uri.scheme?.lowercase()) {
      "http", "https" -> download(source)
      "file" -> {
        val path = uri.path ?: throw DecodeException("INVALID_SOURCE", "Bad file URI: $source")
        try {
          File(path).inputStream().use { readAll(it) }
        } catch (e: FileNotFoundException) {
          throw DecodeException("INVALID_SOURCE", "Image file not found: $path", e)
        }
      }
      "content", "android.resource" -> {
        val stream = try {
          context.contentResolver.openInputStream(uri)
        } catch (e: FileNotFoundException) {
          throw DecodeException("INVALID_SOURCE", "Image not found: $source", e)
        } catch (e: SecurityException) {
          throw DecodeException("INVALID_SOURCE", "No permission to read image: $source", e)
        } ?: throw DecodeException("INVALID_SOURCE", "Image not found: $source")
        stream.use { readAll(it) }
      }
      null -> loadResource(source)
      else -> throw DecodeException("INVALID_SOURCE", "Unsupported image URI scheme: ${uri.scheme}")
    }
  }

  /** A bundled asset in a release build is a resource name, e.g. "src_assets_logo". */
  private fun loadResource(name: String): ByteArray {
    val res = context.resources
    val pkg = context.packageName
    val clean = name.lowercase().substringBeforeLast('.')
    var id = res.getIdentifier(clean, "drawable", pkg)
    if (id == 0) id = res.getIdentifier(clean, "raw", pkg)
    if (id == 0) throw DecodeException("INVALID_SOURCE", "Bundled image \"$name\" not found.")
    return res.openRawResource(id).use { readAll(it) }
  }

  private fun download(url: String): ByteArray {
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        instanceFollowRedirects = true
      }
      val status = connection.responseCode
      if (status !in 200..299) {
        throw DecodeException("NETWORK", "Image download failed: HTTP $status")
      }
      return connection.inputStream.use { readAll(it) }
    } catch (e: DecodeException) {
      throw e
    } catch (e: IOException) {
      throw DecodeException("NETWORK", "Image download failed: ${e.message ?: e.javaClass.simpleName}", e)
    } finally {
      connection?.disconnect()
    }
  }

  private fun readAll(stream: InputStream): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    var total = 0
    while (true) {
      val n = stream.read(buffer)
      if (n < 0) break
      total += n
      if (total > MAX_SOURCE_BYTES) {
        throw DecodeException("TOO_LARGE", "Image file is larger than ${MAX_SOURCE_BYTES / (1024 * 1024)}MB.")
      }
      out.write(buffer, 0, n)
    }
    return out.toByteArray()
  }

  // ─── Decoding ─────────────────────────────────────────────────────────────

  /**
   * Whether the bytes start like an image format we know. Only used to word
   * the error once decoding has failed: the OS decides what it can read (it
   * also handles formats like ICO that aren't listed here).
   */
  private fun looksLikeImage(b: ByteArray): Boolean {
    fun at(i: Int, vararg v: Int) = b.size >= i + v.size && v.indices.all { (b[i + it].toInt() and 0xff) == v[it] }
    val known = at(0, 0x89, 0x50, 0x4E, 0x47) || // PNG
      at(0, 0xFF, 0xD8, 0xFF) || // JPEG
      at(0, 0x47, 0x49, 0x46) || // GIF
      (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) || // WEBP
      at(0, 0x42, 0x4D) || // BMP
      at(0, 0x00, 0x00, 0x01, 0x00) || // ICO
      at(4, 0x66, 0x74, 0x79, 0x70) // HEIF / AVIF (ftyp)
    return known
  }

  private fun decodeFailure(bytes: ByteArray): DecodeException =
    if (looksLikeImage(bytes)) {
      DecodeException("DECODE_FAILED", "The image is corrupted or could not be decoded.")
    } else {
      DecodeException("UNSUPPORTED_FORMAT", "Not a supported image format (use PNG or JPEG).")
    }

  private fun toGray(bytes: ByteArray, minWidth: Int): GrayImage {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val w0 = bounds.outWidth
    val h0 = bounds.outHeight
    if (w0 <= 0 || h0 <= 0) throw decodeFailure(bytes)

    // Halve while the result stays at least minWidth wide, then keep halving
    // if it's still too many pixels to hold comfortably.
    var sample = 1
    while (w0 / (sample * 2) >= minWidth) sample *= 2
    while ((w0.toLong() / sample) * (h0.toLong() / sample) > MAX_PIXELS) sample *= 2

    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    val bitmap = try {
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    } catch (e: OutOfMemoryError) {
      throw DecodeException("TOO_LARGE", "Not enough memory to decode the image.")
    } ?: throw decodeFailure(bytes)

    try {
      val w = bitmap.width
      val h = bitmap.height
      val gray = ByteArray(w * h)
      val row = IntArray(w)
      for (y in 0 until h) {
        bitmap.getPixels(row, 0, w, 0, y, w, 1)
        for (x in 0 until w) {
          val c = row[x]
          val a = (c ushr 24) and 0xff
          val r = (c shr 16) and 0xff
          val g = (c shr 8) and 0xff
          val b = c and 0xff
          val lum = (299 * r + 587 * g + 114 * b + 500) / 1000
          // composite over white: transparent → 255
          val v = 255 - ((255 - lum) * a + 127) / 255
          gray[y * w + x] = v.toByte()
        }
      }
      return GrayImage(w, h, gray)
    } finally {
      bitmap.recycle()
    }
  }

  companion object {
    private const val TIMEOUT_MS = 15_000
    private const val MAX_SOURCE_BYTES = 20 * 1024 * 1024
    private const val MAX_PIXELS = 4_000_000L
  }
}
