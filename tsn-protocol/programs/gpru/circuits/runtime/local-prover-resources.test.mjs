import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { hashProverFile, localProverOptions } from './local-prover-resources.mjs';
test('streamed artifact hashes match full-buffer hashes and reject missing files', async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'tsn-prover-resources-'));
  try {
    const data=Buffer.alloc(3*1024*1024+17,0x5a);
    const file=path.join(directory,'synthetic.zkey');
    await writeFile(file,data);
    assert.equal(await hashProverFile(file),createHash('sha256').update(data).digest('hex'));
    await assert.rejects(hashProverFile(path.join(directory,'missing')), {code:'ENOENT'});
    assert.equal(globalThis.navigator.hardwareConcurrency,1);
    assert.equal(localProverOptions.prover.singleThread,true);
    assert.equal(localProverOptions.witness.memorySize,8192);
  } finally {await rm(directory,{recursive:true,force:true});}
});
