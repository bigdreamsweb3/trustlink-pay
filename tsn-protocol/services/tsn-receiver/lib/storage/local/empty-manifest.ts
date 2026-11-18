import type { Manifest } from "./types";
export function emptyManifest(): Manifest {
  return { format: "TSN_RECEIVER_FILE_STORE", version: 1, collections: Object.create(null) };
}
