import { mutateStore } from "./mutate-store";
import { createDocument } from "./create-document";
import type { Ref } from "./ref";
import type { Row } from "./types";
export async function refCreate(this: Ref, value: Row) { return mutateStore(this.context, createDocument.bind(null, this, value)); }
