

/** normalizePrivateKey component. Inputs and results retain the original firebase contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function normalizePrivateKey(raw: string) {
  let value = raw.trim();

  // Vercel's environment editor may preserve a pair of surrounding quotes
  // when a PEM is pasted as `"-----BEGIN ..."`. Remove only that outer pair;
  // never alter the key body beyond newline normalization.
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }

  // Accept both literal escape sequences (the usual `.env` form) and actual
  // Windows/Unix line endings from hosted environment-variable editors.
  value = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Operators sometimes paste the complete service-account JSON into the
  // private-key variable. Supporting that shape avoids an opaque OpenSSL
  // decoder error while still extracting only the private key field.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") {
        value = parsed.private_key
          .replace(/\\r\\n/g, "\n")
          .replace(/\\n/g, "\n")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim();
      }
    } catch {
      // Let the validation below report a safe configuration error.
    }
  }

  return value;
}
