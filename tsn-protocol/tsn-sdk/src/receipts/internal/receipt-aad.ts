import {
  TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION,
  TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION,
  type PrivateReceiptAad,
} from "../types.js";
import { canonicalFields } from "./encoding.js";

export function createPrivateReceiptAad(params: {
  receiptId: string;
  operationId: string;
  tinCommitment: string;
}): PrivateReceiptAad {
  return {
    protocolVersion: TSN_PRIVATE_RECEIPT_PROTOCOL_VERSION,
    receiptId: params.receiptId,
    operationId: params.operationId,
    tinCommitment: params.tinCommitment,
    encryptionVersion: TSN_PRIVATE_RECEIPT_ENCRYPTION_VERSION,
  };
}

export function serializePrivateReceiptAad(aad: PrivateReceiptAad): Uint8Array {
  return canonicalFields([
    "TSN_PRIVATE_RECEIPT_AAD",
    aad.protocolVersion,
    aad.receiptId,
    aad.operationId,
    aad.tinCommitment,
    aad.encryptionVersion,
  ]);
}
