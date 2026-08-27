import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { TCAP, TSN, connection, redactRpc, seed, inspect, assetForMint } from "./common.mjs";

const rpc = process.env.TCAP_RPC_URL ?? process.env.ANCHOR_PROVIDER_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const c = connection();
const [config] = PublicKey.findProgramAddressSync([seed("tcap:global-config:v1")], TCAP);
const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], TCAP);
const [root] = PublicKey.findProgramAddressSync([seed("tcap:commitment-root:v1")], TCAP);
const [mother] = PublicKey.findProgramAddressSync([seed("tsn_mother_escrow")], TSN);
const programInfo = await c.getAccountInfo(TCAP, "confirmed");
const tsnInfo = await c.getAccountInfo(TSN, "confirmed");
async function deployment(id, info) {
  if (!info || info.data.length < 36) return { lastDeploySlot: null, observedSlot: null };
  const programData = new PublicKey(info.data.subarray(4, 36));
  const details = await c.getAccountInfoAndContext(programData, "confirmed");
  return { programData: programData.toBase58(), lastDeploySlot: details.value?.data.length >= 12 ? details.value.data.readBigUInt64LE(4).toString() : null, observedSlot: details.context.slot };
}
const [tcapDeployment, tsnDeployment] = await Promise.all([deployment(TCAP, programInfo), deployment(TSN, tsnInfo)]);
const motherInfo = await c.getAccountInfo(mother, "confirmed");
const motherAuthority = motherInfo?.data.length >= 40 ? new PublicKey(motherInfo.data.subarray(8, 40)).toBase58() : null;
const accounts = await c.getProgramAccounts(TCAP, { commitment: "confirmed" });
const discriminator = createHash("sha256").update("account:TcapAssetEntryV1").digest().subarray(0, 8);
const assets = accounts.filter(({ account }) => account.data.length >= 287 && account.data.subarray(0, 8).equals(discriminator));
console.log(JSON.stringify({ cluster: "devnet", rpc: redactRpc(rpc), slot: await c.getSlot("confirmed"), programs: { tcap: { id: TCAP.toBase58(), ...tcapDeployment }, tsn: { id: TSN.toBase58(), ...tsnDeployment } }, motherEscrow: { address: mother.toBase58(), exists: Boolean(motherInfo), authority: motherAuthority }, canonical: { config: config.toBase58(), registry: registry.toBase58(), commitmentRoot: root.toBase58() }, assets: assets.map(({ pubkey, account }) => ({ address: pubkey.toBase58(), ...decodeSafe(account.data) })), missingOrLegacy: accounts.filter(({ account }) => account.data.length < 287 && account.data.length >= 8).map(({ pubkey, account }) => ({ address: pubkey.toBase58(), bytes: account.data.length, classification: "legacy-or-unknown" })) }, null, 2));
function decodeSafe(data) { try { return decodeAssetEntry(data); } catch { return { bytes: data.length, classification: "legacy-or-unknown" }; } }
import { decodeAssetEntry } from "../../tcap-protocol/scripts/tcap-asset-admin.mjs";
