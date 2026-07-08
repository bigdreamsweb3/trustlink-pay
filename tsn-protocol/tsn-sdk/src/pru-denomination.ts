export type PruDenominationConfig = {
  tokenMint: string;
  denominationsBaseUnits: bigint[];
  minimumViableDenominationBaseUnits: bigint;
};

export type PruDenominationSelection = {
  tin: string;
  pruIndex: number;
  amountBaseUnits: bigint;
};

export type PruDenominationPlan = {
  selections: PruDenominationSelection[];
  totalSelectedBaseUnits: bigint;
  changeBaseUnits: bigint;
};

export type PruSpendBatch = {
  selections: PruDenominationSelection[];
  totalAmountBaseUnits: bigint;
  estimatedTxBytes: number;
};

export type PruChangeOutput = {
  amountBaseUnits: bigint;
};

export type PruReorganizationPlan = {
  mergeInputs: PruDenominationSelection[];
  splitOutputs: PruChangeOutput[];
};

export const DEFAULT_PRU_DENOMINATIONS_USDC: bigint[] = [
  1000n * 1_000_000n,
  500n * 1_000_000n,
  100n * 1_000_000n,
  50n * 1_000_000n,
  20n * 1_000_000n,
  10n * 1_000_000n,
  5n * 1_000_000n,
  1n * 1_000_000n,
];

export const MIN_PRU_DENOMINATION_USDC = 1n * 1_000_000n;

const SOLANA_MAX_TX_BYTES = 1232;
const BASE_TX_OVERHEAD_BYTES = 200;
const PER_PRU_SELECTION_OVERHEAD_BYTES = 180;

export function getDefaultDenominationConfig(tokenMint: string): PruDenominationConfig {
  return {
    tokenMint,
    denominationsBaseUnits: [...DEFAULT_PRU_DENOMINATIONS_USDC],
    minimumViableDenominationBaseUnits: MIN_PRU_DENOMINATION_USDC,
  };
}

export function estimatePruSelectionTxBytes(selectionCount: number): number {
  return BASE_TX_OVERHEAD_BYTES + selectionCount * PER_PRU_SELECTION_OVERHEAD_BYTES;
}

export function maxSelectionsPerTx(): number {
  let count = 1;
  while (estimatePruSelectionTxBytes(count + 1) <= SOLANA_MAX_TX_BYTES) {
    count++;
  }
  return count;
}

export function splitIntoDenominations(
  amountBaseUnits: bigint,
  config: PruDenominationConfig,
): bigint[] {
  if (amountBaseUnits <= 0n) return [];

  const sorted = [...config.denominationsBaseUnits].sort((a, b) => Number(b - a));
  const result: bigint[] = [];
  let remaining = amountBaseUnits;

  for (const denom of sorted) {
    if (remaining === 0n) break;
    if (denom < config.minimumViableDenominationBaseUnits) continue;
    if (denom > remaining) continue;
    const count = Number(remaining / denom);
    for (let i = 0; i < count; i++) {
      result.push(denom);
    }
    remaining -= BigInt(count) * denom;
  }

  if (remaining > 0n) {
    result.push(remaining);
  }

  return result;
}

export function planPruSpend(
  amountBaseUnits: bigint,
  config: PruDenominationConfig,
  availablePrus: Map<string, { tin: string; pruIndex: number; amountBaseUnits: bigint }[]>,
): PruDenominationPlan {
  const sortedDenoms = [...config.denominationsBaseUnits].sort((a, b) => Number(b - a));

  const exact = findExactDenominationMatch(amountBaseUnits, availablePrus);
  if (exact) {
    return {
      selections: [exact],
      totalSelectedBaseUnits: exact.amountBaseUnits,
      changeBaseUnits: 0n,
    };
  }

  const fewestPlan = selectFewestPrus(amountBaseUnits, availablePrus, sortedDenoms);

  if (fewestPlan && fewestPlan.totalSelectedBaseUnits >= amountBaseUnits) {
    return fewestPlan;
  }

  const bestOver = findSmallestPruOverAmount(amountBaseUnits, availablePrus);
  if (bestOver) {
    return {
      selections: [bestOver],
      totalSelectedBaseUnits: bestOver.amountBaseUnits,
      changeBaseUnits: bestOver.amountBaseUnits - amountBaseUnits,
    };
  }

  if (fewestPlan) {
    return fewestPlan;
  }

  return {
    selections: [],
    totalSelectedBaseUnits: 0n,
    changeBaseUnits: 0n,
  };
}

function findExactDenominationMatch(
  amountBaseUnits: bigint,
  availablePrus: Map<string, { tin: string; pruIndex: number; amountBaseUnits: bigint }[]>,
): PruDenominationSelection | null {
  for (const [, prus] of availablePrus) {
    for (const pru of prus) {
      if (pru.amountBaseUnits === amountBaseUnits) {
        return { tin: pru.tin, pruIndex: pru.pruIndex, amountBaseUnits: pru.amountBaseUnits };
      }
    }
  }
  return null;
}

function findSmallestPruOverAmount(
  amountBaseUnits: bigint,
  availablePrus: Map<string, { tin: string; pruIndex: number; amountBaseUnits: bigint }[]>,
): PruDenominationSelection | null {
  let best: PruDenominationSelection | null = null;
  for (const [, prus] of availablePrus) {
    for (const pru of prus) {
      if (pru.amountBaseUnits >= amountBaseUnits) {
        if (!best || pru.amountBaseUnits < best.amountBaseUnits) {
          best = { tin: pru.tin, pruIndex: pru.pruIndex, amountBaseUnits: pru.amountBaseUnits };
        }
      }
    }
  }
  return best;
}

function selectFewestPrus(
  amountBaseUnits: bigint,
  availablePrus: Map<string, { tin: string; pruIndex: number; amountBaseUnits: bigint }[]>,
  sortedDenoms: bigint[],
): PruDenominationPlan | null {
  const allPrus: PruDenominationSelection[] = [];
  for (const [, prus] of availablePrus) {
    for (const pru of prus) {
      allPrus.push({ tin: pru.tin, pruIndex: pru.pruIndex, amountBaseUnits: pru.amountBaseUnits });
    }
  }

  const sortedPrus = [...allPrus].sort((a, b) => Number(b.amountBaseUnits - a.amountBaseUnits));
  const selections: PruDenominationSelection[] = [];
  let total = 0n;

  for (const pru of sortedPrus) {
    if (total >= amountBaseUnits) break;
    selections.push(pru);
    total += pru.amountBaseUnits;
  }

  if (selections.length === 0) return null;

  return {
    selections,
    totalSelectedBaseUnits: total,
    changeBaseUnits: total > amountBaseUnits ? total - amountBaseUnits : 0n,
  };
}

export function computeChangeOutputs(
  changeBaseUnits: bigint,
  config: PruDenominationConfig,
): PruChangeOutput[] {
  if (changeBaseUnits <= 0n) return [];
  const denomParts = splitIntoDenominations(changeBaseUnits, config);
  return denomParts.map((amount) => ({ amountBaseUnits: amount }));
}

export function planReorganization(
  existingPrus: { tin: string; pruIndex: number; amountBaseUnits: bigint }[],
  config: PruDenominationConfig,
): PruReorganizationPlan {
  const mergeThreshold = config.minimumViableDenominationBaseUnits;
  const smallPrus = existingPrus.filter((p) => p.amountBaseUnits < mergeThreshold);
  const largePrus = existingPrus.filter((p) => p.amountBaseUnits >= mergeThreshold);

  if (smallPrus.length === 0) {
    return { mergeInputs: [], splitOutputs: [] };
  }

  const totalSmall = smallPrus.reduce((sum, p) => sum + p.amountBaseUnits, 0n);
  const mergedValue = totalSmall;
  const splitOutputs = computeChangeOutputs(mergedValue, config);

  return {
    mergeInputs: smallPrus.map((p) => ({
      tin: p.tin,
      pruIndex: p.pruIndex,
      amountBaseUnits: p.amountBaseUnits,
    })),
    splitOutputs,
  };
}

export function batchPruSelections(
  selections: PruDenominationSelection[],
): PruSpendBatch[] {
  const maxPerBatch = maxSelectionsPerTx();
  const batches: PruSpendBatch[] = [];

  for (let i = 0; i < selections.length; i += maxPerBatch) {
    const batch = selections.slice(i, i + maxPerBatch);
    const total = batch.reduce((sum, s) => sum + s.amountBaseUnits, 0n);
    batches.push({
      selections: batch,
      totalAmountBaseUnits: total,
      estimatedTxBytes: estimatePruSelectionTxBytes(batch.length),
    });
  }

  return batches;
}

export function formatDenominationSummary(selections: PruDenominationSelection[]): string {
  const groups = new Map<string, number>();
  for (const sel of selections) {
    const key = String(sel.amountBaseUnits);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => Number(BigInt(b) - BigInt(a)))
    .map(([amount, count]) => `${count}x${Number(BigInt(amount) / 1_000_000n)}`)
    .join("+");
}
