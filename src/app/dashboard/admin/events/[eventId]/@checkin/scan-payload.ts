import { ResultMetadataType, type Result } from '@zxing/library';

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Reads a QR back as bytes, choosing between the two views ZXing offers —
 * neither of which is lossless on its own.
 *
 * BYTE_SEGMENTS holds only the *byte-mode* segments. An encoder is free to
 * split one string across modes, and Apple Wallet does exactly that: the
 * base64url payload starts with a run of characters that fit QR's
 * alphanumeric mode, so it emits `[alphanumeric 6][byte 149]` and the byte
 * view silently arrives missing its first six characters — a token that
 * fails the signature check for a pass that is perfectly valid. Google
 * encodes the same string as one byte segment, which is why only Apple
 * passes were rejected.
 *
 * `getText()` is the complete string, but it has been through a charset
 * guess, which mangles the in-app QR's raw (non-text) token bytes.
 *
 * So: trust the bytes when they account for the whole result (a single
 * byte-mode QR, text or binary), and the text when it is longer than them,
 * which only happens when segments were left out — and only for content
 * that was text to begin with.
 */
export function payloadFromResult(result: Result): string {
  const text = result.getText();
  const segments = result
    .getResultMetadata()
    ?.get(ResultMetadataType.BYTE_SEGMENTS) as ArrayLike<number>[] | undefined;
  const segmentBytes = segments?.length
    ? segments.flatMap((segment) => Array.from(segment, (byte) => byte & 0xff))
    : [];

  const bytes =
    segmentBytes.length >= text.length
      ? segmentBytes
      : Array.from(text, (char) => char.charCodeAt(0) & 0xff);

  return toBase64Url(bytes);
}
