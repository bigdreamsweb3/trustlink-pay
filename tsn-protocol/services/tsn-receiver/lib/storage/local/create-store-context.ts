/** Compose the explicitly gated local adapter; paths remain working-directory relative. */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageContext } from "./types";
export function createStoreContext(options: { file?: string; workCollection?: string; fs?: typeof fs } = {}): StorageContext {
  const file = path.resolve(process.cwd(), options.file ?? process.env.TSN_RECEIVER_LOCAL_FILE ?? ".receiver-store.json");
  const context: StorageContext = { file, directory: `${file}.d`, lockFile: `${file}.lock`,
    journalFile: path.join(`${file}.d`, "transaction.json"),
    workCollection: options.workCollection ?? process.env.TSN_RECEIVER_COLLECTION ?? "tsn_receiver_work",
    fs: options.fs ?? fs, ready: Promise.resolve(), initialized: false };
  return context;
}
