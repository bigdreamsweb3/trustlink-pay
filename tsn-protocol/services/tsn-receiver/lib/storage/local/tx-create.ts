import { createDocument } from "./create-document";
import type { Ref } from "./ref";
import type { Tx } from "./tx";
import type { Row } from "./types";
export function txCreate(this: Tx, reference: Ref, value: Row) { createDocument(reference,value,this.data); }
