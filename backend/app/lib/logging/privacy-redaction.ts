const REDACTED = "[REDACTED]";

const PRIVATE_IDENTITY_FIELD =
  /^(ownerPublicKey|signerPublicKey|tinsWalletPublicKey|tins_wallet_pubkey|ownerWallet|walletAddress|senderWallet|receiverWallet|settlementWallet|walletBinding|authorization|signature|phoneNumber|normalizedPhoneNumber|rawFrom|from|recipientId|contactName|userPhone|sessionCode|challengeToken|reviewMessageId|replyMessageId|messageId|text|inboundText|match)$/i;

export function redactPrivateIdentityFields(
  value: unknown,
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth >= 4) return "[REDACTED NESTED VALUE]";
  if (Array.isArray(value)) {
    return value.map((entry) => redactPrivateIdentityFields(entry, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      PRIVATE_IDENTITY_FIELD.test(key)
        ? REDACTED
        : redactPrivateIdentityFields(entry, depth + 1),
    ]),
  );
}
