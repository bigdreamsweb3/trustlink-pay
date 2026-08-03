import type { AuthSig, SessionKeyPair, SolRpcConditions } from "@lit-protocol/types";

import { canonicalFields, sha256Hex } from "./receipts/internal/encoding.js";
import type {
  TinMasterSeedAccessContext,
  TinMasterSeedThresholdProvider,
} from "./tin-private-controller.js";
import { wrapTinThresholdKeyForDevice } from "./tin-device-key-envelope.js";
import {
  createLitTinProtectKeyRequest,
  createLitTinReleaseKeyRequest,
  type LitTinActionRequest,
  type LitTinProtectKeyResponse,
  type LitTinReleaseKeyResponse,
} from "./lit-tin-action-contract.js";
import {
  assertLitTinActionConfiguration,
  type LitTinActionConfiguration,
} from "./lit-tin-action-configuration.js";
import { verifyTinThresholdNonceReceipt } from "./tin-threshold-nonce-receipt.js";

const LIT_CHAIN = "solanaDevnet";
const SESSION_LIFETIME_MS = 5 * 60 * 1000;

/**
 * Lit's current Solana AuthSig proves control of a Solana address, but the
 * pinned SDK does not provide a verified device-bound capability flow that
 * prevents a captured Solana AuthSig from being presented by another client.
 * Its normal Solana access-control decryption is directly wallet-gated; the
 * local TSN device proof is not evaluated by those threshold nodes.
 * Master-seed protection must fail closed until that second factor is enforced
 * by the threshold network, not merely checked by this browser process.
 */
export const LIT_SOLANA_TIN_ACCESS_READINESS = {
  status: "BLOCKED_UNVERIFIED_DEVICE_BINDING",
  safeForTinMasterSeeds: false,
  reason:
    "Pinned Lit Solana access-control decryption does not enforce TSN's authorized-device binding, wallet-plus-device proof, and nonce contract at the threshold network.",
} as const;

function assertDeviceBindingReady() {
  if (!LIT_SOLANA_TIN_ACCESS_READINESS.safeForTinMasterSeeds) {
    throw new Error(
      `TIN master-seed threshold access is blocked: ${LIT_SOLANA_TIN_ACCESS_READINESS.reason}`,
    );
  }
}

type ThresholdLitClient = {
  getSessionSigs(params: Record<string, unknown>): Promise<Record<string, AuthSig>>;
  disconnect(): Promise<void>;
};

function exactSolanaOwnerCondition(ownerPublicKey: string): SolRpcConditions {
  return [{
    conditionType: "solRpc",
    method: "",
    params: [":userAddress"],
    pdaParams: [],
    pdaInterface: { offset: 0, fields: {} },
    pdaKey: "",
    chain: LIT_CHAIN,
    returnValueTest: {
      key: "",
      comparator: "=",
      value: ownerPublicKey,
    },
  }];
}

async function conditionHash(ownerPublicKey: string) {
  return sha256Hex(canonicalFields([
    "TSN_TIN_LIT_ACCESS_POLICY",
    LIT_CHAIN,
    ownerPublicKey,
  ]));
}

function signatureHex(signature: Uint8Array) {
  return Buffer.from(signature).toString("hex");
}

/**
 * Browser-only threshold provider. The Lit session key is generated in memory
 * and is never placed in localStorage, sessionStorage, TIN data, or an API.
 */
export class LitSolanaTinMasterSeedProvider implements TinMasterSeedThresholdProvider {
  readonly id = "lit-datil-dev-solana-authorized-device";

  private constructor(
    private readonly client: ThresholdLitClient,
    private readonly sessionKey: SessionKeyPair,
  ) {}

  static async connect() {
    if (typeof window === "undefined") {
      throw new Error("The authorized-device threshold provider requires a browser");
    }
    const [{ LitNodeClient }, { LIT_NETWORK }, { generateSessionKeyPair }] = await Promise.all([
      import("@lit-protocol/lit-node-client"),
      import("@lit-protocol/constants"),
      import("@lit-protocol/crypto"),
    ]);
    const client = new LitNodeClient({
      litNetwork: LIT_NETWORK.DatilDev,
      debug: false,
    });
    await client.connect();
    return new LitSolanaTinMasterSeedProvider(
      client as unknown as ThresholdLitClient,
      generateSessionKeyPair(),
    );
  }

  async getDeviceSessionBinding() {
    return `lit-session:${this.sessionKey.publicKey}`;
  }

  async protectKey(params: TinMasterSeedAccessContext) {
    assertDeviceBindingReady();
    const { encryptUint8Array } = await import("@lit-protocol/encryption");
    const solRpcConditions = exactSolanaOwnerCondition(params.ownerPublicKey);
    const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
    try {
      const encrypted = await encryptUint8Array(
        {
          dataToEncrypt: keyMaterial,
          solRpcConditions,
        },
        this.client as never,
      );
      const protectedKey = JSON.stringify({
        ciphertext: encrypted.ciphertext,
        dataToEncryptHash: encrypted.dataToEncryptHash,
      });
      return {
        protectedKey,
        protectedKeyCommitment: await sha256Hex(new TextEncoder().encode(protectedKey)),
        accessControlHash: await conditionHash(params.ownerPublicKey),
        deviceKeyEnvelope: await wrapTinThresholdKeyForDevice({
          keyMaterial,
          proof: params.deviceAccessProof,
        }),
      };
    } finally {
      keyMaterial.fill(0);
    }
  }

  async releaseKey(
    params: TinMasterSeedAccessContext & {
      protectedKey: string;
      protectedKeyCommitment: string;
      accessControlHash: string;
    },
  ) {
    assertDeviceBindingReady();
    const expectedConditionHash = await conditionHash(params.ownerPublicKey);
    if (expectedConditionHash !== params.accessControlHash.toLowerCase()) {
      throw new Error("TIN threshold access-control policy does not match the owner wallet");
    }
    const sessionBinding = await this.getDeviceSessionBinding();
    if (!params.deviceSessionBinding.startsWith(`${sessionBinding}:device:`)) {
      throw new Error("TIN wallet authorization belongs to another device session");
    }
    if (
      await sha256Hex(new TextEncoder().encode(params.protectedKey)) !==
      params.protectedKeyCommitment.toLowerCase()
    ) {
      throw new Error("TIN protected-key commitment is invalid");
    }
    const protectedKey = JSON.parse(params.protectedKey) as {
      ciphertext?: string;
      dataToEncryptHash?: string;
    };
    if (!protectedKey.ciphertext || !protectedKey.dataToEncryptHash) {
      throw new Error("TIN protected-key payload is invalid");
    }
    const [
      { decryptToUint8Array },
      { LitAccessControlConditionResource },
      { LIT_ABILITY },
    ] = await Promise.all([
      import("@lit-protocol/encryption"),
      import("@lit-protocol/auth-helpers"),
      import("@lit-protocol/constants"),
    ]);
    const sessionSigs = await this.client.getSessionSigs({
      chain: LIT_CHAIN,
      expiration: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
      sessionKey: this.sessionKey,
      resourceAbilityRequests: [{
        resource: new LitAccessControlConditionResource("*"),
        ability: LIT_ABILITY.AccessControlConditionDecryption,
      }],
      authNeededCallback: async (): Promise<AuthSig> => ({
        sig: signatureHex(params.walletAuthorizationSignature),
        derivedVia: "solana.signMessage",
        signedMessage: new TextDecoder().decode(params.walletAuthorizationMessage),
        address: params.ownerPublicKey,
      }),
    });
    const keyMaterial = await decryptToUint8Array(
      {
        chain: LIT_CHAIN,
        ciphertext: protectedKey.ciphertext,
        dataToEncryptHash: protectedKey.dataToEncryptHash,
        solRpcConditions: exactSolanaOwnerCondition(params.ownerPublicKey),
        sessionSigs,
      },
      this.client as never,
    );
    try {
      return await wrapTinThresholdKeyForDevice({
        keyMaterial,
        proof: params.deviceAccessProof,
      });
    } finally {
      keyMaterial.fill(0);
    }
  }

  async disconnect() {
    this.sessionKey.secretKey = "";
    await this.client.disconnect();
  }
}

export async function createLitSolanaTinMasterSeedProvider() {
  return LitSolanaTinMasterSeedProvider.connect();
}

export type LitTinActionExecutor = (
  request: LitTinActionRequest,
  configuration: LitTinActionConfiguration,
) => Promise<LitTinProtectKeyResponse | LitTinReleaseKeyResponse>;

/**
 * Production provider for the immutable Chipotle action. The executor is a
 * same-origin frontend-server proxy so the scoped Lit usage credential never
 * enters browser state. Requests contain public proofs only; responses contain
 * an opaque PKP ciphertext and/or a data key encrypted to the authorized
 * device.
 */
export class LitChipotleTinMasterSeedProvider implements TinMasterSeedThresholdProvider {
  readonly id = "lit-chipotle-authorized-device";

  constructor(
    private readonly configuration: LitTinActionConfiguration,
    private readonly executeAction: LitTinActionExecutor,
    private readonly sessionBinding: string,
  ) {
    assertLitTinActionConfiguration(configuration);
    if (!sessionBinding.trim()) throw new Error("TIN threshold session binding is required");
  }

  async getDeviceSessionBinding() {
    return this.sessionBinding;
  }

  async protectKey(params: TinMasterSeedAccessContext) {
    const request = createLitTinProtectKeyRequest({
      pkpId: this.configuration.pkpId,
      access: params,
    });
    const response = await this.executeAction(request, this.configuration);
    if (response.operation !== "PROTECT_KEY") {
      throw new Error("TIN threshold action returned the wrong operation");
    }
    await verifyTinThresholdNonceReceipt({
      receipt: response.nonceReceipt,
      proof: params.deviceAccessProof,
      expectedVerifierPublicKeyBase64Url:
        this.configuration.replayProtection.verifierPublicKey,
    });
    return {
      protectedKey: response.protectedKey,
      protectedKeyCommitment: response.protectedKeyCommitment,
      accessControlHash: response.accessControlHash,
      deviceKeyEnvelope: response.deviceKeyEnvelope,
    };
  }

  async releaseKey(params: TinMasterSeedAccessContext & {
    protectedKey: string;
    protectedKeyCommitment: string;
    accessControlHash: string;
  }) {
    const request = createLitTinReleaseKeyRequest({
      pkpId: this.configuration.pkpId,
      access: params,
      protectedKey: params.protectedKey,
      protectedKeyCommitment: params.protectedKeyCommitment,
      accessControlHash: params.accessControlHash,
    });
    const response = await this.executeAction(request, this.configuration);
    if (response.operation !== "RELEASE_KEY") {
      throw new Error("TIN threshold action returned the wrong operation");
    }
    await verifyTinThresholdNonceReceipt({
      receipt: response.nonceReceipt,
      proof: params.deviceAccessProof,
      expectedVerifierPublicKeyBase64Url:
        this.configuration.replayProtection.verifierPublicKey,
    });
    return response.deviceKeyEnvelope;
  }
}
