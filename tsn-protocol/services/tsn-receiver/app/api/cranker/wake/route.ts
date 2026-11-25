export const runtime = "nodejs";
import { dependencies } from "../../../../lib/http/api/cranker/wake/runtime";
import { GET as GETComponent } from "../../../../lib/http/api/cranker/wake/GET";

export const GET = GETComponent.bind(null, dependencies);
