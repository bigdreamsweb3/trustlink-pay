(() => {
  let session = null;
  let currentAsset = null;
  let currentWallet = null;
  let stableTcap = null;
  let selectedMintProfile = "STANDARD_PUBLIC";

  const MINT_PROFILES = {
    STANDARD_PUBLIC: {
      label: "Standard public-balance mint",
      detail: "Conventional public token balances and transfer amounts for institutional test flows."
    },
    CONFIDENTIAL_TRANSFER_ENABLED: {
      label: "Confidential-transfer-enabled mint",
      detail: "A Token-2022 mint initialized with Confidential Transfer when the mint account is created. Token-account addresses remain public, and this is separate from TCAP confidential ownership."
    }
  };

  async function api(route, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (session) { headers["x-trustlink-session"] = session.sessionId; headers["x-trustlink-csrf"] = session.csrfToken; }
    const response = await fetch(route, { ...options, headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "LOCAL_CONTROLLER_ERROR");
    return body;
  }

  async function ensureSession() { if (!session) session = window.trustlinkLabSession ?? await api("/api/session", { method: "POST", body: "{}" }); window.trustlinkLabSession = session; return session; }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function tokenRowsMarkup(tokens, emptyMessage) {
    if (!Array.isArray(tokens) || tokens.length === 0) return `<p class="small">${escapeHtml(emptyMessage)}</p>`;
    return tokens.map((token) => `<button class="token-row" data-token="${escapeHtml(token.tokenAccount ?? "")}" style="width:100%;text-align:left;margin-bottom:6px"><b>${escapeHtml(token.symbol ?? "UNKNOWN")}</b> · ${escapeHtml(token.displayBalance ?? "0")}<br><small>${escapeHtml(token.name ?? "Unknown token")}<br>${escapeHtml(token.state ?? "UNKNOWN")} · ${escapeHtml(token.verification ?? "UNVERIFIED")} · TCAP ${escapeHtml(token.tcapStatus ?? "NOT_CHECKED")}</small></button>`).join("");
  }

  function display(value, fallback = "NOT_AVAILABLE") {
    return escapeHtml(value ?? fallback);
  }

  function walletPanel(wallet) {
    currentWallet = wallet;
    window.trustlinkLabWallet = wallet;
    const info = document.querySelector("#info"); if (!info) return;
    if (!wallet || wallet.status === "NOT_CONFIGURED") {
      info.innerHTML = `<div class="card"><h3>Test wallet</h3><b class="warn">NOT CONFIGURED</b><p class="small">Choose a local Devnet fixture or connect a browser wallet. Browser wallets reconnect through their extension. A local fixture remains attached to this secure local-server session across page refreshes.</p><input id="localWalletFile" type="file" accept="application/json" autocomplete="off"><button id="loadLocal">Select Local Devnet Wallet</button><button id="connectBrowser">Connect Browser Wallet</button><p>Private key: HIDDEN<br>Seed phrase: NEVER DISPLAYED</p></div>`;
      bindWalletSetup(); return;
    }
    const allTokens = Array.isArray(wallet.tokenAccounts) ? wallet.tokenAccounts : [];
    const usableTokens = Array.isArray(wallet.usableTokenAccounts) ? wallet.usableTokenAccounts : allTokens.filter((token) => token.tcapAccepted === true && token.state === "ACTIVE");
    const unsupportedTokens = Array.isArray(wallet.unsupportedTokenAccounts) ? wallet.unsupportedTokenAccounts : allTokens.filter((token) => token.tcapAccepted !== true || token.state !== "ACTIVE");
    info.innerHTML = `<div class="card"><h3>Test wallet</h3><p><b>${escapeHtml(wallet.publicKey ?? "NOT_AVAILABLE")}</b></p><p>Signer type: ${escapeHtml(wallet.type ?? "UNKNOWN")}<br>Network: ${escapeHtml(wallet.network ?? "devnet")}<br>Connection: CONNECTED<br>Transaction approval: REQUIRED ONLY WHEN SUBMITTING</p><h3>Devnet SOL</h3><p>Balance: ${escapeHtml(wallet.solBalance ?? "0")} SOL<br>Estimated requirement: ${escapeHtml(wallet.estimatedRequirementSol ?? "NOT_AVAILABLE")} SOL<br>Status: <b class="${wallet.solStatus === "SUFFICIENT" ? "ok" : "bad"}">${escapeHtml(wallet.solStatus ?? "UNKNOWN")}</b></p>${wallet.insufficientSolMessage ? `<p class="warn">${escapeHtml(wallet.insufficientSolMessage)}</p>` : ""}<p>Private key: HIDDEN<br>Seed phrase: NEVER DISPLAYED</p><button id="refreshWallet">Refresh balances</button><button id="removeWallet">Remove wallet</button></div><div class="card"><h3>TCAP accepted assets</h3><p class="small">Only assets that pass the complete governed V2 live-Devnet policy, reserve, canonical-vault, extension, and balance checks appear here.</p>${tokenRowsMarkup(usableTokens, "No TCAP-governed accepted assets found in this wallet.")}<details><summary>Unsupported or historical token accounts (${unsupportedTokens.length})</summary><p class="small">These balances remain visible for inspection but cannot be selected as a TCAP funding source.</p>${tokenRowsMarkup(unsupportedTokens, "No unsupported or historical token accounts.")}</details></div><div class="card" id="assetPanel"><h3>TrustLink test stable token</h3><p>Not loaded. Local configuration is not treated as Devnet proof.</p><button id="refreshAsset">Refresh token state</button></div>`;
    info.insertAdjacentHTML("beforeend", mintProfilePanel());
    info.insertAdjacentHTML("beforeend", `<div class="card" id="stableTcapPanel"><h3>Stable-TCAP</h3><p>Loading confirmed Devnet status...</p></div>`);
    document.querySelector("#refreshWallet").onclick = refresh;
    document.querySelector("#removeWallet").onclick = removeWallet;
    document.querySelector("#refreshAsset").onclick = loadAsset;
    for (const row of document.querySelectorAll(".token-row")) row.onclick = () => showToken(allTokens.find((token) => token.tokenAccount === row.dataset.token));
    bindMintProfileSelector();
    window.markWalletReady?.();
    loadStableTcap();
  }

  function mintProfilePanel() {
    const selected = MINT_PROFILES[selectedMintProfile] ?? MINT_PROFILES.STANDARD_PUBLIC;
    return `<div class="card" id="mintProfilePanel"><h3>Mint-account issuance profile</h3><label>Institutional issuance profile<br><select id="mintProfileSelect"><option value="STANDARD_PUBLIC" ${selectedMintProfile === "STANDARD_PUBLIC" ? "selected" : ""}>Standard public-balance mint</option><option value="CONFIDENTIAL_TRANSFER_ENABLED" ${selectedMintProfile === "CONFIDENTIAL_TRANSFER_ENABLED" ? "selected" : ""}>Confidential-transfer-enabled mint</option></select></label><p id="mintProfileDetail" class="small">${selected.detail}</p><p class="warn small">This choice applies only when a new mint account is created. Confidential Transfer cannot be added to an existing mint afterward. No mint-creation transaction is available from this screen yet.</p></div>`;
  }

  function bindMintProfileSelector() {
    const select = document.querySelector("#mintProfileSelect");
    if (!select) return;
    select.onchange = () => {
      selectedMintProfile = MINT_PROFILES[select.value] ? select.value : "STANDARD_PUBLIC";
      const detail = document.querySelector("#mintProfileDetail");
      if (detail) detail.textContent = MINT_PROFILES[selectedMintProfile].detail;
    };
  }

  async function loadStableTcap() {
    const panel = document.querySelector("#stableTcapPanel"); if (!panel) return;
    try {
      stableTcap = await api("/api/stable-tcap/status", { method: "POST", body: "{}" });
      const s = stableTcap;
      const failedChecks = Object.entries(s.tcapAcceptanceChecks ?? {}).filter(([, passed]) => passed !== true).map(([name]) => name);
      panel.innerHTML = `<h3>${escapeHtml(s.name ?? "Stable-TCAP")}</h3><p>Status: <b class="${s.faucetAvailable ? "ok" : "warn"}">${escapeHtml(s.status ?? "UNKNOWN")}</b><br>Symbol: ${escapeHtml(s.symbol ?? "STCAP")}<br>Mint: ${escapeHtml(s.mint ?? "NOT_AVAILABLE")}<br>Mint exists: ${s.mintExists ? "YES" : "NO"}<br>Mint creation gate: ${escapeHtml(s.mintCreationGate ?? "UNKNOWN")}<br>Token program: ${escapeHtml(s.tokenProgram ?? "NOT_AVAILABLE")}<br>Decimals: ${escapeHtml(s.decimals ?? "UNKNOWN")}</p><p><b>Mint-account profile: ${escapeHtml(s.mintProfileLabel ?? "Confidential-transfer-enabled mint")} (fixed)</b><br>Profile timing: ${escapeHtml(s.mintProfileTiming ?? "INITIALIZE_AT_MINT_CREATION")}</p><p class="small">Stable-TCAP is reserved for the confidential-transfer-enabled profile. Its Confidential Transfer extension must be initialized with the mint account; an existing mint cannot be converted later. Token-account addresses remain public. This profile remains distinct from TCAP confidential ownership.</p><p>Faucet program: ${escapeHtml(s.faucetProgram ?? "NOT_AVAILABLE")}<br>Program executable: ${s.faucetProgramExecutable ? "YES" : "NO"}<br>Faucet state: ${escapeHtml(s.faucetState ?? "NOT_AVAILABLE")}<br>Faucet available: ${s.faucetAvailable ? "YES" : "NO"}<br>Per-request range: ${escapeHtml(s.minimumRequest ?? "0.01")}&ndash;${escapeHtml(s.maximumRequest ?? "1000000")} ${escapeHtml(s.symbol ?? "STCAP")}</p><p>Wallet token account: ${escapeHtml(s.walletTokenAccount ?? "NOT_CREATED")}<br>Public wallet balance: ${escapeHtml(s.walletBalance ?? "0")}<br>Confidential Token-2022 balance: NOT AVAILABLE<br>TCAP pending funding: NOT AVAILABLE<br>TCAP confidential ownership: NOT IMPLEMENTED<br>TCAP registration: ${escapeHtml(s.tcapRegistration ?? "NOT_REGISTERED_ON_DEVNET")}<br>TCAP approval: ${escapeHtml(s.tcapApprovalStatus ?? "NOT_AVAILABLE")}<br>TCAP operation: ${escapeHtml(s.tcapOperationalStatus ?? "NOT_AVAILABLE")}<br>TCAP acceptance: ${s.tcapAccepted ? "ACCEPTED" : "NOT ACCEPTED"}<br>Reserve: ${escapeHtml(s.tcapReserve ?? "NOT_AVAILABLE")}<br>Canonical vault: ${escapeHtml(s.tcapCanonicalVault ?? "NOT_AVAILABLE")}<br>Vault / actual-assets balance: ${escapeHtml(s.tcapReserveBalanceRaw ?? "NOT_AVAILABLE")} / ${escapeHtml(s.tcapActualAssets ?? "NOT_AVAILABLE")}</p>${failedChecks.length ? `<p class="warn small">Failed live acceptance checks: ${escapeHtml(failedChecks.join(", "))}</p>` : ""}<p class="small">${escapeHtml(s.safeMessage ?? "Deployment status unavailable.")}<br>TCAP acceptance is derived from the governed V2 asset, reserve, canonical vault, mint-extension binding, and accounting invariants read from Devnet.</p><button ${s.faucetAvailable ? "" : "disabled"} id="requestStableTcap">Request Stable-TCAP</button><button disabled>Configure confidential account</button><button ${s.tcapAccepted ? "" : "disabled"}>Use in TCAP funding test</button>`;
      if (s.faucetAvailable) document.querySelector("#requestStableTcap").onclick = () => alert("Manual faucet requests will be enabled after the deployed interface passes the build and initialization gates.");
    } catch (error) {
      panel.innerHTML = `<h3>Stable-TCAP</h3><p class="bad">${error.message}</p><button id="retryStableTcap">Retry status</button>`;
      document.querySelector("#retryStableTcap").onclick = loadStableTcap;
    }
  }

  function showToken(token) {
    if (!token) return;
    const profile = token.confidentialTransferCapability === "ENABLED"
      ? "Confidential-transfer-enabled mint"
      : token.confidentialTransferCapability === "NOT_SUPPORTED"
        ? "Standard public-balance mint"
        : "Token-2022 profile — extension verification required";
    const failedChecks = Object.entries(token.tcapAcceptanceChecks ?? {}).filter(([, passed]) => passed !== true).map(([name]) => name);
    document.querySelector("#info").innerHTML = `<div class="card"><h3>${escapeHtml(token.symbol ?? "UNKNOWN")}</h3><p>Name: ${escapeHtml(token.name ?? "Unknown token")}<br>Mint: ${escapeHtml(token.mint ?? "NOT_AVAILABLE")}<br>Token account: ${escapeHtml(token.tokenAccount ?? "NOT_AVAILABLE")}<br>Balance: ${escapeHtml(token.displayBalance ?? "0")}<br>Raw balance: ${escapeHtml(token.rawBalance ?? "0")}<br>Decimals: ${escapeHtml(token.decimals ?? 0)}<br>Token program: ${escapeHtml(token.tokenProgram ?? "NOT_AVAILABLE")}<br>Mint-account profile: ${escapeHtml(profile)}<br>State: ${escapeHtml(token.state ?? "UNKNOWN")}<br>Verification: ${escapeHtml(token.verification ?? "UNVERIFIED")}<br>TCAP: ${escapeHtml(token.tcapStatus ?? "NOT_CHECKED")}<br>TCAP acceptance model: ${escapeHtml(token.tcapAcceptanceModel ?? "NOT_AVAILABLE")}<br>Approval: ${escapeHtml(token.tcapApprovalStatus ?? "NOT_AVAILABLE")}<br>Operational status: ${escapeHtml(token.tcapOperationalStatus ?? "NOT_AVAILABLE")}<br>Reserve: ${escapeHtml(token.tcapReserve ?? "NOT_AVAILABLE")}<br>Canonical vault: ${escapeHtml(token.tcapCanonicalVault ?? "NOT_AVAILABLE")}<br>Reserve authority: ${escapeHtml(token.tcapReserveAuthority ?? "NOT_AVAILABLE")}<br>Confidential Transfer: ${escapeHtml(token.confidentialTransferCapability ?? "UNKNOWN")}</p>${failedChecks.length ? `<p class="warn small">Failed live acceptance checks: ${escapeHtml(failedChecks.join(", "))}</p>` : '<p class="ok small">All governed TCAP acceptance checks passed.</p>'}<p class="small">TCAP acceptance is read from live Devnet accounts. Token labels may use local display metadata and are not acceptance evidence.</p><button onclick="showInfo('wallet')">Back to wallet</button></div>`;
  }

  function bindWalletSetup() {
    document.querySelector("#loadLocal").onclick = async () => {
      const input = document.querySelector("#localWalletFile"), file = input.files?.[0]; if (!file) return;
      try { const keypair = JSON.parse(await file.text()); input.value = ""; walletPanel(await api("/api/session/wallet/local-file", { method: "POST", body: JSON.stringify({ keypair }) })); keypair.fill?.(0); }
      catch { input.value = ""; alert("Invalid wallet file."); }
    };
    document.querySelector("#connectBrowser").onclick = async () => {
      try { const provider = window.solana ?? window.phantom?.solana ?? window.backpack?.solana; if (!provider) throw new Error(); const connected = await provider.connect(); walletPanel(await api("/api/session/wallet/browser", { method: "POST", body: JSON.stringify({ publicKey: connected.publicKey.toString() }) })); }
      catch { alert("A compatible Solana browser wallet is required."); }
    };
  }

  async function refresh() { walletPanel(await api("/api/wallet/refresh", { method: "POST", body: "{}" })); }
  async function removeWallet() { await api("/api/session/wallet", { method: "DELETE" }); currentAsset = null; currentWallet = null; walletPanel(null); }
  async function loadAsset() {
    const panel = document.querySelector("#assetPanel"); panel.innerHTML = "<h3>TrustLink test stable token</h3><p>Reading confirmed Devnet accounts…</p>";
    try { currentAsset = await api("/api/test-asset/prepare", { method: "POST", body: "{}" }); renderAsset(); }
    catch (error) { panel.innerHTML = `<h3>TrustLink test stable token</h3><p class="bad">${error.message}</p><button id="refreshAsset">Retry</button>`; document.querySelector("#refreshAsset").onclick = loadAsset; }
  }

  function renderAsset(extra = "") {
    const a = currentAsset, panel = document.querySelector("#assetPanel"); if (!a || !panel) return;
    const canMint = a.mintAuthorityCapability === "LOCAL_SIGNER_READY" || a.mintAuthorityCapability === "LOCAL_TEST_FAUCET_READY";
    const canCreateAta = a.ataRequired && currentWalletIsLocal();
    const failedChecks = Object.entries(a.tcapAcceptanceChecks ?? {}).filter(([, passed]) => passed !== true).map(([name]) => name);
    panel.innerHTML = `<h3>TrustLink test stable token</h3><p>Status: <b class="${a.liveReady ? "ok" : "warn"}">${display(a.status, "UNKNOWN")}</b><br>Governed TCAP acceptance: ${a.liveReady ? "ACCEPTED" : "NOT ACCEPTED"}<br>Acceptance model: ${display(a.tcapAcceptanceModel)}</p><p>Mint: ${display(a.mint)}<br>Symbol: ${display(a.symbol, "UNKNOWN")}<br>Decimals: ${display(a.decimals, "UNKNOWN")}<br>Token program: ${display(a.tokenProgram)}</p><p>Registered in TCAP: ${a.registeredInTcap ? "YES" : "NO"}<br>Asset active: ${a.assetActive ? "YES" : "NO"}<br>Deposits enabled: ${a.depositsEnabled ? "YES" : "NO"}<br>Reserve paused: ${a.reservePaused ? "YES" : "NO"}</p><p>Asset registry: ${display(a.assetRegistry)}<br>Asset record: ${display(a.assetRecord)}<br>Reserve: ${display(a.reserve)}<br>Canonical vault: ${display(a.canonicalVault)}<br>Vault balance: ${display(a.vaultBalance, "NOT AVAILABLE")}</p>${failedChecks.length ? `<p class="warn small">Failed live acceptance checks: ${escapeHtml(failedChecks.join(", "))}</p>` : ""}<p>Wallet token account: ${display(a.walletTokenAccount, "NOT CREATED")}<br>Wallet balance: ${display(a.walletBalance, "0")}<br>ATA required: ${a.ataRequired ? "YES" : "NO"}<br>Mint recipient: ${display(a.mintRecipientPublicKey, "NOT AVAILABLE")}<br>Mint authority: ${display(a.mintAuthorityPublicKey, "NONE")}<br>Local faucet ready: ${a.mintAuthorityCapability === "LOCAL_TEST_FAUCET_READY" ? "YES" : "NO"}<br>Per-transaction range: ${display(a.minimumMintAmount, "0.01")}–${display(a.maximumMintAmount, "1000000")} ${display(a.symbol, "UNKNOWN")}</p>${canCreateAta ? '<button id="simulateAta">Simulate token-account creation</button>' : ""}${canMint ? `<label>Mint amount <input id="mintAmount" inputmode="decimal" placeholder="100.00" max="1000000"></label><button id="simulateMint">Simulate test-token mint</button>` : `<input id="mintAuthorityFile" type="file" accept="application/json" autocomplete="off"><button id="loadMintAuthority">Enable local test-token faucet</button><p class="warn">The lab operator must load the legitimate mint-authority fixture once. After that, any connected wallet may mint up to 1,000,000 ${display(a.symbol, "UNKNOWN")} per manually approved transaction. Authority secrets remain server-memory only.</p>`}<button id="refreshAsset">Refresh token state</button>${extra}`;
    document.querySelector("#refreshAsset").onclick = loadAsset;
    if (canMint) document.querySelector("#simulateMint").onclick = simulateMint;
    if (!canMint) document.querySelector("#loadMintAuthority").onclick = loadMintAuthority;
    if (canCreateAta) document.querySelector("#simulateAta").onclick = simulateAta;
  }

  async function loadMintAuthority() {
    const input = document.querySelector("#mintAuthorityFile"), file = input.files?.[0]; if (!file) return;
    try { const keypair = JSON.parse(await file.text()); input.value = ""; await api("/api/test-asset/authority/local-file", { method: "POST", body: JSON.stringify({ keypair }) }); keypair.fill?.(0); await loadAsset(); }
    catch (error) { input.value = ""; renderAsset(`<p class="bad">${error.message}</p>`); }
  }

  function currentWalletIsLocal() { return currentWallet?.type === "LOCAL_DEVNET_FIXTURE"; }

  async function simulateAta() {
    try { const result = await api("/api/test-asset/simulate-ata", { method: "POST", body: "{}" }); renderAsset(`<hr><p>Token-account simulation: <b class="${result.status === "SIMULATION_PASSED" ? "ok" : "bad"}">${result.status}</b><br>Confirmed state change: NONE</p>${result.status === "SIMULATION_PASSED" ? '<button id="createAta">Create token account</button>' : ""}`); if (result.status === "SIMULATION_PASSED") document.querySelector("#createAta").onclick = createAta; }
    catch (error) { renderAsset(`<p class="bad">${error.message}</p>`); }
  }

  async function createAta() {
    if (!confirm("Create this associated token account on Devnet?")) return;
    try { const result = await api("/api/test-asset/create-ata", { method: "POST", body: JSON.stringify({ approved: true }) }); await refresh(); await loadAsset(); renderAsset(`<hr><p class="ok">TOKEN ACCOUNT CREATED</p><p>Signature: ${result.signature}<br>Account: ${result.associatedTokenAccount}</p><a href="${result.explorer}" target="_blank" rel="noreferrer">Open in Solana Explorer</a>`); }
    catch (error) { renderAsset(`<p class="bad">${error.message}</p>`); }
  }

  async function simulateMint() {
    const amount = document.querySelector("#mintAmount").value;
    try {
      const result = await api("/api/test-asset/simulate-mint", { method: "POST", body: JSON.stringify({ amount }) });
      renderAsset(`<hr><p>Simulation: <b class="${result.status === "SIMULATION_PASSED" ? "ok" : "bad"}">${result.status}</b><br>Evidence: ${result.evidenceClass}<br>Confirmed token movement: NONE<br>ATA creation included: ${result.createsAssociatedTokenAccount ? "YES" : "NO"}</p>${result.status === "SIMULATION_PASSED" ? '<button id="submitMint">Mint test token</button>' : `<pre>${JSON.stringify(result.error)}</pre>`}`);
      if (result.status === "SIMULATION_PASSED") document.querySelector("#submitMint").onclick = submitMint;
    } catch (error) { renderAsset(`<p class="bad">${error.message}</p>`); }
  }

  async function submitMint() {
    if (!confirm("Submit this test-token mint transaction to Devnet?")) return;
    try {
      const result = await api("/api/test-asset/mint", { method: "POST", body: JSON.stringify({ approved: true }) });
      await refresh(); await loadAsset();
      renderAsset(`<hr><p class="ok">CONFIRMED</p><p>Signature: ${result.signature}<br>Balance before: ${result.balanceBefore}<br>Balance after: ${result.balanceAfter}</p><a href="${result.explorer}" target="_blank" rel="noreferrer">Open in Solana Explorer</a>`);
    } catch (error) { renderAsset(`<p class="bad">${error.message}</p>`); }
  }

  async function showAiDiagnostics() {
    const info = document.querySelector("#info");
    if (!info) return;
    info.innerHTML = '<div class="card"><h3>AI diagnostics</h3><p class="small">Loading...</p></div>';
    try {
      const { records, config } = await api("/api/diagnostics");
      const totals = records.length ? JSON.parse(JSON.stringify(records.reduce((acc, r) => { acc.totalCost += (r.estimated_cost_usd ?? 0); acc.totalTokens += (r.total_tokens ?? 0); return acc; }, { totalCost: 0, totalTokens: 0 }))) : { totalCost: 0, totalTokens: 0 };
      const lastRecord = records.at(-1);
      const rows = records.length
        ? records.slice().reverse().map((record) => `<div class="card"><h3>${escapeHtml(record.purpose)}</h3><p>Status: <b class="${record.status.includes("COMPLETE") ? "ok" : "warn"}">${escapeHtml(record.status)}</b><br>Provider/model: ${escapeHtml(record.provider)} / ${escapeHtml(record.model)}<br>Confidence: ${escapeHtml(record.confidence_level)}<br>Cost: $${escapeHtml(String(record.estimated_cost_usd ?? "0"))}<br>Tokens: ${escapeHtml(String(record.total_tokens ?? "0"))}${record.cached ? " <b>(cached)</b>" : ""}${record.blocked ? " <b>(BLOCKED)</b>" : ""}${record.blocked_reason ? "<br>Reason: " + escapeHtml(record.blocked_reason) : ""}</p><p class="small">${escapeHtml(record.diagnosis_summary ?? "")}</p>${record.recommended_next_step ? `<p class="small">Next: ${escapeHtml(record.recommended_next_step)}</p>` : ""}</div>`).join("")
        : '<p class="small">No diagnostic record exists yet.</p>';
      info.innerHTML = `<div class="card"><h3>AI diagnostics</h3>
<p class="small">Enabled: <b>${config.enabled ? "YES" : "NO"}</b> · Auto-diagnosis: <b>${config.automaticDiagnosis ? "YES" : "NO"}</b> · Model: ${escapeHtml(config.preferredModel)}<br>
Session records: ${records.length} · Session cost cap: $${escapeHtml(String(config.maxCostPerSessionUsd))} · Per-call cap: $${escapeHtml(String(config.maxCostPerCallUsd))}<br>
Max calls/session: ${config.maxCallsPerSession} · Max input tokens: ${config.maxInputTokens} · Max output: ${config.maxOutputTokens}</p>
<details><summary>AI settings</summary>
<div class="card" style="margin-top:6px"><p>
<label style="display:block;margin:4px 0"><input type="checkbox" id="aiEnabled" ${config.enabled ? "checked" : ""}> Enabled</label>
<label style="display:block;margin:4px 0"><input type="checkbox" id="aiAutoDiagnosis" ${config.automaticDiagnosis ? "checked" : ""}> Automatic diagnosis</label>
<label style="display:block;margin:4px 0">Provider: <input type="text" id="aiProvider" value="openai" style="width:180px" disabled title="Server-side only"></label>
<label style="display:block;margin:4px 0">Model: <select id="aiModel"><option value="claude-3-5-sonnet-latest" ${config.preferredModel === "claude-3-5-sonnet-latest" ? "selected" : ""}>claude-3-5-sonnet-latest</option><option value="gpt-4o" ${config.preferredModel === "gpt-4o" ? "selected" : ""}>gpt-4o</option><option value="gpt-4o-mini" ${config.preferredModel === "gpt-4o-mini" ? "selected" : ""}>gpt-4o-mini</option></select></label>
<label style="display:block;margin:4px 0">Max calls/session: <input type="number" id="aiMaxCallsSession" value="${config.maxCallsPerSession}" min="1" max="50" style="width:60px"></label>
<label style="display:block;margin:4px 0">Max cost/call ($): <input type="number" id="aiMaxCostCall" value="${config.maxCostPerCallUsd}" min="0" max="10" step="0.01" style="width:80px"></label>
<label style="display:block;margin:4px 0">Max cost/session ($): <input type="number" id="aiMaxCostSession" value="${config.maxCostPerSessionUsd}" min="0" max="50" step="0.01" style="width:80px"></label>
<label style="display:block;margin:4px 0">Max input tokens: <input type="number" id="aiMaxInput" value="${config.maxInputTokens}" min="100" max="100000" style="width:100px"></label>
<label style="display:block;margin:4px 0">Max output tokens: <input type="number" id="aiMaxOutput" value="${config.maxOutputTokens}" min="100" max="100000" style="width:100px"></label>
<button id="saveAiConfig">Save settings</button><span id="aiConfigStatus" class="small"></span></p></div>
</details>
<hr>
<p class="small">Deterministic checks fingerprint: ${lastRecord?.failure_fingerprint ? `<code>${escapeHtml(lastRecord.failure_fingerprint.slice(0, 16))}...</code>` : "None yet"}</p>
<button id="analyzeFundingMismatch">Analyze historical funding failure</button>
<button id="runDeterministicChecks">Run deterministic checks</button>
<button id="requestAiDiagnosis">Request AI diagnosis</button>
<button id="clearDiagnostics">Clear history</button></div>${rows}`;
      document.querySelector("#analyzeFundingMismatch").onclick = async () => {
        const result = await api("/api/diagnostics/funding-commitment", { method: "POST", body: "{}" });
        alert(result.record.cached ? "Reused a cached deterministic diagnosis. No AI credits used." : "Saved deterministic diagnosis. No AI credits used.");
        showAiDiagnostics();
      };
      document.querySelector("#runDeterministicChecks").onclick = async () => {
        const checks = await api("/api/diagnostics/deterministic-checks", { method: "POST", body: "{}" });
        alert("Deterministic checks:\n- Anchor error lookup: " + checks.errorLookup.name + " (" + checks.errorLookup.anchorCode + ")\n- Instruction: " + checks.instructionName + "\n- Program: " + checks.programId + "\n- Cached diagnosis available: " + (checks.cachedDiagnosisAvailable ? "YES" : "NO"));
        showAiDiagnostics();
      };
      document.querySelector("#requestAiDiagnosis").onclick = async () => {
        const result = await api("/api/diagnostics/ai-call", { method: "POST", body: {
          relatedProgram: "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
          relatedInstruction: "deposit_with_funding_commitment_v1",
          errorCode: "6022",
          errorName: "FundingCommitmentMismatch",
          rawErrorExcerpt: "Devnet simulation returned FundingCommitmentMismatch (6022 / 0x1786).",
          purpose: "AI analysis of funding commitment mismatch",
          testStage: "funding_simulation",
        }});
        if (result.blocked) {
          alert("AI call blocked: " + result.blockedReason);
        } else if (result.mocked) {
          alert("MOCKED AI diagnosis saved. No real AI call was made.\nDiagnosis: " + result.record.diagnosis_summary);
        } else {
          alert("AI diagnosis completed. Cost: $" + result.record.estimated_cost_usd);
        }
        showAiDiagnostics();
      };
      document.querySelector("#clearDiagnostics").onclick = async () => {
        if (!confirm("Clear saved diagnostic history for this local session?")) return;
        await api("/api/diagnostics", { method: "DELETE" });
        showAiDiagnostics();
      };
      document.querySelector("#saveAiConfig").onclick = async () => {
        const body = {
          enabled: document.querySelector("#aiEnabled").checked,
          automaticDiagnosis: document.querySelector("#aiAutoDiagnosis").checked,
          maxCallsPerSession: Number(document.querySelector("#aiMaxCallsSession").value),
          maxCostPerCallUsd: Number(document.querySelector("#aiMaxCostCall").value),
          maxCostPerSessionUsd: Number(document.querySelector("#aiMaxCostSession").value),
          maxInputTokens: Number(document.querySelector("#aiMaxInput").value),
          maxOutputTokens: Number(document.querySelector("#aiMaxOutput").value),
          preferredModel: document.querySelector("#aiModel").value,
        };
        const saved = await api("/api/diagnostics/config", { method: "PUT", body: JSON.stringify(body) });
        document.querySelector("#aiConfigStatus").textContent = " Saved";
        setTimeout(() => { document.querySelector("#aiConfigStatus").textContent = ""; }, 2000);
      };
      if (lastRecord?.status === "FAILED") console.warn("Diagnostic provider failure recorded without exposing secrets.");
    } catch (error) {
      info.innerHTML = `<div class="card"><h3>AI diagnostics</h3><p class="bad">${escapeHtml(error.message)}</p></div>`;
    }
  }

  window.showWalletSetup = () => walletPanel(currentWallet);
  window.showInfo = (tab) => {
    if (tab === "wallet") return walletPanel(currentWallet);
    if (tab === "claude" || tab === "ai") return showAiDiagnostics();
    const messages = { flow: "No confirmed TCAP transaction yet. Token movement: NONE.", logs: "No simulation or transaction log has been requested.", claude: "Claude is manual-only. Use Explain Result after sanitized evidence exists." };
    document.querySelector("#info").innerHTML = `<div class="card"><h3>${tab}</h3><p>${messages[tab] || "NOT AVAILABLE"}</p><button onclick="showInfo('wallet')">Back to wallet</button></div>`;
  };
  window.showAiDiagnostics = showAiDiagnostics;
  ensureSession().then(async (opened) => {
    if (opened.wallet?.status !== "NOT_CONFIGURED") return walletPanel(opened.wallet);
    const provider = window.solana;
    if (provider) {
      try {
        const connected = await provider.connect({ onlyIfTrusted: true });
        return walletPanel(await api("/api/session/wallet/browser", { method: "POST", body: JSON.stringify({ publicKey: connected.publicKey.toString() }) }));
      } catch { /* No prior browser-wallet approval; keep the setup screen idle. */ }
    }
    walletPanel(null);
  });
})();
