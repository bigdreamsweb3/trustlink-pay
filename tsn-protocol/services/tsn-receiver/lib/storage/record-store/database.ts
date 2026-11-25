import { createHash } from "node:crypto";
import { rowMatches } from "../local/row-matches";
import { compareQueryRows } from "../local/compare-query-rows";
import { parseStoreMetadata } from "./metadata";
import { decodeStoredRecord } from "./decode-record";
import type { Change, Command, Metadata, Row } from "./types";

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function name(value: string): string {
  if (typeof value !== "string" || !value || value.length > 512 || /[\r\n\0]/.test(value)
      || value.split("/").some(part => ["__proto__","prototype","constructor"].includes(part) || Object.hasOwn(Object.prototype,part))) throw new Error("TSN_STORE_RECORD_ID_INVALID");
  return value;
}
export class RecordSnapshot {
  readonly exists: boolean;
  constructor(public id: string, private row: Row | null, public ref: RecordDocument) { this.exists = row !== null; }
  data(): Row | undefined { return this.row === null ? undefined : clone(this.row); }
  get(field: string): any { return this.row === null || this.row[field] === undefined ? undefined : clone(this.row[field]); }
}
export class RecordQuery {
  constructor(public db: RecordDb, public collectionPath: string, public filters: [string,string,unknown][] = [], public order?: [string,string], public max?: number, public after?: string) {}
  where(field: string, operator: string, value: unknown): RecordQuery { return new RecordQuery(this.db,this.collectionPath,[...this.filters,[field,operator,value]],this.order,this.max,this.after); }
  orderBy(field: string, direction="asc"): RecordQuery { return new RecordQuery(this.db,this.collectionPath,this.filters,[field,direction],this.max,this.after); }
  limit(value: number): RecordQuery { if (!Number.isInteger(value) || value < 1 || value > 10000) throw new Error("TSN_STORE_QUERY_LIMIT_INVALID"); return new RecordQuery(this.db,this.collectionPath,this.filters,this.order,value,this.after); }
  startAfter(snapshot: {id:string}): RecordQuery { return new RecordQuery(this.db,this.collectionPath,this.filters,this.order,this.max,snapshot.id); }
  get(): Promise<{docs:RecordSnapshot[]}> { return this.db.runTransaction(tx=>tx.get(this)); }
  evaluate(rows: Record<string,Row>): {docs:RecordSnapshot[]} {
    let entries = Object.entries(rows).filter(([,row])=>rowMatches(row,this.filters));
    if (this.order) entries.sort(compareQueryRows.bind(null,this.order));
    if (this.after) entries = entries.filter(([id])=>id > this.after!);
    if (this.max) entries = entries.slice(0,this.max);
    return {docs:entries.map(([id,row])=>new RecordSnapshot(id,row,new RecordDocument(this.db,this.collectionPath,id)))};
  }
}
export class RecordCollection extends RecordQuery {
  doc(id: string): RecordDocument { return new RecordDocument(this.db,this.collectionPath,name(id)); }
}
export class RecordDocument {
  constructor(public db: RecordDb, public collectionPath: string, public id: string) {}
  get(): Promise<RecordSnapshot> { return this.db.readDocument(this); }
  set(value: Row, options?: {merge?:boolean}): Promise<void> { return this.db.runTransaction(async tx=>{tx.set(this,value,options);}); }
  create(value: Row): Promise<void> { return this.db.runTransaction(async tx=>{tx.create(this,value);}); }
  delete(): Promise<void> { return this.db.runTransaction(async tx=>{tx.delete(this);}); }
  collection(segment: string): RecordCollection { return this.db.collection(this.collectionPath+"/"+this.id+"/"+name(segment)); }
}
export class RecordTransaction {
  changes: Change[] = [];
  private cache = new Map<string,Row|null>();
  constructor(public db: RecordDb, public metadata: Metadata) {}
  private check(reference: RecordDocument | RecordQuery): void { if (reference.db !== this.db) throw new Error("TSN_STORE_CROSS_STORE_REFERENCE"); }
  private stage(reference: RecordDocument, operation: Change["operation"], value?: Row, merge?: boolean): void {
    this.check(reference);
    if (value !== undefined && (!value || typeof value!=="object" || Array.isArray(value))) throw new Error("TSN_STORE_RECORD_INVALID");
    this.changes.push({collection:reference.collectionPath,id:reference.id,operation,...(value===undefined?{}:{value:clone(value)}),merge});
  }
  create(reference: RecordDocument,value: Row): void { this.stage(reference,"create",value); }
  set(reference: RecordDocument,value: Row,options?: {merge?:boolean}): void { this.stage(reference,"set",value,options?.merge); }
  update(reference: RecordDocument,value: Row): void { this.stage(reference,"update",value); }
  delete(reference: RecordDocument): void { this.stage(reference,"delete"); }
  private async original(collection: string,id: string): Promise<Row|null> {
    const key=this.db.recordKey(collection,id);
    if (this.cache.has(key)) return this.cache.get(key)!;
    const indexed=this.metadata.collections[collection]?.[id];
    if (indexed !== undefined && indexed!==key) throw new Error("TSN_STORE_INDEX_INVALID");
    const row=indexed===undefined?null:decodeStoredRecord(await this.db.readKey(key));
    this.cache.set(key,row);
    return row;
  }
  private async row(collection: string,id: string): Promise<Row|null> {
    let row=await this.original(collection,id);
    for (const change of this.changes.filter(change=>change.collection===collection&&change.id===id)) {
      if (change.operation==="create"&&row!==null) throw new Error("DOCUMENT_ALREADY_EXISTS");
      if (change.operation==="update"&&row===null) throw new Error("DOCUMENT_NOT_FOUND");
      row=change.operation==="delete"?null:change.operation==="update"||change.merge?{...row,...change.value}:clone(change.value!);
    }
    return row;
  }
  async get(reference: RecordDocument): Promise<RecordSnapshot>;
  async get(reference: RecordQuery): Promise<{docs:RecordSnapshot[]}>;
  async get(reference: RecordDocument | RecordQuery): Promise<any> {
    this.check(reference);
    if (reference instanceof RecordDocument) return new RecordSnapshot(reference.id,await this.row(reference.collectionPath,reference.id),reference);
    const index=this.metadata.collections[reference.collectionPath]??{};
    const ids=Object.keys(index);
    for(let start=0;start<ids.length;start+=64) {
      const page=ids.slice(start,start+64);
      for(const id of page) if(index[id]!==this.db.recordKey(reference.collectionPath,id)) throw new Error("TSN_STORE_INDEX_INVALID");
      const values=await this.db.readKeys(page.map(id=>index[id]));
      if(!Array.isArray(values)||values.length!==page.length) throw new Error("TSN_STORE_RESPONSE_INVALID");
      page.forEach((id,i)=>this.cache.set(index[id],decodeStoredRecord(values[i])));
    }
    const selected=new Set([...ids,...this.changes.filter(change=>change.collection===reference.collectionPath).map(change=>change.id)]);
    const rows: Record<string,Row>=Object.create(null);
    for(const id of selected){const row=await this.row(reference.collectionPath,id);if(row!==null)rows[id]=row;}
    return reference.evaluate(rows);
  }
  async commit(raw: string): Promise<boolean> {
    if (!this.changes.length) return (await this.db.readKey(this.db.metadataKey))===raw;
    const metadata=clone(this.metadata);
    const unique=new Map<string,{collection:string;id:string}>();
    for(const change of this.changes)unique.set(this.db.recordKey(change.collection,change.id),change);
    const keys=[this.db.metadataKey],values:string[]=[];
    for(const [key,reference] of unique){
      const row=await this.row(reference.collection,reference.id);
      if (JSON.stringify(row) === JSON.stringify(await this.original(reference.collection,reference.id))) continue;
      const index=metadata.collections[reference.collection]??={};
      if(row===null)delete index[reference.id];else index[reference.id]=key;
      keys.push(key);values.push(JSON.stringify(row));
    }
    if (keys.length === 1) return (await this.db.readKey(this.db.metadataKey)) === raw;
    if (metadata.revision >= Number.MAX_SAFE_INTEGER) throw new Error("TSN_STORE_REVISION_EXHAUSTED");
    metadata.revision++;
    const request={operation:"commit" as const,metadataKey:this.db.metadataKey,expected:raw,metadata:JSON.stringify(metadata),records:keys.slice(1).map((key,i)=>({key,value:values[i]==="null"?null:values[i]}))};
    if(Buffer.byteLength(request.metadata,"utf8")>768*1024)throw new Error("TSN_STORE_INDEX_FULL");
    if(request.records.some(record=>record.value!==null&&Buffer.byteLength(record.value,"utf8")>1024*1024))throw new Error("TSN_STORE_RECORD_TOO_LARGE");
    if(Buffer.byteLength(JSON.stringify(request),"utf8")>8*1024*1024)throw new Error("TSN_STORE_TRANSACTION_TOO_LARGE");
    const result=await this.db.command(request);
    if(typeof result!=="boolean")throw new Error("TSN_STORE_RESPONSE_INVALID");
    return result;
  }
}
export class RecordDb {
  readonly metadataKey: string;
  private prefix: string;
  constructor(public command: Command, namespace="tsn-receiver") {
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(namespace))throw new Error("TSN_STORE_NAMESPACE_INVALID");
    this.prefix="{"+namespace+"}";this.metadataKey=this.prefix+":metadata";
  }
  recordKey(collection:string,id:string): string { name(collection);name(id);return this.prefix+":record:"+createHash("sha256").update(JSON.stringify([collection,id])).digest("hex"); }
  async readDocument(reference:RecordDocument): Promise<RecordSnapshot> {
    const key=this.recordKey(reference.collectionPath,reference.id);
    const [rawMetadata,rawRecord]=await this.readKeys([this.metadataKey,key]);
    const metadata=parseStoreMetadata(rawMetadata),indexed=metadata.collections[reference.collectionPath]?.[reference.id];
    if(indexed!==undefined&&indexed!==key)throw new Error("TSN_STORE_INDEX_INVALID");
    return new RecordSnapshot(reference.id,indexed===undefined?null:decodeStoredRecord(rawRecord),reference);
  }
  async readKeys(keys:string[]): Promise<any[]> { const result=await this.command({operation:"read",keys}); if(!Array.isArray(result)||result.length!==keys.length)throw new Error("TSN_STORE_RESPONSE_INVALID");return result; }
  async readKey(key:string): Promise<any> { return (await this.readKeys([key]))[0]; }
  collection(collection:string): RecordCollection { return new RecordCollection(this,name(collection)); }
  async runTransaction<T>(operation:(transaction:RecordTransaction)=>Promise<T>):Promise<T>{
    for(let attempt=0;attempt<8;attempt++){
      const raw=await this.readKey(this.metadataKey);const metadata=parseStoreMetadata(raw);
      const tx=new RecordTransaction(this,metadata);
      let value:T;
      try{value=await operation(tx);}catch(error){if((await this.readKey(this.metadataKey))!==raw)continue;throw error;}
      if(await tx.commit(raw))return value;
      await new Promise(resolve=>setTimeout(resolve,Math.min(100,5*(attempt+1))));
    }
    throw new Error("TSN_STORE_TRANSACTION_CONFLICT");
  }
  batch(): {set:(reference:RecordDocument,value:Row,options?:{merge?:boolean})=>any;delete:(reference:RecordDocument)=>any;commit:()=>Promise<void>} {
    const changes:Change[]=[];
    const batch={set:(reference:RecordDocument,value:Row,options?:{merge?:boolean})=>{if(reference.db!==this)throw new Error("TSN_STORE_CROSS_STORE_REFERENCE");changes.push({collection:reference.collectionPath,id:reference.id,operation:"set",value:clone(value),merge:options?.merge});return batch;},
      delete:(reference:RecordDocument)=>{if(reference.db!==this)throw new Error("TSN_STORE_CROSS_STORE_REFERENCE");changes.push({collection:reference.collectionPath,id:reference.id,operation:"delete"});return batch;},
      commit:()=>this.runTransaction(async tx=>{tx.changes=clone(changes);})};
    return batch;
  }
}
