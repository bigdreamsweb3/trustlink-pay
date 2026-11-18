import { start } from "./start.mjs";
import { pull } from "./pull.mjs";

export function interruptedComponent() {
    return new Response(new ReadableStream({
        start: start,
        pull: pull,
    }), { status: 200 });
}
