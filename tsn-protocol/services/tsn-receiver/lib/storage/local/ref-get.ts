import { readDocument } from "./read-document";
import { Snap } from "./snap";
import type { Ref } from "./ref";
export async function refGet(this: Ref) { return new Snap(this.id, await readDocument(this.context, this.collectionPath, this.id), this); }
