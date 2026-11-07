import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {PublicKey} from "@solana/web3.js";
import {assertSealedFundingPool} from "../src/dbrix/funding-root.js";
test("sealed funding gate binds asset, root, token and real-source counts",()=>{
  const owner=new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF"),asset=new PublicKey(Buffer.alloc(32,7)),root="00".repeat(31)+"0a";
  const [address,bump]=PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),asset.toBuffer(),Buffer.from(root,"hex")],owner);
  const data=Buffer.alloc(113);createHash("sha256").update("account:TcapSealedFundingPoolV1").digest().copy(data,0,0,8);
  data.writeUInt16LE(1,8);data[10]=bump;asset.toBuffer().copy(data,11);data.writeUInt32LE(7,43);Buffer.from(root,"hex").copy(data,47);
  data.writeBigUInt64LE(20n,79);data.writeBigUInt64LE(3n,87);data.writeUInt16LE(2,95);data.writeBigUInt64LE(100n,97);data.writeBigUInt64LE(150n,105);
  const account={owner,data,executable:false,lamports:1,rentEpoch:0};
  assert.doesNotThrow(()=>assertSealedFundingPool(account,address,asset,7,root));
  for(const change of [
    (d:Buffer)=>{d[0]^=1},(d:Buffer)=>{d[10]^=1},(d:Buffer)=>{d[11]^=1},(d:Buffer)=>d.writeUInt32LE(8,43),
    (d:Buffer)=>{d[47]^=1},(d:Buffer)=>d.writeBigUInt64LE(1n,87),(d:Buffer)=>d.writeUInt16LE(1,95),
    (d:Buffer)=>d.writeUInt16LE(4,95),(d:Buffer)=>d.writeBigUInt64LE(21n,87),(d:Buffer)=>d.writeBigUInt64LE(99n,105),
    (d:Buffer)=>d.writeBigUInt64LE((1n<<32n)+1n,79)
  ]){const d=Buffer.from(data);change(d);assert.throws(()=>assertSealedFundingPool({...account,data:d},address,asset,7,root),/POOL_INVALID/)}
  assert.throws(()=>assertSealedFundingPool({...account,owner:PublicKey.default},address,asset,7,root));
  assert.throws(()=>assertSealedFundingPool(account,PublicKey.default,asset,7,root));
});
