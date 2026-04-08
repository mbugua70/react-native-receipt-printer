import { createContext, useContext, type ReactNode } from 'react';
import {
  useBluetoothPermissions,
  type UseBluetoothPermissionsOptions,
  type UseBluetoothPermissionsReturn,
} from '../hooks/useBluetoothPermissions';

const BluetoothPermissionContext =
  createContext<UseBluetoothPermissionsReturn | null>(null);

export type BluetoothPermissionProviderProps =
  UseBluetoothPermissionsOptions & {
    children: ReactNode;
  };

/**
 * Provides shared Bluetooth permission state to any component below it in
 * the React tree. Use this when multiple screens need to read/observe the
 * same permission state without re-running `useBluetoothPermissions` in
 * each one.
 *
 * @example
 * ```tsx
 * // app entry
 * <BluetoothPermissionProvider requestOnMount>
 *   <App />
 * </BluetoothPermissionProvider>
 *
 * // anywhere inside
 * const { granted, request } = useBluetoothPermissionsContext();
 * ```
 */
export function BluetoothPermissionProvider({
  children,
  ...options
}: BluetoothPermissionProviderProps) {
  const value = useBluetoothPermissions(options);
  return (
    <BluetoothPermissionContext.Provider value={value}>
      {children}
    </BluetoothPermissionContext.Provider>
  );
}

/**
 * Read the shared Bluetooth permission state provided by the nearest
 * `<BluetoothPermissionProvider />` ancestor.
 *
 * Throws if used outside of a provider — this is intentional, so the
 * mistake is caught immediately rather than silently returning stale data.
 */
export function useBluetoothPermissionsContext(): UseBluetoothPermissionsReturn {
  const context = useContext(BluetoothPermissionContext);
  if (!context) {
    throw new Error(
      'useBluetoothPermissionsContext must be used inside a <BluetoothPermissionProvider />'
    );
  }
  return context;
}
