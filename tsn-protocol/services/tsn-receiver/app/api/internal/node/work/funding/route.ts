export const runtime = "nodejs";
import { dependencies } from "../../../../../../lib/http/api/internal/node/work/funding/runtime";
import { POST as POSTComponent } from "../../../../../../lib/http/api/internal/node/work/funding/POST";
export const POST = POSTComponent.bind(null, dependencies);
