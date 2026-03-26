import { config } from "dotenv";

config({ path: ".env.local" });

async function invokeRoute<T>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

  const payload = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    throw new Error(JSON.stringify(payload, null, 2));
  }

  return payload as T;
}

async function main() {
  const phoneNumber =
    process.env.TEST_AUTH_PHONE_NUMBER ??
    process.env.TEST_RECIPIENT_PHONE_NUMBER ??
    process.env.TEST_PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error(
      "Set TEST_AUTH_PHONE_NUMBER or TEST_RECIPIENT_PHONE_NUMBER in backend/.env.local",
    );
  }

  const authPhoneStartRoute = await import("../app/api/auth/phone/start/route");
  const authPhoneStatusRoute = await import("../app/api/auth/phone/status/route");
  const authPhoneVerifyRoute = await import("../app/api/auth/phone/verify/route");
  const { findLatestActiveOtp, findLatestOtpForPhoneNumber } = await import(
    "../app/db/phone-verifications"
  );
  const { findUserByPhoneNumber } = await import("../app/db/users");

  console.log("Testing phone-first auth for:", phoneNumber);

  const existingUser = await findUserByPhoneNumber(phoneNumber);
  console.log(
    "existing user snapshot:",
    JSON.stringify(
      existingUser
        ? {
            id: existingUser.id,
            phone_number: existingUser.phone_number,
            whatsapp_opted_in: existingUser.whatsapp_opted_in,
            opt_in_timestamp: existingUser.opt_in_timestamp,
            phone_verified_at: existingUser.phone_verified_at,
            pin_hash_present: Boolean(existingUser.pin_hash),
          }
        : null,
      null,
      2,
    ),
  );

  const startResult = await invokeRoute<{
    phoneNumber: string;
    status: "awaiting_whatsapp_opt_in" | "otp_sent";
    authMode: "login" | "register";
    isRegistered: boolean;
    optedIn: boolean;
    otpReady: boolean;
    expiresAt: string | null;
    whatsappUrl: string | null;
  }>(authPhoneStartRoute.POST, "/api/auth/phone/start", {
    phoneNumber,
  });
  console.log("start result:", JSON.stringify(startResult, null, 2));

  const statusResult = await invokeRoute<{
    phoneNumber: string;
    authMode: "login" | "register";
    isRegistered: boolean;
    optedIn: boolean;
    otpReady: boolean;
    expiresAt: string | null;
  }>(authPhoneStatusRoute.POST, "/api/auth/phone/status", {
    phoneNumber,
  });
  console.log("status result:", JSON.stringify(statusResult, null, 2));

  const latestActiveOtp = await findLatestActiveOtp(phoneNumber, "auth");
  const latestOtp = await findLatestOtpForPhoneNumber(phoneNumber, "auth");

  console.log(
    "latest active auth otp:",
    JSON.stringify(
      latestActiveOtp
        ? {
            id: latestActiveOtp.id,
            otp_code: latestActiveOtp.otp_code,
            attempt_count: latestActiveOtp.attempt_count,
            consumed_at: latestActiveOtp.consumed_at,
            expires_at: latestActiveOtp.expires_at,
            created_at: latestActiveOtp.created_at,
          }
        : null,
      null,
      2,
    ),
  );
  console.log(
    "latest auth otp lookup:",
    JSON.stringify(
      latestOtp
        ? {
            id: latestOtp.id,
            otp_code: latestOtp.otp_code,
            attempt_count: latestOtp.attempt_count,
            consumed_at: latestOtp.consumed_at,
            expires_at: latestOtp.expires_at,
            created_at: latestOtp.created_at,
          }
        : null,
      null,
      2,
    ),
  );

  if (!latestActiveOtp) {
    console.log("No active auth OTP was persisted. Stopping before verify.");
    return;
  }

  const verifyResult = await invokeRoute<{
    authenticated: boolean;
    challengeToken: string;
    pinRequired: boolean;
    pinSetupRequired: boolean;
    isNewUser: boolean;
    user: {
      id: string;
      phoneNumber: string;
      displayName: string;
      handle: string;
    };
  }>(authPhoneVerifyRoute.POST, "/api/auth/phone/verify", {
    phoneNumber,
    otp: latestActiveOtp.otp_code,
  });

  console.log("verify result:", JSON.stringify(verifyResult, null, 2));
}

main().catch((error) => {
  console.error("Auth phone flow test failed.");
  console.error(error);
  process.exit(1);
});
