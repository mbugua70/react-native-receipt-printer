import RNBluetoothClassic, {
  type BluetoothDevice,
} from 'react-native-bluetooth-classic';
import { requestBluetoothPermissions } from './BluetoothPermissions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { BluetoothDevice };

/**
 * Result of `ensureReady()`.
 *
 * When `ready` is `false`, `reason` tells the consumer exactly what to show:
 * - `permission_denied`   → user can still be prompted, show a "Grant" button
 * - `permission_blocked`  → user permanently denied, show an "Open Settings" button
 * - `bluetooth_disabled`  → radio is off, show a "Turn on Bluetooth" button
 * - `unsupported`         → device does not support Bluetooth
 */
export type BluetoothReadyResult =
  | { ready: true }
  | {
      ready: false;
      reason:
        | 'permission_denied'
        | 'permission_blocked'
        | 'bluetooth_disabled'
        | 'unsupported';
    };

export type DeviceQuery = {
  /** Match by hardware address — unique, preferred over name. */
  address?: string;
  /** Match by device name — fallback when address is not known. */
  name?: string;
};

export type ScanOptions = {
  /**
   * How long to scan for in milliseconds before stopping automatically.
   * Defaults to 10 000 ms (10 seconds).
   */
  timeoutMs?: number;
};

// ─── Radio state ──────────────────────────────────────────────────────────────

/**
 * Silently check whether the Bluetooth radio is turned on.
 * Does not show any dialog. Safe to call from polling loops or effects.
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch {
    return false;
  }
}

/**
 * Ask the user to turn on Bluetooth via the system dialog.
 * Returns `true` if Bluetooth is enabled after the call.
 */
export async function requestBluetoothEnabled(): Promise<boolean> {
  try {
    await RNBluetoothClassic.requestBluetoothEnabled();
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch {
    return false;
  }
}

// ─── ensureReady ──────────────────────────────────────────────────────────────

/**
 * Combined readiness check — the single call you need before any Bluetooth
 * operation (scan, connect, print).
 *
 * Checks in order:
 * 1. Permissions — requests them if not yet granted
 * 2. Bluetooth radio — prompts the user to enable it if off
 *
 * Returns `{ ready: true }` or `{ ready: false, reason }` so the caller
 * can show the correct UI for each failure case.
 *
 * @example
 * ```ts
 * const result = await ensureReady();
 * if (!result.ready) {
 *   if (result.reason === 'permission_blocked') openAppSettings();
 *   if (result.reason === 'permission_denied')  showGrantButton();
 *   if (result.reason === 'bluetooth_disabled') showEnableButton();
 *   return;
 * }
 * // safe to scan / connect
 * ```
 */
export async function ensureReady(): Promise<BluetoothReadyResult> {
  // Step 1 — permissions
  const permResult = await requestBluetoothPermissions();

  if (!permResult.granted) {
    return {
      ready: false,
      reason: permResult.blocked ? 'permission_blocked' : 'permission_denied',
    };
  }

  // Step 2 — Bluetooth radio
  const isEnabled = await isBluetoothEnabled();
  if (!isEnabled) {
    const enabled = await requestBluetoothEnabled();
    if (!enabled) {
      return { ready: false, reason: 'bluetooth_disabled' };
    }
  }

  return { ready: true };
}

// ─── Device discovery ─────────────────────────────────────────────────────────

/**
 * Return all devices the phone has previously paired (bonded) with.
 * Fast — no scan required.
 */
export async function getBondedDevices(): Promise<BluetoothDevice[]> {
  try {
    return await RNBluetoothClassic.getBondedDevices();
  } catch {
    return [];
  }
}

/**
 * Scan for nearby Bluetooth devices that are not yet paired.
 *
 * `onDeviceFound` is called immediately each time a new device is
 * discovered — the list builds up in real time rather than waiting for
 * the scan to finish.
 *
 * The scan stops automatically after `timeoutMs` (default 10 s) or when
 * `stopScan()` is called.
 *
 * @example
 * ```ts
 * await startScan((device) => {
 *   setDevices(prev => [...prev, device]);
 * });
 * ```
 */
export async function startScan(
  onDeviceFound: (device: BluetoothDevice) => void,
  options: ScanOptions = {}
): Promise<void> {
  const { timeoutMs = 10_000 } = options;

  const subscription = RNBluetoothClassic.onDeviceDiscovered((event) => {
    if (event?.device?.address) onDeviceFound(event.device as BluetoothDevice);
  });

  try {
    //  The actual trigger to start our bluetooth scan
    await RNBluetoothClassic.startDiscovery();

    await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  } finally {
    subscription.remove();
    try {
      await RNBluetoothClassic.cancelDiscovery();
    } catch {
      // ignore — device may have already stopped
    }
  }
}

/**
 * Cancel an active device scan early.
 */
export async function stopScan(): Promise<void> {
  try {
    await RNBluetoothClassic.cancelDiscovery();
  } catch {
    // ignore if no scan was running
  }
}

/**
 * Find a specific Bluetooth device by address or name.
 *
 * Search order:
 * 1. Bonded devices — instant, no scan
 * 2. If not found, perform a short scan (5 s) and return the first match
 *
 * Address is checked first when provided (unique identifier). Name is used
 * as a fallback — if multiple devices share the same name, the first match
 * is returned.
 */
export async function findDevice(
  query: DeviceQuery
): Promise<BluetoothDevice | null> {
  if (!query.address && !query.name) return null;

  // Check bonded devices first — fast, no scan required
  const bonded = await getBondedDevices();
  const bondedMatch = bonded.find((d) => {
    if (query.address) return d.address === query.address;
    return d.name === query.name;
  });

  if (bondedMatch) return bondedMatch;

  // Fall back to a short scan for unpaired devices
  let found: BluetoothDevice | null = null;

  await startScan(
    (device) => {
      if (found) return;
      const matches = query.address
        ? device.address === query.address
        : device.name === query.name;
      if (matches) found = device;
    },
    { timeoutMs: 5_000 }
  );

  return found;
}

// ─── Connection ───────────────────────────────────────────────────────────────

let _connectedDevice: BluetoothDevice | null = null;

/**
 * Open a Bluetooth connection to the device at the given address.
 * Call `ensureReady()` before connecting.
 *
 * @throws if the connection fails
 */
export async function connect(address: string): Promise<void> {
  const device = await RNBluetoothClassic.connectToDevice(address);
  _connectedDevice = device;
}

/**
 * Close the current Bluetooth connection.
 * Safe to call even if no connection is open.
 */
export async function disconnect(): Promise<void> {
  if (!_connectedDevice) return;
  try {
    await _connectedDevice.disconnect();
  } finally {
    _connectedDevice = null;
  }
}

/**
 * Return the currently connected device, or `null` if not connected.
 */
export function getConnectedDevice(): BluetoothDevice | null {
  return _connectedDevice;
}

/**
 * Quick boolean — `true` if a device is currently connected.
 */
export function isConnected(): boolean {
  return _connectedDevice !== null;
}
