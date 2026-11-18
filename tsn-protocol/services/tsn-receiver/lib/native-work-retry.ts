/** Stable native-work-retry facade and production composition; implementations live in recovery/native-retry. */
import { nativeWorkRetryPatch as nativeWorkRetryPatchComponent } from "./recovery/native-retry/native-work-retry-patch";

const dependencies = {
  clock: Date,
};

export const nativeWorkRetryPatch = nativeWorkRetryPatchComponent.bind(null, dependencies);
