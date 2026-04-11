import RNBluetoothClassic from 'react-native-bluetooth-classic';
import type { BluetoothDevice } from './BluetoothManager';

// ─── Event types ──────────────────────────────────────────────────────────────

/**
 * Fired when a Bluetooth device connects or disconnects.
 *
 * - `connected`    — a device successfully opened a connection
 * - `disconnected` — the connection was closed (by user, by the device
 *                    going out of range, or by the device powering off)
 */
export type ConnectionChangeEvent = {
  type: 'connected' | 'disconnected';
  device: BluetoothDevice;
};

/**
 * Fired when the Bluetooth radio is turned on or off by the user
 * (e.g. via the notification shade toggle or system settings).
 */
export type BluetoothStateChangeEvent = {
  enabled: boolean;
};

// Listener is a function that receives an event and returns nothing
type Listener<T> = (event: T) => void;

// A simple unsubscribe function returned to the caller
type Unsubscribe = () => void;

// ─── Internal listener store ──────────────────────────────────────────────────

// We keep two separate sets of listeners — one per event type.
// A Set is used so the same listener can never be registered twice.
const connectionListeners = new Set<Listener<ConnectionChangeEvent>>();
const stateListeners = new Set<Listener<BluetoothStateChangeEvent>>();

// ─── Native → JS bridge ───────────────────────────────────────────────────────

// These subscriptions wire up the native RNBluetoothClassic events to our
// internal listener sets. They are created once and never torn down for the
// lifetime of the app.

RNBluetoothClassic.onDeviceConnected((event) => {
  const payload: ConnectionChangeEvent = {
    type: 'connected',
    device: event.device as BluetoothDevice,
  };
  connectionListeners.forEach((listener) => listener(payload));
});

RNBluetoothClassic.onDeviceDisconnected((event) => {
  const payload: ConnectionChangeEvent = {
    type: 'disconnected',
    device: event.device as BluetoothDevice,
  };
  connectionListeners.forEach((listener) => listener(payload));
});

RNBluetoothClassic.onStateChanged((event) => {
  const payload: BluetoothStateChangeEvent = {
    enabled: event.enabled,
  };
  stateListeners.forEach((listener) => listener(payload));
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Subscribe to Bluetooth connection and disconnection events.
 *
 * The callback fires immediately whenever a device connects or
 * disconnects — no polling required.
 *
 * Returns an **unsubscribe** function. Call it when the component
 * unmounts to prevent memory leaks and stale updates.
 *
 * @example
 * ```ts
 * const unsub = onConnectionChange((event) => {
 *   if (event.type === 'disconnected') {
 *     showToast(`${event.device.name} disconnected`);
 *   }
 * });
 *
 * // later — clean up
 * unsub();
 * ```
 */
export function onConnectionChange(
  listener: Listener<ConnectionChangeEvent>
): Unsubscribe {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

/**
 * Subscribe to Bluetooth radio state changes.
 *
 * The callback fires immediately when the user turns Bluetooth on or off
 * via the system settings or notification shade.
 *
 * Returns an **unsubscribe** function. Call it when the component
 * unmounts to prevent memory leaks and stale updates.
 *
 * @example
 * ```ts
 * const unsub = onBluetoothStateChange((event) => {
 *   if (!event.enabled) {
 *     showWarning('Bluetooth was turned off');
 *   }
 * });
 *
 * // later — clean up
 * unsub();
 * ```
 */
export function onBluetoothStateChange(
  listener: Listener<BluetoothStateChangeEvent>
): Unsubscribe {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
