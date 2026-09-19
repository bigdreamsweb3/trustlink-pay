(() => {
  let session;
  let pendingPayment;
  let networkStatus;
  let activeWallet;
  const events = [];
  const $ = (id) => document.getElementById(id);

  function walletCandidate() {
    const candidates = [
      ["Solflare", window.solflare],
      ["Solflare", window.solana?.isSolflare ? window.solana : null],
      ["Phantom", window.phantom?.solana],
      ["Backpack", window.backpack?.solana],
      ["Browser wallet", window.solana],
    ];
    return candidates.find(([, wallet]) => wallet?.connect) ?? [null, null];
  }

  function short(value, max = 88) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
  }

  function log(title, value = "") {
    events.unshift({ time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), title, value });
    events.splice(8);
    $("activity").innerHTML = events.map((entry) => `<div class="event"><time>${entry.time}</time><span><b>${entry.title}</b>${entry.value ? ` - ${short(entry.value)}` : ""}</span></div>`).join("");
    $("log").textContent = events.map((entry) => `${entry.time}  ${entry.title}\n${typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value, null, 2)}`).join("\n\n");
  }

  async function read(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
    return body;
  }

  async function api(url, options = {}) {
    session ??= await fetch("/api/session", { method: "POST" }).then(read);
    return fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        "x-trustlink-session": session.sessionId,
        "x-trustlink-csrf": session.csrfToken,
        ...(options.headers ?? {}),
      },
    }).then(read);
  }

  function selectTab(tabId) {
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      const selected = tab.id === tabId;
      tab.setAttribute("aria-selected", String(selected));
      $(tab.getAttribute("aria-controls")).classList.toggle("active", selected);
    });
  }

  function renderNetworkStatus(status) {
    networkStatus = status;
    const selectedByService = new Map(Object.entries(status.selected ?? {}).map(([service, selected]) => [service, selected]));
    const serviceLabels = { node: "MOTHER NODE", receiver: "RECEIVER", rpc: "RPC GATEWAY", cranker: "CRANKER NODE" };
    const services = ["node", "receiver", "rpc", "cranker"].map((service) => {
      const item = [...status.services].reverse().find((entry) => entry.service === service && entry.state === "online")
        ?? status.services.find((entry) => entry.service === service)
        ?? { service, state: "unknown", source: "none" };
      const selected = selectedByService.get(service);
      const detail = service === "cranker" && status.onlineCrankers == null
        ? "Mother-DNA claim observed on demand"
        : selected?.url ? `${item.source} / ${selected.url.replace(/^https?:\/\//, "")}` : item.detail ?? item.source;
      const displayState = service === "cranker" && status.onlineCrankers == null ? "ON DEMAND" : item.state.toUpperCase();
      const displayClass = service === "cranker" && status.onlineCrankers == null ? "unknown" : item.state;
      return `<div class="status-card service-${service}"><span>${serviceLabels[service]}</span><strong class="state-${displayClass}">${displayState}</strong><small title="${detail}">${short(detail, 34)}</small></div>`;
    });
    const nativeReady = status.readyForNativeTransactions ?? status.readyForTransactions;
    const crossChainReady = status.readyForCrossChainTransactions ?? (nativeReady && status.routeCount > 0);
    const crankerText = status.onlineCrankers == null
      ? "discovery on demand"
      : `${status.onlineCrankers} recently active`;
    $("serviceStatus").innerHTML = `<div class="status-grid">${services.join("")}</div><div class="status-summary"><span>Native TSN <b class="state-${nativeReady ? "online" : "offline"}">${nativeReady ? "READY" : "BLOCKED"}</b></span><span>Cross-chain <b class="state-${crossChainReady ? "online" : "unknown"}">${crossChainReady ? "READY" : "ROUTE REQUIRED"}</b></span><span>Registered routes <b>${status.routeCount}</b></span><span>Cranker Node <b class="state-unknown">${crankerText}</b></span></div><p class="status-note">Cranker Nodes are not tracked by IP. They authenticate with Mother-DNA and become observable when they claim authorized work.</p>`;
  }

  async function refreshStatus() {
    try {
      const status = await api("/api/tsn/sdk/network-status");
      renderNetworkStatus(status);
      const rpc = status.selected?.rpc;
      log("SDK getTsnNetworkStatus", rpc?.url ? `RPC: ${rpc.source} / ${rpc.url}` : "No RPC selected");
    } catch (error) {
      networkStatus = null;
      $("serviceStatus").textContent = `Status check failed: ${error.message}`;
      log("NETWORK STATUS BLOCKED", error.message);
    }
  }

  async function connectWallet() {
    try {
      const [name, wallet] = walletCandidate();
      if (!wallet) throw new Error("Solflare was not detected. Unlock Solflare and allow the extension on localhost.");
      const connected = await wallet.connect();
      const publicKey = (connected.publicKey ?? wallet.publicKey)?.toBase58();
      if (!publicKey) throw new Error("Wallet did not return a Solana public key.");
      activeWallet = wallet;
      const tinOwnerWallet = $("tinOwnerWallet");
      if (tinOwnerWallet) tinOwnerWallet.value = publicKey;
      await api("/api/session/wallet", { method: "POST", body: JSON.stringify({ publicKey }) });
      $("walletStatus").textContent = `${name} connected`;
      $("walletKey").textContent = publicKey;
      $("connectWallet").textContent = "Connected";
      $("connectWallet").disabled = true;
      log("WALLET CONNECTED", `${name} / ${publicKey}`);
    } catch (error) {
      log("WALLET CONNECTION BLOCKED", error.message);
    }
  }

  async function sign(message) {
    if (!activeWallet?.signMessage) throw new Error("The connected wallet must support signMessage.");
    const signed = await activeWallet.signMessage(new TextEncoder().encode(message), "utf8");
    return btoa(String.fromCharCode(...signed.signature));
  }

  async function signBytes(bytes) {
    if (!activeWallet?.signMessage) throw new Error("The connected wallet must support signMessage.");
    const signed = await activeWallet.signMessage(bytes, "utf8");
    return btoa(String.fromCharCode(...signed.signature));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function bytesToBase64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function canonicalFields(fields) {
    return new TextEncoder().encode(fields.map((field) => `${field.length}:${field}`).join("|"));
  }

  async function sha256Hex(bytes) {
    return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  }

  async function createProgramAssignedOwnerEnvelope({ ownerPublicKey, nonce, signature, encryptionMessage }) {
    const dataKey = new Uint8Array(await crypto.subtle.digest("SHA-256", signature));
    const masterSeed = crypto.getRandomValues(new Uint8Array(32));
    const marker = "program-assigned";
    const zeroHash = "0".repeat(64);
    const resourceCommitment = await sha256Hex(crypto.getRandomValues(new Uint8Array(32)));
    const aad = canonicalFields(["TSN_TIN_LOCAL_MASTER_SEED", marker, ownerPublicKey, "1", zeroHash]);
    const seedNonce = crypto.getRandomValues(new Uint8Array(12));
    const seedCiphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: seedNonce, additionalData: aad, tagLength: 128 },
      await crypto.subtle.importKey("raw", dataKey, { name: "AES-GCM" }, false, ["encrypt"]),
      masterSeed,
    ));
    const seedCiphertextBase64 = bytesToBase64Url(seedCiphertext);
    const seedNonceBase64 = bytesToBase64Url(seedNonce);
    const seedCiphertextCommitment = await sha256Hex(canonicalFields([
      "TSN_TIN_LOCAL_MASTER_SEED_CIPHERTEXT", marker, ownerPublicKey, "1", zeroHash,
      seedNonceBase64, seedCiphertextBase64,
    ]));
    const accessControlHash = await sha256Hex(new TextEncoder().encode(encryptionMessage));
    const envelope = {
      version: "tsn-tin-master-seed-envelope",
      provider: "wallet-owner-signature-v1",
      tin: marker,
      ownerPublicKey,
      routeVersion: 1,
      pruConfigurationHash: zeroHash,
      resourceCommitment,
      seedEncryptionAlgorithm: "aes-256-gcm-local-master-seed",
      seedCiphertext: seedCiphertextBase64,
      seedNonce: seedNonceBase64,
      seedCiphertextCommitment,
      protectedKey: "wallet-owner-signature-derived",
      protectedKeyCommitment: await sha256Hex(new TextEncoder().encode("wallet-owner-signature-derived")),
      accessControlHash,
    };
    envelope.integrityCommitment = await sha256Hex(canonicalFields([
      envelope.version, envelope.provider, envelope.tin, envelope.ownerPublicKey,
      String(envelope.routeVersion), envelope.pruConfigurationHash, envelope.resourceCommitment,
      envelope.seedEncryptionAlgorithm, envelope.seedCiphertext, envelope.seedNonce,
      envelope.seedCiphertextCommitment, envelope.protectedKey, envelope.protectedKeyCommitment,
      envelope.accessControlHash,
    ]));
    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  function requireWallet() {
    if (!session || !activeWallet) throw new Error("Connect Solflare or another browser wallet first.");
  }

  function requireNetwork() {
    if (!networkStatus?.readyForTransactions) throw new Error("TSN services are not ready. Refresh Status before creating a transaction.");
  }

  function configureLegacyTinPath() {
    $("panel-create-tin").innerHTML = `<div class="section-head"><div><h2>Prepare a private TIN identity</h2><p>The current SDK path accepts a 10-digit TIN and display name. This prepares the encrypted identity envelope; it does not claim that an on-chain TIN was created.</p></div></div><div class="form"><label>10-digit TIN<input id="tinIdentity" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" placeholder="1234567890" autocomplete="off"></label><label>Name shown after authorized resolution<input id="tinDisplayName" placeholder="Your display name" autocomplete="name"></label><div></div></div><div class="form-actions" style="margin-top:12px"><button id="prepareTinIdentity">Prepare identity envelope</button></div><p class="notice" style="margin-top:14px">Phone verification and random-secret issuance are not part of the current deployed SDK path. The SDK returns a commitment and encrypted envelope, not a public identity record.</p><details><summary>VIEW SDK CODE / current accepted path</summary><pre>const identity = await createTinV1IdentityEnvelope({\n  tin,\n  displayName,\n});</pre><a href="https://trust-link-tsn.mintlify.site/developers/private-tin-issuance" target="_blank" rel="noreferrer">Read the Private TIN guide -&gt;</a></details>`;
  }

  function configureCurrentTinPath() {
    $("panel-create-tin").innerHTML = `<div class="section-head"><div><h2>Create private TIN</h2><p>Connect a wallet and choose a display name. The Solana program assigns the 10-digit TIN during the finalized creation transaction.</p></div></div><div class="form"><label>Connected wallet<input id="tinOwnerWallet" readonly value="${activeWallet?.publicKey?.toBase58?.() ?? "Connect wallet above"}"></label><label>Display name<input id="tinDisplayName" placeholder="Your display name" autocomplete="name"></label><div></div></div><div class="form-actions" style="margin-top:12px"><button id="prepareTinIdentity">Prepare owner creation</button></div><p class="notice" style="margin-top:14px">The current protocol does not ask the user for a TIN, phone number, or lookup secret. The UI will not claim a TIN was created until the SDK creation payload is accepted by the Node, submitted by a Cranker, and finalized on Solana.</p><details><summary>VIEW SDK CODE / creation boundary</summary><pre>User inputs: connected wallet and display name. The SDK must build the encrypted route payload and owner authorization before submission.</pre><a href="https://trust-link-tsn.mintlify.site/developers/private-tin-issuance" target="_blank" rel="noreferrer">Read the Private TIN guide -&gt;</a></details>`;
  }

  async function prepareTinIdentity() {
    try {
      const displayName = $("tinDisplayName").value.trim();
      if (!activeWallet) throw new Error("Connect a browser wallet first.");
      if (!displayName) throw new Error("Enter a display name.");
      log("TIN CREATION INPUTS VALID", `Wallet ${activeWallet.publicKey.toBase58()} / display name ${displayName}`);
      let prepared = await api("/api/tsn/sdk/prepare-tin", { method: "POST", body: JSON.stringify({ displayName }) });
      if (prepared.status === "OWNER_ENCRYPTION_SIGNATURE_REQUIRED") {
        const encryptionBytes = new TextEncoder().encode(prepared.ownerEncryptionMessage);
        const ownerEncryptionSignatureBase64 = await signBytes(encryptionBytes);
        const ownerEncryptionSignature = Uint8Array.from(atob(ownerEncryptionSignatureBase64), (character) => character.charCodeAt(0));
        const encryptedMasterSeed = await createProgramAssignedOwnerEnvelope({
          ownerPublicKey: activeWallet.publicKey.toBase58(),
          nonce: Uint8Array.from(prepared.ownerEncryptionNonce.match(/.{2}/g), (pair) => parseInt(pair, 16)),
          signature: ownerEncryptionSignature,
          encryptionMessage: prepared.ownerEncryptionMessage,
        });
        prepared = await api("/api/tsn/sdk/prepare-tin", {
          method: "POST",
          body: JSON.stringify({ displayName, encryptedMasterSeed: btoa(String.fromCharCode(...encryptedMasterSeed)) }),
        });
      }
      const ownerIntentMessage = prepared.ownerIntentMessage;
      const ownerSignature = await sign(ownerIntentMessage);
      const submitted = await api("/api/tsn/sdk/submit-tin", { method: "POST", body: JSON.stringify({ ...prepared, ownerSignature, ownerIntentMessage }) });
      log("SDK createTin", submitted.intentId ?? "TIN creation intent submitted");
      log("TIN CREATION SUBMITTED", "The Node accepted the owner-authorized creation intent. The Cranker will submit CreateTin and the program will assign the TIN on Solana.");
    } catch (error) { log("TIN IDENTITY BLOCKED", error.message); }
  }

  async function payTin() {
    try {
      requireWallet();
      requireNetwork();
      const recipientTin = $("recipientTin").value.trim();
      const route = await api("/api/tsn/sdk/resolve-tin", { method: "POST", body: JSON.stringify({ tin: recipientTin }) });
      pendingPayment = await api("/api/tsn/sdk/prepare-payment", {
        method: "POST",
        body: JSON.stringify({ recipientTin, recipientRouteCommitment: route.recipientRouteCommitment, recipientRouteVersion: route.recipientRouteVersion, tokenMintAddress: $("tinMint").value.trim(), amount: Number($("tinAmount").value) }),
      });
      $("submitTin").disabled = false;
      log("SDK createPaymentAuthorization", `TIN ${recipientTin} / ready for wallet signature`);
    } catch (error) { log("TIN PAYMENT BLOCKED", error.message); }
  }

  async function submitTin() {
    try {
      if (!pendingPayment) throw new Error("Prepare the TIN payment first.");
      const signatureBase64 = await sign(pendingPayment.message);
      const submitted = await api("/api/tsn/sdk/submit-payment", { method: "POST", body: JSON.stringify({ ...pendingPayment, signatureBase64 }) });
      $("submitTin").disabled = true;
      log("SDK submitPaymentAuthorizationToMempool", submitted.status ?? "Intent submitted");
    } catch (error) { log("INTENT SUBMISSION BLOCKED", error.message); }
  }

  async function buildWalletTransfer() {
    try {
      requireWallet();
      requireNetwork();
      const transfer = await api("/api/tsn/sdk/build-wallet-transfer", { method: "POST", body: JSON.stringify({ recipientWallet: $("walletRecipient").value.trim(), tokenMintAddress: $("walletMint").value.trim(), amountUi: $("walletAmount").value, tokenDecimals: 6 }) });
      log("SDK buildTsnSplTokenTransferTransaction", transfer.status ?? "Unsigned transfer ready");
    } catch (error) { log("WALLET TRANSFER BLOCKED", error.message); }
  }

  async function buildFunding() {
    try {
      requireWallet();
      requireNetwork();
      const funding = await api("/api/tsn/sdk/build-funding", { method: "POST", body: JSON.stringify({ tokenMintAddress: $("fundingMint").value.trim(), amountUi: $("fundingAmount").value, tokenDecimals: 6 }) });
      log("SDK buildTsnSponsoredSettlementTransaction", funding.status ?? "Unsigned funding ready");
    } catch (error) { log("FUNDING BUILD BLOCKED", error.message); }
  }

  document.querySelectorAll('[role="tab"]').forEach((tab) => { tab.onclick = () => selectTab(tab.id); });
  $("connectWallet").onclick = connectWallet;
  $("refreshStatus").onclick = refreshStatus;
  $("payTin").onclick = payTin;
  $("submitTin").onclick = submitTin;
  $("buildWalletTransfer").onclick = buildWalletTransfer;
  $("buildFunding").onclick = buildFunding;
  configureCurrentTinPath();
  $("prepareTinIdentity").onclick = prepareTinIdentity;
  $("clearActivity").onclick = () => { events.splice(0); $("activity").innerHTML = '<div class="event"><time>CLEAR</time><span>Activity cleared.</span></div>'; $("log").textContent = "Activity cleared."; };
  const [walletName] = walletCandidate();
  if (walletName) $("walletKey").textContent = `${walletName} detected. Connect when ready.`;
  log("READY", walletName ? `${walletName} detected` : "No browser wallet detected");
  refreshStatus();
})();
