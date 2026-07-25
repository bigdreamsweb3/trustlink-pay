export function checkFundingInvariants(before, after, claim, expectedAmount) {
  const checks = [
    { name: "actual_assets_equals_vault", passed: BigInt(after.reserve.actualAssets) === BigInt(after.vault) },
    { name: "assets_cover_pending_liabilities", passed: BigInt(after.reserve.actualAssets) >= BigInt(after.reserve.pendingLiabilities) },
    { name: "source_decreased_by_amount", passed: BigInt(before.source) - BigInt(after.source) === BigInt(expectedAmount) },
    { name: "vault_increased_by_amount", passed: BigInt(after.vault) - BigInt(before.vault) === BigInt(expectedAmount) },
    { name: "actual_assets_increased_by_amount", passed: BigInt(after.reserve.actualAssets) - BigInt(before.reserve.actualAssets) === BigInt(expectedAmount) },
    { name: "pending_liabilities_increased_by_amount", passed: BigInt(after.reserve.pendingLiabilities) - BigInt(before.reserve.pendingLiabilities) === BigInt(expectedAmount) },
    { name: "funding_root_advanced_once", passed: BigInt(after.root.sequence) === BigInt(before.root?.sequence ?? 0) + 1n },
    { name: "funding_nonce_advanced_once", passed: BigInt(after.nonce.nextNonce) === BigInt(before.nonce?.nextNonce ?? 0) + 1n },
    { name: "funding_claim_created", passed: Boolean(claim) },
  ];
  return checks.map((check) => ({ ...check, classification: "DERIVED_BY_ANALYZER" }));
}
