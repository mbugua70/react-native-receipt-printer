# react-native-receipt-printer

A React Native library for thermal receipt printing over Bluetooth, with built-in permission handling, device connection management, and dynamic receipt building.

---

## 🚧 Status

Work in progress. Bluetooth permission and connection layers are complete. Receipt printing is coming next.

---

## ✨ Features

- **Bluetooth permissions** — cross-platform, Android 12+ and legacy Android, iOS. Fully handled with one call.
- **Three-layer API** — raw functions, React hooks, and Context providers. Pick the level that fits your app.
- **Device discovery** — scan for nearby devices or list already-paired ones.
- **Connection management** — connect, disconnect, and track connection state reactively.
- **ESC/POS receipt printing** — coming soon
- **Dynamic receipt builder** — backend-driven receipt format (JSON → print commands) — coming soon
- **58mm / 80mm printer support** — coming soon

---

## 📦 Installation

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

## 🔌 API

The library exposes three layers. Pick the one that fits your use case.

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

#### Events

Subscribe to real-time Bluetooth state changes — no polling required.

```typescript
import {
  onConnectionChange,
  onBluetoothStateChange,
} from 'react-native-receipt-printer';

// Fires immediately when a device connects or disconnects
const unsub = onConnectionChange((event) => {
  if (event.type === 'connected') {
    console.log('Connected to:', event.device.name);
  }
  if (event.type === 'disconnected') {
    console.log('Disconnected from:', event.device.name);
  }
});

// Fires when the user turns Bluetooth on or off
const unsubState = onBluetoothStateChange((event) => {
  if (!event.enabled) {
    console.log('Bluetooth was turned off');
  }
});

// Always unsubscribe when done to prevent memory leaks
unsub();
unsubState();
```

> **Note:** If you use the `useBluetooth` hook or `BluetoothProvider`, events are already wired up internally — you don't need to call these manually. Use the raw event functions only when building custom state management outside of the hook.

---

### Layer 2 — React hooks

Wraps the raw functions into reactive state. Recommended for most apps.

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

// Wrap your app once at the root
export default function App() {
  return (
    <BluetoothPermissionProvider requestOnMount>
      <BluetoothProvider>
        <Navigation />
      </BluetoothProvider>
    </BluetoothPermissionProvider>
  );
}

// Read shared permission state anywhere inside
function PermissionStatus() {
  const { granted, status } = useBluetoothPermissionsContext();
  return <Text>Bluetooth: {status}</Text>;
}

// Read shared Bluetooth state anywhere inside
function PrinterStatus() {
  const { isConnected, connectedDevice } = useBluetoothContext();
  return <Text>{isConnected ? connectedDevice?.name : 'Not connected'}</Text>;
}
```

---

## 🗺️ Roadmap

- [x] Bluetooth permission handling (Android 12+, legacy Android, iOS)
- [x] Bluetooth radio state management
- [x] Device discovery (bonded + scan)
- [x] Connection management
- [x] `BluetoothEvents` — real-time connection drop and radio state change events
- [ ] `usePrinter` hook
- [ ] ESC/POS encoder
- [ ] Dynamic receipt builder (backend JSON → print commands)
- [ ] 58mm / 80mm paper width support
- [ ] Receipt templates

---

## 📄 License

MIT
