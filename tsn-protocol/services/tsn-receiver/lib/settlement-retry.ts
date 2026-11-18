/** Stable settlement-retry facade and production composition; implementations live in recovery/settlement-retry. */
import { snapshotRetryPatch as snapshotRetryPatchComponent } from "./recovery/settlement-retry/snapshot-retry-patch";
import { fundedRootRetryPatch as fundedRootRetryPatchComponent } from "./recovery/settlement-retry/funded-root-retry-patch";

const dependencies = {
  clock: Date,
};

export const snapshotRetryPatch = snapshotRetryPatchComponent.bind(null, dependencies);

export const fundedRootRetryPatch = fundedRootRetryPatchComponent.bind(null, dependencies);

export { LEGACY_MEMO_INPUT_COUNT_REJECTION } from "./recovery/settlement-retry/configuration";

export { FUNDED_ROOT_STALE } from "./recovery/settlement-retry/configuration";

export { NATIVE_REVERIFY_REASONS } from "./recovery/settlement-retry/configuration";
