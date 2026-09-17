import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';

/**
 * The scanned QR's decoded text. Every check-in QR (Apple/Google Wallet
 * barcodes, and the standalone in-app QR) encodes the signed token as
 * base64url text rather than raw bytes specifically so this is lossless —
 * `IDetectedBarcode.rawValue` is a plain string per the Barcode Detection
 * API spec, with no way to get the pre-charset-conversion bytes back out.
 */
export function payloadFromResult(result: IDetectedBarcode): string {
  return result.rawValue;
}
