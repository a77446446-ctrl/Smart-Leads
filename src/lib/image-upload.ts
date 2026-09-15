export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isAllowedImageMimeType(value: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(value);
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return false;

  if (mimeType === 'image/jpeg') {
    return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
  if (mimeType === 'image/png') {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === 'image/gif') {
    return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
      || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  }
  if (mimeType === 'image/webp') {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytes[8] === 0x57
      && bytes[9] === 0x45
      && bytes[10] === 0x42
      && bytes[11] === 0x50;
  }
  return false;
}
