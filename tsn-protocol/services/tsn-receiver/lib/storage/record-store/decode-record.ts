import type { Row } from "./types";
export function decodeStoredRecord(raw: unknown): Row {
 if(raw===null)throw new Error("TSN_STORE_INDEXED_RECORD_MISSING");
 let row:Row;try{if(typeof raw!=="string")throw new Error();row=JSON.parse(raw);}catch{throw new Error("TSN_STORE_RECORD_INVALID");}
 if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("TSN_STORE_RECORD_INVALID");return row;
}
