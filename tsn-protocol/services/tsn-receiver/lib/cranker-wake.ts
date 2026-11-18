/** Stable cranker-wake facade and production composition; implementations live in networking/cranker-wake. */
import { app } from "./firebase";
import { publishCrankerWake as publishCrankerWakeComponent } from "./networking/cranker-wake/publish-cranker-wake";

const dependencies = {
  environment: process.env,
  clock: Date,
  app: app,
};

export const publishCrankerWake = publishCrankerWakeComponent.bind(null, dependencies);
