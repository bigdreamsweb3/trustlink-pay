/** Stable auth facade and production composition; implementations live in authentication/service. */
import { requireService as requireServiceComponent } from "./authentication/service/require-service";

const dependencies = {
  environment: process.env,
};

export const requireService = requireServiceComponent.bind(null, dependencies);
