export interface SnapshotPort { id: string; exists: boolean; ref: DocumentPort; get(field: string): any; data(): any; }
export interface QuerySnapshotPort { docs: SnapshotPort[]; }
export interface QueryPort { where(field: string, operator: string, value: unknown): QueryPort; orderBy(field: string, direction?: string): QueryPort; limit(count: number): QueryPort; get(): Promise<QuerySnapshotPort>; }
export interface CollectionPort extends QueryPort { doc(id: string): DocumentPort; }
export interface DocumentPort { get(): Promise<SnapshotPort>; set(value: any, options?: {merge?: boolean}): Promise<unknown>; create(value: any): Promise<unknown>; update(value: any): Promise<unknown>; delete(): Promise<unknown>; collection(name: string): CollectionPort; }
export interface TransactionPort { get(reference: DocumentPort): Promise<SnapshotPort>; set(reference: DocumentPort,value: any,options?: {merge?: boolean}): unknown; create(reference: DocumentPort,value: any): unknown; update(reference: DocumentPort,value: any): unknown; delete(reference: DocumentPort): unknown; }
export interface BatchPort { set(reference: DocumentPort,value: any): unknown; delete(reference: DocumentPort): unknown; commit(): Promise<unknown>; }
export interface DatabasePort { runTransaction<T>(update: (transaction: TransactionPort) => Promise<T>): Promise<T>; batch(): BatchPort; }
