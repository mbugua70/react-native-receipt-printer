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

---

## ✨ Features

- **Bluetooth permissions** — cross-platform, Android 12+ and legacy Android, iOS. Fully handled with one call.
- **Three-layer API** — raw functions, React hooks, and Context providers. Pick the level that fits your app.
- **Device discovery** — scan for nearby devices or list already-paired ones.
- **Connection management** — connect, disconnect, and track connection state reactively.
- **ESC/POS receipt encoding** — supports text, dividers, spacers, QR codes, and paper cut. 58mm and 80mm paper widths.
- **Fluent receipt builder** — construct receipts with chainable methods or pass a JSON structure from your backend.
- **Print queue** — jobs are processed one at a time. No corrupted output from concurrent prints.
- **Retry logic** — automatically retries failed writes before giving up. Configurable per print call.
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
| `.cut()` | Paper cut — always last | |
| `.build()` | Returns `ReceiptData` ready for `encode()` | |

Options you can override on `.header()` and `.text()`:

```ts
.header('ACME RIDES', { align: 'left', bold: false })
.text('Note', { align: 'center', size: 'large', bold: true })
```

### Backend-driven receipts

If your backend returns receipt data, pass it directly to `encode()` — no builder needed:

```ts
const data = await fetch('/api/receipt/123').then(r => r.json());
// data is already ReceiptData shape:
// { paperWidth: 58, lines: [ { type: 'text', ... }, ... ] }

encode(data); // → raw ESC/POS string
```

### Printing

```ts
import { connect, print } from 'react-native-receipt-printer';

await connect('00:11:22:AA:BB:CC');
await print(receipt);                               // 1 copy, 2 retries
await print(receipt, { copies: 2 });               // 2 copies
await print(receipt, { copies: 1, retries: 5 });   // up to 5 retries
await print(receipt, { copies: 1, retries: 0 });   // no retries
```

`PrintOptions`:

| Option | Type | Default | Description |
|---|---|---|---|
| `copies` | `number` | `1` | How many receipts to print |
| `retries` | `number` | `2` | How many times to retry a failed write |
| `retryDelayMs` | `number` | `500` | Milliseconds between retry attempts |

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
    // no device connected — show "connect to a printer" UI
  }
  if (err instanceof PrintError) {
    // write failed after all retries — err.cause has the underlying error
    console.log(err.cause);
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
- [x] ESC/POS encoder — text, dividers, spacers, QR codes, paper cut
- [x] 58mm / 80mm paper width support
- [x] Fluent receipt builder
- [x] `print()` with copies support
- [x] Print queue — serial job processing
- [x] Retry logic — automatic retries with configurable delay
- [x] Print status events — `sending`, `done`, `error`
- [x] `usePrinter` hook — `isPrinting`, `status`, `error`
- [ ] Receipt templates

---

## 📄 License

MIT
