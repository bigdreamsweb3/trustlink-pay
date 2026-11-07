import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PublicKey,Transaction,GPRU} from '../hidden-head-setup.mjs';
import {epochMaterial,epochInstructions,epochInitializationPlan,EPOCH_VERIFIER} from '../tcap-epoch-setup.mjs';
const source=fs.readFileSync(new URL('../../tsn-protocol/programs/gpru/circuits/tcap_epoch_v1/main.circom',import.meta.url));
const hash=(...p)=>[...createHash('sha256').update(Buffer.concat(p.map(x=>Buffer.from(x)))).digest()];
const authority=new PublicKey('11111111111111111111111111111112');
function args(){const v={public_input_count:5,alpha_g1:Array(64).fill(1),beta_g2:Array(128).fill(2),gamma_g2:Array(128).fill(3),delta_g2:Array(128).fill(4),ic:Array.from({length:6},()=>Array(64).fill(5))};
 v.circuit_commitment=hash(Buffer.from('TSN_TCAP_CREDIT_EPOCH_CIRCUIT_V1\0'),source,Buffer.from('circomlib-poseidon-bn254-v1'));
 v.key_commitment=hash(Buffer.from('TSN_TCAP_CREDIT_EPOCH_KEY_V1\0'),v.alpha_g1,v.beta_g2,v.gamma_g2,v.delta_g2,...v.ic);return v;}
function account(m,enabled){const d=Buffer.alloc(940);Buffer.from(hash(Buffer.from('account:GpruTcapEpochVerifierV1'))).copy(d,0,0,8);d.writeUInt16LE(1,8);authority.toBuffer().copy(d,10);m.circuit.copy(d,42);m.key.copy(d,74);d[106]=enabled?1:0;Buffer.concat(m.header).copy(d,108);if(enabled)Buffer.concat(m.points).copy(d,556);return {owner:GPRU,data:d};}
test('epoch initialization reconstructs six IC points in four bounded packets',()=>{
 const m=epochMaterial(args(),source),instructions=epochInstructions(authority,m);assert.equal(instructions.length,4);
 const rebuilt=[];for(const ix of instructions){const wire=new Transaction({feePayer:authority,recentBlockhash:PublicKey.default.toBase58()}).add(ix).serialize({requireAllSignatures:false,verifySignatures:false});assert.ok(wire.length<=1232);}
 for(const ix of instructions.slice(1,3)){assert.equal(ix.data[8],rebuilt.length);const count=ix.data.readUInt32LE(9);for(let i=0;i<count;i++)rebuilt.push(ix.data.subarray(13+i*64,77+i*64));}
 assert.deepEqual(rebuilt,m.points);
});
test('matching disabled upload resumes while enabled keys require explicit rekey',()=>{
 const m=epochMaterial(args(),source);assert.equal(epochInitializationPlan(authority,m,null).length,4);
 assert.equal(epochInitializationPlan(authority,m,account(m,false)).length,3);
 assert.equal(epochInitializationPlan(authority,m,account(m,true)).length,0);
 const changed=account(m,true);changed.data[74]^=1;assert.throws(()=>epochInitializationPlan(authority,m,changed),/explicit rekey/);
 assert.equal(epochInitializationPlan(authority,m,changed,'rekey').length,4);
 assert.throws(()=>epochInitializationPlan(authority,m,null,'rekey'),/existing/);
 const wrong=args();wrong.public_input_count=13;assert.throws(()=>epochMaterial(wrong,source),/five/);
});
