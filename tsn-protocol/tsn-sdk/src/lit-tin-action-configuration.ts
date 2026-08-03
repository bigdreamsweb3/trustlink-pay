export const LIT_TIN_ACTION_RUNTIME = "lit-chipotle-action" as const;
export const LIT_TIN_ACTION_REPLAY_MODE = "ATOMIC_NONCE_REGISTRY" as const;

export type LitTinActionConfiguration = {
  runtime: typeof LIT_TIN_ACTION_RUNTIME;
  apiBaseUrl: string;
  actionCid: string;
  actionSourceSha256: string;
  pkpId: string;
  groupId: string;
  replayProtection: {
    mode: typeof LIT_TIN_ACTION_REPLAY_MODE;
    endpoint: string;
    audience: string;
    verifierPublicKey: string;
  };
};

export type LitTinActionReadiness =
  | {
      ready: true;
      status: "READY";
      configuration: LitTinActionConfiguration;
    }
  | {
      ready: false;
      status: "BLOCKED_ACTION_CONFIGURATION";
      errors: string[];
    };

function isSha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isIpfsCid(value: string) {
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(value) ||
    /^b[a-z2-7]{20,}$/.test(value);
}

function secureUrl(value: string, label: string, errors: string[]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(`${label} must use HTTPS`);
    }
    if (url.username || url.password || url.search || url.hash) {
      errors.push(`${label} must not contain credentials, query parameters, or fragments`);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    errors.push(`${label} is invalid`);
    return value;
  }
}

/**
 * Validates only public, immutable action metadata. Account or usage API keys
 * are deliberately excluded so they cannot enter frontend state, TIN data,
 * evidence, or documentation.
 */
export function getLitTinActionReadiness(
  input: Partial<LitTinActionConfiguration> | null | undefined,
): LitTinActionReadiness {
  const errors: string[] = [];
  if (!input) {
    return {
      ready: false,
      status: "BLOCKED_ACTION_CONFIGURATION",
      errors: ["Lit TIN action configuration is missing"],
    };
  }
  if (input.runtime !== LIT_TIN_ACTION_RUNTIME) {
    errors.push(`runtime must equal ${LIT_TIN_ACTION_RUNTIME}`);
  }
  const apiBaseUrl = secureUrl(input.apiBaseUrl ?? "", "apiBaseUrl", errors);
  if (!isIpfsCid(input.actionCid ?? "")) {
    errors.push("actionCid must be an immutable IPFS CID");
  }
  if (!isSha256(input.actionSourceSha256 ?? "")) {
    errors.push("actionSourceSha256 must be a 32-byte hexadecimal SHA-256 digest");
  }
  if (!input.pkpId?.trim()) errors.push("pkpId is required");
  if (!input.groupId?.trim()) errors.push("groupId is required");
  if (input.replayProtection?.mode !== LIT_TIN_ACTION_REPLAY_MODE) {
    errors.push(`replayProtection.mode must equal ${LIT_TIN_ACTION_REPLAY_MODE}`);
  }
  const replayEndpoint = secureUrl(
    input.replayProtection?.endpoint ?? "",
    "replayProtection.endpoint",
    errors,
  );
  if (!input.replayProtection?.audience?.trim()) {
    errors.push("replayProtection.audience is required");
  }
  if (!input.replayProtection?.verifierPublicKey?.trim()) {
    errors.push("replayProtection.verifierPublicKey is required");
  }
  if (errors.length) {
    return { ready: false, status: "BLOCKED_ACTION_CONFIGURATION", errors };
  }
  return {
    ready: true,
    status: "READY",
    configuration: {
      runtime: LIT_TIN_ACTION_RUNTIME,
      apiBaseUrl,
      actionCid: input.actionCid!,
      actionSourceSha256: input.actionSourceSha256!.toLowerCase(),
      pkpId: input.pkpId!.trim(),
      groupId: input.groupId!.trim(),
      replayProtection: {
        mode: LIT_TIN_ACTION_REPLAY_MODE,
        endpoint: replayEndpoint,
        audience: input.replayProtection!.audience.trim(),
        verifierPublicKey: input.replayProtection!.verifierPublicKey.trim(),
      },
    },
  };
}

export function assertLitTinActionConfiguration(
  input: Partial<LitTinActionConfiguration> | null | undefined,
) {
  const readiness = getLitTinActionReadiness(input);
  if (!readiness.ready) {
    throw new Error(
      `TIN threshold action is not ready: ${readiness.errors.join("; ")}`,
    );
  }
  return readiness.configuration;
}
