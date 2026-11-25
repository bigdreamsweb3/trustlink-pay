import type { RelayRequest } from "../../node-relay/types";
export interface Dependencies { environment: NodeJS.ProcessEnv; request: (request: RelayRequest) => Promise<Response>; }
