import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {GPRU,TSNP,ADDRESSES} from "./hidden-head-setup.mjs";
const require=createRequire(new URL("../tsn-protocol/sdks/tsn-sdk/package.json",import.meta.url));
const {PublicKey,Connection,Keypair,Transaction,TransactionInstruction,SystemProgram,sendAndConfirmTransaction}=require("@solana/web3.js");
const hash=(...parts)=>{const h=createHash("sha256");for(const p of parts)h.update(p);return h.digest()};
const disc=n=>hash(Buffer.from("global:"+n)).subarray(0,8);
export const EPOCH_VERIFIER=PublicKey.findProgramAddressSync([Buffer.from("gpru:tcap-epoch-verifier:v1")],GPRU)[0];
function bytes(v,n){if(!Array.isArray(v)||v.length!==n||v.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error("Invalid epoch verifier bytes");return Buffer.from(v)}
export function epochMaterial(args,source) {
  if(args.public_input_count!==5||args.ic?.length!==6)throw Error("Epoch requires five public inputs and six IC points");
  const header=[bytes(args.alpha_g1,64),...["beta_g2","gamma_g2","delta_g2"].map(k=>bytes(args[k],128))];
  const points=args.ic.map(p=>bytes(p,64));
  const circuit=hash(Buffer.from("TSN_TCAP_CREDIT_EPOCH_CIRCUIT_V1\0"),source,Buffer.from("circomlib-poseidon-bn254-v1"));
  const key=hash(Buffer.from("TSN_TCAP_CREDIT_EPOCH_KEY_V1\0"),...header,...points);
  if(!circuit.equals(bytes(args.circuit_commitment,32))||!key.equals(bytes(args.key_commitment,32))||points.some(p=>p.every(b=>b===0)))throw Error("Epoch source or key commitment mismatch");
  return {circuit,key,header,points};
}
export function epochInstructions(authority,material) {
  const keys=[{pubkey:authority,isSigner:true,isWritable:true},{pubkey:ADDRESSES.mother,isSigner:false,isWritable:false},{pubkey:EPOCH_VERIFIER,isSigner:false,isWritable:true}];
  const txs=[new TransactionInstruction({programId:GPRU,keys:[...keys,{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],data:Buffer.concat([disc("initialize_tcap_epoch_verifier_v1"),material.circuit,material.key,...material.header])})];
  for(let start=0;start<6;start+=4){const points=material.points.slice(start,start+4),count=Buffer.alloc(4);count.writeUInt32LE(points.length);txs.push(new TransactionInstruction({programId:GPRU,keys,data:Buffer.concat([disc("write_tcap_epoch_verifier_ic_v1"),Buffer.from([start]),count,...points])}))}
  txs.push(new TransactionInstruction({programId:GPRU,keys,data:disc("enable_tcap_epoch_verifier_v1")}));
  return txs;
}
function matches(info,material,authority) {
  if(!info||!info.owner.equals(GPRU)||info.data.length!==940||!info.data.subarray(0,8).equals(hash(Buffer.from("account:GpruTcapEpochVerifierV1")).subarray(0,8)))throw Error("Invalid epoch verifier account");
  const d=info.data;
  if(d.readUInt16LE(8)!==1||!d.subarray(10,42).equals(authority.toBuffer())||!d.subarray(42,74).equals(material.circuit)||!d.subarray(74,106).equals(material.key)||!d.subarray(108,556).equals(Buffer.concat(material.header)))throw Error("Existing epoch verifier differs; use explicit rekey");
  if(d[106]===1&&!d.subarray(556).equals(Buffer.concat(material.points)))throw Error("Enabled epoch key differs");
  return d[106]===1;
}
export function epochInitializationPlan(authority,material,verifier,command="init") {
  if(!["init","rekey"].includes(command))throw Error("Invalid epoch setup command");
  const txs=epochInstructions(authority,material);
  if(command==="rekey"){if(!verifier)throw Error("Rekey requires an existing epoch verifier");return txs;}
  if(verifier){if(matches(verifier,material,authority))return [];txs.shift();}
  return txs;
}
export async function main(argv) {
  const command=argv[0]??"status",options={};
  if(!["status","init","rekey"].includes(command))throw Error("Usage: tcap-epoch-setup.mjs status|init|rekey [--rpc URL] [--args FILE] [--wallet KEYPAIR] [--send]");
  for(let i=1;i<argv.length;i++){if(argv[i]==="--send")options.send=true;else if(["--rpc","--args","--wallet"].includes(argv[i])&&argv[i+1])options[argv[i++].slice(2)]=argv[i];else throw Error("Unknown or missing epoch option")}
  const rpc=options.rpc??"https://api.devnet.solana.com",connection=new Connection(rpc,"confirmed");
  if(await connection.getGenesisHash()!=="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG")throw Error("Epoch setup requires Devnet");
  const [mother,verifier]=await connection.getMultipleAccountsInfo([ADDRESSES.mother,EPOCH_VERIFIER],"confirmed");
  if(!mother||!mother.owner.equals(TSNP)||mother.data.length<40||!mother.data.subarray(0,8).equals(hash(Buffer.from("account:MotherEscrow")).subarray(0,8)))throw Error("Invalid Mother Escrow");
  const authority=new PublicKey(mother.data.subarray(8,40));
  console.log(JSON.stringify({verifier:EPOCH_VERIFIER.toBase58(),exists:!!verifier,enabled:verifier?.data[106]===1,authority:authority.toBase58()}));
  if(command==="status")return;
  if(!options.args)throw Error("--args is required");
  const source=fs.readFileSync(new URL("../tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/main.circom",import.meta.url));
  const material=epochMaterial(JSON.parse(fs.readFileSync(options.args,"utf8")),source);
  const txs=epochInitializationPlan(authority,material,verifier,command);
  if(!txs.length){console.log("Epoch verifier already matches");return;}
  const {blockhash}=await connection.getLatestBlockhash("confirmed");
  const sizes=txs.map(ix=>new Transaction({feePayer:authority,recentBlockhash:blockhash}).add(ix).serialize({requireAllSignatures:false,verifySignatures:false}).length);
  if(sizes.some(n=>n>1232))throw Error("Epoch setup packet too large");
  console.log(JSON.stringify({mode:options.send?"SEND":"READ-ONLY PLAN",transactions:txs.length,packetBytes:sizes}));
  if(!options.send)return;
  if(!options.wallet)throw Error("--wallet is required for --send");
  const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(options.wallet,"utf8"))));
  if(!signer.publicKey.equals(authority))throw Error("Wallet must be Mother authority");
  for(const ix of txs)console.log(JSON.stringify({signature:await sendAndConfirmTransaction(connection,new Transaction().add(ix),[signer],{commitment:"confirmed"})}));
  if(!matches(await connection.getAccountInfo(EPOCH_VERIFIER,"confirmed"),material,authority))throw Error("Epoch verifier remains disabled");
  console.log("CONFIRMED: epoch verifier enabled with all six IC points");
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(String(e.message).replace(/https?:\/\/[^\s]+/g,"[RPC URL]"));process.exitCode=1});
