export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getOtpExpiryDate(ttlMinutes: number): Date {
  return new Date(Date.now() + ttlMinutes * 60_000);
}
