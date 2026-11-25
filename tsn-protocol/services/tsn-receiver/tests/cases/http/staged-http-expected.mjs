/** Preserve captured observations while explicitly accounting for the approved message-only validator at /intents. */
export function stagedHttpExpected(result) {
  if (result.route === "app/api/health/route.ts") {
    const expected = structuredClone(result.expected);
    if (expected.response?.data?.errorCode === "FIREBASE_STORAGE_ERROR") expected.response.data.errorCode = "STORAGE_ERROR";
    return expected;
  }
  if (result.route !== "app/intents/route.ts" || result.method !== "POST") return result.expected;
  const expected = structuredClone(result.expected);
  for (const call of expected.calls ?? []) if (call[0] === "assertAuthorizedFundingIngress") call[0] = "assertPaymentAuthorizationIngress";
  return expected;
}
