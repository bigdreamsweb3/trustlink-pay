import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(new URL('../../hidden_head_v1/package.json',import.meta.url));
const {CircomRunner,bindings}=require('circom2');
const tools=path.resolve(root,'../hidden_head_v1/node_modules');
const build=path.resolve(process.env.GPRU_EPOCH_CIRCUIT_BUILD_DIR||path.join(root,'build/tcap_epoch_v1'));
fs.mkdirSync(build,{recursive:true});
process.chdir(build);
// Fixed guest mounts avoid Windows separators and parent-path capability gaps.
const runner=new CircomRunner({args:['/source/main.circom','--r1cs','--wasm','--sym','-l','/deps','-o','/output'],
  env:process.env,preopens:{'.':build,'/source':root,'/deps':tools,'/output':build},
  bindings:{...bindings,path,fs,exit:code=>process.exit(code),kill:signal=>process.kill(process.pid,signal)}});
await runner.execute(fs.readFileSync(require.resolve('circom2/circom.wasm')));
