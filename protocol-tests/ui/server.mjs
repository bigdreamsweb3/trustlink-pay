import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { diagnosticConfig, diagnosticConfigFromBody, loadDiagnosticRecords, saveDiagnosticRecords, recordDiagnosis, readDiagnosticRecord, recordFundingDiagnosis, createBlockedAiRecord, createAiDiagnosisRecord, calculateSessionTotals } from "../diagnostics/diagnostic-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runsRoot = path.join(root, "protocol-test-runs");
const port = Number(process.env.TRUSTLINK_UI_PORT || 4317);
const clients = new Set();
const rpc = process.env.TCAP_RPC_URL
  ?? process.env.HELIUS_DEVNET_RPC_URL
  ?? process.env.DEVNET_RPC_URL
  ?? process.env.SOLANA_RPC_URL
  ?? process.env.ANCHOR_PROVIDER_URL
  ?? "https://api.devnet.solana.com";
const connection = new Connection(rpc, "confirmed");
const sessions = new Map();
let testMintAuthoritySigner = null;
const SESSION_TTL = 30 * 60 * 1000;
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ZERO_PUBLIC_KEY = new PublicKey(Buffer.alloc(32)).toBase58();
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TEST_ASSET_CONFIG = JSON.parse(await fs.readFile(path.join(root, "protocol-tests/config/trustlink-test-asset.devnet.json"), "utf8"));
const STABLE_TCAP_CONFIG = JSON.parse(await fs.readFile(path.join(root, "protocol-tests/config/stable-tcap.devnet.json"), "utf8"));
const VERIFIED_DEVNET_STABLES = JSON.parse(await fs.readFile(path.join(root, "protocol-tests/config/verified-devnet-stables.json"), "utf8"));
const TCAP_PROGRAM = new PublicKey(TEST_ASSET_CONFIG.tcapProgram);
const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/health") return json(res, 200, { service: "trustlink-test-lab", status: "READY", port });
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  if (url.pathname === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (url.pathname === "/" || url.pathname.startsWith("/runs/")) {
    const html = await fs.readFile(path.join(root, "protocol-tests/ui/public/index.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html.replace("</body>", '<script src="/wallet-controller.js"></script></body>')); return;
  }
  if (url.pathname === "/wallet-controller.js") { const js = await fs.readFile(path.join(root, "protocol-tests/ui/public/wallet-controller.js"), "utf8"); res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" }); res.end(js); return; }
  res.writeHead(404); res.end("Not found");
});

async function handleApi(req, res, url) {
  const origin = req.headers.origin;
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: "LOCAL_ORIGIN_REQUIRED" });
  if (req.method === "POST" && url.pathname === "/api/session") {
    const cookieSessionId = parseCookies(req).trustlink_lab_session;
    const existing = sessions.get(cookieSessionId);
    if (existing && Date.now() - existing.touchedAt <= SESSION_TTL) {
      existing.touchedAt = Date.now();
      return json(res, 200, { sessionId: existing.id, csrfToken: existing.csrf, network: "devnet", restored: true, wallet: await safeWallet(existing, true) });
    }
    const id = randomBytes(24).toString("hex"), csrf = randomBytes(24).toString("hex");
    sessions.set(id, { id, csrf, signer: null, wallet: null, touchedAt: Date.now(), simulation: null, pendingTransaction: null });
    return json(res, 201, { sessionId: id, csrfToken: csrf, network: "devnet", restored: false, wallet: { status: "NOT_CONFIGURED" }, rpc: "configured-local-controller" }, { "set-cookie": `trustlink_lab_session=${id}; HttpOnly; SameSite=Strict; Path=/` });
  }
  const session = authenticate(req);
  if (!session) return json(res, 401, { error: "INVALID_OR_EXPIRED_SESSION" });
  session.touchedAt = Date.now();
  if (req.method === "POST" && url.pathname === "/api/session/wallet/local-file") {
    try {
      const body = await readJson(req);
      const secret = Array.isArray(body.keypair) ? body.keypair : null;
      if (!secret || secret.length < 32) return json(res, 400, { error: "INVALID_WALLET_FILE" });
      const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
      session.signer = signer;
      session.wallet = { type: "LOCAL_DEVNET_FIXTURE", publicKey: signer.publicKey.toBase58(), source: "Local Devnet fixture file", signerLoaded: true };
      body.keypair = null;
      return json(res, 200, await safeWallet(session, true));
    } catch { return json(res, 400, { error: "INVALID_WALLET_FILE" }); }
  }
  if (req.method === "POST" && url.pathname === "/api/session/wallet/browser") {
    try { const body = await readJson(req); const publicKey = new PublicKey(body.publicKey); session.signer = null; session.wallet = { type: "BROWSER_WALLET", publicKey: publicKey.toBase58(), source: "Browser wallet", signerLoaded: false }; return json(res, 200, await safeWallet(session, true)); } catch { return json(res, 400, { error: "INVALID_BROWSER_WALLET" }); }
  }
  if (req.method === "GET" && url.pathname === "/api/session/wallet") return json(res, 200, await safeWallet(session));
  if (req.method === "DELETE" && url.pathname === "/api/session/wallet") { session.signer = null; session.wallet = null; session.simulation = null; session.pendingTransaction = null; return json(res, 200, { removed: true }); }
  if (req.method === "GET" && url.pathname === "/api/diagnostics/config") return json(res, 200, diagnosticConfig());
  if (req.method === "GET" && url.pathname === "/api/diagnostics") return json(res, 200, { records: await loadDiagnosticRecords(root, session.id), config: diagnosticConfig() });
  if (req.method === "DELETE" && url.pathname === "/api/diagnostics") { await saveEmptyDiagnostics(session.id); return json(res, 200, { cleared: true }); }
  if (req.method === "POST" && url.pathname === "/api/diagnostics/funding-commitment") {
    const body = await readJson(req).catch(() => ({}));
    const record = await recordFundingDiagnosis(root, session.id, {
      relatedProgram: TCAP_PROGRAM.toBase58(),
      relatedInstruction: "deposit_with_funding_commitment_v1",
      testStage: "funding_simulation",
      errorCode: body.errorCode ?? "6022",
      errorName: body.errorName ?? "FundingCommitmentMismatch",
      rawErrorExcerpt: body.rawErrorExcerpt ?? "Devnet simulation returned FundingCommitmentMismatch (6022 / 0x1786).",
      references: ["docs/FUNDING-COMMITMENT-MISMATCH-6022.md", "docs/TESTING-RESUMPTION-CHECKPOINT.md", "test-vectors/tcap-funding-commitment.json"],
    });
    return json(res, 201, { record, config: diagnosticConfig() });
  }
  if (req.method === "PUT" && url.pathname === "/api/diagnostics/config") {
    const body = await readJson(req);
    return json(res, 200, {
      ...diagnosticConfigFromBody(body),
      apiKeyPresent: false,
      apiKeyMessage: "API key remains server-side only and is not returned to the browser",
    });
  }
  if (req.method === "POST" && url.pathname === "/api/diagnostics/ai-call") {
    const body = await readJson(req);
    const config = diagnosticConfig();
    const totals = calculateSessionTotals(await loadDiagnosticRecords(root, session.id));
    let blockedReason = null;
    if (!config.enabled) blockedReason = "AI diagnostics are disabled";
    else if (totals.aiCallCount >= config.maxCallsPerSession) blockedReason = "Session call limit reached";
    else if ((totals.totalEstimatedCostUsd + 0.10) > config.maxCostPerSessionUsd) blockedReason = "Session cost limit would be exceeded";
    if (blockedReason) {
      const record = createBlockedAiRecord({
        relatedProgram: body.relatedProgram ?? null,
        relatedInstruction: body.relatedInstruction ?? null,
        errorCode: body.errorCode ?? null,
        errorName: body.errorName ?? null,
        rawErrorExcerpt: body.rawErrorExcerpt ?? null,
        purpose: body.purpose ?? "AI analysis",
        testStage: body.testStage ?? null,
      }, session.id, blockedReason);
      const records = await loadDiagnosticRecords(root, session.id);
      records.push(record);
      await saveDiagnosticRecords(root, session.id, records);
      return json(res, 200, { record, blocked: true, blockedReason, config: diagnosticConfig() });
    }
    const record = createAiDiagnosisRecord({
      relatedProgram: body.relatedProgram ?? null,
      relatedInstruction: body.relatedInstruction ?? null,
      errorCode: body.errorCode ?? null,
      errorName: body.errorName ?? null,
      rawErrorExcerpt: body.rawErrorExcerpt ?? null,
      purpose: body.purpose ?? "AI analysis (mocked)",
      diagnosisSummary: "MOCKED — no AI provider configured. Provide a server-side API key and set AI_DIAGNOSTICS_ENABLED=true to enable real calls.",
      confidenceLevel: "LOW (mocked)",
      testStage: body.testStage ?? null,
    }, session.id, 0);
    const records = await loadDiagnosticRecords(root, session.id);
    records.push(record);
    await saveDiagnosticRecords(root, session.id, records);
    return json(res, 200, { record, blocked: false, mocked: true, config: diagnosticConfig() });
  }
  if (req.method === "POST" && url.pathname === "/api/diagnostics/deterministic-checks") {
    const checks = {
      deterministicAvailable: true,
      errorLookup: { anchorCode: "6022", hexCode: "0x1786", name: "FundingCommitmentMismatch" },
      instructionName: "deposit_with_funding_commitment_v1",
      programId: TCAP_PROGRAM.toBase58(),
      cachedDiagnosisAvailable: false,
    };
    const records = await loadDiagnosticRecords(root, session.id);
    const cached = records.find((r) => r.failure_fingerprint);
    if (cached) checks.cachedDiagnosisAvailable = true;
    return json(res, 200, checks);
  }
  if (req.method === "POST" && url.pathname === "/api/wallet/refresh") return json(res, 200, await safeWallet(session, true));
  if (req.method === "GET" && url.pathname === "/api/tokens") return json(res, 200, { tokenAccounts: await tokenAccounts(session) });
  if (req.method === "POST" && url.pathname === "/api/test-asset/authority/local-file") {
    try {
      const body = await readJson(req), secret = Array.isArray(body.keypair) ? body.keypair : null;
      if (!secret || secret.length < 32) return json(res, 400, { error: "INVALID_MINT_AUTHORITY_FILE" });
      const signer = Keypair.fromSecretKey(Uint8Array.from(secret)), mint = new PublicKey(TEST_ASSET_CONFIG.mint);
      body.keypair = null;
      const parsed = await connection.getParsedAccountInfo(mint, "confirmed"), expected = parsed.value?.data?.parsed?.info?.mintAuthority;
      if (!expected || signer.publicKey.toBase58() !== expected) return json(res, 403, { error: "WRONG_TEST_MINT_AUTHORITY", expectedAuthority: expected ?? "NOT_AVAILABLE", suppliedPublicKey: signer.publicKey.toBase58() });
      testMintAuthoritySigner = signer;
      return json(res, 200, { status: "TEST_MINT_SERVICE_READY", authorityPublicKey: signer.publicKey.toBase58(), secret: "HIDDEN_IN_SERVER_MEMORY", maximumMintAmount: "1000000" });
    } catch { return json(res, 400, { error: "INVALID_MINT_AUTHORITY_FILE" }); }
  }
  if (req.method === "DELETE" && url.pathname === "/api/test-asset/authority") { testMintAuthoritySigner = null; return json(res, 200, { status: "TEST_MINT_SERVICE_DISABLED" }); }
  if (req.method === "POST" && (url.pathname === "/api/test-asset/prepare" || url.pathname === "/api/tcap/load-reserve")) {
    return json(res, 200, await discoverTestAsset(session));
  }
  if (req.method === "POST" && url.pathname === "/api/stable-tcap/status") {
    return json(res, 200, await discoverStableTcap(session));
  }
  if (req.method === "POST" && url.pathname === "/api/test-asset/simulate-mint") {
    return simulateTestMint(req, res, session);
  }
  if (req.method === "POST" && url.pathname === "/api/test-asset/mint") {
    return submitTestMint(req, res, session);
  }
  if (req.method === "POST" && url.pathname === "/api/test-asset/simulate-ata") {
    return simulateTestAta(res, session);
  }
  if (req.method === "POST" && url.pathname === "/api/test-asset/create-ata") {
    return submitTestAta(req, res, session);
  }
  if (["/api/tcap/build-funding","/api/tcap/simulate-funding","/api/tcap/submit-funding","/api/tcap/verify-funding"].includes(url.pathname)) return json(res, 409, { error: "CONTROLLER_ACTION_NOT_READY", action: url.pathname, reason: "Canonical manual transaction builder has not been extracted; no automatic fallback is permitted." });
  return json(res, 404, { error: "NOT_FOUND" });
}

async function saveEmptyDiagnostics(sessionId) {
  const directory = path.join(root, "artifacts", "test-runs", sessionId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "ai-diagnostics.json"), "[]\n", "utf8");
}

async function discoverStableTcap(session) {
  const mint = new PublicKey(STABLE_TCAP_CONFIG.mint);
  const faucetProgram = new PublicKey(STABLE_TCAP_CONFIG.faucetProgram);
  const tokenProgram = new PublicKey(STABLE_TCAP_CONFIG.tokenProgram);
  const [faucetState] = PublicKey.findProgramAddressSync(
    [Buffer.from(STABLE_TCAP_CONFIG.faucetStateSeed, "utf8")],
    faucetProgram
  );
  const [mintAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from(STABLE_TCAP_CONFIG.faucetMintAuthoritySeed, "utf8")],
    faucetProgram
  );
  const tcap = deriveTcapAssetAddresses(mint, tokenProgram);
  const [mintAccount, faucetProgramAccount, faucetStateAccount] = await connection.getMultipleAccountsInfo(
    [mint, faucetProgram, faucetState],
    "confirmed"
  );
  let mintInfo = null;
  if (mintAccount) {
    const parsed = await connection.getParsedAccountInfo(mint, "confirmed");
    mintInfo = parsed.value?.data?.parsed?.info ?? null;
  }
  const walletTokens = session.wallet ? await tokenAccounts(session) : [];
  const walletToken = walletTokens.find((account) => account.mint === mint.toBase58()) ?? null;
  const programExecutable = faucetProgramAccount?.executable === true;
  const mintValid = Boolean(
    mintAccount
    && mintAccount.owner.equals(tokenProgram)
    && mintInfo
    && Number(mintInfo.decimals) === Number(STABLE_TCAP_CONFIG.decimals)
  );
  const authorityMatches = mintInfo?.mintAuthority === mintAuthority.toBase58();
  const faucetReady = programExecutable && Boolean(faucetStateAccount) && mintValid && authorityMatches;
  const liveTcap = await inspectLiveTcapAsset(mint, tokenProgram);
  const registeredInTcap = liveTcap.registered;
  const stableMintProfileMatches = liveTcap.mintProfile === (STABLE_TCAP_CONFIG.mintProfile ?? "CONFIDENTIAL_TRANSFER_ENABLED");
  const stableRequiredExtensionsMatch = liveTcap.extensionPolicy.requiredExtensionBitmap === "7";
  const stableAllowedExtensionsMatch = liveTcap.extensionPolicy.allowedExtensionBitmap === "7";
  const stableMintAuthorityMatches = liveTcap.extensionInspection.mintAuthority === mintAuthority.toBase58();
  const stableFreezeAuthorityMatches = liveTcap.extensionInspection.freezeAuthority === ZERO_PUBLIC_KEY;
  const acceptedByTcap = liveTcap.accepted
    && stableMintProfileMatches
    && stableRequiredExtensionsMatch
    && stableAllowedExtensionsMatch
    && stableMintAuthorityMatches
    && stableFreezeAuthorityMatches;
  const stableAcceptanceChecks = {
    ...liveTcap.checks,
    stableMintProfileMatches,
    stableRequiredExtensionsMatch,
    stableAllowedExtensionsMatch,
    stableMintAuthorityMatches,
    stableFreezeAuthorityMatches
  };
  return {
    status: !mintAccount ? "MINT_NOT_CREATED" : faucetReady ? "FAUCET_AVAILABLE" : "DEPLOYMENT_INCOMPLETE",
    evidenceClass: "CONFIRMED_DEVNET_ACCOUNT_READ",
    network: "devnet",
    name: STABLE_TCAP_CONFIG.name ?? "Stable-TCAP",
    symbol: STABLE_TCAP_CONFIG.symbol ?? "STCAP",
    decimals: mintInfo?.decimals ?? STABLE_TCAP_CONFIG.decimals,
    mint: mint.toBase58(),
    mintExists: Boolean(mintAccount),
    mintCreationGate: mintAccount ? "MINT_ACCOUNT_ALREADY_EXISTS" : "RESERVED_MINT_ACCOUNT_CONFIRMED_ABSENT",
    mintCreationAvailable: false,
    mintProfile: STABLE_TCAP_CONFIG.mintProfile ?? "CONFIDENTIAL_TRANSFER_ENABLED",
    mintProfileLabel: STABLE_TCAP_CONFIG.mintProfileLabel ?? "Confidential-transfer-enabled mint",
    mintProfileLocked: STABLE_TCAP_CONFIG.mintProfileLocked !== false,
    mintProfileTiming: STABLE_TCAP_CONFIG.mintProfileTiming ?? "INITIALIZE_AT_MINT_CREATION",
    tokenProgram: tokenProgram.toBase58(),
    mintAccountOwner: mintAccount?.owner.toBase58() ?? "NOT_AVAILABLE",
    mintAuthority: mintInfo?.mintAuthority ?? "NOT_AVAILABLE",
    expectedMintAuthority: mintAuthority.toBase58(),
    mintAuthorityMatches: authorityMatches,
    faucetProgram: faucetProgram.toBase58(),
    faucetProgramExecutable: programExecutable,
    faucetState: faucetState.toBase58(),
    faucetStateExists: Boolean(faucetStateAccount),
    faucetAvailable: faucetReady,
    minimumRequest: STABLE_TCAP_CONFIG.minimumRequest,
    maximumRequest: STABLE_TCAP_CONFIG.maximumRequest,
    walletTokenAccount: walletToken?.tokenAccount ?? "NOT_CREATED",
    walletBalance: walletToken?.displayBalance ?? "0",
    confidentialTransfers: mintValid
      ? liveTcap.extensionInspection.confidentialTransferEnabled ? "ENABLED" : "NOT_ENABLED"
      : STABLE_TCAP_CONFIG.confidentialTransfers,
    tcapAssetRegistry: tcap.registry.toBase58(),
    tcapAssetRecord: tcap.assetRecord.toBase58(),
    tcapGovernancePolicy: tcap.governancePolicy.toBase58(),
    tcapExtensionPolicy: tcap.extensionPolicy.toBase58(),
    tcapReserve: tcap.reserve.toBase58(),
    tcapCanonicalVault: tcap.canonicalVault.toBase58(),
    tcapReserveAuthority: tcap.reserveAuthority.toBase58(),
    tcapMinimumInstructionVersion: liveTcap.minimumInstructionVersion,
    tcapApprovalStatus: liveTcap.approvalStatus,
    tcapOperationalStatus: liveTcap.operationalStatus,
    tcapRegistration: registeredInTcap ? "REGISTERED_ON_DEVNET" : "NOT_REGISTERED_ON_DEVNET",
    tcapStatus: acceptedByTcap ? "ACCEPTED" : registeredInTcap ? "REGISTERED_NOT_ACCEPTING" : "REGISTRATION_REQUIRED",
    tcapAccepted: acceptedByTcap,
    tcapAcceptanceModel: liveTcap.acceptanceModel,
    tcapAcceptanceChecks: stableAcceptanceChecks,
    tcapExtensionInspection: liveTcap.extensionInspection,
    tcapReserveBalanceRaw: liveTcap.vaultBalanceRaw,
    tcapActualAssets: liveTcap.actualAssets,
    value: "NONE",
    safeMessage: !mintAccount
      ? "The reserved Stable-TCAP mint account is absent on Devnet. Mint creation and faucet requests remain disabled."
      : faucetReady
      ? "The deployed faucet and Stable-TCAP mint identities are ready for manual requests."
      : "The public identities are reserved, but the complete Devnet faucet deployment is not yet proven."
  };
}

function authenticate(req) { const id = req.headers["x-trustlink-session"] || parseCookies(req).trustlink_lab_session, csrf = req.headers["x-trustlink-csrf"]; const s = sessions.get(id); if (!s || s.csrf !== csrf || Date.now() - s.touchedAt > SESSION_TTL) { if (s) sessions.delete(id); return null; } return s; }
async function safeWallet(session, includeTokens = false) {
  if (!session.wallet) return { status: "NOT_CONFIGURED" };
  const key = new PublicKey(session.wallet.publicKey);
  const lamports = await connection.getBalance(key, "confirmed");
  const ataRent = await connection.getMinimumBalanceForRentExemption(165);
  const estimatedRequirementLamports = ataRent + 10_000;
  const result = {
    ...session.wallet,
    network: "devnet",
    solBalanceLamports: lamports,
    solBalance: lamports / 1e9,
    estimatedRequirementLamports,
    estimatedRequirementSol: estimatedRequirementLamports / 1e9,
    solStatus: lamports >= estimatedRequirementLamports ? "SUFFICIENT" : "INSUFFICIENT",
    insufficientSolMessage: lamports >= estimatedRequirementLamports ? null : "Fund this wallet with Devnet SOL externally, then click Refresh Balances.",
    roles: ["FEE_PAYER", "DEPOSITOR", "SOURCE_TOKEN_OWNER"],
    privateKey: "HIDDEN",
    seedPhrase: "NEVER_DISPLAYED"
  };
  if (includeTokens) {
    const allTokens = await tokenAccounts(session);
    result.tokenAccounts = allTokens;
    result.usableTokenAccounts = allTokens.filter((token) => token.tcapAccepted && token.state === "ACTIVE");
    result.unsupportedTokenAccounts = allTokens.filter((token) => !token.tcapAccepted || token.state !== "ACTIVE");
  }
  return result;
}

async function tokenAccounts(session) {
  if (!session.wallet) return [];
  const owner = new PublicKey(session.wallet.publicKey);
  const programs = [TOKEN_PROGRAM, TOKEN_2022_PROGRAM];
  const rows = [];
  for (const programId of programs) {
    const found = await connection.getParsedTokenAccountsByOwner(owner, { programId }, "confirmed");
    for (const item of found.value) {
      const info = item.account.data.parsed.info;
      const amount = info.tokenAmount;
      rows.push({
        tokenAccount: item.pubkey.toBase58(),
        mint: String(info.mint || ""),
        tokenProgram: programId.toBase58(),
        decimals: Number.isInteger(amount.decimals) ? amount.decimals : 0,
        rawBalance: String(amount.amount ?? "0"),
        displayBalance: String(amount.uiAmountString ?? "0"),
        state: info.state === "frozen" ? "FROZEN" : "ACTIVE",
        delegatedAmount: String(info.delegatedAmount?.amount ?? "0")
      });
    }
  }
  await Promise.all(rows.map((row) => enrichTokenAccount(row, session)));
  return rows.map(normalizeTokenRow);
}

async function enrichTokenAccount(row, session) {
  const localLabel = VERIFIED_DEVNET_STABLES.tokens?.[row.mint] ?? null;
  const metadata = localLabel ?? await readMetaplexMetadata(new PublicKey(row.mint));
  row.symbol = metadata?.symbol || "UNKNOWN";
  row.name = metadata?.name || "Unknown token";
  row.symbolSource = localLabel ? "LOCAL_DISPLAY_METADATA" : metadata ? "ON_CHAIN_TOKEN_METADATA" : "NOT_AVAILABLE";
  row.verifiedStablecoin = localLabel?.verifiedStablecoin === true;
  row.verificationUrl = localLabel?.verificationUrl ?? null;
  row.verification = localLabel?.verification === "TRUSTLINK_DEPLOYMENT_RECORD" ? "TRUSTLINK_TEST_ASSET" : row.verifiedStablecoin ? "VERIFIED_DEVNET_STABLE" : "UNVERIFIED";
  try {
    const live = await inspectLiveTcapAsset(new PublicKey(row.mint), new PublicKey(row.tokenProgram));
    row.tcapAssetRecord = live.addresses.assetRecord;
    row.tcapGovernanceAuthority = live.governanceAuthority;
    row.connectedWalletCanRegister = Boolean(live.governanceAuthority !== "NOT_AVAILABLE" && session.wallet?.publicKey === live.governanceAuthority);
    row.tcapRegistered = live.registered;
    row.tcapAccepted = live.accepted;
    row.tcapAcceptanceModel = live.acceptanceModel;
    row.tcapEvidenceClass = "CONFIRMED_DEVNET_ACCOUNT_READ";
    row.tcapApprovalStatus = live.approvalStatus;
    row.tcapOperationalStatus = live.operationalStatus;
    row.tcapStatus = live.accepted
      ? "ACCEPTED"
      : live.acceptanceModel === "LEGACY_V1_HISTORICAL_ONLY"
        ? "LEGACY_HISTORICAL_NOT_ACCEPTED"
        : live.registered
          ? "REGISTERED_NOT_ACCEPTING"
          : "NOT_REGISTERED";
    row.tcapAcceptanceChecks = live.checks;
    row.tcapReserve = live.addresses.reserve;
    row.tcapCanonicalVault = live.addresses.canonicalVault;
    row.tcapReserveAuthority = live.addresses.reserveAuthority;
    row.confidentialTransferCapability = live.extensionInspection.confidentialTransferEnabled ? "ENABLED" : row.tokenProgram === TOKEN_2022_PROGRAM.toBase58() ? "NOT_ENABLED" : "NOT_SUPPORTED";
  } catch {
    row.tcapRegistered = false;
    row.tcapAccepted = false;
    row.tcapAcceptanceModel = "LIVE_DEVNET_CHECK_UNAVAILABLE";
    row.tcapEvidenceClass = "NOT_AVAILABLE";
    row.tcapApprovalStatus = "NOT_AVAILABLE";
    row.tcapOperationalStatus = "NOT_AVAILABLE";
    row.tcapStatus = "CHECK_UNAVAILABLE";
    row.tcapAcceptanceChecks = { liveDevnetRead: false };
    row.confidentialTransferCapability = row.tokenProgram === TOKEN_2022_PROGRAM.toBase58() ? "UNKNOWN" : "NOT_SUPPORTED";
  }
}

function normalizeTokenRow(row) {
  return {
    tokenAccount: row.tokenAccount ?? "NOT_AVAILABLE",
    mint: row.mint ?? "NOT_AVAILABLE",
    symbol: row.symbol ?? "UNKNOWN",
    name: row.name ?? "Unknown token",
    decimals: Number.isInteger(row.decimals) ? row.decimals : 0,
    tokenProgram: row.tokenProgram ?? "NOT_AVAILABLE",
    displayBalance: row.displayBalance ?? "0",
    rawBalance: row.rawBalance ?? "0",
    state: row.state ?? "UNKNOWN",
    delegatedAmount: row.delegatedAmount ?? "0",
    verification: row.verification ?? "UNVERIFIED",
    verificationUrl: row.verificationUrl ?? null,
    tcapStatus: row.tcapStatus ?? "NOT_CHECKED",
    tcapRegistered: row.tcapRegistered === true,
    tcapAccepted: row.tcapAccepted === true,
    tcapAcceptanceModel: row.tcapAcceptanceModel ?? "NOT_AVAILABLE",
    tcapEvidenceClass: row.tcapEvidenceClass ?? "NOT_AVAILABLE",
    tcapApprovalStatus: row.tcapApprovalStatus ?? "NOT_AVAILABLE",
    tcapOperationalStatus: row.tcapOperationalStatus ?? "NOT_AVAILABLE",
    tcapAssetRecord: row.tcapAssetRecord ?? "NOT_AVAILABLE",
    tcapGovernanceAuthority: row.tcapGovernanceAuthority ?? "NOT_AVAILABLE",
    connectedWalletCanRegister: row.connectedWalletCanRegister === true,
    confidentialTransferCapability: row.confidentialTransferCapability ?? "UNKNOWN",
    tcapReserve: row.tcapReserve ?? "NOT_AVAILABLE",
    tcapCanonicalVault: row.tcapCanonicalVault ?? "NOT_AVAILABLE",
    tcapReserveAuthority: row.tcapReserveAuthority ?? "NOT_AVAILABLE",
    tcapAcceptanceChecks: row.tcapAcceptanceChecks ?? { liveDevnetRead: false }
  };
}

async function readMetaplexMetadata(mint) {
  try {
    const [metadataPda] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), METADATA_PROGRAM.toBytes(), mint.toBytes()], METADATA_PROGRAM);
    const account = await connection.getAccountInfo(metadataPda, "confirmed");
    if (!account || account.data.length < 69) return null;
    let offset = 65;
    const readString = () => { const length = account.data.readUInt32LE(offset); offset += 4; if (length < 0 || offset + length > account.data.length) throw new Error("invalid metadata"); const value = account.data.subarray(offset, offset + length).toString("utf8").replace(/\0/g, "").trim(); offset += length; return value; };
    return { name: readString(), symbol: readString() };
  } catch { return null; }
}
function readJson(req) { return new Promise((resolve, reject) => { let data = ""; req.on("data", (c) => { data += c; if (data.length > 2_000_000) req.destroy(); }); req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } }); req.on("error", reject); }); }
function json(res, status, body, extraHeaders = {}) { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extraHeaders }); res.end(JSON.stringify(body)); }
function parseCookies(req) { return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => { const index = part.indexOf("="); return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; })); }

function deriveTcapAssetAddresses(mint, tokenProgram) {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("tcap:global-config:v1")], TCAP_PROGRAM);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-registry:v1")], TCAP_PROGRAM);
  const [assetRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from("tcap:asset-entry:v1"), registry.toBytes(), tokenProgram.toBytes(), mint.toBytes()],
    TCAP_PROGRAM
  );
  const [governancePolicy] = PublicKey.findProgramAddressSync([Buffer.from("tcap:asset-governance:v2"), assetRecord.toBytes()], TCAP_PROGRAM);
  const [extensionPolicy] = PublicKey.findProgramAddressSync([Buffer.from("tcap:extension-policy:v2"), assetRecord.toBytes()], TCAP_PROGRAM);
  const [reserve] = PublicKey.findProgramAddressSync([Buffer.from("tcap:reserve-state:v1"), assetRecord.toBytes()], TCAP_PROGRAM);
  const [reserveAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tcap:reserve-authority:v1"), assetRecord.toBytes()], TCAP_PROGRAM);
  const [canonicalVault] = PublicKey.findProgramAddressSync([Buffer.from("tcap:future-vault:v1"), assetRecord.toBytes()], TCAP_PROGRAM);
  return { config, registry, assetRecord, governancePolicy, extensionPolicy, reserve, reserveAuthority, canonicalVault };
}

async function inspectLiveTcapAsset(mint, tokenProgram) {
  const addresses = deriveTcapAssetAddresses(mint, tokenProgram);
  const keys = [
    TCAP_PROGRAM,
    addresses.config,
    addresses.registry,
    addresses.assetRecord,
    addresses.governancePolicy,
    addresses.extensionPolicy,
    addresses.reserve,
    addresses.canonicalVault,
    mint
  ];
  const [programAccount, configAccount, registryAccount, assetAccount, governanceAccount, extensionAccount, reserveAccount, vaultAccount, mintAccount] = await connection.getMultipleAccountsInfo(keys, "confirmed");
  const asset = assetAccount ? decodeAssetEntry(assetAccount.data) : null;
  const configState = configAccount ? decodeGlobalConfigV1(configAccount.data) : null;
  const registryState = registryAccount ? decodeAssetRegistryV1(registryAccount.data) : null;
  const governance = governanceAccount ? decodeGovernancePolicyV2(governanceAccount.data) : null;
  const extension = extensionAccount ? decodeExtensionPolicyV2(extensionAccount.data) : null;
  const reserve = reserveAccount ? decodeReserveState(reserveAccount.data) : null;
  const vault = vaultAccount ? decodeTokenAccountBase(vaultAccount.data) : null;
  const mintInspection = mintAccount ? inspectMintAccount(mintAccount, mint, tokenProgram) : emptyMintInspection();
  const minimumInstructionVersion = decodeMinimumInstructionVersion(configAccount?.data);
  const governanceAuthority = configState?.governanceAuthority ?? "NOT_AVAILABLE";
  const addressStrings = Object.fromEntries(Object.entries(addresses).map(([name, value]) => [name, value.toBase58()]));
  const requiredBitmap = extension ? BigInt(extension.requiredExtensionBitmap) : -1n;
  const allowedBitmap = extension ? BigInt(extension.allowedExtensionBitmap) : -1n;
  const observedBitmap = extension ? BigInt(extension.extensionBitmap) : -1n;
  const supportedBitmap = 7n;
  const actualBitmap = BigInt(mintInspection.extensionBitmap);
  const policyFlagsMatch = Boolean(extension
    && extension.confidentialTransferEnabled === mintInspection.confidentialTransferEnabled
    && extension.metadataPointerEnabled === mintInspection.metadataPointerEnabled
    && extension.tokenMetadataEnabled === mintInspection.tokenMetadataEnabled
    && !extension.transferFeeEnabled
    && !extension.transferHookEnabled
    && !extension.permanentDelegateEnabled
    && !extension.defaultAccountStateEnabled
    && !extension.nonTransferableEnabled
    && !extension.interestBearingEnabled
    && !extension.mintCloseAuthorityEnabled);
  const profileValid = Boolean(extension && (
    (extension.mintProfile === "STANDARD_PUBLIC"
      && !mintInspection.confidentialTransferEnabled
      && (requiredBitmap & 1n) === 0n)
    || (extension.mintProfile === "CONFIDENTIAL_TRANSFER_ENABLED"
      && mintInspection.confidentialTransferEnabled
      && (requiredBitmap & 1n) !== 0n)
  ));
  const totalLiabilities = reserve
    ? BigInt(reserve.pendingLiabilities) + BigInt(reserve.settledConfidentialLiabilities) + BigInt(reserve.authorizedWithdrawalLiabilities) + BigInt(reserve.reservedRefundLiabilities)
    : null;
  const checks = {
    liveDevnetRead: true,
    tcapProgramExecutable: programAccount?.executable === true,
    recordedTokenProgramSupported: tokenProgram.equals(TOKEN_PROGRAM) || tokenProgram.equals(TOKEN_2022_PROGRAM),
    configOwnedByTcap: Boolean(configAccount?.owner.equals(TCAP_PROGRAM)),
    configAccountTypeValid: Boolean(configState),
    protocolNotPaused: Boolean(configState && !configState.paused),
    configBindsCanonicalRegistry: Boolean(configState?.assetRegistry === addressStrings.registry),
    governedInstructionVersionActive: minimumInstructionVersion >= 2,
    registryOwnedByTcap: Boolean(registryAccount?.owner.equals(TCAP_PROGRAM)),
    registryAccountTypeValid: Boolean(registryState),
    registryBindsCanonicalConfig: Boolean(registryState?.config === addressStrings.config),
    registryAcceptingGovernance: Boolean(registryState && !registryState.frozen),
    assetRecordOwnedByTcap: Boolean(assetAccount?.owner.equals(TCAP_PROGRAM)),
    assetRecordCanonical: Boolean(asset
      && asset.registry === addressStrings.registry
      && asset.mint === mint.toBase58()
      && asset.tokenProgram === tokenProgram.toBase58()
      && asset.reserve === addressStrings.reserve
      && asset.vault === addressStrings.canonicalVault
      && asset.reserveAuthority === addressStrings.reserveAuthority),
    assetActiveForDeposits: Boolean(asset?.status === 1 && asset?.depositsEnabled && !asset?.paused && !asset?.deprecated),
    governancePolicyOwnedByTcap: Boolean(governanceAccount?.owner.equals(TCAP_PROGRAM)),
    governancePolicyCanonical: Boolean(governance
      && governance.version === 2
      && governance.policyVersion >= 1
      && governance.registry === addressStrings.registry
      && governance.assetEntry === addressStrings.assetRecord
      && governance.mint === mint.toBase58()
      && governance.tokenProgram === tokenProgram.toBase58()),
    governanceApprovedAndActive: Boolean(governance
      && governance.approvalStatus === "APPROVED"
      && governance.operationalStatus === "ACTIVE"
      && governance.depositsEnabled
      && governance.reserveInitialized
      && governance.vaultInitialized
      && !governance.deprecatedIrreversible),
    extensionPolicyOwnedByTcap: Boolean(extensionAccount?.owner.equals(TCAP_PROGRAM)),
    extensionPolicyCanonical: Boolean(extension
      && extension.version === 2
      && extension.assetEntry === addressStrings.assetRecord
      && extension.mint === mint.toBase58()
      && extension.tokenProgram === tokenProgram.toBase58()),
    mintOwnedByRecordedTokenProgram: Boolean(mintAccount?.owner.equals(tokenProgram)),
    mintLayoutValid: mintInspection.layoutValid,
    mintInitialized: mintInspection.initialized === true,
    mintDecimalsMatch: Boolean(extension && asset && mintInspection.decimals === extension.decimals && mintInspection.decimals === asset.decimals),
    mintAuthorityMatchesPolicy: Boolean(extension && mintInspection.mintAuthority === extension.expectedMintAuthority),
    freezeAuthorityMatchesPolicy: Boolean(extension && mintInspection.freezeAuthority === extension.expectedFreezeAuthority),
    extensionBitmapMatchesPolicy: Boolean(extension && mintInspection.layoutValid && actualBitmap === observedBitmap),
    extensionConfigHashMatchesPolicy: Boolean(extension && mintInspection.configHash === extension.extensionConfigHash),
    extensionRequirementsSatisfied: Boolean(extension
      && (requiredBitmap & ~allowedBitmap) === 0n
      && (allowedBitmap & ~supportedBitmap) === 0n
      && (actualBitmap & requiredBitmap) === requiredBitmap
      && (actualBitmap & ~allowedBitmap) === 0n
      && mintInspection.unsupportedExtensionTypes.length === 0
      && profileValid
      && policyFlagsMatch),
    reserveOwnedByTcap: Boolean(reserveAccount?.owner.equals(TCAP_PROGRAM)),
    reserveCanonical: Boolean(reserve
      && reserve.assetEntry === addressStrings.assetRecord
      && reserve.futureVault === addressStrings.canonicalVault
      && reserve.reserveAuthority === addressStrings.reserveAuthority),
    reserveAcceptingFunding: Boolean(reserve?.fundingEnabled && !reserve?.paused),
    vaultOwnedByRecordedTokenProgram: Boolean(vaultAccount?.owner.equals(tokenProgram)),
    vaultCanonical: Boolean(vault
      && vault.mint === mint.toBase58()
      && vault.authority === addressStrings.reserveAuthority
      && vault.state === "INITIALIZED"),
    vaultBalanceMatchesActualAssets: Boolean(vault && reserve && vault.amount === reserve.actualAssets),
    assetsCoverLiabilities: Boolean(reserve && totalLiabilities !== null && BigInt(reserve.actualAssets) >= totalLiabilities)
  };
  const accepted = Object.values(checks).every((value) => value === true);
  const registered = checks.registryOwnedByTcap && checks.assetRecordOwnedByTcap && checks.assetRecordCanonical;
  const acceptanceModel = registered && minimumInstructionVersion < 2
    ? "LEGACY_V1_HISTORICAL_ONLY"
    : "GOVERNED_V2_LIVE_DEVNET";
  return {
    accepted,
    registered,
    acceptanceModel,
    minimumInstructionVersion,
    governanceAuthority,
    approvalStatus: governance?.approvalStatus ?? "NOT_AVAILABLE",
    operationalStatus: governance?.operationalStatus ?? "NOT_AVAILABLE",
    mintProfile: extension?.mintProfile ?? "NOT_AVAILABLE",
    addresses: addressStrings,
    checks,
    failedChecks: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name),
    actualAssets: reserve?.actualAssets ?? "NOT_AVAILABLE",
    vaultBalanceRaw: vault?.amount ?? "NOT_AVAILABLE",
    extensionInspection: {
      extensionBitmap: mintInspection.extensionBitmap,
      extensionConfigHash: mintInspection.configHash,
      mintAuthority: mintInspection.mintAuthority,
      freezeAuthority: mintInspection.freezeAuthority,
      confidentialTransferEnabled: mintInspection.confidentialTransferEnabled,
      metadataPointerEnabled: mintInspection.metadataPointerEnabled,
      tokenMetadataEnabled: mintInspection.tokenMetadataEnabled,
      unsupportedExtensionTypes: mintInspection.unsupportedExtensionTypes
    },
    extensionPolicy: {
      requiredExtensionBitmap: extension?.requiredExtensionBitmap ?? "NOT_AVAILABLE",
      allowedExtensionBitmap: extension?.allowedExtensionBitmap ?? "NOT_AVAILABLE",
      extensionBitmap: extension?.extensionBitmap ?? "NOT_AVAILABLE",
      expectedMintAuthority: extension?.expectedMintAuthority ?? "NOT_AVAILABLE",
      expectedFreezeAuthority: extension?.expectedFreezeAuthority ?? "NOT_AVAILABLE"
    }
  };
}

function emptyMintInspection() {
  return {
    layoutValid: false,
    decimals: null,
    mintAuthority: "NOT_AVAILABLE",
    freezeAuthority: "NOT_AVAILABLE",
    extensionBitmap: "0",
    configHash: "NOT_AVAILABLE",
    confidentialTransferEnabled: false,
    metadataPointerEnabled: false,
    tokenMetadataEnabled: false,
    unsupportedExtensionTypes: []
  };
}

function inspectMintAccount(account, mint, tokenProgram) {
  const data = account.data;
  if (!Buffer.isBuffer(data) || data.length < 82) return emptyMintInspection();
  const base = decodeMintBase(data);
  const token2022 = tokenProgram.equals(TOKEN_2022_PROGRAM);
  let layoutValid = account.owner.equals(tokenProgram) && (token2022 ? data.length === 82 || (data.length >= 166 && data[165] === 1) : data.length === 82);
  const extensionTypes = [];
  if (token2022 && data.length > 82 && layoutValid) {
    const tlv = data.subarray(166);
    let offset = 0;
    while (offset < tlv.length) {
      if (offset + 4 > tlv.length) { layoutValid = false; break; }
      const extensionType = tlv.readUInt16LE(offset);
      const extensionLength = tlv.readUInt16LE(offset + 2);
      if (offset + 4 + extensionLength > tlv.length) { layoutValid = false; break; }
      if (extensionType !== 0) extensionTypes.push(extensionType);
      offset += 4 + extensionLength;
    }
  }
  let bitmap = 0n;
  if (extensionTypes.includes(4)) bitmap |= 1n;
  if (extensionTypes.includes(18)) bitmap |= 2n;
  if (extensionTypes.includes(19)) bitmap |= 4n;
  const unsupportedExtensionTypes = extensionTypes.filter((type) => ![4, 18, 19].includes(type));
  const bitmapBytes = Buffer.alloc(8);
  bitmapBytes.writeBigUInt64LE(bitmap);
  const configHash = createHash("sha256")
    .update(Buffer.from("trustlink:tcap:asset-extension-policy:v2"))
    .update(Buffer.from(tokenProgram.toBytes()))
    .update(Buffer.from(mint.toBytes()))
    .update(Buffer.from([base.decimals]))
    .update(bitmapBytes)
    .update(data.length > 82 ? data.subarray(82) : Buffer.alloc(0))
    .digest("hex");
  return {
    layoutValid,
    ...base,
    extensionBitmap: bitmap.toString(),
    configHash,
    confidentialTransferEnabled: extensionTypes.includes(4),
    metadataPointerEnabled: extensionTypes.includes(18),
    tokenMetadataEnabled: extensionTypes.includes(19),
    unsupportedExtensionTypes
  };
}

function decodeMintBase(data) {
  const zero = new PublicKey(Buffer.alloc(32)).toBase58();
  const mintAuthority = data.readUInt32LE(0) === 1 ? new PublicKey(data.subarray(4, 36)).toBase58() : zero;
  const freezeAuthority = data.readUInt32LE(46) === 1 ? new PublicKey(data.subarray(50, 82)).toBase58() : zero;
  return { mintAuthority, freezeAuthority, decimals: data[44], initialized: data[45] === 1 };
}

function decodeTokenAccountBase(data) {
  if (!Buffer.isBuffer(data) || data.length < 165) return null;
  return {
    mint: new PublicKey(data.subarray(0, 32)).toBase58(),
    authority: new PublicKey(data.subarray(32, 64)).toBase58(),
    amount: data.readBigUInt64LE(64).toString(),
    state: ["UNINITIALIZED", "INITIALIZED", "FROZEN"][data[108]] ?? "UNKNOWN"
  };
}

async function discoverTestAsset(session) {
  const programId = new PublicKey(TEST_ASSET_CONFIG.tcapProgram), mint = new PublicKey(TEST_ASSET_CONFIG.mint), tokenProgram = new PublicKey(TEST_ASSET_CONFIG.tokenProgram);
  const seed = (value) => Buffer.from(value, "utf8");
  const [registry] = PublicKey.findProgramAddressSync([seed("tcap:asset-registry:v1")], programId);
  const [assetRecord] = PublicKey.findProgramAddressSync([seed("tcap:asset-entry:v1"), registry.toBytes(), tokenProgram.toBytes(), mint.toBytes()], programId);
  const [reserve] = PublicKey.findProgramAddressSync([seed("tcap:reserve-state:v1"), assetRecord.toBytes()], programId);
  const [canonicalVault] = PublicKey.findProgramAddressSync([seed("tcap:future-vault:v1"), assetRecord.toBytes()], programId);
  const response = await connection.getMultipleAccountsInfo([mint, registry, assetRecord, reserve, canonicalVault], "confirmed");
  const [mintAccount, registryAccount, assetAccount, reserveAccount, vaultAccount] = response;
  if (!mintAccount) return { status: "TEST_MINT_NOT_FOUND", mint: mint.toBase58(), evidence: TEST_ASSET_CONFIG.discoveryEvidence };
  const mintParsed = await connection.getParsedAccountInfo(mint, "confirmed");
  const mintInfo = mintParsed.value?.data?.parsed?.info;
  if (!mintInfo) return { status: "TEST_MINT_NOT_FOUND", mint: mint.toBase58(), reason: "Mint account could not be decoded" };
  const asset = assetAccount ? decodeAssetEntry(assetAccount.data) : null;
  const reserveState = reserveAccount ? decodeReserveState(reserveAccount.data) : null;
  const vaultParsed = vaultAccount ? await connection.getParsedAccountInfo(canonicalVault, "confirmed") : null;
  const vaultInfo = vaultParsed?.value?.data?.parsed?.info;
  const accounts = session.wallet ? await tokenAccounts(session) : [];
  const walletAccounts = accounts.filter((account) => account.mint === mint.toBase58());
  const walletOwner = session.wallet ? new PublicKey(session.wallet.publicKey) : null;
  const expectedAta = walletOwner ? PublicKey.findProgramAddressSync([walletOwner.toBytes(), tokenProgram.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM)[0] : null;
  const walletAta = expectedAta ? walletAccounts.find((account) => account.tokenAccount === expectedAta.toBase58()) : null;
  const walletIsAuthority = Boolean(session.wallet && mintInfo.mintAuthority === session.wallet.publicKey && session.signer);
  const serviceAuthorityReady = Boolean(testMintAuthoritySigner && mintInfo.mintAuthority === testMintAuthoritySigner.publicKey.toBase58());
  const liveTcap = await inspectLiveTcapAsset(mint, tokenProgram);
  const registered = liveTcap.registered;
  const liveReady = liveTcap.accepted;
  const status = !registered
    ? "TEST_MINT_NOT_REGISTERED_IN_TCAP"
    : !liveReady
      ? "TEST_MINT_NOT_ACCEPTED_BY_GOVERNED_TCAP"
      : serviceAuthorityReady || walletIsAuthority
        ? "TEST_MINT_READY"
        : "TEST_MINT_AUTHORITY_UNAVAILABLE";
  return {
    status, network: "devnet", name: TEST_ASSET_CONFIG.name, symbol: TEST_ASSET_CONFIG.symbol,
    mint: mint.toBase58(), decimals: mintInfo.decimals, tokenProgram: mintAccount.owner.toBase58(),
    mintAuthorityPublicKey: mintInfo.mintAuthority, freezeAuthority: mintInfo.freezeAuthority, totalSupply: mintInfo.supply,
    mintAuthorityAvailable: serviceAuthorityReady || walletIsAuthority, mintAuthorityCapability: serviceAuthorityReady ? "LOCAL_TEST_FAUCET_READY" : walletIsAuthority ? "LOCAL_SIGNER_READY" : "UNAVAILABLE",
    mintRecipientPublicKey: session.wallet?.publicKey ?? null, minimumMintAmount: "0.01", maximumMintAmount: "1000000",
    registeredInTcap: registered, liveReady, tcapAcceptanceModel: liveTcap.acceptanceModel, tcapAcceptanceChecks: liveTcap.checks, assetRegistry: registry.toBase58(), assetRecord: assetRecord.toBase58(), reserve: reserve.toBase58(), canonicalVault: canonicalVault.toBase58(),
    depositsEnabled: asset?.depositsEnabled ?? null, assetActive: asset?.status === 1, reservePaused: reserveState?.paused ?? null,
    actualAssets: reserveState?.actualAssets ?? null, pendingFundingLiabilities: reserveState?.pendingLiabilities ?? null,
    vaultMint: vaultInfo?.mint ?? null, vaultAuthority: vaultInfo?.owner ?? null, vaultBalanceRaw: vaultInfo?.tokenAmount?.amount ?? null, vaultBalance: vaultInfo?.tokenAmount?.uiAmountString ?? null,
    walletTokenAccounts: walletAccounts, walletTokenAccount: walletAta?.tokenAccount ?? null, expectedAssociatedTokenAccount: expectedAta?.toBase58() ?? null, walletBalance: walletAta?.displayBalance ?? "0", ataRequired: Boolean(expectedAta && !walletAta),
    evidence: [...TEST_ASSET_CONFIG.discoveryEvidence, { classification: "CONFIRMED_DEVNET_ACCOUNT_READ", slot: await connection.getSlot("confirmed"), accounts: [mint, registry, assetRecord, reserve, canonicalVault].map(String) }]
  };
}

function decodeAssetEntry(data) {
  if (!hasDiscriminator(data, "TcapAssetEntryV1") || data.length < 283) return null;
  return {
    registry: new PublicKey(data.subarray(12, 44)).toBase58(),
    tokenProgram: new PublicKey(data.subarray(44, 76)).toBase58(),
    mint: new PublicKey(data.subarray(76, 108)).toBase58(),
    reserve: new PublicKey(data.subarray(144, 176)).toBase58(),
    vault: new PublicKey(data.subarray(176, 208)).toBase58(),
    reserveAuthority: new PublicKey(data.subarray(208, 240)).toBase58(),
    decimals: data[240],
    depositsEnabled: data[241] === 1,
    paused: data[243] === 1,
    status: data[279],
    deprecated: data[281] === 1
  };
}
function decodeReserveState(data) {
  if (!hasDiscriminator(data, "TcapReserveStateV1") || data.length < 161) return null;
  return {
    assetEntry: new PublicKey(data.subarray(12, 44)).toBase58(),
    futureVault: new PublicKey(data.subarray(44, 76)).toBase58(),
    reserveAuthority: new PublicKey(data.subarray(76, 108)).toBase58(),
    actualAssets: data.readBigUInt64LE(108).toString(),
    pendingLiabilities: data.readBigUInt64LE(116).toString(),
    settledConfidentialLiabilities: data.readBigUInt64LE(124).toString(),
    authorizedWithdrawalLiabilities: data.readBigUInt64LE(132).toString(),
    reservedRefundLiabilities: data.readBigUInt64LE(140).toString(),
    fundingEnabled: data[156] === 1,
    paused: data[157] === 1
  };
}

function accountDiscriminator(name) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function hasDiscriminator(data, name) {
  return Buffer.isBuffer(data)
    && data.length >= 8
    && data.subarray(0, 8).equals(accountDiscriminator(name));
}

function decodeMinimumInstructionVersion(data) {
  return Buffer.isBuffer(data) && data.length >= 14 ? data.readUInt16LE(12) : 0;
}

function decodeGlobalConfigV1(data) {
  if (!hasDiscriminator(data, "TcapGlobalConfigV1") || data.length < 244) return null;
  return {
    version: data.readUInt16LE(8),
    protocolVersion: data.readUInt16LE(10),
    minimumInstructionVersion: data.readUInt16LE(12),
    governanceAuthority: new PublicKey(data.subarray(14, 46)).toBase58(),
    registryAuthority: new PublicKey(data.subarray(78, 110)).toBase58(),
    paused: data[175] === 1,
    assetRegistry: new PublicKey(data.subarray(176, 208)).toBase58()
  };
}

function decodeAssetRegistryV1(data) {
  if (!hasDiscriminator(data, "TcapAssetRegistryV1") || data.length < 116) return null;
  return {
    version: data.readUInt16LE(8),
    config: new PublicKey(data.subarray(10, 42)).toBase58(),
    authority: new PublicKey(data.subarray(42, 74)).toBase58(),
    registryVersion: data.readUInt32LE(74),
    entryCount: data.readUInt32LE(110),
    frozen: data[114] === 1
  };
}

function decodeGovernancePolicyV2(data) {
  if (!hasDiscriminator(data, "TcapAssetGovernancePolicyV2") || data.length < 190) return null;
  const approvals = ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
  const operations = ["INACTIVE", "ACTIVE", "PAUSED", "DEPRECATED"];
  return {
    version: data.readUInt16LE(8),
    policyVersion: data.readUInt16LE(10),
    registry: new PublicKey(data.subarray(12, 44)).toBase58(),
    assetEntry: new PublicKey(data.subarray(44, 76)).toBase58(),
    mint: new PublicKey(data.subarray(76, 108)).toBase58(),
    tokenProgram: new PublicKey(data.subarray(108, 140)).toBase58(),
    approvalStatus: approvals[data[140]] ?? "UNKNOWN",
    operationalStatus: operations[data[141]] ?? "UNKNOWN",
    depositsEnabled: data[142] === 1,
    settlementsEnabled: data[143] === 1,
    publicExitEnabled: data[144] === 1,
    confidentialSettlementEnabled: data[145] === 1,
    reserveInitialized: data[146] === 1,
    vaultInitialized: data[147] === 1,
    deprecatedIrreversible: data[148] === 1,
    lastUpdatedSlot: data.readBigUInt64LE(149).toString(),
    authority: new PublicKey(data.subarray(157, 189)).toBase58(),
    bump: data[189]
  };
}

function decodeExtensionPolicyV2(data) {
  if (!hasDiscriminator(data, "TcapAssetExtensionPolicyV2") || data.length < 239) return null;
  const profiles = ["STANDARD_PUBLIC", "CONFIDENTIAL_TRANSFER_ENABLED"];
  return {
    version: data.readUInt16LE(8),
    assetEntry: new PublicKey(data.subarray(10, 42)).toBase58(),
    mint: new PublicKey(data.subarray(42, 74)).toBase58(),
    tokenProgram: new PublicKey(data.subarray(74, 106)).toBase58(),
    decimals: data[106],
    mintProfile: profiles[data[107]] ?? "UNKNOWN",
    requiredExtensionBitmap: data.readBigUInt64LE(108).toString(),
    allowedExtensionBitmap: data.readBigUInt64LE(116).toString(),
    extensionBitmap: data.readBigUInt64LE(124).toString(),
    extensionConfigHash: data.subarray(132, 164).toString("hex"),
    expectedMintAuthority: new PublicKey(data.subarray(164, 196)).toBase58(),
    expectedFreezeAuthority: new PublicKey(data.subarray(196, 228)).toBase58(),
    confidentialTransferEnabled: data[228] === 1,
    metadataPointerEnabled: data[229] === 1,
    tokenMetadataEnabled: data[230] === 1,
    transferFeeEnabled: data[231] === 1,
    transferHookEnabled: data[232] === 1,
    permanentDelegateEnabled: data[233] === 1,
    defaultAccountStateEnabled: data[234] === 1,
    nonTransferableEnabled: data[235] === 1,
    interestBearingEnabled: data[236] === 1,
    mintCloseAuthorityEnabled: data[237] === 1,
    bump: data[238]
  };
}

async function simulateTestMint(req, res, session) {
  if (!session.wallet) return json(res, 409, { error: "RECIPIENT_WALLET_REQUIRED" });
  const body = await readJson(req), asset = await discoverTestAsset(session);
  const authority = testMintAuthoritySigner ?? (session.signer?.publicKey.toBase58() === asset.mintAuthorityPublicKey ? session.signer : null);
  if (!authority || !asset.mintAuthorityAvailable) return json(res, 409, { error: "TEST_TOKEN_MINT_AUTHORITY_UNAVAILABLE" });
  let rawAmount; try { rawAmount = displayToRaw(body.amount, asset.decimals); } catch { return json(res, 400, { error: "INVALID_MINT_AMOUNT" }); }
  if (rawAmount > 1_000_000n * (10n ** BigInt(asset.decimals))) return json(res, 400, { error: "TEST_MINT_LIMIT_EXCEEDED", maximumMintAmount: "1000000" });
  const built = await buildMintTransaction(authority, new PublicKey(session.wallet.publicKey), new PublicKey(asset.mint), rawAmount);
  const simulation = await connection.simulateTransaction(built.transaction);
  session.simulation = { kind: "TEST_TOKEN_MINT", rawAmount: rawAmount.toString(), displayAmount: String(body.amount), passed: simulation.value.err === null, before: asset.walletBalance, ata: built.ata.toBase58(), createsAta: built.createsAta };
  return json(res, 200, { evidenceClass: "DEVNET_SIMULATION_EVIDENCE", status: simulation.value.err === null ? "SIMULATION_PASSED" : "SIMULATION_FAILED", error: simulation.value.err, logs: simulation.value.logs ?? [], unitsConsumed: simulation.value.unitsConsumed ?? null, amount: String(body.amount), rawAmount: rawAmount.toString(), associatedTokenAccount: built.ata.toBase58(), createsAssociatedTokenAccount: built.createsAta, confirmedTokenMovement: "NONE" });
}

async function submitTestMint(req, res, session) {
  const body = await readJson(req);
  if (body.approved !== true || !session.simulation?.passed || session.simulation.kind !== "TEST_TOKEN_MINT") return json(res, 409, { error: "PASSING_SIMULATION_AND_EXPLICIT_APPROVAL_REQUIRED" });
  const asset = await discoverTestAsset(session);
  if (!asset.mintAuthorityAvailable) return json(res, 409, { error: "TEST_TOKEN_MINT_AUTHORITY_UNAVAILABLE" });
  const authority = testMintAuthoritySigner ?? (session.signer?.publicKey.toBase58() === asset.mintAuthorityPublicKey ? session.signer : null);
  if (!authority) return json(res, 409, { error: "TEST_TOKEN_MINT_AUTHORITY_UNAVAILABLE" });
  const [authorityLamports, ataRent] = await Promise.all([connection.getBalance(authority.publicKey, "confirmed"), connection.getMinimumBalanceForRentExemption(165)]);
  if (authorityLamports < ataRent + 10_000) return json(res, 409, { error: "MINT_AUTHORITY_INSUFFICIENT_DEVNET_SOL", message: "Fund the public mint-authority wallet with Devnet SOL externally, then retry." });
  const built = await buildMintTransaction(authority, new PublicKey(session.wallet.publicKey), new PublicKey(asset.mint), BigInt(session.simulation.rawAmount));
  const raw = built.transaction.serialize();
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({ signature, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err) return json(res, 502, { error: "MINT_TRANSACTION_FAILED", signature, transactionError: confirmation.value.err });
  const after = await discoverTestAsset(session); session.simulation = null;
  return json(res, 200, { evidenceClass: "CONFIRMED_DEVNET_EVIDENCE", status: "CONFIRMED", signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`, associatedTokenAccount: built.ata.toBase58(), balanceBefore: asset.walletBalance, balanceAfter: after.walletBalance, slot: await connection.getSlot("confirmed") });
}

async function buildMintTransaction(authority, owner, mint, rawAmount) {
  const [ata] = PublicKey.findProgramAddressSync([owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM);
  const createsAta = !(await connection.getAccountInfo(ata, "confirmed"));
  const transaction = new Transaction();
  if (createsAta) transaction.add(new TransactionInstruction({ programId: ASSOCIATED_TOKEN_PROGRAM, keys: [{ pubkey: authority.publicKey, isSigner: true, isWritable: true }, { pubkey: ata, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false }], data: Buffer.alloc(0) }));
  const mintData = Buffer.alloc(9); mintData[0] = 7; mintData.writeBigUInt64LE(rawAmount, 1);
  transaction.add(new TransactionInstruction({ programId: TOKEN_PROGRAM, keys: [{ pubkey: mint, isSigner: false, isWritable: true }, { pubkey: ata, isSigner: false, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: false }], data: mintData }));
  const latest = await connection.getLatestBlockhash("confirmed"); transaction.feePayer = authority.publicKey; transaction.recentBlockhash = latest.blockhash; transaction.sign(authority);
  return { transaction, ata, createsAta, ...latest };
}
function displayToRaw(value, decimals) { const text = String(value ?? "").trim(); if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(); const [whole, fraction = ""] = text.split("."); if (fraction.length > decimals) throw new Error(); const raw = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0"); if (raw <= 0n || raw > 0xffffffffffffffffn) throw new Error(); return raw; }

async function simulateTestAta(res, session) {
  if (!session.signer || !session.wallet) return json(res, 409, { error: "LOCAL_FIXTURE_WALLET_REQUIRED" });
  const asset = await discoverTestAsset(session), built = await buildAtaTransaction(session.signer, new PublicKey(asset.mint));
  if (!built.createsAta) return json(res, 409, { error: "TEST_TOKEN_ACCOUNT_ALREADY_EXISTS", associatedTokenAccount: built.ata.toBase58() });
  const simulation = await connection.simulateTransaction(built.transaction);
  session.simulation = { kind: "TEST_TOKEN_ATA", passed: simulation.value.err === null, ata: built.ata.toBase58() };
  return json(res, 200, { evidenceClass: "DEVNET_SIMULATION_EVIDENCE", status: simulation.value.err === null ? "SIMULATION_PASSED" : "SIMULATION_FAILED", error: simulation.value.err, logs: simulation.value.logs ?? [], associatedTokenAccount: built.ata.toBase58(), confirmedStateChange: "NONE" });
}

async function submitTestAta(req, res, session) {
  const body = await readJson(req);
  if (body.approved !== true || !session.simulation?.passed || session.simulation.kind !== "TEST_TOKEN_ATA") return json(res, 409, { error: "PASSING_SIMULATION_AND_EXPLICIT_APPROVAL_REQUIRED" });
  const wallet = await safeWallet(session);
  if (wallet.solStatus !== "SUFFICIENT") return json(res, 409, { error: "INSUFFICIENT_DEVNET_SOL", message: wallet.insufficientSolMessage });
  const asset = await discoverTestAsset(session), built = await buildAtaTransaction(session.signer, new PublicKey(asset.mint));
  if (!built.createsAta) return json(res, 409, { error: "TEST_TOKEN_ACCOUNT_ALREADY_EXISTS", associatedTokenAccount: built.ata.toBase58() });
  const signature = await connection.sendRawTransaction(built.transaction.serialize(), { skipPreflight: false });
  const confirmation = await connection.confirmTransaction({ signature, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight }, "confirmed");
  if (confirmation.value.err) return json(res, 502, { error: "TOKEN_ACCOUNT_CREATION_FAILED", signature, transactionError: confirmation.value.err });
  session.simulation = null;
  return json(res, 200, { evidenceClass: "CONFIRMED_DEVNET_EVIDENCE", status: "CONFIRMED", signature, explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`, associatedTokenAccount: built.ata.toBase58(), slot: await connection.getSlot("confirmed") });
}

async function buildAtaTransaction(payer, mint) {
  const owner = payer.publicKey;
  const [ata] = PublicKey.findProgramAddressSync([owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()], ASSOCIATED_TOKEN_PROGRAM);
  const createsAta = !(await connection.getAccountInfo(ata, "confirmed"));
  const transaction = new Transaction();
  if (createsAta) transaction.add(new TransactionInstruction({ programId: ASSOCIATED_TOKEN_PROGRAM, keys: [{ pubkey: owner, isSigner: true, isWritable: true }, { pubkey: ata, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false }], data: Buffer.alloc(0) }));
  const latest = await connection.getLatestBlockhash("confirmed"); transaction.feePayer = owner; transaction.recentBlockhash = latest.blockhash; transaction.sign(payer);
  return { transaction, ata, createsAta, ...latest };
}

setInterval(() => { const now = Date.now(); for (const [id, s] of sessions) if (now - s.touchedAt > SESSION_TTL) { s.signer = null; sessions.delete(id); } }, 60_000);

server.on("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  identifyExistingTestLab(port, (isTestLab) => {
    if (isTestLab) {
      const url = `http://127.0.0.1:${port}/`;
      console.log(`TrustLink Test Lab is already running: ${url}`);
      openLabUrl(url);
      process.exit(0);
    }
    console.error(`Port ${port} is occupied by another service. Set TRUSTLINK_UI_PORT to a different fixed port.`);
    process.exit(1);
  });
});

function identifyExistingTestLab(existingPort, done) {
  http.get(`http://127.0.0.1:${existingPort}/api/health`, (response) => {
    let body = "";
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      try {
        const health = JSON.parse(body);
        if (health.service === "trustlink-test-lab") return done(true);
      } catch {
        // A Test Lab process started before /api/health was added may return HTML.
      }
      identifyLegacyTestLab(existingPort, done);
    });
  }).on("error", () => done(false));
}

function identifyLegacyTestLab(existingPort, done) {
  http.get(`http://127.0.0.1:${existingPort}/`, (response) => {
    let body = "";
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => done(body.includes("<title>TrustLink Test Lab</title>")));
  }).on("error", () => done(false));
}

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  console.log(`TRUSTLINK_UI_URL=${url}`);
  openLabUrl(url);
});

function openLabUrl(url) {
  if (process.env.TRUSTLINK_UI_NO_OPEN !== "1") {
    const opener = process.platform === "win32" ? ["cmd.exe", ["/d", "/c", "start", "", url]] : ["xdg-open", [url]];
    try { spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref(); } catch { /* terminal URL remains available */ }
  }
}

setInterval(async () => {
  const dirs = await fs.readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const latest = dirs.filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).at(-1);
  if (!latest) return;
  const eventFile = path.join(runsRoot, latest.name, "live-events.jsonl");
  const data = await fs.readFile(eventFile, "utf8").catch(() => "");
  const message = `event: snapshot\ndata: ${JSON.stringify({ runId: latest.name, lines: data.split(/\r?\n/).filter(Boolean).slice(-200) })}\n\n`;
  for (const client of clients) client.write(message);
}, 500);
