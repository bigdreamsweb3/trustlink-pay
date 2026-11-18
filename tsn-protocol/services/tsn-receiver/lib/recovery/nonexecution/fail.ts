

/** fail component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export const fail = (reason: string): never => { throw new Error(`SETTLEMENT_NONEXECUTION_${reason}`); };
