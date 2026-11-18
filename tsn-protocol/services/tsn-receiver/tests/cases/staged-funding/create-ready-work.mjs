import { createAuthorization } from "./create-authorization.mjs";
import { signReadiness } from "./sign-readiness.mjs";

/** Exercise ingress, leasing and signed readiness before attachment cases. */
export async function createReadyWork(context, id = "synthetic-staged-funding") {
  const payload = createAuthorization(id);
  await context.receive({ id, kind: "AUTHORIZED_FUNDING", payload });
  const leased = await context.leaseNode("synthetic-node", ["AUTHORIZED_FUNDING"]);
  const evidence = signReadiness(context, leased);
  const work = await context.transition({ id, actor: "node", owner: "synthetic-node", expectedVersion: leased.stateVersion,
    status: "FUNDING_READY", evidence });
  return { work, payload, evidence, leased };
}
