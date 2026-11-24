// Public instruction compilation only: no RPC, wallet, authority key or signature.
import { readFileSync } from "node:fs";
import { AccountRole, address, appendTransactionMessageInstructions, compileTransaction, createTransactionMessage,
  getTransactionEncoder, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, setTransactionMessageConfig } from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import { buildPublicTinDebitInstructionsV1 } from "../src/dbrix/tin-debit-transition.js";
const fixture = JSON.parse(readFileSync(0, "utf8"));
const { instructions } = buildPublicTinDebitInstructionsV1(fixture.transition, new PublicKey(fixture.authority), new PublicKey(fixture.motherEscrow));
let message = setTransactionMessageFeePayer(address(fixture.operator), createTransactionMessage({ version: 1 }));
message = setTransactionMessageLifetimeUsingBlockhash({ blockhash: fixture.blockhash, lastValidBlockHeight: 1000n }, message);
message = appendTransactionMessageInstructions(instructions.map(ix => ({ programAddress: address(ix.programId.toBase58()),
  accounts: ix.keys.map(key => ({ address: address(key.pubkey.toBase58()), role: key.isSigner
    ? key.isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER : key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY })), data: Uint8Array.from(ix.data) })), message);
message = setTransactionMessageConfig({ computeUnitLimit: 1_400_000, loadedAccountsDataSizeLimit: 64 * 1024 * 1024 }, message);
const compiled = compileTransaction(message), wire = getTransactionEncoder().encode(compiled);
if (wire.length > 4096) throw new Error("TIN_DEBIT_NATIVE_V1_WIRE_LIMIT_EXCEEDED");
process.stdout.write(JSON.stringify({ messageBase64: Buffer.from(compiled.messageBytes).toString("base64"), wireBytes: wire.length,
  transactionSizeLimit: 4096, instructionBytes: instructions[0].data.length, memoBytes: instructions.slice(1).map(ix => ix.data.length),
  signerCount: Object.keys(compiled.signatures).length, accountCount: compiled.messageBytes[41] }));
