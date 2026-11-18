/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../lib/http/tin-routes/proxy/runtime";
import { run as runComponent } from "../../../lib/http/tin-routes/proxy/run";
const run = runComponent.bind(null, dependencies);
export const GET = run;
export const POST = run;
export const DELETE = run;
