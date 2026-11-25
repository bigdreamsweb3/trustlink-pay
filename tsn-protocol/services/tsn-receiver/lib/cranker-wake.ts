/** Durable payload-free coordination marker; Cranker uses its existing authenticated polling lanes. */
import { db } from "./database";
import { publishCrankerWake as component } from "./networking/cranker-wake/publish-cranker-wake";
export const publishCrankerWake = component.bind(null, {db,clock:Date});
