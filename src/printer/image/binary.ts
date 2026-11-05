/* eslint-disable no-bitwise -- packing pixels into ESC/POS bytes */
// ─── Binary helpers ───────────────────────────────────────────────────────────
//
// Small, dependency-free conversions. They don't rely on Buffer, atob or
// TextEncoder so they behave the same on Hermes, JSC and in Jest.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;
// URL-safe variants decode too
B64_LOOKUP['-'.charCodeAt(0)] = 62;
B64_LOOKUP['_'.charCodeAt(0)] = 63;

/** Decode base64 (standard or URL-safe; whitespace ignored). Returns null when invalid. */
export function base64ToBytes(input: string): Uint8Array | null {
  const clean = input.replace(/[\s=]/g, '');
  if (clean.length % 4 === 1) return null;

  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let pos = 0;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? B64_LOOKUP[code]! : -1;
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (buffer >> bits) & 0xff;
    }
  }
  return pos === out.length ? out : out.subarray(0, pos);
}

/** UTF-8 encode a string — the same bytes `Buffer.from(str)` produces. */
export function utf8Bytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length * 3);
  let pos = 0;

  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);

    // Combine a valid surrogate pair; a lone surrogate becomes U+FFFD,
    // matching Buffer / TextEncoder.
    if (code >= 0xd800 && code <= 0xdfff) {
      const next = str.charCodeAt(i + 1);
      if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    }

    if (code < 0x80) {
      out[pos++] = code;
    } else if (code < 0x800) {
      out[pos++] = 0xc0 | (code >> 6);
      out[pos++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      out[pos++] = 0xe0 | (code >> 12);
      out[pos++] = 0x80 | ((code >> 6) & 0x3f);
      out[pos++] = 0x80 | (code & 0x3f);
    } else {
      out[pos++] = 0xf0 | (code >> 18);
      out[pos++] = 0x80 | ((code >> 12) & 0x3f);
      out[pos++] = 0x80 | ((code >> 6) & 0x3f);
      out[pos++] = 0x80 | (code & 0x3f);
    }
  }
  return out.slice(0, pos);
}

/**
 * Bytes → a string with one char (0–255) per byte. Written with the
 * `latin1` encoding, the Bluetooth library turns it back into exactly
 * these bytes — the binary-safe way through its string API.
 */
export function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const STEP = 0x2000; // keep apply() argument lists small
  for (let i = 0; i < bytes.length; i += STEP) {
    out += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + STEP) as unknown as number[]
    );
  }
  return out;
}

/** Join byte arrays into one. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** FNV-1a 32-bit hash — a cheap cache identity for long base64 strings. */
export function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + str.length;
}
