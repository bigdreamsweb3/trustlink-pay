export async function traceConfirmedTransaction(connection, signature) {
  const transaction = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!transaction) throw new Error(`Confirmed transaction not available: ${signature}`);
  const message = transaction.transaction.message;
  const accountKeys = message.accountKeys.map((entry) => ({ pubkey: entry.pubkey.toBase58(), signer: entry.signer, writable: entry.writable }));
  return {
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    fee: transaction.meta?.fee ?? null,
    error: transaction.meta?.err ?? null,
    accountKeys,
    instructions: message.instructions.map((ix) => ({ programId: ix.programId?.toBase58?.() ?? null, parsed: ix.parsed ?? null, data: ix.data ?? null, accounts: ix.accounts?.map((x) => x.toBase58()) ?? null })),
    innerInstructions: transaction.meta?.innerInstructions ?? [],
    preTokenBalances: transaction.meta?.preTokenBalances ?? [],
    postTokenBalances: transaction.meta?.postTokenBalances ?? [],
    logs: transaction.meta?.logMessages ?? [],
    computeUnits: transaction.meta?.logMessages?.find((line) => line.includes("consumed")) ?? null,
  };
}
