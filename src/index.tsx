// ─── Bluetooth events ────────────────────────────────────────────────────
export {
  onConnectionChange,
  onBluetoothStateChange,
  type ConnectionChangeEvent,
  type BluetoothStateChangeEvent,
} from './bluetooth/BluetoothEvents';

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

// ─── Layer 2: React hooks ────────────────────────────────────────────────
export {
  useBluetoothPermissions,
  type BluetoothPermissionStatus,
  type UseBluetoothPermissionsOptions,
  type UseBluetoothPermissionsReturn,
} from './hooks/useBluetoothPermissions';

export {
  useBluetooth,
  type UseBluetoothReturn,
  type BluetoothReadyError,
} from './hooks/useBluetooth';

// ─── Layer 3: Context providers ──────────────────────────────────────────
export {
  BluetoothPermissionProvider,
  useBluetoothPermissionsContext,
  type BluetoothPermissionProviderProps,
} from './bluetooth/BluetoothPermissionContext';

export {
  BluetoothProvider,
  useBluetoothContext,
  type BluetoothProviderProps,
} from './bluetooth/BluetoothContext';
