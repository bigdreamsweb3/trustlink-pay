import { config } from "dotenv";

config({ path: ".env.local" });
const runClaimFlow = process.env.TEST_RUN_CLAIM_FLOW === "true";

async function invokeRoute<T>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<T> {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

  const payload = (await response.json()) as T | { error: string };

  if (!response.ok) {
    throw new Error(JSON.stringify(payload, null, 2));
  }

  return payload as T;
}

async function invokeGetRoute<T>(
  handler: (request: Request) => Promise<Response>,
  path: string,
  accessToken: string,
): Promise<T> {
  const response = await handler(
    new Request(`http://localhost${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  );

  const payload = (await response.json()) as T | { error: string };

  if (!response.ok) {
    throw new Error(JSON.stringify(payload, null, 2));
  }

  return payload as T;
}

async function main() {
  const { findLatestOtpForPhoneNumber } =
    await import("../app/db/phone-verifications");
  const { getRegisteredUserByPhoneNumber } =
    await import("../app/services/auth");
  const registerStartRoute =
    await import("../app/api/auth/register/start/route");
  const registerRoute = await import("../app/api/auth/register/route");
  const loginStartRoute = await import("../app/api/auth/login/start/route");
  const loginRoute = await import("../app/api/auth/login/route");
  const pinSetupRoute = await import("../app/api/auth/pin/setup/route");
  const pinVerifyRoute = await import("../app/api/auth/pin/verify/route");
  const receiverWalletsRoute =
    await import("../app/api/receiver-wallets/route");
  const createPaymentRoute = await import("../app/api/payment/create/route");
  const startClaimRoute = await import("../app/api/payment/claim/start/route");
  const pendingPaymentsRoute = await import("../app/api/payment/pending/route");
  const acceptPaymentRoute = await import("../app/api/payment/accept/route");
  const phoneNumber =
    process.env.TEST_RECIPIENT_PHONE_NUMBER ??
    `+1555${Math.floor(1000000 + Math.random() * 8999999)}`;
  const senderHandle = process.env.TEST_SENDER_HANDLE ?? "daniel_trust";
  const senderPin =
    process.env.TEST_SENDER_PIN ??
    process.env.TEST_SENDER_PASSWORD ??
    "123456";
  const senderWalletAddress =
    process.env.TEST_SENDER_WALLET_ADDRESS ??
    "SenderWalletMock111111111111111111111111111111";
  const receiverWalletAddress =
    process.env.TEST_RECEIVER_WALLET_ADDRESS ??
    "ReceiverWalletMock111111111111111111111111111";
  let accessToken: string;
  let receiverWalletId: string | undefined;

  console.log("Using phone number:", phoneNumber);

  const existingUser = await getRegisteredUserByPhoneNumber(phoneNumber);

  if (!existingUser) {
    await invokeRoute<{
      sent: boolean;
      phoneNumber: string;
      expiresAt: string;
    }>(registerStartRoute.POST, "/api/auth/register/start", {
      phoneNumber,
    });

    const registerOtp = await findLatestOtpForPhoneNumber(
      phoneNumber,
      "register",
    );

    if (!registerOtp) {
      throw new Error("No registration OTP found for test phone number");
    }

    const registerResult = await invokeRoute<{
      registered: boolean;
      challengeToken: string;
      pinSetupRequired: boolean;
      user: {
        id: string;
        phoneNumber: string;
        displayName: string;
        handle: string;
      };
    }>(registerRoute.POST, "/api/auth/register", {
      phoneNumber,
      otp: registerOtp.otp_code,
      displayName: "Daniel Trust",
      handle: senderHandle,
      walletAddress: senderWalletAddress,
    });
    console.log("register sender:", registerResult);
    const pinSetupResult = await invokeRoute<{
      accessGranted: boolean;
      accessToken: string;
    }>(pinSetupRoute.POST, "/api/auth/pin/setup", {
      challengeToken: registerResult.challengeToken,
      pin: senderPin,
    });
    console.log("setup pin:", pinSetupResult);
    accessToken = pinSetupResult.accessToken;
  } else {
    console.log("sender already registered:", existingUser);
    await invokeRoute<{
      sent: boolean;
      phoneNumber: string;
      expiresAt: string;
    }>(loginStartRoute.POST, "/api/auth/login/start", {
      phoneNumber,
    });

    const loginOtp = await findLatestOtpForPhoneNumber(phoneNumber, "login");

    if (!loginOtp) {
      throw new Error("No login OTP found for test phone number");
    }

    const loginResult = await invokeRoute<{
      authenticated: boolean;
      challengeToken: string;
      pinRequired: boolean;
      pinSetupRequired: boolean;
      user: {
        id: string;
        phoneNumber: string;
      };
    }>(loginRoute.POST, "/api/auth/login", {
      phoneNumber,
      otp: loginOtp.otp_code,
    });

    console.log("login sender:", loginResult);
    if (loginResult.pinSetupRequired) {
      const pinSetupResult = await invokeRoute<{
        accessGranted: boolean;
        accessToken: string;
      }>(pinSetupRoute.POST, "/api/auth/pin/setup", {
        challengeToken: loginResult.challengeToken,
        pin: senderPin,
      });
      console.log("setup pin:", pinSetupResult);
      accessToken = pinSetupResult.accessToken;
    } else {
      const pinVerifyResult = await invokeRoute<{
        accessGranted: boolean;
        accessToken: string;
      }>(pinVerifyRoute.POST, "/api/auth/pin/verify", {
        challengeToken: loginResult.challengeToken,
        pin: senderPin,
      });
      console.log("verify pin:", pinVerifyResult);
      accessToken = pinVerifyResult.accessToken;
    }
  }

  const walletList = await invokeGetRoute<{
    wallets: Array<{
      id: string;
      wallet_name: string;
      wallet_address: string;
    }>;
  }>(receiverWalletsRoute.GET, "/api/receiver-wallets", accessToken);

  if (walletList.wallets.length === 0) {
    const createdWallet = await invokeRoute<{
      wallet: {
        id: string;
        wallet_name: string;
        wallet_address: string;
      };
    }>(
      receiverWalletsRoute.POST,
      "/api/receiver-wallets",
      {
        walletName: "Primary Wallet",
        walletAddress: receiverWalletAddress,
      },
      accessToken,
    );
    console.log("add receiver wallet:", createdWallet);
    receiverWalletId = createdWallet.wallet.id;
  } else {
    receiverWalletId = walletList.wallets[0]?.id;
    console.log("receiver wallets:", walletList.wallets);
  }

  const createPaymentResult = await invokeRoute<{
    paymentId: string;
    status: string;
    referenceCode: string;
    senderDisplayName: string;
    senderHandle: string;
    escrowAccount: string;
    blockchainSignature: string;
  }>(createPaymentRoute.POST, "/api/payment/create", {
    phoneNumber,
    senderPhoneNumber: phoneNumber,
    amount: 2.5,
    token: "USDC",
    senderWallet: senderWalletAddress,
  });
  console.log("create payment:", createPaymentResult);

  if (!runClaimFlow) {
    console.log(
      "claim flow skipped. Set TEST_RUN_CLAIM_FLOW=true to trigger OTP and acceptance.",
    );
    return;
  }

  const claimStartResult = await invokeRoute<{
    paymentId: string;
    referenceCode: string;
    senderDisplayName: string;
    senderHandle: string;
    expiresAt: string;
  }>(startClaimRoute.POST, "/api/payment/claim/start", {
    paymentId: createPaymentResult.paymentId,
  }, accessToken);
  console.log("start claim:", claimStartResult);

  const latestOtp = await findLatestOtpForPhoneNumber(phoneNumber, "claim");

  if (!latestOtp) {
    throw new Error("No OTP found for test phone number");
  }

  console.log("loaded otp from database:", latestOtp.otp_code);

  const acceptPaymentResult = await invokeRoute<{
    paymentId: string;
    status: string;
    walletAddress: string;
    blockchainSignature: string;
  }>(acceptPaymentRoute.POST, "/api/payment/accept", {
    paymentId: createPaymentResult.paymentId,
    otp: latestOtp.otp_code,
    receiverWalletId,
  }, accessToken);
  console.log("accept payment:", acceptPaymentResult);

  const pendingPayments = await invokeGetRoute<{
    payments: Array<{
      id: string;
      status: string;
      reference_code: string;
    }>;
  }>(pendingPaymentsRoute.GET, "/api/payment/pending", accessToken);
  console.log("pending payments:", pendingPayments);
}

main().catch((error) => {
  console.error("Payment flow test failed.");
  console.error(error);
  process.exit(1);
});
