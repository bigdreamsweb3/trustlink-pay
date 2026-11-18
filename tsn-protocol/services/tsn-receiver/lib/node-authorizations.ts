/** Stable node-authorizations facade and production composition; implementations live in networking/node-authorization. */
import { fetchResponse } from "./networking/common/fetch-response";
import { requestNodeAuthorization as requestNodeAuthorizationComponent } from "./networking/node-authorization/request-node-authorization";

const dependencies = {
  environment: process.env,
  fetch: fetchResponse,
};

export const requestNodeAuthorization = requestNodeAuthorizationComponent.bind(null, dependencies);
