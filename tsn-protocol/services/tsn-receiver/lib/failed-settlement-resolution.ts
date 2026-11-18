/** Stable failed-settlement-resolution facade and production composition; implementations live in recovery/nonexecution. */
import { fetchResponse } from "./networking/common/fetch-response";
import { db } from "./firebase";
import { workCollection } from "./firebase";
import { wakeTsnNode } from "./node-wake";
import { resolveFailedSettlement as resolveFailedSettlementComponent } from "./recovery/nonexecution/resolve-failed-settlement";

const dependencies = {
  clock: Date,
  environment: process.env,
  fetch: fetchResponse,
  workCollection: workCollection,
  database: db,
  wakeNode: wakeTsnNode,
};

export const resolveFailedSettlement = resolveFailedSettlementComponent.bind(null, dependencies);
