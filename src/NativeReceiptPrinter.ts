import { TurboModuleRegistry, type TurboModule } from 'react-native';

/** A decoded image as 8-bit grayscale; `data` is base64 of width × height bytes. */
export type DecodedImage = {
  width: number;
  height: number;
  data: string;
};

export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;

  /**
   * Load and decode an image, flatten transparency onto white and convert it
   * to grayscale. Large images are subsampled, never below `minWidth` wide.
   *
   * - `sourceType` — 'uri' (http(s), file, content, bundled asset) or 'base64'
   *
   * Rejects with code INVALID_SOURCE, NETWORK, UNSUPPORTED_FORMAT,
   * DECODE_FAILED or TOO_LARGE.
   */
  decodeImage(
    source: string,
    sourceType: string,
    minWidth: number
  ): Promise<DecodedImage>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ReceiptPrinter');
