import { promises as fs } from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
const file = path.resolve(process.cwd(), process.env.TSN_RECEIVER_LOCAL_FILE || ".receiver-store.json");
let lock = Promise.resolve();
async function read(): Promise<Record<string, Record<string, Row>>> { try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return {}; } }
async function write(data: Record<string, Record<string, Row>>) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(data, null, 2)); }
function queue<T>(fn: () => Promise<T>): Promise<T> { const run = lock.then(fn, fn); lock = run.then(() => undefined, () => undefined); return run; }
class Snap { constructor(public id: string, public dataValue: Row | null) {} get exists() { return !!this.dataValue; } data() { return this.dataValue ?? undefined; } get(field: string) { return this.dataValue?.[field]; } }
class QuerySnap { constructor(public docs: Snap[]) {} }
class Ref { constructor(public collection: string, public id: string) {} async get() { const db = await read(); return new Snap(this.id, db[this.collection]?.[this.id] ?? null); } }
class Query { constructor(private collection: string, private filters: [string, unknown][] = [], private order?: [string, string], private max?: number) {} where(field: string, _op: string, value: unknown) { return new Query(this.collection, [...this.filters, [field, value]], this.order, this.max); } orderBy(field: string, direction: string = "asc") { return new Query(this.collection, this.filters, [field, direction], this.max); } limit(value: number) { return new Query(this.collection, this.filters, this.order, value); } async get() { const db = await read(); let rows = Object.entries(db[this.collection] ?? {}).filter(([, row]) => this.filters.every(([f, v]) => row[f] === v)); if (this.order) rows.sort((a, b) => String(a[1][this.order![0]] ?? "").localeCompare(String(b[1][this.order![0]] ?? "")) * (this.order[1] === "desc" ? -1 : 1)); if (this.max) rows = rows.slice(0, this.max); return new QuerySnap(rows.map(([id, row]) => new Snap(id, row))); } }
class Tx { constructor(private db: Record<string, Record<string, Row>>) {} async get(ref: Ref | Query) { return ref instanceof Ref ? new Snap(ref.id, this.db[(ref as any).collection]?.[ref.id] ?? null) : ref.get(); } create(ref: Ref, value: Row) { const c = (this.db as any)[(ref as any).collection] ??= {}; if (c[ref.id]) throw new Error("ALREADY_EXISTS"); c[ref.id] = value; } update(ref: Ref, patch: Row) { const c = (this.db as any)[(ref as any).collection] ??= {}; c[ref.id] = { ...(c[ref.id] ?? {}), ...patch }; } }
export class LocalDb { collection(name: string) { return new LocalCollection(name); } async runTransaction<T>(fn: (tx: Tx) => Promise<T>) { return queue(async () => { const data = await read(); const result = await fn(new Tx(data)); await write(data); return result; }); } }
class LocalCollection extends Query { constructor(private name: string) { super(name); } doc(id: string) { return new Ref(this.name, id); } }
export const localDb = new LocalDb();
