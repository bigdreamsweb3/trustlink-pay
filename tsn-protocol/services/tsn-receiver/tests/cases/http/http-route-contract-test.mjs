import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { compileHttpFixture } from "./compile-http-fixture.mjs";
import { httpState } from "./http-state.mjs";
import { executeHttpScenario } from "./execute-http-scenario.mjs";
import { scenarioForResult } from "./scenario-for-result.mjs";
import { assertHttpContract } from "./assert-http-contract.mjs";
import { stagedHttpExpected } from "./staged-http-expected.mjs";
export async function httpRouteContractTest(){
  const fixtures=JSON.parse(await readFile(new URL("./route-contract-baseline.json",import.meta.url),"utf8"));
  const directory=await mkdtemp(path.join(os.tmpdir(),"receiver-http-contract-"));
  const names=["TSN_RECEIVER_STORE","TSN_ALLOW_LOCAL_JSON_STORE","FIREBASE_WEB_API_KEY"],prior=[];
  for(const name of names)prior.push(process.env[name]);
  process.env.TSN_RECEIVER_STORE="file";process.env.TSN_ALLOW_LOCAL_JSON_STORE="true";process.env.FIREBASE_WEB_API_KEY="SYNTHETIC_FIREBASE_KEY";
  try{
    await compileHttpFixture(directory,fixtures.contracts);const modules=new Map();
    for(const contract of fixtures.contracts){const module=await import(pathToFileURL(path.join(directory,contract.route).replace(/\.ts$/,".mjs")).href);assertHttpContract(contract,module);modules.set(contract.route,module);}
    for(const result of fixtures.results){const scenario=scenarioForResult(fixtures,result);const actual=await executeHttpScenario(modules.get(result.route)[result.method],scenario,fixtures,httpState);assert.deepEqual(actual,stagedHttpExpected(result),result.route+" "+result.method+" "+result.scenario);}
  }finally{
    for(let index=0;index<names.length;index+=1)if(prior[index]===undefined)delete process.env[names[index]];else process.env[names[index]]=prior[index];
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.match(path.basename(directory),/^receiver-http-contract-/);await rm(directory,{recursive:true,force:true});
  }
}
