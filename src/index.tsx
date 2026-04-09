// ─── Bluetooth manager ───────────────────────────────────────────────────
export {
  isBluetoothEnabled,
  requestBluetoothEnabled,
  ensureReady,
  getBondedDevices,
  startScan,
  stopScan,
  findDevice,
  connect,
  disconnect,
  getConnectedDevice,
  isConnected,
  type BluetoothDevice,
  type BluetoothReadyResult,
  type DeviceQuery,
  type ScanOptions,
} from './bluetooth/BluetoothManager';

// ─── Layer 1: Raw functions ──────────────────────────────────────────────
export {
  requestBluetoothPermissions,
  checkBluetoothPermissions,
  type BluetoothPermissionResult,
} from './bluetooth/BluetoothPermissions';

// ─── Layer 2: React hook ─────────────────────────────────────────────────
export {
  useBluetoothPermissions,
  type BluetoothPermissionStatus,
  type UseBluetoothPermissionsOptions,
  type UseBluetoothPermissionsReturn,
} from './hooks/useBluetoothPermissions';

// ─── Layer 3: Context provider ───────────────────────────────────────────
export {
  BluetoothPermissionProvider,
  useBluetoothPermissionsContext,
  type BluetoothPermissionProviderProps,
} from './bluetooth/BluetoothPermissionContext';
