/** Stable cranker-auth facade and production composition; implementations live in authentication/cranker. */
import { db } from "./firebase";
import { hasRpcUrl } from "./authentication/cranker/has-rpc-url";
import { DEFAULT_TSN_RPC_GATEWAY_URL, DEVNET_RPC_URL } from "./authentication/cranker/configuration";
import { connectSolana } from "./authentication/cranker/connect-solana";
import { issueCrankerChallenge as issueCrankerChallengeComponent } from "./authentication/cranker/issue-cranker-challenge";
import { issueCrankerSession as issueCrankerSessionComponent } from "./authentication/cranker/issue-cranker-session";
import { authenticateCrankerRequest as authenticateCrankerRequestComponent } from "./authentication/cranker/authenticate-cranker-request";
import { enforceCrankerLeaseRateLimit as enforceCrankerLeaseRateLimitComponent } from "./authentication/cranker/enforce-cranker-lease-rate-limit";

const challengeCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_CHALLENGE_COLLECTION ?? "tsn_receiver_cranker_challenges");
const rateCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_RATE_COLLECTION ?? "tsn_receiver_cranker_rate_limits");
const sessionCollection = db.collection(process.env.TSN_RECEIVER_CRANKER_SESSION_COLLECTION ?? "tsn_receiver_cranker_sessions");
const SOLANA_RPC_URLS = Array.from(new Set([process.env.TSN_RPC_URL?.trim()
  || process.env.TSN_RPC_GATEWAY_URL?.trim()
  || DEFAULT_TSN_RPC_GATEWAY_URL, DEVNET_RPC_URL].filter(hasRpcUrl)));

const dependencies = {
  rpcUrls: SOLANA_RPC_URLS,
  connect: connectSolana,
  clock: Date,
  challengeCollection: challengeCollection,
  sessionCollection: sessionCollection,
  database: db,
  rateCollection: rateCollection,
};

export const issueCrankerChallenge = issueCrankerChallengeComponent.bind(null, dependencies);

export const issueCrankerSession = issueCrankerSessionComponent.bind(null, dependencies);

export const authenticateCrankerRequest = authenticateCrankerRequestComponent.bind(null, dependencies);

export const enforceCrankerLeaseRateLimit = enforceCrankerLeaseRateLimitComponent.bind(null, dependencies);
