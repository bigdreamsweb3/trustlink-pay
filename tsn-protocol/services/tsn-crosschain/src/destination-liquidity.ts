/** Research-only validators; these target labels do not enable network support. */
import { id } from "ethers";

export type SupportedDestinationEvm = "base" | "arbitrum" | "polygon";

export interface DestinationLiquidityRoute {
  routeId: `0x${string}`;
  network: SupportedDestinationEvm;
  sourceChainKey: bigint;
  sourceLiquidityEmitter: `0x${string}`;
  payoutVault: `0x${string}`;
  settlementToken: `0x${string}`;
  enabled: boolean;
}

export interface VerifiedLiquidityObservation {
  routeId: `0x${string}`;
  queryId: `0x${string}`;
  availableAmount: bigint;
  sourceBlock: bigint;
  validUntil: bigint;
  nonce: bigint;
}

export const LIQUIDITY_AVAILABLE_EVENT_SIGNATURE =
  "LiquidityAvailable(bytes32,address,uint256,uint256,uint256)" as const;

export const LIQUIDITY_AVAILABLE_EVENT_TOPIC = id(LIQUIDITY_AVAILABLE_EVENT_SIGNATURE);

export function createDestinationRouteId(network: SupportedDestinationEvm, token: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) throw new Error("destination token must be a 20-byte EVM address");
  return id(`TSN_DESTINATION_ROUTE_V1:${network}:${token}`) as `0x${string}`;
}

export function validateDestinationLiquidityRoute(
  route: DestinationLiquidityRoute,
): DestinationLiquidityRoute {
  if (!/^0x[0-9a-fA-F]{64}$/.test(route.routeId)) throw new Error("routeId must be bytes32");
  if (!/^0x[0-9a-fA-F]{40}$/.test(route.sourceLiquidityEmitter)) {
    throw new Error("sourceLiquidityEmitter must be a 20-byte EVM address");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(route.payoutVault)) {
    throw new Error("payoutVault must be a 20-byte EVM address");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(route.settlementToken)) {
    throw new Error("settlementToken must be a 20-byte EVM address");
  }
  if (route.sourceChainKey <= 0n) throw new Error("sourceChainKey must be positive");
  return route;
}

export function validateVerifiedLiquidityObservation(
  observation: VerifiedLiquidityObservation,
  requestedAmount: bigint,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): VerifiedLiquidityObservation {
  if (!/^0x[0-9a-fA-F]{64}$/.test(observation.routeId)) throw new Error("observation routeId must be bytes32");
  if (!/^0x[0-9a-fA-F]{64}$/.test(observation.queryId)) throw new Error("observation queryId must be bytes32");
  if (requestedAmount <= 0n) throw new Error("requestedAmount must be positive");
  if (observation.availableAmount < requestedAmount) throw new Error("verified destination liquidity is insufficient");
  if (observation.sourceBlock <= 0n) throw new Error("sourceBlock must be positive");
  if (observation.validUntil <= nowSeconds) throw new Error("verified destination liquidity has expired");
  if (observation.nonce <= 0n) throw new Error("liquidity nonce must be positive");
  return observation;
}

/**
 * A fast RPC read can reject an obviously unfunded route before Solana debit;
 * this local read does not establish cryptographic destination acceptance.
 */
export interface DestinationLiquidityPreflight {
  route: DestinationLiquidityRoute;
  requestedAmount: bigint;
  availableAmount: bigint;
  validUntil: bigint;
  verified: boolean;
}

export function assertDestinationLiquidityPreflight(
  preflight: DestinationLiquidityPreflight,
  nowSeconds: bigint = BigInt(Math.floor(Date.now() / 1000)),
): void {
  validateDestinationLiquidityRoute(preflight.route);
  if (!preflight.verified) throw new Error("destination liquidity has not been verified");
  if (preflight.availableAmount < preflight.requestedAmount) {
    throw new Error("destination liquidity preflight failed");
  }
  if (preflight.validUntil <= nowSeconds) throw new Error("destination liquidity preflight expired");
}
