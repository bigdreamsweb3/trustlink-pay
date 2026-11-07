/** Public-only regression check: no Receiver, environment files, openings or signed submissions. */
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "tsn-protocol/sdks/tsn-sdk/package.json"));
const { poseidon2 } = require("poseidon-lite/poseidon2");
const { poseidon4 } = require("poseidon-lite/poseidon4");
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const q = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TSNP = "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V";
const TCAP = "tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const sha = b => createHash("sha256").update(b).digest();
const fieldHex = n => n.toString(16).padStart(64, "0");
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };

function decode58(value) {
  let n = 0n;
  for (const ch of value) { const digit = alphabet.indexOf(ch); assert(digit >= 0, "INVALID_BASE58"); n = n * 58n + BigInt(digit); }
  let h = n.toString(16); if (h.length % 2) h = "0" + h;
  return Buffer.concat([Buffer.alloc(value.length - value.replace(/^1+/, "").length), n ? Buffer.from(h, "hex") : Buffer.alloc(0)]);
}
function encode58(bytes) {
  let n = BigInt("0x" + bytes.toString("hex")), out = "";
  while (n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out;
}
function oldNullifier(signature) {
  return fieldHex(BigInt("0x" + sha(Buffer.concat([Buffer.from("TSN_GPRU_CONFIRMED_DEPOSIT_NULLIFIER_V1\0"), decode58(TCAP), decode58(signature)])).toString("hex")) % q);
}
function creditStatement(receipt, signature) {
  assert(receipt.version === 1 && receipt.meta?.err === null && receipt.transaction?.[1] === "base64", "CREDIT_NOT_SUCCESSFUL_V1");
  const wire = Buffer.from(receipt.transaction[0], "base64");
  assert(wire.length >= 170 && wire.length <= 4096 && wire[0] === 0x81 && wire[1] === 2, "INVALID_CREDIT_WIRE");
  const message = wire.subarray(0, -128), n = message[41];
  assert(message[40] === 2 && message.readUInt32LE(4) === 12 && n >= 2 && n <= 96, "INVALID_CREDIT_WIRE");
  const keys = Array.from({ length: n }, (_, i) => encode58(message.subarray(42 + 32 * i, 74 + 32 * i)));
  for (let i = 0; i < 2; i++) {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), decode58(keys[i])]), format: "der", type: "spki" });
    assert(verify(null, message, key, wire.subarray(message.length + 64 * i, message.length + 64 * (i + 1))), "INVALID_CREDIT_SIGNATURE");
  }
  assert(encode58(wire.subarray(-128, -64)) === signature, "CREDIT_SIGNATURE_MISMATCH");
  let cursor = 42 + 32 * n + 8;
  const headers = [0, 1].map(() => { const h = { p: message[cursor], n: message[cursor + 1], bytes: message.readUInt16LE(cursor + 2) }; cursor += 4; return h; });
  const instructions = headers.map(h => {
    const indexes = [...message.subarray(cursor, cursor + h.n)]; cursor += h.n;
    const data = message.subarray(cursor, cursor + h.bytes); cursor += h.bytes;
    assert(h.p < n && indexes.every(i => i < n) && data.length === h.bytes, "INVALID_INSTRUCTION");
    return { program: keys[h.p], accounts: indexes.map(i => keys[i]), data };
  });
  assert(cursor === message.length && instructions[0].program === TSNP && instructions[1].program === MEMO, "UNEXPECTED_CREDIT_INSTRUCTIONS");
  const { data, accounts } = instructions[0];
  const count = data.length === 825 ? 12 : data.length === 857 ? 13 : 0;
  assert(count && data.subarray(0, 8).equals(sha("global:tsn_register_tcap_credit_authorization_v2").subarray(0, 8)) && accounts.length === count + 1, "UNSUPPORTED_CREDIT_ABI");
  const publicInputs = Array.from({ length: count }, (_, i) => data.subarray(140 + 32 * i, 172 + 32 * i).toString("hex"));
  assert(publicInputs.every(x => BigInt("0x" + x) < q), "NONCANONICAL_INPUT");
  const nullifier = data.subarray(108, 140).toString("hex");
  const tail = 140 + count * 32 + 256;
  const tokenId = data.readUInt32LE(96), amount = data.readBigUInt64LE(100).toString();
  assert(publicInputs[4] === nullifier && data[tail] === 1 && data.readUInt32LE(tail + 1) === tokenId && data.readBigUInt64LE(tail + 5).toString() === amount, "PROOF_OUTER_BINDING_MISMATCH");
  return { signature, slot: receipt.slot, blockTimeUtc: new Date(receipt.blockTime * 1000).toISOString(), wireBytes: wire.length,
    wireSha256: sha(wire).toString("hex"), instructionBytes: data.length, publicInputCount: count, nullifier, tokenId, amountBaseUnits: amount,
    fundingRoot: count === 13 ? publicInputs[12] : null, fundingRootAccount: count === 13 ? accounts[13] : null,
    assetEntry: accounts[5], reserveState: accounts[7], feePayer: keys[0], signaturesVerified: 2,
    instructionData: data, memoData: instructions[1].data };
}
function depositStatement(receipt, signature) {
  assert(receipt.meta?.err === null && receipt.transaction?.signatures?.[0] === signature, "DEPOSIT_NOT_SUCCESSFUL");
  const message = receipt.transaction.message, keys = message.accountKeys.map(k => typeof k === "string" ? k : k.pubkey);
  const indexes = message.instructions.filter(ix => keys[ix.programIdIndex] === TCAP);
  assert(indexes.length === 1, "UNEXPECTED_DEPOSIT_INSTRUCTIONS");
  const ix = indexes[0], data = decode58(ix.data), accounts = ix.accounts.map(i => keys[i]);
  const funded = data.length === 48 && data.subarray(0, 8).equals(sha("global:deposit_private_funding_v1").subarray(0, 8));
  if (funded) assert(accounts.length === 9, "UNEXPECTED_FUNDED_DEPOSIT_ABI");
  const eventTag = sha("event:PrivateFundingDepositedV1").subarray(0, 8);
  // Accept events only while executing the expected TCAP deposit invocation.
  const stack = [], events = [];
  for (const line of receipt.meta.logMessages ?? []) {
    let match = /^Program (\w+) invoke \[(\d+)\]$/.exec(line);
    if (match) { stack.push(match[1]); continue; }
    match = /^Program (\w+) (?:success|failed:.*)$/.exec(line);
    if (match) { assert(stack.pop() === match[1], "INVALID_LOG_STACK"); continue; }
    if (line.startsWith("Program data: ") && stack.length === 1 && stack[0] === TCAP) {
      const e = Buffer.from(line.slice(14), "base64");
      if (e.length === 156 && e.subarray(0, 8).equals(eventTag)) events.push({ rootAccount: encode58(e.subarray(8, 40)), leafIndex: e.readBigUInt64LE(40).toString(),
        noteCommitment: e.subarray(48, 80).toString("hex"), tokenId: e.readUInt32LE(80), amountBaseUnits: e.readBigUInt64LE(84).toString(),
        leaf: e.subarray(92, 124).toString("hex"), root: e.subarray(124, 156).toString("hex") });
    }
  }
  assert(stack.length === 0 && (!funded || events.length === 1), "DEPOSIT_EVENT_UNAVAILABLE");
  if (funded) assert(events[0].rootAccount === accounts[8] && events[0].noteCommitment === data.subarray(16, 48).toString("hex") && events[0].amountBaseUnits === data.readBigUInt64LE(8).toString(), "DEPOSIT_EVENT_MISMATCH");
  return { signature, slot: receipt.slot, blockTimeUtc: new Date(receipt.blockTime * 1000).toISOString(), depositor: accounts[0],
    assetEntry: accounts[2], reserveState: accounts[3], mint: accounts[6], fundedNoteAbi: funded, instructionBytes: data.length, event: events[0] ?? null,
    tokenDecimals: (receipt.meta.postTokenBalances ?? []).find(b => b.mint === accounts[6])?.uiTokenAmount?.decimals ?? null };
}
function summarizePair(pair, depositReceipt, creditReceipt) {
  const deposit = depositStatement(depositReceipt, pair.deposit), credit = creditStatement(creditReceipt, pair.credit);
  const old = oldNullifier(pair.deposit);
  const checks = { historicalFormulaMatches: old === credit.nullifier, assetEntryMatches: deposit.assetEntry === credit.assetEntry,
    reserveStateMatches: deposit.reserveState === credit.reserveState };
  if (deposit.event && credit.publicInputCount === 13) {
    const e = deposit.event;
    const leaf = poseidon4([7345779629200698683464734587914033020491313n, BigInt("0x" + e.noteCommitment), BigInt(e.tokenId), BigInt(e.amountBaseUnits)]);
    let zero = 0n, reconstructed = leaf;
    for (let i = 0; i < 32; i++) { reconstructed = poseidon2([reconstructed, zero]); zero = poseidon2([zero, zero]); }
    checks.publicFundedLeafReconstructed = fieldHex(leaf) === e.leaf;
    checks.firstLeafIndex = e.leafIndex === "0";
    checks.singleLeafRootReconstructed = fieldHex(reconstructed) === e.root;
    checks.creditFundingRootMatchesDeposit = credit.fundingRoot === e.root && credit.fundingRootAccount === e.rootAccount;
    checks.assetAndAmountMatch = credit.tokenId === e.tokenId && credit.amountBaseUnits === e.amountBaseUnits;
    checks.noteCommitmentAbsentFromPublicCredit = !credit.instructionData.includes(Buffer.from(e.noteCommitment, "hex")) && !credit.memoData.includes(Buffer.from(e.noteCommitment, "hex"));
    checks.singletonMembershipLink = checks.firstLeafIndex && checks.singleLeafRootReconstructed && checks.creditFundingRootMatchesDeposit && checks.assetAndAmountMatch;
  }
  delete credit.instructionData; delete credit.memoData;
  return { label: pair.label, deposit, credit, oldSignatureDerivedNullifier: old, elapsedSeconds: creditReceipt.blockTime - depositReceipt.blockTime, checks };
}
async function main() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) { assert(/^--(?:deposit|credit|rpc|out)$/.test(process.argv[i]) && process.argv[i + 1], "INVALID_ARGUMENTS"); args.set(process.argv[i], process.argv[i + 1]); }
  assert(args.has("--deposit") && args.has("--credit") && args.has("--out"), "REQUIRED_DEPOSIT_CREDIT_OUT");
  const url = args.get("--rpc") ?? "http://127.0.0.1:8787";
  const rpc = async (method, params) => {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000) });
    assert(response.ok, "RPC_HTTP_UNAVAILABLE"); const data = await response.json(); assert(!data.error && data.result !== null && data.result !== undefined, "RPC_RESULT_UNAVAILABLE"); return data.result;
  };
  const genesis = await rpc("getGenesisHash", []); assert(genesis === DEVNET_GENESIS, "NOT_DEVNET");
  const pairs = [
    { label: "historical-1", deposit: "L4NGZGbStLW8DJpnNPmESj9uoDFEpQaS71EakNtt5ETt5SbjzXhfBtJsY2yzcgPgfc8M9DiGzJtfe7bT96KDhnV", credit: "3D1LppGAnsh7F6Ga4DijPpqChYyhzrNhniSKMpte7aETnunfqpxCWHZjfk83s8ZVenbfbeuvQ5FjigrSH4SUbEHq" },
    { label: "historical-2", deposit: "4MwWKHnRPMbTcezdy2RcXtwHE25zqG8SeCkAVH59AzLyNxAhay7xnwTYGkWSJ2oWtFVvkmUUkrj6cXomXupmn5wQ", credit: "2NLYAP1JALjK28Cr8VvXaUs4PV5YdVUP1sbfd5PCGgSF6EDisj5PCfMeuYC6GEs1Gz8c14WLxzZguCoJ2DFzNa2D" },
    { label: "supplied-funded-note", deposit: args.get("--deposit"), credit: args.get("--credit") },
  ];
  const receipts = await Promise.all(pairs.map(async pair => {
    const [d, c] = await Promise.all([rpc("getTransaction", [pair.deposit, { encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 1 }]), rpc("getTransaction", [pair.credit, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }])]);
    return summarizePair(pair, d, c);
  }));
  assert(receipts.slice(0, 2).every(p => p.checks.historicalFormulaMatches), "HISTORICAL_CONTROLS_FAILED");
  const latest = receipts[2]; assert(latest.credit.publicInputCount === 13 && latest.deposit.fundedNoteAbi, "NEW_PAIR_NOT_FUNDED_NOTE");
  const rootAccount = await rpc("getAccountInfo", [latest.credit.fundingRootAccount, { encoding: "base64", commitment: "finalized" }]);
  const bytes = Buffer.from(rootAccount.value?.data?.[0] ?? "", "base64");
  assert(rootAccount.value?.owner === TCAP && bytes.length === 1081 && bytes.subarray(0, 8).equals(sha("account:TcapFundingMerkleRootV1").subarray(0, 8)) && bytes.readUInt16LE(8) === 1 && bytes.readUInt16LE(10) === 1, "INVALID_FUNDING_ACCOUNT");
  const sourcePaths = ["scripts/check-funded-note-public-link.mjs", "tsn-protocol/programs/gpru/circuits/hidden_head_v1/main.circom", "tsn-protocol/programs/tcap-protocol/programs/tcap/src/private_funding.rs", "tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_private_funding_v1.rs", "tsn-protocol/sdks/tsn-sdk/src/gpru/funding-note.ts"];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async p => [p, sha(await readFile(resolve(root, p))).toString("hex")])));
  const result = { schema: "TSN_PUBLIC_FUNDED_NOTE_LINK_CHECK_V1", checkedAtUtc: new Date().toISOString(), cluster: "devnet", genesisHash: genesis,
    scope: "Finalized public receipts and public TCAP account only; no Receiver, private openings, owner decryption, signing or submissions.",
    pairs: receipts, currentFundingAccount: { address: latest.credit.fundingRootAccount, observedFinalizedSlot: rootAccount.context.slot,
      root: bytes.subarray(13, 45).toString("hex"), leafCount: bytes.readBigUInt64LE(45).toString(), bytes: bytes.length },
    conclusion: { oldFormulaRemovedForSuppliedPair: !latest.checks.historicalFormulaMatches, publicSingletonMembershipLinksSuppliedPair: latest.checks.singletonMembershipLink === true },
    sourceSha256, limitations: ["A different nullifier disproves the old formula for this pair; it does not prove general unlinkability.", "The selected first-leaf root identifies a membership set of one. A shared root with multiple deposits alone does not identify the consumed leaf.", "No proof forgery, deployed-byte equality, new recipient-registry reconstruction, private opening or owner record recovery was tested."] };
  await writeFile(resolve(args.get("--out")), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ historicalControls: 2, observedNullifier: latest.credit.nullifier, oldFormulaMatches: latest.checks.historicalFormulaMatches, singletonMembershipLink: latest.checks.singletonMembershipLink, currentFundingLeafCount: result.currentFundingAccount.leafCount }));
}
main().catch(error => { console.error(error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PUBLIC_LINK_CHECK_FAILED"); process.exitCode = 1; });
