export function normalizeTinInput(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  const hasTinPrefix = /^tin[:\s_-]*/i.test(trimmed);
  if (!/^\d{10}$/.test(digits)) return null;
  if (!hasTinPrefix && trimmed.startsWith("+")) return null;

  const checkDigit = Number(digits[9]);
  let sum = 0;
  let double = true;
  for (const char of digits.slice(0, 9).split("").reverse()) {
    let digit = Number(char);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return ((10 - (sum % 10)) % 10) === checkDigit ? digits : null;
}

export function looksLikeTinCandidate(value: string) {
  const trimmed = value.trim();
  return /^tin[:\s_-]*/i.test(trimmed) || (/^\d{10}$/.test(trimmed.replace(/\D/g, "")) && !trimmed.startsWith("+"));
}
