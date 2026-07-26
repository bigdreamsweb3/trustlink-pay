export type TinSpendFundingMode =
  | "zk_pru_only_v2"
  | "mixed_zk_pru_wallet_v2"
  | "wallet_only_v2"
  | "pru_only"
  | "mixed_pru_and_wallet"
  | "wallet_only"
  | "insufficient";

export type TinSpendPlannerInput = {
  requestedAmountBaseUnits: bigint | number | string;
  feeAmountBaseUnits?: bigint | number | string | null;
  pruAvailableBaseUnits: bigint | number | string;
  walletAvailableBaseUnits: bigint | number | string;
};

export type TinSpendPlan = {
  fundingMode: TinSpendFundingMode;
  requestedAmountBaseUnits: string;
  feeAmountBaseUnits: string;
  totalRequiredBaseUnits: string;
  pruSpendBaseUnits: string;
  pruEscrowAmountBaseUnits: string;
  pruSenderFeeBaseUnits: string;
  walletSpendBaseUnits: string;
  walletEscrowAmountBaseUnits: string;
  walletSenderFeeBaseUnits: string;
  shortfallBaseUnits: string;
  privacyLevel: "highest" | "reduced" | "lowest" | "blocked";
  requiresPruExecution: boolean;
  userMessage: string;
};

function toNonNegativeBigint(
  value: bigint | number | string | null | undefined,
  fieldName: string,
) {
  if (value == null) return 0n;
  const parsed = typeof value === "bigint" ? value : BigInt(String(value));
  if (parsed < 0n) {
    throw new Error(`${fieldName} must be non-negative`);
  }
  return parsed;
}

export function planTinBalanceSpend(input: TinSpendPlannerInput): TinSpendPlan {
  const requestedAmount = toNonNegativeBigint(
    input.requestedAmountBaseUnits,
    "requestedAmountBaseUnits",
  );
  const feeAmount = toNonNegativeBigint(
    input.feeAmountBaseUnits,
    "feeAmountBaseUnits",
  );
  const pruAvailable = toNonNegativeBigint(
    input.pruAvailableBaseUnits,
    "pruAvailableBaseUnits",
  );
  const walletAvailable = toNonNegativeBigint(
    input.walletAvailableBaseUnits,
    "walletAvailableBaseUnits",
  );
  const totalRequired = requestedAmount + feeAmount;
  const pruSpend = pruAvailable >= totalRequired ? totalRequired : pruAvailable;
  const remainingAfterPru = totalRequired - pruSpend;
  const walletSpend =
    walletAvailable >= remainingAfterPru ? remainingAfterPru : walletAvailable;
  const shortfall = totalRequired - pruSpend - walletSpend;
  const pruEscrowAmount =
    pruSpend >= requestedAmount ? requestedAmount : pruSpend;
  const pruSenderFeeAmount =
    pruSpend > requestedAmount ? pruSpend - requestedAmount : 0n;
  const walletEscrowAmount = requestedAmount - pruEscrowAmount;
  const walletSenderFeeAmount = feeAmount - pruSenderFeeAmount;

  if (shortfall > 0n) {
    return {
      fundingMode: "insufficient",
      requestedAmountBaseUnits: requestedAmount.toString(),
      feeAmountBaseUnits: feeAmount.toString(),
      totalRequiredBaseUnits: totalRequired.toString(),
      pruSpendBaseUnits: pruSpend.toString(),
      pruEscrowAmountBaseUnits: pruEscrowAmount.toString(),
      pruSenderFeeBaseUnits: pruSenderFeeAmount.toString(),
      walletSpendBaseUnits: walletSpend.toString(),
      walletEscrowAmountBaseUnits: walletEscrowAmount.toString(),
      walletSenderFeeBaseUnits: walletSenderFeeAmount.toString(),
      shortfallBaseUnits: shortfall.toString(),
      privacyLevel: "blocked",
      requiresPruExecution: pruSpend > 0n,
      userMessage:
        "TIN balance plus main wallet balance is not enough for this payment.",
    };
  }

  if (pruSpend === totalRequired && totalRequired > 0n) {
    return {
      fundingMode: "zk_pru_only_v2",
      requestedAmountBaseUnits: requestedAmount.toString(),
      feeAmountBaseUnits: feeAmount.toString(),
      totalRequiredBaseUnits: totalRequired.toString(),
      pruSpendBaseUnits: pruSpend.toString(),
      pruEscrowAmountBaseUnits: pruEscrowAmount.toString(),
      pruSenderFeeBaseUnits: pruSenderFeeAmount.toString(),
      walletSpendBaseUnits: "0",
      walletEscrowAmountBaseUnits: "0",
      walletSenderFeeBaseUnits: "0",
      shortfallBaseUnits: "0",
      privacyLevel: "highest",
      requiresPruExecution: true,
      userMessage: "This payment can be funded fully from TIN balance.",
    };
  }

  if (pruSpend > 0n && walletSpend > 0n) {
    return {
      fundingMode: "mixed_zk_pru_wallet_v2",
      requestedAmountBaseUnits: requestedAmount.toString(),
      feeAmountBaseUnits: feeAmount.toString(),
      totalRequiredBaseUnits: totalRequired.toString(),
      pruSpendBaseUnits: pruSpend.toString(),
      pruEscrowAmountBaseUnits: pruEscrowAmount.toString(),
      pruSenderFeeBaseUnits: pruSenderFeeAmount.toString(),
      walletSpendBaseUnits: walletSpend.toString(),
      walletEscrowAmountBaseUnits: walletEscrowAmount.toString(),
      walletSenderFeeBaseUnits: walletSenderFeeAmount.toString(),
      shortfallBaseUnits: "0",
      privacyLevel: "reduced",
      requiresPruExecution: true,
      userMessage:
        "This payment uses TIN balance first and main wallet balance for the remaining amount.",
    };
  }

  return {
    fundingMode: "wallet_only_v2",
    requestedAmountBaseUnits: requestedAmount.toString(),
    feeAmountBaseUnits: feeAmount.toString(),
    totalRequiredBaseUnits: totalRequired.toString(),
    pruSpendBaseUnits: "0",
    pruEscrowAmountBaseUnits: "0",
    pruSenderFeeBaseUnits: "0",
    walletSpendBaseUnits: totalRequired.toString(),
    walletEscrowAmountBaseUnits: requestedAmount.toString(),
    walletSenderFeeBaseUnits: feeAmount.toString(),
    shortfallBaseUnits: "0",
    privacyLevel: "lowest",
    requiresPruExecution: false,
    userMessage:
      "No spendable TIN balance was found for this token, so this payment uses the connected wallet.",
  };
}
