import { createHash } from "node:crypto";
import { httpState } from "./http-state.mjs";
import { NextResponse } from "./next-response.mjs";
import { invokeHttpPort } from "./invoke-http-port.mjs";
export const httpPorts={NextResponse,createHash,storage:"FILE",app:{name:"SYNTHETIC_APP"},NATIVE_REVERIFY_REASONS:new Set(["SYNTHETIC_NATIVE_REVERIFY"]),
  db:{collection:invokeHttpPort.bind(null,httpState,"storageCollection")}};
export const portNames=["requireService","publicIntent","listKind","receive","assertAuthorizedFundingIngress","publicCoordinationPayload","listRecent","assertExternalWorkKind","proxyNode","authenticateCrankerRequest","enforceCrankerLeaseRateLimit","requestNodeAuthorization","getAuth","attachCrankerAuthorization","leaseForCranker","recordSettlementSubmission","retryLeasedSettlementFundingRoot","transition","reconcileExpiredCrankerConfirmation","crankerAuthorizationForWork","crankerExecutionPayload","verifiedPayloadForWork","getWork","issueCrankerChallenge","issueCrankerSession","coordinationInventory","enqueueCoordination","deferPrivateCredit","executeStateOperation","getWorkForNode","leaseForNode","renewNodeLease","reconcileSettlementReceipt","resolveFailedSettlement","retrySettlementSnapshot"];
for(const name of portNames)httpPorts[name]=invokeHttpPort.bind(null,httpState,name);
httpPorts.assertPaymentAuthorizationIngress=invokeHttpPort.bind(null,httpState,"assertPaymentAuthorizationIngress");
