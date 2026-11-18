/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../lib/http/tin-operations/proxy/runtime";
import { forward as forwardComponent } from "../../../lib/http/tin-operations/proxy/forward";
const forward = forwardComponent.bind(null, dependencies);
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
