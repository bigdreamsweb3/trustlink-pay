import type { Command } from "./types";
/** Server-only private record-store transport. Unknown mutation outcomes propagate; credentials/provider bodies stay private. */
export function recordStoreCommand(environment: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Command {
  const endpoint = environment.TSN_RECORD_STORE_URL?.trim();
  const token = environment.TSN_RECORD_STORE_TOKEN?.trim();
  if (!endpoint || !token) throw new Error("TSN_STORE_CONFIGURATION_REQUIRED");
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("TSN_STORE_URL_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("TSN_STORE_URL_INVALID");
  return async request => {
    let response: Response;
    try { response = await fetchImpl(url, {method:"POST", headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body: JSON.stringify(request), signal: AbortSignal.timeout(10000), cache:"no-store", redirect:"error"}); }
    catch { throw new Error("TSN_STORE_TRANSPORT_UNAVAILABLE"); }
    if (!response.ok) throw new Error("TSN_STORE_SERVICE_UNAVAILABLE");
    let reply: any;
    try { reply = await response.json(); } catch { throw new Error("TSN_STORE_RESPONSE_INVALID"); }
    if (!reply || typeof reply !== "object" || !Object.hasOwn(reply,"result") || reply.error) throw new Error("TSN_STORE_COMMAND_FAILED");
    return reply.result;
  };
}
