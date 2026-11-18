import { mutateStore } from "./mutate-store";
import { setDocument } from "./set-document";
import type { Ref } from "./ref";
import type { Row } from "./types";
export async function refSet(this: Ref, value: Row) { return mutateStore(this.context, setDocument.bind(null, this, value)); }
