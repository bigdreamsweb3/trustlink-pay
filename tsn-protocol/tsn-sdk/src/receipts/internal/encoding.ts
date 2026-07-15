export function bytesToBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

export function bytesToHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

export function canonicalFields(fields: readonly string[]): Uint8Array {
  return new TextEncoder().encode(fields.map((field) => `${field.length}:${field}`).join("|"));
}

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.slice().buffer as ArrayBuffer;
}

export async function sha256Hex(value: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", toArrayBuffer(value))));
}
