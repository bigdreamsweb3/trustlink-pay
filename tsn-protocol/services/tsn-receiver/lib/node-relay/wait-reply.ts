import type { RelayDependencies, RelayJob } from "./types";

/** Wait at most twenty seconds for the exact result; Firestore listeners close on every exit. */
export async function waitRelayReply(dependencies: Pick<RelayDependencies, "jobs" | "decrypt">, id: string, requestHash: string, timeoutMs = 20000): Promise<Response | null> {
  const reference = dependencies.jobs.doc(id);
  const read = (snapshot: any): Response | null => {
    if (!snapshot.exists || snapshot.get("requestHash") !== requestHash) throw new Error("NODE_RELAY_REQUEST_CONFLICT");
    const job = snapshot.data() as RelayJob;
    if (job.status === "EXPIRED") return new Response(JSON.stringify({ error: "NODE_RELAY_REQUEST_EXPIRED" }), { status: 409 });
    if (job.status !== "COMPLETED") return null;
    const reply = dependencies.decrypt(job.response!);
    return new Response(String(reply.body) || null, { status: Number(reply.status), headers: { "content-type": String(reply.contentType), "cache-control": "no-store", "x-tsn-relay-id": id } });
  };
  const ready = read(await reference.get());
  if (ready) return ready;
  if (typeof reference.onSnapshot === "function") {
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {}, settled = false;
      const timer = setTimeout(() => { settled = true; unsubscribe(); resolve(null); }, timeoutMs);
      unsubscribe = reference.onSnapshot((snapshot: any) => {
        try { const result = read(snapshot); if (result) { settled = true; clearTimeout(timer); unsubscribe(); resolve(result); } }
        catch (error) { settled = true; clearTimeout(timer); unsubscribe(); reject(error); }
      }, (error: unknown) => { settled = true; clearTimeout(timer); unsubscribe(); reject(error); });
      if (settled) unsubscribe();
    });
  }
  // The isolated local JSON adapter has no Firestore watch; preserve its bounded test operation.
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 500); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const result = read(await reference.get());
    if (result) return result;
  }
  return null;
}
