import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface UsbPrinterDevice {
  id: string;
  deviceName: string;
  manufacturerName?: string;
  productName?: string;
  vendorId: number;
  productId: number;
  interfaceId: number;
  interfaceClass: number;
  interfaceSubclass: number;
  interfaceProtocol: number;
}

export interface UsbPermissionResult {
  granted: boolean;
  code?: string;
  error?: string;
}

export interface UsbPrintResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;

  discoverUsbPrinters(): Promise<UsbPrinterDevice[]>;
  hasUsbPrinter(): Promise<boolean>;
  requestUsbPermission(id: string): Promise<UsbPermissionResult>;
  printUsb(id: string, bytesBase64: string): Promise<UsbPrintResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ReceiptPrinter');
