import {
  SendTransactionError,
  type Connection,
} from "@solana/web3.js";

function getMostRelevantProgramLog(logs: string[]) {
  return [...logs]
    .reverse()
    .find(
      (log) =>
        log.includes("Program log:") ||
        log.includes("Program failed") ||
        log.includes("custom program error"),
    );
}

export async function enrichSolanaTransactionError(
  error: unknown,
  connection: Connection,
) {
  if (!(error instanceof SendTransactionError)) {
    return error instanceof Error
      ? error
      : new Error("The Solana transaction could not be submitted.");
  }

  const logs = error.logs ?? (await error.getLogs(connection).catch(() => []));
  const relevantLog = getMostRelevantProgramLog(logs);
  const message = relevantLog
    ? `${error.transactionError.message} ${relevantLog}`
    : error.transactionError.message;

  return new Error(message, { cause: error });
}
