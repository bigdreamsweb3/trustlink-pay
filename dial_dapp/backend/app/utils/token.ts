import { createHmac, timingSafeEqual } from "node:crypto";

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function signToken(payload: Record<string, unknown>, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (givenBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(givenBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload)) as T;
  } catch {
    return null;
  }
}
