import { createContext, useContext, type ReactNode } from 'react';
import { useBluetooth, type UseBluetoothReturn } from '../hooks/useBluetooth';

// ─── Context ──────────────────────────────────────────────────────────────────

const BluetoothContext = createContext<UseBluetoothReturn | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export type BluetoothProviderProps = {
  children: ReactNode;
};

/**
 * Provides shared Bluetooth state to every component in the tree below it.
 *
 * Place this once near the root of your app. All screens can then read the
 * same connection state, device list, and scanning status via
 * `useBluetoothContext()` — no prop drilling, no duplicate hook instances.
 *
 * @example
 * ```tsx
 * // App entry point
 * export default function App() {
 *   return (
 *     <BluetoothProvider>
 *       <Navigation />
 *     </BluetoothProvider>
 *   );
 * }
 *
 * // Any screen inside
 * const { isConnected, connectedDevice, connect } = useBluetoothContext();
 * ```
 */
export function BluetoothProvider({ children }: BluetoothProviderProps) {
  const value = useBluetooth();
  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

/**
 * Read the shared Bluetooth state provided by the nearest
 * `<BluetoothProvider />` ancestor.
 *
 * Throws if used outside of a provider — this is intentional so the mistake
 * is caught immediately rather than silently returning stale or empty data.
 *
 * @example
 * ```tsx
 * const {
 *   isReady,
 *   isConnected,
 *   connectedDevice,
 *   bondedDevices,
 *   isScanning,
 *   checkReady,
 *   connect,
 *   disconnect,
 *   scan,
 * } = useBluetoothContext();
 * ```
 */
export function useBluetoothContext(): UseBluetoothReturn {
  const context = useContext(BluetoothContext);
  if (!context) {
    throw new Error(
      'useBluetoothContext must be used inside a <BluetoothProvider />'
    );
  }
  return context;
}
