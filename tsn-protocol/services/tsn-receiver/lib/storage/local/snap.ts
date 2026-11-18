import { snapData } from "./snap-data";
import { snapGet } from "./snap-get";
import { snapExists } from "./snap-exists";
import type { Ref } from "./ref";
import type { Row } from "./types";
export class Snap {
  declare readonly exists: boolean;
  data = snapData;
  get = snapGet;
  constructor(public id: string, public dataValue: Row | null, public ref?: Ref) {
    Object.defineProperty(this, "exists", { get: snapExists });
  }
}
