export function analyzeLinkage(intent, settlement) {
  if (!intent || !settlement) return { status: "INCONCLUSIVE", reason: "intent-to-settlement analysis unavailable because settlement is not implemented" };
  const sharedAccounts = new Set((intent.accountKeys ?? []).map((x) => x.pubkey));
  return { status: sharedAccounts.size ? "DIRECT_LINK" : "NO_LINK_FOUND_UNDER_TEST", sharedAccounts: [...sharedAccounts].filter((key) => (settlement.accountKeys ?? []).some((x) => x.pubkey === key)) };
}
