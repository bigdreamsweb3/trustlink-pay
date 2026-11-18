/** Reuse identical account-key byte projections across native credit and accounting fixtures. */
export function publicKeyBytes(key) { return key.toBuffer(); }
