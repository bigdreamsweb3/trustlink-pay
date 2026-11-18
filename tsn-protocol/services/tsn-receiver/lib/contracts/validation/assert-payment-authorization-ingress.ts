import { PAYMENT_AUTHORIZATION_KEYS } from "../constants";
import { assertAllowlisted } from "./assert-allowlisted";
import { assertPaymentAuthorizationPayload } from "./assert-payment-authorization-payload";

/** Accept only the wallet-signed payment message; funding bytes belong to a later guarded attachment. */
export function assertPaymentAuthorizationIngress(payload: Record<string, unknown>): void {
  assertAllowlisted(payload, PAYMENT_AUTHORIZATION_KEYS, "paymentAuthorization");
  assertPaymentAuthorizationPayload(payload);
}
