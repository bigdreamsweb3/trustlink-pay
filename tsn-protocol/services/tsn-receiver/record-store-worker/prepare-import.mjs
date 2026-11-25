import {readFile,writeFile,lstat} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
function quote(value){return "'"+value.replaceAll("'","''")+"'";}
/** Offline migration preparation only. It does not connect to Firebase, D1 or a service. Output contains private records. */
export async function prepareRecordImport(input,namespace="tsn-receiver"){
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(namespace))throw new Error("Invalid namespace");
 const raw=JSON.parse(await readFile(input,"utf8"));let collections;
 if(raw.format==="TSN_RECEIVER_JSON_EXPORT"&&raw.version===1)collections=raw.collections;
 else if(raw.format==="TSN_RECEIVER_FILE_STORE"&&raw.version===1){
  collections=Object.create(null);const directory=path.resolve(input+".d");
  for(const [collection,index] of Object.entries(raw.collections??{})){
   const rows=collections[collection]=Object.create(null);
   for(const [id,relative] of Object.entries(index)){
    if(typeof relative!=="string")throw new Error("Invalid manifest path");
    const target=path.resolve(directory,relative);if(!target.startsWith(directory+path.sep))throw new Error("Unsafe manifest path");
    let current=target;
    while(current!==path.dirname(directory)){if((await lstat(current)).isSymbolicLink())throw new Error("Symlink input rejected");if(current===directory)break;current=path.dirname(current);}
    rows[id]=JSON.parse(await readFile(target,"utf8"));
   }
  }
 }else throw new Error("Provide a portable JSON export or canonical Receiver file manifest");
 if(!collections||typeof collections!=="object"||Array.isArray(collections))throw new Error("Invalid collection export");
 const metadata={format:"TSN_RECEIVER_RECORD_STORE",version:1,revision:0,collections:Object.create(null)};
 const statements=["-- Private one-time import; protect this file. Target namespace must not already be initialized."];
 let count=0;
 for(const [collection,rows] of Object.entries(collections)){
  if(!rows||typeof rows!=="object"||Array.isArray(rows))throw new Error("Invalid collection");
  const index=metadata.collections[collection]=Object.create(null);
  for(const [id,row] of Object.entries(rows)){
   for(const value of [collection,id])if(!value||value.length>512||value.split("/").some(part=>Object.hasOwn(Object.prototype,part)))throw new Error("Invalid record identity");
   if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("Invalid record");
   const key="{"+namespace+"}:record:"+createHash("sha256").update(JSON.stringify([collection,id])).digest("hex"),value=JSON.stringify(row);
   if(Buffer.byteLength(value,"utf8")>1024*1024)throw new Error("Record too large");
   index[id]=key;
   statements.push("INSERT INTO records(key,value) VALUES ("+quote(key)+","+quote(value)+") ON CONFLICT(key) DO UPDATE SET value=CASE WHEN records.value=excluded.value THEN records.value ELSE NULL END;");
   count++;
  }
 }
 const value=JSON.stringify(metadata);if(Buffer.byteLength(value,"utf8")>768*1024)throw new Error("Index too large");
 statements.push("INSERT INTO records(key,value) VALUES ("+quote("{"+namespace+"}:metadata")+","+quote(value)+");");
 return {sql:statements.join("\n")+"\n",count};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arguments_=process.argv.slice(2),input=arguments_[arguments_.indexOf("--input")+1],output=arguments_[arguments_.indexOf("--output")+1];
 if(!arguments_.includes("--input")||!arguments_.includes("--output")||!input||!output)throw new Error("Usage: node prepare-import.mjs --input private-export.json --output private-import.sql [--namespace name]");
 const namespace=arguments_.includes("--namespace")?arguments_[arguments_.indexOf("--namespace")+1]:"tsn-receiver";
 const prepared=await prepareRecordImport(path.resolve(input),namespace);
 await writeFile(path.resolve(output),prepared.sql,{encoding:"utf8",flag:"wx",mode:0o600});
 console.log(JSON.stringify({records:prepared.count,scope:"Offline SQL preparation only; no network or live migration"}));
}
