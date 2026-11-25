/** Stable private-credit-coordination facade and production composition; implementations live in state/private-coordination. */
import { db } from "./database";
import { workCollection } from "./database";
import { coordinationInventory as coordinationInventoryComponent } from "./state/private-coordination/coordination-inventory";
import { enqueueCoordination as enqueueCoordinationComponent } from "./state/private-coordination/enqueue-coordination";
import { deferPrivateCredit as deferPrivateCreditComponent } from "./state/private-coordination/defer-private-credit";

import { decryptPayloadForNode } from "./node-envelope";
import { projectWorkForNode } from "./work/projectWorkForNode";

const dependencies = {
  projectNodeWork: projectWorkForNode.bind(null, { decryptPayloadForNode }),
  workCollection: workCollection,
  database: db,
  clock: Date,
};

export const coordinationInventory = coordinationInventoryComponent.bind(null, dependencies);

export const enqueueCoordination = enqueueCoordinationComponent.bind(null, dependencies);

export const deferPrivateCredit = deferPrivateCreditComponent.bind(null, dependencies);
