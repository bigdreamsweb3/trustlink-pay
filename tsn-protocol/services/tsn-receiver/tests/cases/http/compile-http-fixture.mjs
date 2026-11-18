import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { rewriteHttpFixtureImport } from "./rewrite-http-fixture-import.mjs";
export async function compileHttpFixture(directory,contracts){
  const root=path.resolve(fileURLToPath(new URL("../../../",import.meta.url))),pending=[],compiled=new Set();
  for(const contract of contracts)pending.push(path.resolve(root,contract.route));
  const portFile=fileURLToPath(new URL("./http-ports.mjs",import.meta.url));
  while(pending.length){
    const source=pending.shift();if(compiled.has(source))continue;compiled.add(source);
    const destination=path.join(directory,path.relative(root,source)).replace(/\.ts$/,".mjs");await mkdir(path.dirname(destination),{recursive:true});
    if(source.endsWith(path.sep+"runtime.ts")){
      let relative=path.relative(path.dirname(destination),portFile).replaceAll("\\","/");if(!relative.startsWith("."))relative="./"+relative;
      await writeFile(destination,"import {httpPorts} from "+JSON.stringify(relative)+";export const dependencies=httpPorts;");continue;
    }
    const compiledSource=ts.transpileModule(await readFile(source,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
    const output=compiledSource.replace(/((?:from\s*|import\s*\(\s*))(["'])([^"']+)\2/g,rewriteHttpFixtureImport.bind(null,{root,directory,source,destination,pending}));
    await writeFile(destination,output);
  }
}
