/** Stable node-state-store facade and production composition; implementations live in state/node-key-value. */
import { db } from "./database";
import { executeStateOperation as executeStateOperationComponent } from "./state/node-key-value/execute-state-operation";

const root = db.collection(process.env.TSN_RECEIVER_STATE_COLLECTION ?? "tsn_receiver_state");

const dependencies = {
  root: root,
  database: db,
};

export const executeStateOperation = executeStateOperationComponent.bind(null, dependencies);
