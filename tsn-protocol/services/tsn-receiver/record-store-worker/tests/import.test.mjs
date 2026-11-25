import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {prepareRecordImport} from "../prepare-import.mjs";
import {sqliteBinding} from "./sqlite-binding.mjs";
test("private import preserves JSON records and fails on conflicting existing state",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"tsn-record-import-")),{sqlite}=sqliteBinding();
 try{
  const row={id:"work",status:"FAILED",result:{signature:"retain-original"},payload:{ciphertext:"synthetic encrypted owner's record"}};
  const input=path.join(directory,"export.json");await writeFile(input,JSON.stringify({format:"TSN_RECEIVER_JSON_EXPORT",version:1,collections:{work:{work:row}}}));
  const prepared=await prepareRecordImport(input);assert.equal(prepared.count,1);sqlite.exec(prepared.sql);
  const metadata=JSON.parse(sqlite.prepare("SELECT value FROM records WHERE key=?").get("{tsn-receiver}:metadata").value);
  const stored=JSON.parse(sqlite.prepare("SELECT value FROM records WHERE key=?").get(metadata.collections.work.work).value);assert.deepEqual(stored,row);
  assert.throws(()=>sqlite.exec(prepared.sql),/UNIQUE/);assert.deepEqual(JSON.parse(sqlite.prepare("SELECT value FROM records WHERE key=?").get(metadata.collections.work.work).value),row);
 }finally{sqlite.close();await rm(directory,{recursive:true,force:true});}
});
