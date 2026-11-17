import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {PublicKey} from "@solana/web3.js";
import {assertFundingRoot} from "../src/dbrix/funding-root.js";
const owner = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const [address,bump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:funding-root:v1")],owner);
const root = (n: number) => Buffer.from(BigInt(n).toString(16).padStart(64,"0"),"hex");
function fixture(size = 3, cursor = size === 128 ? 7 : size, lastCount = size) {
  const data=Buffer.alloc(6209);
  createHash("sha256").update("account:TcapFundingMerkleRootV1").digest().copy(data,0,0,8);
  data.writeUInt16LE(2,8);data.writeUInt16LE(1,10);data[12]=bump;
  data.writeUInt32LE(32,53);data.writeUInt32LE(128,1081);
  data.writeUInt16LE(cursor,6205);data.writeUInt16LE(size,6207);
  root(lastCount || 1).copy(data,13);data.writeBigUInt64LE(BigInt(lastCount),45);
  for(let i=0;i<size;i++) {
    const offset=1085+(size===128?(cursor+i)%128:i)*40;
    root(lastCount-size+i+1).copy(data,offset);data.writeBigUInt64LE(BigInt(lastCount-size+i+1),offset+32);
  }
  return {owner,data,executable:false,lamports:1,rentEpoch:0};
}
test("global funding roots accept one deposit and retained roots after later deposits",()=>{
  for (const size of [1,3,128]) {
    const account=fixture(size);
    for(const selected of [1,size]) assert.doesNotThrow(()=>assertFundingRoot(account,address,root(selected).toString("hex")));
    assert.throws(()=>assertFundingRoot(account,address,root(size+1).toString("hex")),/ROOT_CHANGED/);
  }
  assert.throws(()=>assertFundingRoot(fixture(0),address,root(1).toString("hex")),/ROOT_CHANGED/);
});
test("funding history rejects malformed layouts, noncanonical fields and chronology",()=>{
  const account=fixture(),selected=root(2).toString("hex");
  for(const change of [
    (d:Buffer)=>{d[0]^=1},(d:Buffer)=>d.writeUInt16LE(1,8),(d:Buffer)=>{d[12]^=1},
    (d:Buffer)=>d.writeUInt16LE(2,10),(d:Buffer)=>d.fill(0,13,45),
    (d:Buffer)=>d.writeBigUInt64LE((1n<<32n)+1n,45),(d:Buffer)=>d.writeUInt32LE(31,53),
    (d:Buffer)=>d.fill(255,57,89),(d:Buffer)=>d.writeUInt32LE(127,1081),
    (d:Buffer)=>d.fill(0,1085,1117),(d:Buffer)=>d.writeBigUInt64LE(1n,1157),
    (d:Buffer)=>d.writeBigUInt64LE(4n,1117),(d:Buffer)=>{d[1085+3*40]=1},
    (d:Buffer)=>d.writeBigUInt64LE(1n,1085+3*40+32),(d:Buffer)=>d.writeUInt16LE(2,6205),
    (d:Buffer)=>d.writeUInt16LE(129,6207),(d:Buffer)=>root(4).copy(d,13),
    (d:Buffer)=>d.writeBigUInt64LE(4n,45),
  ]) {
    const data=Buffer.from(account.data);change(data);
    assert.throws(()=>assertFundingRoot({...account,data},address,selected),/ROOT_INVALID/);
  }
  assert.throws(()=>assertFundingRoot({...account,data:account.data.subarray(0,6208)},address,selected),/ROOT_INVALID/);
  assert.throws(()=>assertFundingRoot({...account,owner:PublicKey.default},address,selected),/ROOT_INVALID/);
  assert.throws(()=>assertFundingRoot(account,PublicKey.default,selected),/ROOT_INVALID/);
  for(const selected of ["00".repeat(32),"ff".repeat(32),"invalid"]) assert.throws(()=>assertFundingRoot(account,address,selected),/ROOT_INVALID/);
  const gapped=fixture(3,3,5);gapped.data.writeBigUInt64LE(1n,1117);gapped.data.writeBigUInt64LE(3n,1157);
  assert.throws(()=>assertFundingRoot(gapped,address,root(5).toString("hex")),/ROOT_INVALID/);
});
test("full funding ring requires the cursor to identify the oldest retained root",()=>{
  const account=fixture(128),selected=root(128).toString("hex");
  const data=Buffer.from(account.data);data.writeUInt16LE(8,6205);
  assert.throws(()=>assertFundingRoot({...account,data},address,selected),/ROOT_INVALID/);
  const old=Buffer.from(account.data);old.writeUInt16LE(128,6205);
  assert.throws(()=>assertFundingRoot({...account,data:old},address,selected),/ROOT_INVALID/);
  const migrated=fixture(1,1,100);
  assert.doesNotThrow(()=>assertFundingRoot(migrated,address,root(100).toString("hex")));
  const wrapped=fixture(128,7,130);
  for(const selected of [3,130]) assert.doesNotThrow(()=>assertFundingRoot(wrapped,address,root(selected).toString("hex")));
  assert.throws(()=>assertFundingRoot(wrapped,address,root(1).toString("hex")),/ROOT_CHANGED/);
});
