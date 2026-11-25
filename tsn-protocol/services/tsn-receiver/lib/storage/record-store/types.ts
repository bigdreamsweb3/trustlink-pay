export type Row = Record<string, any>;
export type Metadata = { format: "TSN_RECEIVER_RECORD_STORE"; version: 1; revision: number; collections: Record<string, Record<string,string>> };
export type StoreRequest = {operation:"read";keys:string[]} | {operation:"commit";metadataKey:string;expected:string;metadata:string;records:{key:string;value:string|null}[]};
export type Command = (request:StoreRequest) => Promise<any>;
export type Change = { collection: string; id: string; operation: "set" | "create" | "update" | "delete"; value?: Row; merge?: boolean };
