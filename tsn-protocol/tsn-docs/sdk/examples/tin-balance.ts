import {
  loadTinOwnerBalanceV1,
  type LoadTinOwnerBalanceV1Params,
} from "@trustlink/tsn-sdk/tin-owner-balance";

// The caller supplies its connection, wallet, TIN and authenticated identity transport.
// Wallet approvals and all recovery/validation steps run inside the SDK.
export async function readOwnerTinBalance(input: LoadTinOwnerBalanceV1Params) {
  return loadTinOwnerBalanceV1(input);
}
