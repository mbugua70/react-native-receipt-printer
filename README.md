# react-native-receipt-printer

[![npm version](https://img.shields.io/npm/v/react-native-receipt-printer.svg)](https://www.npmjs.com/package/react-native-receipt-printer)
[![npm downloads](https://img.shields.io/npm/dm/react-native-receipt-printer.svg)](https://www.npmjs.com/package/react-native-receipt-printer)
[![license](https://img.shields.io/npm/l/react-native-receipt-printer.svg)](LICENSE)

A React Native library for thermal receipt printing over Bluetooth, with built-in permission handling, device connection management, and dynamic receipt building.

---

## Contents

- [Features](#-features)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Printing](#️-printing)
- [Bluetooth API](#-bluetooth-api)
- [Roadmap](#️-roadmap)
- [Feedback and contributions](#-feedback-and-contributions)

---

## ✨ Features

- **Bluetooth permissions** — cross-platform, Android 12+ and legacy Android, iOS. Fully handled with one call.
- **Three-layer API** — raw functions, React hooks, and Context providers. Pick the level that fits your app.
- **Device discovery** — scan for nearby devices or list already-paired ones.
- **Connection management** — connect, disconnect, and track connection state reactively.
- **ESC/POS thermal encoding** — supports text, dividers, spacers, QR codes, Code 128 barcodes, and paper cut. 58mm and 80mm paper widths.
- **Images and logos** — print PNG/JPEG logos from URLs, files, base64 or bundled assets anywhere in the receipt, sized in printer dots, dithered to black and white, and cached.
- **Fluent receipt builder** — construct receipts with chainable methods or pass a JSON structure from your backend.
- **Print queue** — jobs are processed one at a time. No corrupted output from concurrent prints.
- **Retry logic** — automatically retries failed writes before giving up, reopening the connection once if the link dropped. Configurable per print call.
- **Chunked writes** — send long receipts (manifests, reports) in small pieces for printers that drop the connection on one big write.
- **Print status events** — subscribe to `sending`, `done`, and `error` events in real time.
- **`usePrinter` hook** — `isPrinting`, `status`, and `error` state wired up automatically.

---

## 📋 Requirements

### React Native

| Requirement | Version |
|---|---|
| React Native | 0.83.0+ (New Architecture / TurboModules) |
| React | 19.2.0+ |

This library uses the **New Architecture** (TurboModules + JSI). The old architecture (Bridge) is not supported.

### Android

| Requirement | Version |
|---|---|
| Minimum SDK | API 24 (Android 7.0 Nougat) |
| Target SDK | API 36 (Android 16) |
| Compile SDK | API 36 |
| Kotlin | 2.1.20+ |

**Bluetooth permission behaviour by Android version:**

| Android version | API level | Permissions required |
|---|---|---|
| Android 12+ | API 31+ | `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` |
| Android 11 and below | API ≤ 30 | `BLUETOOTH`, `BLUETOOTH_ADMIN`, `ACCESS_FINE_LOCATION` |

The library handles both automatically — you just call `requestBluetoothPermissions()` or `ensureReady()`.

### iOS

| Requirement | Version |
|---|---|
| Minimum deployment target | iOS 15.1 |

`NSBluetoothAlwaysUsageDescription` is required in `Info.plist` (see [iOS setup](#ios-setup)).

### Peer dependencies

| Package | Version |
|---|---|
| `react-native-permissions` | ^5.5.1 |
| `react-native-bluetooth-classic` | ^1.73.0-rc.17 |

---

## 📦 Installation

> **Expo users:** This library requires native modules and is **not compatible with Expo Go**. Use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (`expo-dev-client`) or the bare workflow instead.

Install the library along with its peer dependencies:

```bash
yarn add react-native-receipt-printer react-native-permissions react-native-bluetooth-classic
```

or with npm:

```bash
npm install react-native-receipt-printer react-native-permissions react-native-bluetooth-classic
```

### Why peer dependencies?

`react-native-permissions` and `react-native-bluetooth-classic` ship native Kotlin/Swift code. To prevent duplicate native modules — which crash React Native apps at build time — this library declares them as **peer dependencies** instead of bundling its own copies. You install them once in your app and the library uses your copy.

### Android setup

Add the following to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Bluetooth permissions for Android 12+ (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission
    android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />

<!-- Legacy Bluetooth for Android 11 and below -->
<uses-permission
    android:name="android.permission.BLUETOOTH"
    android:maxSdkVersion="30" />
<uses-permission
    android:name="android.permission.BLUETOOTH_ADMIN"
    android:maxSdkVersion="30" />

<!-- Required for Bluetooth scanning on Android 11 and below -->
<uses-permission
    android:name="android.permission.ACCESS_FINE_LOCATION"
    android:maxSdkVersion="30" />
```

### iOS setup

Add the following to `ios/YourApp/Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app uses Bluetooth to connect to receipt printers.</string>
```

Follow each peer dependency's native setup guide for additional configuration:

- [`react-native-permissions` setup](https://github.com/zoontek/react-native-permissions#setup)
- [`react-native-bluetooth-classic` setup](https://github.com/kenjdavidson/react-native-bluetooth-classic#installation)

---

## 🖨️ Printing

### Building a receipt

Use `ReceiptBuilder` to construct a receipt with chainable methods:

```ts
import { ReceiptBuilder, encode } from 'react-native-receipt-printer';

const receipt = new ReceiptBuilder({ paperWidth: 58 })
  .header('ACME RIDES')
  .divider()
  .row('Passenger:', 'John Doe')
  .row('Fare:', 'KES 500')
  .row('Date:', '2026-04-14')
  .divider()
  .qrCode('https://acme.com/receipt/123')
  .barcode('BEE5023C')
  .spacer(2)
  .cut()
  .build();
```

| Method | Description | Defaults |
|---|---|---|
| `.header(title, options?)` | Large bold centered title | `align: center`, `bold: true` |
| `.row(label, value)` | Two-column row — label left, value right | |
| `.text(content, options?)` | Single line of text | `align: left`, `size: normal` |
| `.divider(options?)` | Horizontal rule | `char: '-'` |
| `.spacer(lines?)` | Blank lines | `lines: 1` |
| `.qrCode(data)` | Centered QR code | |
| `.barcode(data, options?)` | Centered Code 128 barcode with its text below. Short data only: ~14 characters fit 58mm, ~23 fit 80mm; anything longer (or non-ASCII) prints as centered text instead | `height: 80` dots, `showText: true` |
| `.cut()` | Paper cut — always last | |
| `.build()` | Returns `ReceiptData` ready for `encode()` | |

Options you can override on `.header()` and `.text()`:

```ts
.header('ACME RIDES', { align: 'left', bold: false })
.text('Note', { align: 'center', size: 'large', bold: true })
```

### Barcodes

`.barcode(data)` prints a **Code 128** barcode — the 1D barcode used in
shipping and logistics — centered, with the text printed under the bars.
The printer draws it itself from the ESC/POS barcode command, so there are no
images to generate.

```ts
new ReceiptBuilder({ paperWidth: 58 })
  .text('Parcel', { align: 'center', bold: true })
  .barcode('BEE5023C')                                  // bars + "BEE5023C" below
  .barcode('NRB-0660', { height: 60, showText: false }) // shorter, no text
  .cut()
  .build();
```

**QR code or barcode?**

| | `.qrCode()` | `.barcode()` |
|---|---|---|
| Holds | Long text — URLs, JSON, tokens | Short codes only |
| Read by | 2D scanners, phone cameras | **Any** scanner (1D laser, 2D imager), phone cameras |
| Use when | Data is long, or every scanner is 2D | Staff use cheap 1D scanners |

**How much fits.** A barcode only grows sideways, so length is limited by the
paper. Bars are made as thick as the paper allows — 3 dots when they fit
(easiest to scan), otherwise 2 dots:

| Paper | Printable width | Characters that fit |
|---|---|---|
| 58mm | 384 dots | up to ~14 (3-dot bars up to 8) |
| 80mm | 576 dots | up to ~23 (3-dot bars up to 14) |

Keep codes short — 8–12 characters scan fastest.

**Never a blank label.** Content that can't be a barcode — too long for the
paper, or characters outside printable ASCII (e.g. `é`) — is printed as
centered text instead, so the code is still on the receipt.

| Option | Description | Default |
|---|---|---|
| `height` | Bar height in printer dots (8 dots ≈ 1mm) | `80` (≈10mm) |
| `showText` | Print the code under the bars | `true` |

In backend JSON, the same line looks like:

```json
{ "type": "barcode", "data": "BEE5023C", "height": 80, "showText": true }
```

**Checking before you print.** Two helpers let your app decide between a
barcode and a QR code up front:

```ts
import { isCode128Printable, getBarcodeModuleDots } from 'react-native-receipt-printer';

isCode128Printable('BEE5023C');        // true  — printable ASCII only
getBarcodeModuleDots('BEE5023C', 384); // 3     — bar width in dots on 58mm
getBarcodeModuleDots('X'.repeat(20), 384); // 0 — won't fit 58mm
```

> **Printer support:** Code 128 uses the standard ESC/POS `GS k` command,
> which almost all thermal receipt printers support. A few very basic models
> don't — print one test receipt on each new printer model.

> **Upgrading apps:** versions before barcode support don't know the
> `barcode` line type and print the word `undefined` in its place. Make sure
> every app that receives barcode lines (including backend-driven receipts)
> is on a version with barcode support.

### Images and logos

Print a logo or any picture anywhere in a receipt. It prints exactly where you put it in the builder (or in the `lines` array), between any other lines:

```ts
const receipt = new ReceiptBuilder({ paperWidth: 58 })
  .image(require('./assets/logo.png'), { width: 240 }) // centered by default
  .header('ACME RIDES')
  .divider()
  .row('Waybill', 'NRB-0699')
  .image('https://example.com/stamp.png', { width: 120, align: 'right' })
  .qrCode('NRB-0699')
  .cut()
  .build();

await print(receipt); // loads, converts and caches the images, then prints
```

> **Thermal printers print black and white only.** Colours become black or white.
> Logos with bold shapes and high contrast print best; thin lines and pale
> colours may disappear. Tune `threshold`, or use a dithering mode for photos.

#### Image sources

| Source | Example |
|---|---|
| HTTPS / HTTP URL | `'https://example.com/logo.png'` |
| Local file | `'file:///data/user/0/…/logo.png'`, Android `'content://…'` |
| Base64 data URI | `'data:image/png;base64,iVBORw0…'` |
| Raw base64 | `{ base64: 'iVBORw0…' }` |
| Bundled asset | `require('./assets/logo.png')` |
| Prepared bitmap | the result of `prepareImage()`, or `{ width, height, data }` (see below) |

PNG and JPEG work everywhere. WEBP, GIF (first frame), BMP and HEIF depend on what the phone's OS can decode. Transparent areas print as white.

#### Size and alignment

Sizes are in **printer dots**. Common 203 DPI printers print 8 dots per mm:

| Paper | Printable width | Good logo width |
|---|---|---|
| 58mm | 384 dots (48mm) | 200–300 dots |
| 80mm | 576 dots (72mm) | 300–450 dots |

Some printers have a different printable width (e.g. 512 dots on some 80mm models, or 360 on some 58mm ones). Set it on the receipt so images and barcodes are sized for your printer:

```ts
new ReceiptBuilder({ paperWidth: 80, printableDots: 512 });
```

| Option | Default | Description |
|---|---|---|
| `width` | image's own width | Width in dots |
| `height` | follows `width` | Height in dots. The aspect ratio is kept unless you set both with `fit: 'stretch'` |
| `fit` | `'contain'` | With both `width` and `height`: `'contain'` fits inside the box, `'stretch'` uses both exactly |
| `align` | `'center'` | `'left'`, `'center'` or `'right'` |
| `overflow` | `'shrink'` | Image wider than the paper: `'shrink'` scales it down to fit, `'error'` throws `ImageError` (`TOO_LARGE`) |
| `dither` | `'threshold'` | `'threshold'` (sharpest — logos and text), `'floyd-steinberg'` (photos, gradients), `'atkinson'` (lighter, cleaner highlights) |
| `threshold` | `128` | 0–255. Pixels darker than this print black. Raise it if a pale logo disappears; lower it if it prints too heavy |
| `invert` | `false` | Swap black and white |
| `cacheKey` | — | Change it when the image behind the same URL changes (e.g. `'v2'`) |

Alignment is done by padding the image with white, so it lines up the same way on every printer.

#### Backend-driven images

An image is just another line type, so JSON receipts can include it:

```json
{
  "paperWidth": 58,
  "lines": [
    { "type": "image", "source": "https://example.com/logo.png", "width": 240, "align": "center", "dither": "threshold" },
    { "type": "text", "content": "ACME RIDES", "align": "center", "size": "large", "bold": true },
    { "type": "cut" }
  ]
}
```

A backend can also send a ready-made 1-bit bitmap, which prints with no decoding: `"source": { "width": 240, "height": 80, "data": "<base64>" }`. Rows are packed 8 pixels per byte, most significant bit first, 1 = black, and each row is `ceil(width / 8)` bytes.

#### Reusing logos (caching and preprocessing)

Processed images are cached in memory (least recently used first, up to 512KB and 32 images by default), and the cache key includes the image and every size and dithering option. So printing the same logo again doesn't download or convert it again. To skip even the first delay, prepare logos when the app starts:

```ts
import { prepareImage, configureImageCache, clearImageCache } from 'react-native-receipt-printer';

const logo = await prepareImage('https://example.com/logo.png', {
  width: 240,
  printableDots: 384, // the paper the logo will print on
});

new ReceiptBuilder().image(logo).header('ACME RIDES').cut().build();

configureImageCache({ maxBytes: 256 * 1024, maxEntries: 16 }); // lower memory use
clearImageCache(); // e.g. after the logo changes on the server
```

`encode()` returns a text string and can't carry image bytes, so it throws `ImageError` (`NOT_PREPARED`) for image lines. To get the raw bytes yourself, use `encodeBytes(await prepareReceipt(data))`.

#### Printer compatibility

Images print with the standard ESC/POS raster command `GS v 0`, sent in bands of 32 rows. Most modern thermal printers support it. For older printers that print nothing or garbage for images, switch to the older `ESC *` bit-image command:

```ts
new ReceiptBuilder({ imageMode: 'bitImage' });
```

Not every printer supports every image command, so print a test receipt on each new printer model.

#### Performance tips

- Size logos close to the width you print them at. A 2000px logo works, but takes longer to download and decode the first time.
- Prepare frequently used logos once with `prepareImage()`.
- Image data is much larger than text: a full-width 58mm logo 120 dots tall is about 5.8KB. If a printer stalls or drops the connection during images, send in pieces: `print(receipt, { chunkSize: 1024, chunkDelayMs: 20 })`, and/or use smaller bands: `new ReceiptBuilder({ imageBandHeight: 16 })`.

#### Troubleshooting

| Symptom | Try |
|---|---|
| Garbage characters instead of the image | `imageMode: 'bitImage'` |
| Image cut off, or the printer stops partway | `chunkSize: 512, chunkDelayMs: 30`, or `imageBandHeight: 16` |
| Logo too pale / parts missing | Raise `threshold` (e.g. `170`) |
| Logo too heavy / blotchy | Lower `threshold`, or use `dither: 'atkinson'` |
| Image off-centre or too wide | Set `printableDots` to your printer's real printable width |
| `ImageError` `NATIVE_UNAVAILABLE` | The app was built with an older version of this library. Rebuild the app (a new APK / IPA); new JavaScript alone isn't enough |

> **Upgrading apps:** image printing needs the library's native code, so apps
> must be rebuilt after upgrading. Versions before image support don't know
> the `image` line type, so make sure every app that receives image lines
> from a backend is on a version with image support.

### Backend-driven receipts

If your backend returns receipt data, pass it directly to `encode()` — no builder needed:

```ts
const data = await fetch('/api/receipt/123').then(r => r.json());
// data is already ReceiptData shape:
// { paperWidth: 58, lines: [ { type: 'text', ... }, ... ] }

encode(data); // → raw ESC/POS string
```

For receipts that contain `image` lines, pass the data to `print()` (or `encodeBytes(await prepareReceipt(data))`). Images have to be loaded first, and their bytes can't go into the `encode()` string.

### Printing

```ts
import { connect, print } from 'react-native-receipt-printer';

await connect('00:11:22:AA:BB:CC');
await print(receipt);                               // 1 copy, 2 retries
await print(receipt, { copies: 2 });               // 2 copies
await print(receipt, { copies: 1, retries: 5 });   // up to 5 retries
await print(receipt, { copies: 1, retries: 0 });   // no retries
await print(manifest, { chunkSize: 512, chunkDelayMs: 20 }); // long receipt in pieces
```

`PrintOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `copies` | `number` | `1` | How many receipts to print |
| `retries` | `number` | `2` | How many times to retry a failed write |
| `retryDelayMs` | `number` | `500` | Milliseconds between retry attempts |
| `chunkSize` | `number` | `0` | Send each copy in pieces of at most this many characters (bytes for receipts with images). `0` sends the whole copy in one write |
| `chunkDelayMs` | `number` | `0` | Milliseconds to pause between pieces when `chunkSize` is set |
| `reconnect` | `boolean` | `true` | After the first failed write, close and reopen the connection to the same printer (once per print) before retrying |

#### Long receipts

Some printers — especially the built-in printers on POS terminals — print short receipts fine but drop the Bluetooth connection when a long receipt (a passenger manifest, a daily report) arrives in one write. Set `chunkSize` to send it in pieces, with `chunkDelayMs` giving the printer's buffer time to drain:

```ts
await print(manifest, { chunkSize: 512, chunkDelayMs: 20 });
```

Smaller pieces and longer pauses are gentler on slow printers (e.g. `256` / `35`); larger ones print faster (e.g. `1024` / `8`). Each piece has its own retries, so a failed piece is resent on its own rather than the whole receipt. Characters are never split across pieces.

#### Retries and reconnecting

When a write fails, `print()` waits `retryDelayMs` and tries again. Writing again on a connection that just dropped rarely works, so before the first retry it closes and reopens the connection to the same printer. If the printer can't be reached, it stops retrying early instead of trying a dead link. Pass `reconnect: false` to retry on the same connection only.

### `usePrinter` hook

The recommended way to print from a React component:

```tsx
import { usePrinter } from 'react-native-receipt-printer';

function PrintButton({ receipt }) {
  const { print, isPrinting, status, error } = usePrinter();

  return (
    <>
      <Button
        title={isPrinting ? 'Printing...' : 'Print'}
        onPress={() => print(receipt)}
        disabled={isPrinting}
      />
      <Text>Status: {status}</Text>
      {error && <Text style={{ color: 'red' }}>{error.message}</Text>}
    </>
  );
}
```

| Value | Type | Description |
|---|---|---|
| `print(data, options?)` | `function` | Send a receipt to the print queue |
| `isPrinting` | `boolean` | `true` while the job is in flight |
| `status` | `'idle' \| 'sending' \| 'done' \| 'error'` | Fine-grained current state |
| `error` | `Error \| null` | Last error, or `null` if no error |

### Print queue

Jobs are always processed one at a time — safe to call `print()` or `enqueue()` multiple times without worrying about concurrent writes corrupting the output.

```ts
import { enqueue, clearQueue, getQueueLength } from 'react-native-receipt-printer';

// Add jobs — processed in order
enqueue(customerReceipt);
enqueue(driverReceipt, { copies: 2 });

// How many jobs are waiting (not counting the one currently printing)
getQueueLength();

// Cancel all pending jobs (the current job finishes normally)
clearQueue();
```

### Print status events

Subscribe anywhere in your app to get real-time updates:

```ts
import { onPrintStatus } from 'react-native-receipt-printer';

const unsubscribe = onPrintStatus((event) => {
  if (event.status === 'sending') {
    console.log(`Sending copy ${event.copy} of ${event.totalCopies}...`);
  }
  if (event.status === 'done') {
    console.log(`Copy ${event.copy} printed successfully.`);
  }
  if (event.status === 'error') {
    console.log(`Copy ${event.copy} failed: ${event.error.message}`);
  }
});

// Unsubscribe when done (e.g. in useEffect cleanup)
unsubscribe();
```

### Error handling

```ts
import {
  NotConnectedError,
  PrintError,
} from 'react-native-receipt-printer';

try {
  await print(receipt);
} catch (err) {
  if (err instanceof NotConnectedError) {
    // no device connected, or the connection was lost and couldn't be
    // reopened — show "connect to a printer" UI
  }
  if (err instanceof PrintError) {
    // write failed after all retries — the message ends with the reason,
    // e.g. "Failed to print copy 1 of 1 after 3 attempt(s): Broken pipe"
    showAlert(err.message);
    console.log(err.cause); // the underlying error
  }
}
```

| Error | When | `message` | `cause` |
|---|---|---|---|
| `NotConnectedError` | No device connected, or the native side reports the connection is gone and it couldn't be reopened | Fixed "not connected" text | The native error, if there was one |
| `PrintError` | Every attempt to write failed | `Failed to print copy X of Y after N attempt(s): <reason>` — `N` is the attempts actually made | The last underlying error |
| `ImageError` | An image couldn't be loaded or processed. Thrown **before anything is sent**, so a receipt never prints with a missing image | Describes the problem | The native error, if there was one |

`ImageError.code` is one of `INVALID_SOURCE`, `NETWORK`, `UNSUPPORTED_FORMAT`, `DECODE_FAILED`, `INVALID_DIMENSIONS`, `TOO_LARGE`, `NATIVE_UNAVAILABLE`, `NOT_PREPARED`:

```ts
import { ImageError } from 'react-native-receipt-printer';

try {
  await print(receipt);
} catch (err) {
  if (err instanceof ImageError && err.code === 'NETWORK') {
    // logo couldn't be downloaded — retry later, or print without it
  }
}
```

---

## 🔌 Bluetooth API

The library exposes three layers for Bluetooth. Pick the one that fits your use case.

---

### Layer 1 — Raw functions

Maximum flexibility. Call directly from anywhere — inside or outside React.

#### Permissions

```typescript
import {
  requestBluetoothPermissions,
  checkBluetoothPermissions,
} from 'react-native-receipt-printer';

// Shows the OS permission dialog if not yet granted
const result = await requestBluetoothPermissions();
// { granted: boolean, blocked: boolean, denied: Permission[] }

// Silent check — no dialog, safe for polling
const result = await checkBluetoothPermissions();
```

#### Bluetooth state

```typescript
import {
  ensureReady,
  isBluetoothEnabled,
  requestBluetoothEnabled,
} from 'react-native-receipt-printer';

// Checks permissions + radio state in one call
const result = await ensureReady();
// { ready: true } or { ready: false, reason: 'permission_denied' | 'permission_blocked' | 'bluetooth_disabled' }

// Silent radio check
const enabled = await isBluetoothEnabled();

// Shows "Turn on Bluetooth?" system dialog
const enabled = await requestBluetoothEnabled();
```

#### Device discovery

```typescript
import {
  getBondedDevices,
  startScan,
  stopScan,
  findDevice,
} from 'react-native-receipt-printer';

// Get already-paired devices — instant, no scan
const devices = await getBondedDevices();

// Scan for nearby unpaired devices — fires callback per device found
await startScan((device) => {
  console.log(device.name, device.address);
}, { timeoutMs: 10_000 });

// Stop scan early
await stopScan();

// Find by address (preferred) or name — checks bonded first, scans as fallback
const device = await findDevice({ address: '00:11:22:AA:BB:CC' });
const device = await findDevice({ name: 'EPSON-TM-T20' });
```

#### Connection

```typescript
import {
  connect,
  disconnect,
  getConnectedDevice,
  isConnected,
} from 'react-native-receipt-printer';

// Always call ensureReady() before connecting
await ensureReady();
await connect('00:11:22:AA:BB:CC');

await disconnect();

const device = getConnectedDevice(); // BluetoothDevice | null
const connected = isConnected();     // boolean
```

`getConnectedDevice()` and `isConnected()` follow the real connection: when Android reports the printer disconnected (powered off, out of range) the library checks the native side and forgets the device if it's really gone, and turning Bluetooth off forgets it straight away. The next `print()` then throws `NotConnectedError` instead of writing to a dead connection.

#### Bluetooth events

Subscribe to real-time Bluetooth state changes — no polling required.

```typescript
import {
  onConnectionChange,
  onBluetoothStateChange,
} from 'react-native-receipt-printer';

const unsub = onConnectionChange((event) => {
  if (event.type === 'connected')    console.log('Connected to:', event.device.name);
  if (event.type === 'disconnected') console.log('Disconnected');
});

const unsubState = onBluetoothStateChange((event) => {
  if (!event.enabled) console.log('Bluetooth was turned off');
});

// Always unsubscribe when done
unsub();
unsubState();
```

> **Note:** If you use the `useBluetooth` hook or `BluetoothProvider`, events are already wired up internally.

---

### Layer 2 — React hooks

#### `useBluetoothPermissions`

```tsx
import { useBluetoothPermissions } from 'react-native-receipt-printer';

const {
  status,       // 'unknown' | 'granted' | 'denied' | 'blocked'
  granted,      // boolean
  blocked,      // boolean
  loading,      // boolean — true while checking
  request,      // () => Promise — shows OS dialog
  check,        // () => Promise — silent re-check
} = useBluetoothPermissions({
  requestOnMount: true,       // auto-prompt on first render
  recheckOnForeground: true,  // re-check when app returns to screen
});

if (status === 'blocked') return <OpenSettingsButton />;
if (!granted) return <Button title="Allow Bluetooth" onPress={request} />;
return <PrinterScreen />;
```

#### `useBluetooth`

```tsx
import { useBluetooth } from 'react-native-receipt-printer';

const {
  isReady,            // ensureReady passed — safe to connect
  readyError,         // 'permission_denied' | 'permission_blocked' | 'bluetooth_disabled'
  bondedDevices,      // already-paired devices
  discoveredDevices,  // devices found during scan (builds in real time)
  connectedDevice,    // currently connected device or null
  isConnected,        // boolean
  isScanning,         // boolean
  isConnecting,       // boolean
  checkReady,         // () => Promise
  loadBondedDevices,  // () => Promise
  scan,               // (options?) => Promise
  cancelScan,         // () => Promise
  find,               // (query) => Promise<BluetoothDevice | null>
  connect,            // (address) => Promise
  disconnect,         // () => Promise
} = useBluetooth();
```

**Example — connect to a printer:**

```tsx
const { isReady, readyError, bondedDevices, isConnected, checkReady, loadBondedDevices, connect } = useBluetooth();

useEffect(() => { checkReady(); }, []);
useEffect(() => { if (isReady) loadBondedDevices(); }, [isReady]);

if (readyError === 'permission_blocked') return <OpenSettingsButton />;
if (readyError === 'bluetooth_disabled') return <EnableBluetoothButton />;

return (
  <>
    {bondedDevices.map(device => (
      <TouchableOpacity key={device.address} onPress={() => connect(device.address)}>
        <Text>{device.name}</Text>
      </TouchableOpacity>
    ))}
    {isConnected && <Text>Connected ✓</Text>}
  </>
);
```

---

### Layer 3 — Context providers

Provides shared state across your entire app. Use when multiple screens need the same Bluetooth state.

```tsx
import {
  BluetoothPermissionProvider,
  BluetoothProvider,
  useBluetoothPermissionsContext,
  useBluetoothContext,
} from 'react-native-receipt-printer';

export default function App() {
  return (
    <BluetoothPermissionProvider requestOnMount>
      <BluetoothProvider>
        <Navigation />
      </BluetoothProvider>
    </BluetoothPermissionProvider>
  );
}

function PrinterStatus() {
  const { isConnected, connectedDevice } = useBluetoothContext();
  return <Text>{isConnected ? connectedDevice?.name : 'Not connected'}</Text>;
}
```

---

## 📱 Example app

A fully working demo app is included in the [`example/`](./example) directory. It covers the complete end-to-end flow in a single screen:

| What it demos | Where in code |
|---|---|
| Permission request + status display | `PermissionSection` component |
| Bluetooth radio state + readiness check | `BluetoothSection` component |
| List already-paired (bonded) devices | `loadBondedDevices()` + device list |
| Live device scanning with real-time results | `scan()` + `discoveredDevices` |
| Connect / disconnect to a device | `connect(address)` / `disconnect()` |
| Live event log — connection + radio state changes | `EventLog` component + `onConnectionChange` / `onBluetoothStateChange` |
| Image printing — logo at top, images between sections, 58mm / 80mm, backend JSON, cached repeat prints | `ImagePrintSection` component |

**Run it yourself:**

```bash
# Clone the repo
git clone https://github.com/mbugua70/react-native-receipt-printer.git
cd react-native-receipt-printer

# Install dependencies
yarn

# Run on Android
yarn example android

# Run on iOS
yarn example ios
```

> The example app reads directly from the local `src/` — no need to install from npm.

---

## 🗺️ Roadmap

- [x] Bluetooth permission handling (Android 12+, legacy Android, iOS)
- [x] Bluetooth radio state management
- [x] Device discovery (bonded + scan)
- [x] Connection management
- [x] Bluetooth events — connection and radio state changes
- [x] ESC/POS thermal encoder — text, dividers, spacers, QR codes, paper cut
- [x] Code 128 barcodes — centered, sized to the paper, with text fallback
- [x] 58mm / 80mm thermal paper width support
- [x] Fluent receipt builder
- [x] `print()` with copies support
- [x] Print queue — serial job processing
- [x] Retry logic — automatic retries with configurable delay
- [x] Reconnect once before retrying a failed write
- [x] Chunked writes for long receipts
- [x] Connection state follows Android disconnect events
- [x] Print status events — `sending`, `done`, `error`
- [x] `usePrinter` hook — `isPrinting`, `status`, `error`
- [x] Images and logos — any position, dithering, caching, `GS v 0` / `ESC *`
- [ ] Receipt templates

---

## 💬 Feedback and contributions

If you try this library, feedback is welcome — especially around printer compatibility, Bluetooth connection handling, and receipt formatting.

Open an issue or start a discussion on [GitHub](https://github.com/mbugua70/react-native-receipt-printer/issues).

---

## 📄 License

MIT
