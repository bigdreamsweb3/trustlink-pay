import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { compactVerificationPayload } from "./work-contract";

type Row = Record<string, any>;
const file = path.resolve(process.cwd(), process.env.TSN_RECEIVER_LOCAL_FILE || ".receiver-store.json");
const lockFile = `${file}.lock`;
let lock = Promise.resolve();
async function readRaw(): Promise<Record<string, Record<string, Row>>> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("TSN_RECEIVER_LOCAL_STORE_INVALID: refusing to replace unreadable local state", { cause: error });
  }
}
async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await fs.open(lockFile, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.stat(lockFile).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 30_000) {
        await fs.unlink(lockFile).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > 10_000) throw new Error("TSN_RECEIVER_LOCAL_STORE_BUSY");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await fs.unlink(lockFile).catch(() => undefined);
  }
}
async function writeRaw(data: Record<string, Record<string, Row>>) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(temporary, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !["EPERM", "EBUSY", "EACCES"].includes(code) || attempt === 7) {
        await fs.unlink(temporary).catch(() => undefined);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}
async function migrateLegacyTinRecords() {
  return withFileLock(async () => {
    const data = await readRaw();
    const collection = data[process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work"];
    if (!collection) return;
    let compacted = 0;
    for (const row of Object.values(collection)) {
      if (!row.verification?.verifiedPayload || !row.payload) continue;
      row.verification = compactVerificationPayload(row.payload, row.verification);
      compacted += 1;
    }
    if (compacted === 0) return;
    await writeRaw(data);
    console.info(`[receiver] compacted Node verification payloads for ${compacted} local work record(s)`);
  });
}
const ready = migrateLegacyTinRecords().catch((error) => {
  console.error("[receiver] local verification compaction failed; legacy payload reads remain enabled", error);
});
async function read(): Promise<Record<string, Record<string, Row>>> {
  await ready;
  return withFileLock(readRaw);
}
function queue<T>(fn: () => Promise<T>): Promise<T> { const run = lock.then(fn, fn); lock = run.then(() => undefined, () => undefined); return run; }
async function mutate<T>(operation: (data: Record<string, Record<string, Row>>) => Promise<T> | T): Promise<T> {
  await ready;
  return queue(() => withFileLock(async () => {
    const data = await readRaw();
    const result = await operation(data);
    await writeRaw(data);
    return result;
  }));
}
class Snap {
  constructor(public id: string, public dataValue: Row | null, public ref?: Ref) {}
  get exists() { return !!this.dataValue; }
  data() { return this.dataValue ?? undefined; }
  get(field: string) { return this.dataValue?.[field]; }
}
class QuerySnap { constructor(public docs: Snap[]) {} }
class Ref {
  constructor(public collectionPath: string, public id: string) {}
  async get() { const db = await read(); return new Snap(this.id, db[this.collectionPath]?.[this.id] ?? null, this); }
  async set(value: Row) { return mutate((db) => { (db[this.collectionPath] ??= {})[this.id] = value; }); }
  async create(value: Row) { return mutate((db) => { const collection = (db[this.collectionPath] ??= {}); if (collection[this.id]) throw new Error("ALREADY_EXISTS"); collection[this.id] = value; }); }
  async delete() { return mutate((db) => { if (db[this.collectionPath]) delete db[this.collectionPath][this.id]; }); }
  collection(name: string) { return new LocalCollection(`${this.collectionPath}/${this.id}/${name}`); }
}
class Query {
  constructor(private collection: string, private filters: [string, string, unknown][] = [], private order?: [string, string], private max?: number) {}
  where(field: string, operator: string, value: unknown) { return new Query(this.collection, [...this.filters, [field, operator, value]], this.order, this.max); }
  orderBy(field: string, direction: string = "asc") { return new Query(this.collection, this.filters, [field, direction], this.max); }
  limit(value: number) { return new Query(this.collection, this.filters, this.order, value); }
  async get() {
    const db = await read();
    let rows = Object.entries(db[this.collection] ?? {}).filter(([, row]) => this.filters.every(([field, operator, value]) => {
      const actual = row[field];
      const expected = value as any;
      if (operator === "==") return actual === expected;
      if (operator === "!=") return actual !== expected;
      if (operator === "<") return actual < expected;
      if (operator === "<=") return actual <= expected;
      if (operator === ">") return actual > expected;
      if (operator === ">=") return actual >= expected;
      throw new Error(`LOCAL_QUERY_OPERATOR_UNSUPPORTED: ${operator}`);
    }));
    if (this.order) {
      const [field, direction] = this.order;
      rows.sort((left, right) => String(left[1][field] ?? "").localeCompare(String(right[1][field] ?? "")) * (direction === "desc" ? -1 : 1));
    }
    if (this.max) rows = rows.slice(0, this.max);
    return new QuerySnap(rows.map(([id, row]) => new Snap(id, row, new Ref(this.collection, id))));
  }
}
class Tx { constructor(private db: Record<string, Record<string, Row>>) {} async get(ref: Ref | Query) { return ref instanceof Ref ? new Snap(ref.id, this.db[ref.collectionPath]?.[ref.id] ?? null) : ref.get(); } create(ref: Ref, value: Row) { const c = this.db[ref.collectionPath] ??= {}; if (c[ref.id]) throw new Error("ALREADY_EXISTS"); c[ref.id] = value; } set(ref: Ref, value: Row, options?: { merge?: boolean }) { const c = this.db[ref.collectionPath] ??= {}; c[ref.id] = options?.merge ? { ...(c[ref.id] ?? {}), ...value } : value; } update(ref: Ref, patch: Row) { const c = this.db[ref.collectionPath] ??= {}; c[ref.id] = { ...(c[ref.id] ?? {}), ...patch }; } }
type BatchWrite =
  | { operation: "set"; reference: Ref; value: Row; merge?: boolean }
  | { operation: "delete"; reference: Ref };
class Batch {
  private writes: BatchWrite[] = [];
  set(reference: Ref, value: Row, options?: { merge?: boolean }) {
    this.writes.push({ operation: "set", reference, value, merge: options?.merge });
    return this;
  }
  delete(reference: Ref) {
    this.writes.push({ operation: "delete", reference });
    return this;
  }
  async commit() {
    await mutate((data) => {
      for (const write of this.writes) {
        const collection = data[write.reference.collectionPath] ??= {};
        if (write.operation === "delete") {
          delete collection[write.reference.id];
          continue;
        }
        collection[write.reference.id] = write.merge
          ? { ...(collection[write.reference.id] ?? {}), ...write.value }
          : write.value;
      }
    });
    this.writes = [];
  }
}
export class LocalDb {
  collection(name: string) { return new LocalCollection(name); }
  batch() { return new Batch(); }
  async runTransaction<T>(fn: (tx: Tx) => Promise<T>) { return mutate((data) => fn(new Tx(data))); }
}
class LocalCollection extends Query { constructor(private name: string) { super(name); } doc(id: string) { return new Ref(this.name, id); } }
export const localDb = new LocalDb();
