import assert from "node:assert/strict";
export function assertHttpContract(contract,module){
  assert.equal(module.runtime,contract.runtime,contract.route+" runtime");
  assert.deepEqual(Object.keys(module),contract.exports,contract.route+" exports");
  for(const[name,arity]of Object.entries(contract.arities))assert.equal(module[name].length,arity,contract.route+" "+name+" arity");
  for(const[a,b,same]of contract.aliases)assert.equal(module[a]===module[b],same,contract.route+" "+a+"/"+b+" alias");
}
