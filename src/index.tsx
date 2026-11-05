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

// ─── Printer ─────────────────────────────────────────────────────────────
export {
  encode,
  encodeBytes,
  getBarcodeModuleDots,
  isCode128Printable,
  type BarcodeLine,
  type ImageLine,
  type ReceiptData,
  type ReceiptLine,
} from './printer/EscPosEncoder';
export {
  ImageError,
  prepareImage,
  prepareReceipt,
  configureImageCache,
  clearImageCache,
  getImageCacheStats,
  type ImageErrorCode,
  type PrepareImageOptions,
  type ImageCacheOptions,
  type DitherMode,
  type ImageMode,
  type ImageProcessingOptions,
  type ImageSource,
  type MonochromeBitmap,
} from './printer/image';
export { ReceiptBuilder } from './printer/ReceiptBuilder';
export {
  print,
  type PrintOptions,
  NotConnectedError,
  PrintError,
} from './printer/PrinterManager';
export {
  onPrintStatus,
  type PrintStatusEvent,
  type PrintStatusListener,
} from './printer/PrintEvents';
export {
  enqueue,
  getQueueLength,
  isProcessing,
  clearQueue,
} from './printer/PrintQueue';
export {
  usePrinter,
  type UsePrinterReturn,
  type PrintStatus,
} from './hooks/usePrinter';

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
