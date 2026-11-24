(() => {
  let session;
  let resolvedTin;
  let resolvedDebitTin;
  let networkStatus;
  let activeWallet;
  let ownerTinIdentity;
  let balanceInFlight;
  let balanceController;
  let pendingTinCredit;
  let tinCreditInFlight = false;
  let tinCreditGeneration = 0;
  let tinFundingReadinessTimer;
  const ownerIdentityClient = {
    post: (path, body) => api(`/api/tsn/sdk${path}`, { method: "POST", body: JSON.stringify(body) }),
  };
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

  function short(value, max = 220) {
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
    if (!response.ok) {
      const detail = Array.isArray(body.detail)
        ? body.detail.map((item) => {
          const location = Array.isArray(item?.loc) ? item.loc.join(".") : "request";
          return `${location}: ${item?.msg ?? item?.type ?? "invalid"}`;
        }).join("; ")
        : body.detail;
      throw new Error(body.message ?? body.error ?? detail ?? `HTTP ${response.status}`);
    }
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
    const panel = $(document.querySelector(`[aria-controls="${tabId}"]`)?.getAttribute("aria-controls") ?? "");
    if (panel && panel.id !== "panel-status" && !panel.querySelector(".modal-close")) {
      const close = document.createElement("button");
      close.className = "modal-close";
      close.type = "button";
      close.textContent = "Back";
      close.onclick = () => selectTab("tab-status");
      panel.prepend(close);
    }
  }

  function setWalletConnectedView(connected) {
    document.body.classList.toggle("wallet-connected", connected);
    const walletOverview = $("walletOverviewSection");
    if (walletOverview) walletOverview.hidden = !connected;
  }

  function handleWalletDisconnect(wallet) {
    if (wallet !== activeWallet) return;
    activeWallet = null;
    invalidateTinFundingApproval();
    ownerTinIdentity = null;
    if (pendingTinDebitId) tinDebitRetryState.workId = pendingTinDebitId;
    delete tinDebitRetryState.requestJson;
    delete tinDebitRetryState.intent;
    balanceController?.abort();
    balanceInFlight = null;
    window.TsnTinCreationSdk?.clearTinOwnerBalanceAccessV1(wallet);
    $("overviewTinBalance").textContent = "Locked";
    $("tinBalanceStatus").textContent = "Connect your wallet to open your balance.";
    $("refreshTinBalance").disabled = true;
    setWalletConnectedView(false);
    if ($("headerConnectWallet")) {
      $("headerConnectWallet").textContent = "Connect";
      $("headerConnectWallet").disabled = false;
    }
    if ($("overviewTin")) $("overviewTin").textContent = "Not issued";
    if ($("overviewDisplayName")) $("overviewDisplayName").textContent = "—";
    if ($("overviewWallet")) $("overviewWallet").textContent = "Not connected";
    if ($("overviewAccountStatus")) $("overviewAccountStatus").textContent = "Awaiting wallet";
    if ($("issueTinAction")) $("issueTinAction").hidden = false;
    log("WALLET DISCONNECTED", "Connect a wallet to load its TSN identity.");
  }

  function renderNetworkStatus(status) {
    networkStatus = status;
    const headerHealth = $("headerNetworkHealth");
    if (headerHealth) {
      const ready = Boolean(status.readyForNativeTransactions ?? status.readyForTransactions);
      const rpcSelection = status.selected?.rpc;
      const rpc = status.services?.find((entry) => entry.service === "rpc" && rpcSelection && entry.source === rpcSelection.source && entry.url === rpcSelection.url)
        ?? status.services?.find((entry) => entry.service === "rpc");
      headerHealth.className = `network-health ${ready ? "ready" : "blocked"}`;
      headerHealth.querySelector("span").textContent = ready
        ? `NETWORK READY · RPC ${rpc?.latencyMs ?? "-"}MS`
        : "NETWORK BLOCKED";
      const headerDetail = $("headerNetworkDetail");
      if (headerDetail) {
        headerDetail.innerHTML = ["node", "receiver", "rpc"].map((service) => {
          const item = status.services?.find((entry) => entry.service === service);
          const state = item?.state ?? "unknown";
          return `<i class="health-dot ${state}" title="${service.toUpperCase()} ${state}${item?.latencyMs == null ? "" : ` · ${item.latencyMs}ms`}"></i>`;
        }).join("");
      }
      headerHealth.title = `Last sync ${new Date(status.checkedAt).toLocaleTimeString()} · RPC ${rpc?.state ?? "unknown"}`;
    }
    const selectedByService = new Map(Object.entries(status.selected ?? {}).map(([service, selected]) => [service, selected]));
    const serviceLabels = { node: "MOTHER NODE", receiver: "RECEIVER", rpc: "RPC GATEWAY", cranker: "CRANKER NODE" };
    const services = ["node", "receiver", "rpc", "cranker"].map((service) => {
      const selected = selectedByService.get(service);
      const item = status.services.find((entry) => entry.service === service && selected && entry.source === selected.source && entry.url === selected.url)
        ?? [...status.services].reverse().find((entry) => entry.service === service && entry.state === "online")
        ?? status.services.find((entry) => entry.service === service)
        ?? { service, state: "unknown", source: "none" };
      const healthDetail = service === "rpc"
        ? `${item.detail ?? "getHealth: ok"} · ${item.latencyMs == null ? "latency n/a" : `${item.latencyMs}ms`}`
        : null;
      const detail = service === "cranker" && status.onlineCrankers == null
        ? "on demand"
        : selected?.url ? `${healthDetail ?? item.source} · ${selected.url.replace(/^https?:\/\//, "")}` : healthDetail ?? item.detail ?? item.source;
      const displayState = service === "cranker" && status.onlineCrankers == null ? "ON DEMAND" : item.state.toUpperCase();
      const displayClass = service === "cranker" && status.onlineCrankers == null ? "unknown" : item.state;
      return `<div class="status-card service-${service}"><span>${serviceLabels[service]}</span><strong class="state-${displayClass}">${displayState}</strong><small title="${detail}">${short(detail, 34)}</small></div>`;
    });
    const nativeReady = status.readyForNativeTransactions ?? status.readyForTransactions;
    const crossChainReady = status.readyForCrossChainTransactions ?? (nativeReady && status.routeCount > 0);
    const crankerText = status.onlineCrankers == null
      ? "on demand"
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
      const headerHealth = $("headerNetworkHealth");
      if (headerHealth) { headerHealth.className = "network-health blocked"; headerHealth.querySelector("span").textContent = "STATUS ERROR"; }
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
      renderTinFundingControls();
      setWalletConnectedView(true);
      if (typeof wallet.on === "function") {
        wallet.on("disconnect", () => handleWalletDisconnect(wallet));
        wallet.on("accountChanged", (key) => {
          if (key?.toBase58?.() !== publicKey) handleWalletDisconnect(wallet);
        });
      }
      const tinOwnerWallet = $("tinOwnerWallet");
      if (tinOwnerWallet) tinOwnerWallet.value = publicKey;
      await api("/api/session/wallet", { method: "POST", body: JSON.stringify({ publicKey }) });
      if ($("walletStatus")) $("walletStatus").textContent = `${name} connected`;
      if ($("walletKey")) $("walletKey").textContent = publicKey;
      if ($("overviewWallet")) $("overviewWallet").textContent = `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}`;
      if ($("overviewAccountStatus")) $("overviewAccountStatus").textContent = "Wallet connected";
      $("headerConnectWallet").textContent = "Connected";
      $("headerConnectWallet").disabled = true;
      log("WALLET CONNECTED", `${name} / ${publicKey}`);
      try {
        await recoverConnectedTin();
      } catch (error) {
        log("TIN RECOVERY BLOCKED", error instanceof Error ? error.message : String(error));
      }
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

  function decodeBase64(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function encodeBase64(value) {
    return btoa(String.fromCharCode(...value));
  }

  async function tinRecoveryKey(recoveryKeyContextBase64, signatureBase64) {
    const domain = new TextEncoder().encode("TSN_TIN_OWNER_RECOVERY_KEY_V1");
    const context = decodeBase64(recoveryKeyContextBase64);
    const signature = decodeBase64(signatureBase64);
    const material = new Uint8Array(domain.length + context.length + signature.length);
    material.set(domain, 0);
    material.set(context, domain.length);
    material.set(signature, domain.length + context.length);
    const rawKey = await crypto.subtle.digest("SHA-256", material);
    return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  async function encryptTinRecovery(tin, displayName, recoveryKeyContextBase64, signatureBase64) {
    const key = await tinRecoveryKey(recoveryKeyContextBase64, signatureBase64);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const magic = new TextEncoder().encode("TSNTIN04");
    const recoveryPlaintext = new TextEncoder().encode(JSON.stringify({ tin, displayName }));
    const recoveryCiphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce }, key, recoveryPlaintext,
    ));
    const envelope = new Uint8Array(magic.length + nonce.length + recoveryCiphertext.length);
    envelope.set(magic, 0);
    envelope.set(nonce, magic.length);
    envelope.set(recoveryCiphertext, magic.length + nonce.length);
    return encodeBase64(envelope);
  }

  async function decryptTinRecovery(encryptedTinRecovery, recoveryKeyContextBase64, signatureBase64) {
    const envelope = decodeBase64(encryptedTinRecovery);
    const versionFourMagic = new TextEncoder().encode("TSNTIN04");
    const versionThreeMagic = new TextEncoder().encode("TSNTIN03");
    const versionTwoMagic = new TextEncoder().encode("TSNTIN02");
    const versionFour = versionFourMagic.every((byte, index) => envelope[index] === byte);
    const versionThree = versionThreeMagic.every((byte, index) => envelope[index] === byte);
    const versionTwo = versionTwoMagic.every((byte, index) => envelope[index] === byte);
    const magicLength = versionFour ? versionFourMagic.length : versionThree ? versionThreeMagic.length : versionTwo ? versionTwoMagic.length : 0;
    const ciphertext = envelope.slice(magicLength);
    if (ciphertext.length < 28) throw new Error("The encrypted TIN recovery record is malformed.");
    const key = await tinRecoveryKey(recoveryKeyContextBase64, signatureBase64);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ciphertext.slice(0, 12) }, key, ciphertext.slice(12),
    );
    const decoded = new TextDecoder().decode(plaintext);
    let tin = decoded;
    let displayName;
    if (versionFour || versionThree) {
      const identity = JSON.parse(decoded);
      tin = identity.tin;
      displayName = identity.displayName;
    }
    if (!/^\d{10}$/.test(tin)) throw new Error("Recovered identity is not a 10-digit TIN.");
    if ((versionFour || versionThree) && (typeof displayName !== "string" || !displayName.trim())) {
      throw new Error("Recovered display name is invalid.");
    }
    return { tin, ...(displayName ? { displayName } : {}) };
  }

  async function recoverConnectedTin() {
    const recovery = await api("/api/tsn/sdk/owner-tin-recovery");
    if (!recovery.found) return;
    const signature = await signBytes(new TextEncoder().encode(recovery.recoveryMessage));
    const identity = await decryptTinRecovery(recovery.encryptedTinRecovery, recovery.recoveryKeyContextBase64, signature);
    let displayName = identity.displayName;
    if (!displayName) {
      const challenge = await api("/api/tsn/sdk/owner-tin-identity-challenge", {
        method: "POST",
        body: JSON.stringify({ tin: identity.tin }),
      });
      const identitySignature = await signBytes(new TextEncoder().encode(challenge.message));
      const resolved = await api("/api/tsn/sdk/owner-tin-identity", {
        method: "POST",
        body: JSON.stringify({ tin: identity.tin, challengeId: challenge.challengeId, ownerSignature: identitySignature }),
      });
      displayName = resolved.displayName;
    }
    if ($("overviewTin")) $("overviewTin").textContent = identity.tin;
    if (displayName && $("overviewDisplayName")) $("overviewDisplayName").textContent = displayName;
    if ($("overviewAccountStatus")) $("overviewAccountStatus").textContent = "TIN recovered from wallet";
    const issueButton = $("issueTinAction");
    if (issueButton) issueButton.hidden = true;
    ownerTinIdentity = { tin: identity.tin, displayName };
    $("refreshTinBalance").disabled = false;
    log("TIN RECOVERED", `Wallet-authorized recovery / TIN ${identity.tin}${displayName ? ` · ${displayName}` : ""}`);
    await refreshTinBalance();
  }

  function formatTinTokenBalance(token) {
    const raw = BigInt(token.balanceBaseUnits), scale = 10n ** BigInt(token.decimals);
    const fraction = (raw % scale).toString().padStart(token.decimals, "0").replace(/0+$/, "");
    const amount = `${raw / scale}${fraction ? `.${fraction}` : ""}`;
    const label = token.mint === "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" ? "USDC" : `asset ${token.tokenId}`;
    return `${amount} ${label}`;
  }

  async function refreshTinBalance() {
    if (balanceInFlight) return balanceInFlight;
    const wallet = activeWallet, identity = ownerTinIdentity;
    if (!wallet || !identity) return;
    const controller = new AbortController();
    balanceController = controller;
    const current = () => wallet === activeWallet && identity === ownerTinIdentity && !controller.signal.aborted;
    $("refreshTinBalance").disabled = true;
    $("overviewTinBalance").textContent = "Loading…";
    $("tinBalanceStatus").textContent = "Approve wallet access to read your balance locally.";
    const pending = (async () => {
      try {
        const sdk = window.TsnTinCreationSdk;
        if (!sdk?.loadTinOwnerBalanceV1) throw new Error("Rebuild the XP browser SDK to enable balance recovery.");
        const connection = new sdk.Connection(`${window.location.origin}/api/tsn/rpc`, {
          commitment: "finalized", httpHeaders: { "x-trustlink-session": session.sessionId, "x-trustlink-csrf": session.csrfToken },
        });
        const result = await sdk.loadTinOwnerBalanceV1({ connection, tin: identity.tin,
          identityClient: ownerIdentityClient, ownerWallet: wallet, cacheAuthorization: true,
          signal: controller.signal,
          onProgress: message => { if (current()) $("tinBalanceStatus").textContent = message; },
        });
        if (!current()) return;
        const tokens = result.tokenBalances.filter(token => BigInt(token.balanceBaseUnits) > 0n);
        $("overviewTinBalance").textContent = tokens.length ? tokens.map(formatTinTokenBalance).join(" · ") : "0";
        $("tinBalanceStatus").textContent = `${result.actionCount} owner action${result.actionCount === 1 ? "" : "s"} recovered from finalized history.`;
        $("refreshTinBalance").textContent = "Refresh balance";
        log("TIN BALANCE RECOVERED", `${result.actionCount} finalized owner actions checked locally.`);
      } catch (error) {
        if (!current()) return;
        $("overviewTinBalance").textContent = "Unavailable";
        $("tinBalanceStatus").textContent = error instanceof Error ? error.message : "Balance recovery failed.";
        log("TIN BALANCE UNAVAILABLE", error instanceof Error ? error.message : "Balance recovery failed.");
      } finally {
        if (current()) $("refreshTinBalance").disabled = false;
      }
    })();
    balanceInFlight = pending;
    try { await pending; } finally { if (balanceInFlight === pending) balanceInFlight = null; }
  }

  function hexToBytes(value) {
    if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/i.test(value)) {
      throw new Error("TIN owner-encryption nonce is invalid.");
    }
    return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function createTinV1OwnerEnvelope({ ownerPublicKey, displayName, nonce }) {
    const createEnvelope = window.TsnTinCreationSdk?.createTinV1OwnerSeedEnvelope;
    if (typeof createEnvelope !== "function") {
      throw new Error("TIN creation SDK bundle is missing the ElGamal seed-envelope builder; rebuild the browser SDK bundle.");
    }
    return createEnvelope({
      ownerWallet: {
        publicKey: ownerPublicKey,
        signMessage: async (message) => decodeBase64(await signBytes(message)),
      },
      displayName,
      nonce: hexToBytes(nonce),
    });
  }

  function requireWallet() {
    if (!session || !activeWallet) throw new Error("Connect Solflare or another browser wallet first.");
  }

  function requireNetwork() {
    if (!networkStatus?.readyForTransactions) throw new Error("TSN services are not ready. Refresh Status before creating a transaction.");
  }

  function configureCurrentTinPath() {
    $("panel-create-tin").innerHTML = `<div class="section-head"><div><h2>Create private TIN</h2><p>Connect a wallet and choose a display name. TSN generates a random TIN privately; the program stores only its keyed lookup commitment and encrypted identity.</p></div></div><div class="form"><label>Connected wallet<input id="tinOwnerWallet" readonly value="${activeWallet?.publicKey?.toBase58?.() ?? "Connect wallet above"}"></label><label>Display name<input id="tinDisplayName" placeholder="Your display name" autocomplete="name"></label><div></div></div><div class="form-actions" style="margin-top:12px"><button id="prepareTinIdentity">Prepare owner creation</button></div><div id="tinCreationResult" class="notice" style="margin-top:14px" hidden></div><p class="notice" style="margin-top:14px">The TIN stays in the XP session until the Node verifies the Receiver work and the Cranker confirms the CreateTinV1 transaction. It is not included in Receiver work or the on-chain account.</p><details><summary>VIEW SDK CODE / TIN V1 creation boundary</summary><pre>const identity = await createTinV1IdentityEnvelope({ tin, displayName, lookupSecret });\nconst intent = buildTinV1Creation({ lookupCommitment, encryptedIdentityEnvelope, ownerPubkey, ... });\nawait submitTinV1Creation({ ...intent, ownerSignature });</pre><a href="https://trust-link-tsn.mintlify.site/developers/private-tin-issuance" target="_blank" rel="noreferrer">Read the Private TIN guide -&gt;</a></details>`;
  }

  async function prepareTinIdentity() {
    let stage = "validating wallet and display name";
    try {
      const displayName = $("tinDisplayName").value.trim();
      if (!activeWallet) throw new Error("Connect a browser wallet first.");
      if (!displayName) throw new Error("Enter a display name.");
      log("TIN CREATION INPUTS VALID", `Wallet ${activeWallet.publicKey.toBase58()} / display name ${displayName}`);
      stage = "requesting owner-encryption approval message from TSN XP server";
      let prepared = await api("/api/tsn/sdk/prepare-tin", { method: "POST", body: JSON.stringify({ displayName }) });
      if (prepared.status === "OWNER_ENCRYPTION_SIGNATURE_REQUIRED") {
        stage = "requesting wallet approval for local seed encryption";
        stage = "encrypting the owner seed locally";
        const ownerSeed = await createTinV1OwnerEnvelope({
          ownerPublicKey: activeWallet.publicKey.toBase58(),
          displayName,
          nonce: prepared.ownerEncryptionNonce,
        });
        stage = "building private TIN V1 intent with the TSN SDK";
        const ownerSeedPayload = {
          resourceCommitment: ownerSeed.resourceCommitment,
          encryptedMasterSeed: encodeBase64(ownerSeed.encryptedMasterSeed),
          gpruElgamalKeyVersion: ownerSeed.gpruElgamalKeyVersion,
          gpruElgamalPublicKey: bytesToHex(ownerSeed.gpruElgamalPublicKey),
          gpruElgamalKeyCommitment: bytesToHex(ownerSeed.gpruElgamalKeyCommitment),
          gpruBalanceScanKeyVersion: ownerSeed.gpruBalanceScanKeyVersion,
          gpruBalanceScanPublicKeyX: bytesToHex(ownerSeed.gpruBalanceScanPublicKeyX),
          gpruBalanceScanPublicKeyY: bytesToHex(ownerSeed.gpruBalanceScanPublicKeyY),
        };
        prepared = await api("/api/tsn/sdk/prepare-tin", {
          method: "POST",
          body: JSON.stringify({ displayName, ...ownerSeedPayload }),
        });
        if (prepared.status === "TIN_RECOVERY_SIGNATURE_REQUIRED") {
          if (typeof prepared.recoveryMessage !== "string" || !prepared.recoveryMessage.trim()) {
            throw new Error("TSN did not provide the human-readable recovery authorization message.");
          }
          if (typeof prepared.recoveryKeyContextBase64 !== "string" || !prepared.recoveryKeyContextBase64) {
            throw new Error("TSN did not provide the recovery key context.");
          }
          stage = "requesting wallet approval for local TIN recovery encryption";
          const recoverySignature = await signBytes(new TextEncoder().encode(prepared.recoveryMessage));
          stage = "encrypting the owner recovery record locally";
          const encryptedTinRecovery = await encryptTinRecovery(prepared.tin, displayName, prepared.recoveryKeyContextBase64, recoverySignature);
          stage = "sending the encrypted recovery record to TSN XP";
          prepared = await api("/api/tsn/sdk/prepare-tin", {
            method: "POST",
            body: JSON.stringify({ displayName, ...ownerSeedPayload, encryptedTinRecovery }),
          });
        }
      }
      stage = "requesting owner-intent signature from wallet";
      const ownerIntentMessage = prepared.ownerIntentMessage;
      if (typeof ownerIntentMessage !== "string" || !ownerIntentMessage.trim()) {
        throw new Error("TSN did not provide the human-readable owner approval message.");
      }
      const ownerSignature = await signBytes(new TextEncoder().encode(ownerIntentMessage));
      stage = "submitting signed TIN intent to TSN Receiver ingress";
      const submitted = await api("/api/tsn/sdk/submit-tin", { method: "POST", body: JSON.stringify({ ...prepared, ownerSignature, ownerIntentMessage }) });
      log("SDK createTin", submitted.intentId ?? "TIN creation intent submitted");
      const result = $("tinCreationResult");
      if (result) { result.hidden = false; result.textContent = "TIN V1 intent accepted by Receiver. Waiting for Node verification and Cranker finalization…"; }
      log("TIN V1 INTENT RECEIVED", "Receiver accepted the encrypted identity envelope and owner-signed lookup commitment. Node verification and Cranker submission are pending.");
      void watchTinFinalization(submitted.operationId);
    } catch (error) { log("TIN IDENTITY BLOCKED", `${stage}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function watchTinFinalization(operationId) {
    if (!operationId) { log("TIN V1 STATUS PENDING", "Receiver did not return its operation reference."); return; }
    const terminal = new Set(["CONFIRMED", "FAILED"]);
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const current = await api(`/api/tsn/sdk/tin-status?operationId=${encodeURIComponent(operationId)}`);
        if (!terminal.has(current.status)) continue;
        if (current.status === "CONFIRMED" && current.tin) {
          if ($("overviewTin")) $("overviewTin").textContent = current.tin;
          if (current.displayName && $("overviewDisplayName")) $("overviewDisplayName").textContent = current.displayName;
          if ($("overviewAccountStatus")) $("overviewAccountStatus").textContent = "TIN secured to wallet";
          if ($("issueTinAction")) $("issueTinAction").hidden = true;
          ownerTinIdentity = { tin: current.tin, displayName: current.displayName ?? $("tinDisplayName").value.trim() };
          $("refreshTinBalance").disabled = false;
          $("tinBalanceStatus").textContent = "Open your newly issued TIN balance with wallet authorization.";
          const result = $("tinCreationResult");
          if (result) result.textContent = `TIN ${current.tin}${current.displayName ? ` · ${current.displayName}` : ""} finalized on Solana${current.signature ? ` · ${current.signature}` : ""}.`;
          log("TIN V1 FINALIZED", `TIN ${current.tin}${current.signature ? ` / Solana ${current.signature}` : ""}`);
        } else {
          const result = $("tinCreationResult");
          if (result) result.textContent = `TIN V1 operation ${current.status}. Check SDK activity for the Node or Cranker result.`;
          log("TIN V1 OPERATION ENDED", current.status.toUpperCase());
        }
        return;
      } catch (error) {
        if (attempt === 0) log("TIN V1 STATUS WAITING", error instanceof Error ? error.message : String(error));
      }
    }
    log("TIN V1 STATUS PENDING", "The owner session remains active; refresh status after the Cranker submits the transaction.");
  }

  async function resolveTinForReview(action = "credit") {
    const isDebit = action === "debit";
    const tin = $(isDebit ? "debitRecipientTin" : "recipientTin").value.trim();
    const result = $(isDebit ? "tinDebitResolution" : "tinResolution");
    const submit = $(isDebit ? "sendTinDebit" : "payTin");
    if (isDebit) resolvedDebitTin = null;
    else resolvedTin = null;
    submit.disabled = true;
    result.hidden = false;
    result.textContent = "Resolving the TIN display name through TSN Node…";
    try {
      requireNetwork();
      const identity = await api("/api/tsn/sdk/resolve-tin", { method: "POST", body: JSON.stringify({ tin }) });
      if (isDebit) resolvedDebitTin = identity;
      else resolvedTin = identity;
      result.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = identity.displayName || "No display name provided";
      const detail = document.createElement("p");
      detail.textContent = "Display name supplied by the TIN owner. No government identity attestation is attached.";
      const match = document.createElement("small");
      match.textContent = `Resolved TIN ${identity.tin}`;
      result.append(heading, detail, match);
      submit.disabled = false;
      log("TSN SDK resolve TIN", `TIN ${tin} / ${identity.displayName || "no display name"} / owner-provided name`);
    } catch (error) {
      result.textContent = `TIN could not be resolved: ${error.message}`;
      log("TIN RESOLUTION BLOCKED", error.message);
    }
  }

  let tinDebitInFlight = false;
  let pendingTinDebitId;
  const tinDebitRetryState = {};
  function reconcileTinDebitStatus(work, workId) {
    if (work?.operationId !== workId || work.kind !== "TIN_DEBIT") throw new Error("The original TIN-Debit status could not be verified.");
    if (work.status !== "CONFIRMED" && !(["REJECTED", "FAILED"].includes(work.status) && work.safeToReplace === true)) return false;
    if (pendingTinDebitId !== workId) return false;
    delete tinDebitRetryState.intent; delete tinDebitRetryState.requestJson; delete tinDebitRetryState.workId;
    pendingTinDebitId = undefined;
    $("tinDebitResolution").textContent = work.status === "CONFIRMED"
      ? "TIN-Debit confirmed. Your outgoing debit and the recipient's incoming credit are recorded."
      : "TIN-Debit did not execute. You can prepare another debit.";
    return true;
  }
  async function sendTinDebit() {
    if (tinDebitInFlight) return;
    const wallet = activeWallet, identity = ownerTinIdentity;
    if (!wallet || !identity) return log("TIN-DEBIT", "Connect your wallet and open your TIN identity first.");
    const recipientTin = $("debitRecipientTin").value.trim();
    if (pendingTinDebitId && !tinDebitRetryState.requestJson && tinDebitRetryState.workId) {
      try {
        const status = await api(`/api/tsn/sdk/tin-debit-status?workId=${encodeURIComponent(pendingTinDebitId)}`);
        $("tinDebitResolution").hidden = false;
        $("tinDebitResolution").textContent = `Original TIN-Debit ${pendingTinDebitId}: ${status.status}.`;
        if (reconcileTinDebitStatus(status, pendingTinDebitId) && status.status === "CONFIRMED") await refreshTinBalance();
      } catch {
        log("TIN-DEBIT STATUS", `Keep the original payment ID ${pendingTinDebitId}; its status is unavailable in this wallet session.`);
      }
      return;
    }
    if (!tinDebitRetryState.requestJson && (!resolvedDebitTin || resolvedDebitTin.tin !== recipientTin)) return log("TIN-DEBIT", "Resolve and review the recipient TIN first.");
    tinDebitInFlight = true;
    $("sendTinDebit").disabled = true;
    pendingTinDebitId ??= crypto.randomUUID();
    try {
      const sdk = window.TsnTinCreationSdk;
      if (!sdk?.sendTinDebitV1) throw new Error("Rebuild the XP browser SDK to enable TIN-Debit.");
      const connection = new sdk.Connection(`${window.location.origin}/api/tsn/rpc`, {
        commitment: "finalized", httpHeaders: { "x-trustlink-session": session.sessionId, "x-trustlink-csrf": session.csrfToken },
      });
      const result = await sdk.sendTinDebitV1({ connection, tin: identity.tin, recipientTin,
        tokenMintAddress: $("debitMint").value.trim(), amount: $("debitAmount").value.trim(),
        paymentId: pendingTinDebitId, retryState: tinDebitRetryState, identityClient: ownerIdentityClient, ownerWallet: wallet, cacheAuthorization: true,
        debitClient: { post: (path, body) => api(path.endsWith("/prepare") ? "/api/tsn/sdk/prepare-tin-debit" : "/api/tsn/sdk/submit-tin-debit", { method: "POST", body: JSON.stringify(body) }) },
        onProgress: message => { $("tinDebitResolution").hidden = false; $("tinDebitResolution").textContent = message; },
      });
      if (activeWallet !== wallet || ownerTinIdentity !== identity) throw new Error("Wallet changed; preserve the original payment ID for status recovery.");
      $("tinDebitResolution").textContent = `TIN-Debit ${result.workId} accepted. Follow its settlement status in network activity.`;
      log("TIN-DEBIT ACCEPTED", `${result.workId} / ${result.status}`);
      for (let attempt = 0; attempt < 60 && activeWallet === wallet; attempt++) {
        const work = await api(`/api/tsn/sdk/tin-debit-status?workId=${encodeURIComponent(result.workId)}`);
        $("tinDebitResolution").textContent = `TIN-Debit ${result.workId}: ${work.status}.`;
        if (reconcileTinDebitStatus(work, result.workId)) {
          if (work.status === "CONFIRMED" && ownerTinIdentity === identity) await refreshTinBalance();
          break;
        }
        if (["REJECTED", "FAILED"].includes(work.status)) {
          $("tinDebitResolution").textContent += " Preserve this payment ID for recovery; do not create a replacement.";
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error) {
      $("tinDebitResolution").hidden = false;
      $("tinDebitResolution").textContent = error instanceof Error ? error.message : "TIN-Debit could not be completed.";
    } finally {
      tinDebitInFlight = false;
      $("sendTinDebit").disabled = false;
    }
  }

  function clearTinFundingReadinessTimer() {
    if (tinFundingReadinessTimer !== undefined) clearTimeout(tinFundingReadinessTimer);
    tinFundingReadinessTimer = undefined;
  }

  function hasCurrentTinFundingReadiness(pending) {
    if (!pending?.readiness || pending.request?.senderWallet !== pending.senderWallet
        || activeWallet?.publicKey?.toBase58() !== pending.senderWallet
        || Date.parse(pending.readiness.expiresAt) <= Date.now()) return false;
    try {
      const sdk = window.TsnRecipientCreditSdk;
      sdk.assertTsnFundingReadiness(pending.readiness, pending.request, pending.workId, new sdk.PublicKey(pending.prepared.tcapProgramId));
      return true;
    } catch { return false; }
  }

  function renderTinFundingControls() {
    clearTinFundingReadinessTimer();
    const pending = pendingTinCredit, readinessCurrent = hasCurrentTinFundingReadiness(pending);
    const fundingExpired = Boolean(pending?.readiness) && Date.parse(pending.readiness.expiresAt) <= Date.now();
    const recovering = Boolean(pending?.terminalWork);
    $("payTin").disabled = tinCreditInFlight || (recovering
      ? activeWallet?.publicKey?.toBase58() !== pending.senderWallet
      : !resolvedTin || Boolean(pending?.accepted));
    $("payTin").textContent = recovering ? "Check funding outcome"
      : pending?.request && !pending.accepted ? "Retry intent authorization" : "Authorize intent";
    $("approveTinFunding").hidden = recovering || !(pending?.readiness || pending?.completion) || Boolean(pending?.attached);
    $("approveTinFunding").disabled = tinCreditInFlight || (!pending?.completion && !readinessCurrent)
      || activeWallet?.publicKey?.toBase58() !== pending?.senderWallet;
    $("approveTinFunding").textContent = pending?.completion ? "Retry funding submission"
      : fundingExpired ? "Funding approval expired" : readinessCurrent ? "Ready to approve funding" : "Funding approval unavailable";
    $("cancelTinFunding").hidden = !pending || Boolean(pending.completion) || Boolean(pending.attached);
    $("cancelTinFunding").disabled = tinCreditInFlight;
    for (const name of ["recipientTin", "tinAmount", "tinMint"]) $(name).disabled = tinCreditInFlight || Boolean(pending);
    if (!recovering && readinessCurrent && !pending.completion && !pending.attached) {
      const readiness = pending.readiness, generation = tinCreditGeneration;
      const timer = setTimeout(() => {
        if (tinFundingReadinessTimer !== timer || pending !== pendingTinCredit || generation !== tinCreditGeneration
            || pending.readiness !== readiness || pending.completion || pending.attached) return;
        tinFundingReadinessTimer = undefined;
        renderTinFundingControls();
        if (Date.parse(readiness.expiresAt) <= Date.now() && $("tinCreditResult")) {
          $("tinCreditResult").textContent = "Funding approval expired. Check the intent status or cancel this approval.";
        }
      }, Math.max(1, Math.min(2147483647, Date.parse(readiness.expiresAt) - Date.now())));
      tinFundingReadinessTimer = timer;
    }
  }

  function invalidateTinFundingApproval() {
    clearTinFundingReadinessTimer();
    tinCreditGeneration++;
    pendingTinCredit?.controller?.abort();
    if (!pendingTinCredit?.completion) pendingTinCredit = null;
    renderTinFundingControls();
  }

  async function cancelTinFundingApproval() {
    if (tinCreditInFlight || !pendingTinCredit || pendingTinCredit.completion || pendingTinCredit.attached) return;
    const pending = pendingTinCredit, generation = tinCreditGeneration;
    const current = () => pending === pendingTinCredit && generation === tinCreditGeneration
      && activeWallet?.publicKey?.toBase58() === pending.senderWallet;
    // Keep approval serialized until this cancellation settles, including wallet changes.
    tinCreditInFlight = true;
    renderTinFundingControls();
    try {
      await api("/api/tsn/sdk/cancel-tin-credit", { method: "POST", body: JSON.stringify({}) });
      if (!current() || pending.completion) return;
      invalidateTinFundingApproval();
      log("TIN FUNDING APPROVAL CANCELLED", "No funding transaction was submitted. The signed intent remains subject to its original expiry.");
    } catch (error) {
      if (current()) log("TIN FUNDING CANCELLATION BLOCKED", error.message);
    } finally { tinCreditInFlight = false; renderTinFundingControls(); }
  }

  function requireCurrentTinFunding(pending, generation) {
    if (pending !== pendingTinCredit || generation !== tinCreditGeneration
        || activeWallet?.publicKey?.toBase58() !== pending.senderWallet) throw new Error("The funding approval session changed.");
  }

  async function recoverTinCredit() {
    if (tinCreditInFlight || !pendingTinCredit?.terminalWork) return;
    const pending = pendingTinCredit, generation = tinCreditGeneration;
    tinCreditInFlight = true;
    renderTinFundingControls();
    try {
      requireWallet(); requireNetwork(); requireCurrentTinFunding(pending, generation);
      $("tinCreditResult").textContent = "Checking the original funding outcome. Keep this window open; wallet approval is paused.";
      const outcome = await api("/api/tsn/sdk/recover-tin-credit", { method: "POST", body: JSON.stringify({ operationId: pending.workId }) });
      requireCurrentTinFunding(pending, generation);
      if (["NONEXECUTION_CONFIRMED", "UNSIGNED_INTENT_RELEASED", "CREDIT_CONFIRMED"].includes(outcome.status)) {
        clearTinFundingReadinessTimer();
        pending.controller.abort();
        pendingTinCredit = null;
        tinCreditGeneration++;
        $("tinCreditResult").textContent = outcome.status === "CREDIT_CONFIRMED"
          ? "The original credit is confirmed. You can authorize another intent."
          : "The original attempt is cleared for a fresh authorization. Review the recipient and amount, then select Authorize intent.";
        log("TIN FUNDING OUTCOME CHECKED", `${outcome.reason ?? outcome.status} The original intent and signed attempt remain recorded.`);
      } else {
        $("tinCreditResult").textContent = outcome.status === "FUNDING_OBSERVED"
          ? "The original funding signature was found. Reconcile that work before approving another deposit."
          : outcome.reason ?? "The funding outcome remains uncertain. Keep the original attempt and check again.";
        log("TIN FUNDING RECOVERY WAITING", outcome.reason ?? outcome.status);
      }
    } catch (error) {
      if (pending === pendingTinCredit && generation === tinCreditGeneration
          && activeWallet?.publicKey?.toBase58() === pending.senderWallet) {
        $("tinCreditResult").textContent = "The outcome check could not finish. Keep the original attempt and check again.";
        log("TIN FUNDING RECOVERY WAITING", error instanceof Error ? error.message : String(error));
      }
    } finally { tinCreditInFlight = false; renderTinFundingControls(); }
  }

  async function payTin() {
    if (pendingTinCredit?.terminalWork) { await recoverTinCredit(); return; }
    if (tinCreditInFlight || pendingTinCredit?.accepted) return;
    let stage = "validating sender and recipient";
    tinCreditInFlight = true;
    renderTinFundingControls();
    try {
      requireWallet(); requireNetwork();
      const sdk = window.TsnRecipientCreditSdk;
      if (!sdk?.createFundingNoteV1 || !sdk?.waitForTsnFundingReadiness) throw new Error("The browser SDK is missing staged funding authorization.");
      let pending = pendingTinCredit;
      if (!pending?.request) {
        const recipientTin = $("recipientTin").value.trim();
        if (!resolvedTin || resolvedTin.tin !== recipientTin) throw new Error("Resolve the TIN and review its identity before continuing.");
        if (!/^[a-f0-9]{64}$/i.test(resolvedTin.ownerPubkeyHash ?? "")) throw new Error("SDK did not return a valid recipient owner hash.");
        const amount = String($("tinAmount").value ?? "").trim(), mint = String($("tinMint").value ?? "").trim();
        if (!/^\d+(?:\.\d{1,9})?$/.test(amount) || Number(amount) <= 0 || !mint) throw new Error("Enter a positive amount and registered token mint.");
        if (typeof activeWallet.signTransaction !== "function") throw new Error("The connected wallet must support transaction signing.");
        stage = "reading the registered token metadata for review";
        const prepared = await api("/api/tsn/sdk/prepare-tin-credit", { method: "POST", body: JSON.stringify({ recipientTin, tokenMintAddress: mint, amount }) });
        const senderWallet = activeWallet.publicKey.toBase58();
        const fundingNote = sdk.createFundingNoteV1();
        pending = { senderWallet, prepared, amount, paymentId: crypto.randomUUID(), controller: new AbortController() };
        pendingTinCredit = pending;
        const generation = ++tinCreditGeneration;
        renderTinFundingControls();
        stage = "requesting the sender's canonical intent authorization";
        const authorization = sdk.createPaymentAuthorization({ senderWallet, senderIdentity: senderWallet, receiverIdentity: `tin:${recipientTin}`,
          recipientDisplayName: resolvedTin.displayName, recipientDisplayNameSource: resolvedTin.displayNameSource,
          recipientVerifiedCredentials: resolvedTin.verifiedCredentials, tokenMintAddress: prepared.tokenMintAddress,
          amount, senderFeeAmount: "0", totalTokenRequiredUi: Number(amount), tokenDecimals: prepared.decimals,
          fundingMode: "tcap_funded_note_v1", fundingNoteCommitment: fundingNote.commitment });
        if (authorization.amountBaseUnits !== prepared.amountBaseUnits) throw new Error("The SDK amount differs from the registered token amount.");
        const senderAuthorizationSignature = await sign(authorization.message);
        requireCurrentTinFunding(pending, generation);
        pending.request = sdk.buildPaymentAuthorizationIntentRequest({ paymentId: pending.paymentId,
          recipientHash: resolvedTin.ownerPubkeyHash.toLowerCase(), recipientTin, tokenMintAddress: prepared.tokenMintAddress,
          tokenDecimals: prepared.decimals, senderWallet, senderAuthorizationMessage: authorization.message, senderAuthorizationSignature,
          senderAuthorizationNonce: authorization.nonce, senderAuthorizationIssuedAt: authorization.issuedAt,
          senderAuthorizationExpiresAt: authorization.expiresAt, senderFeeAmount: "0", senderFundingMode: "tcap_funded_note_v1",
          fundingNote, amount, source: "TSN XP" });
      }
      const generation = tinCreditGeneration;
      requireCurrentTinFunding(pending, generation);
      stage = "submitting intent authorization to Receiver";
      const accepted = await api("/api/tsn/sdk/submit-tin-credit", { method: "POST", body: JSON.stringify({ request: pending.request }) });
      requireCurrentTinFunding(pending, generation);
      pending.workId = accepted.id ?? pending.paymentId;
      pending.accepted = true;
      let output = $("tinCreditResult");
      if (!output) { output = document.createElement("div"); output.id = "tinCreditResult"; output.className = "notice";
        output.style.marginTop = "12px"; $("tinResolution").after(output); }
      output.textContent = `Receiver accepted intent ${pending.workId}. TSN Node is checking authorization before funding approval.`;
      log("TIN INTENT RECEIVER ACCEPTED", `Intent ${pending.workId}; funding has not been approved or submitted.`);
      void watchTinFundingAuthorization(pending, generation);
    } catch (error) {
      log("TIN CREDIT BLOCKED", `${stage}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { tinCreditInFlight = false; renderTinFundingControls(); }
  }

  async function watchTinFundingAuthorization(pending, generation) {
    try {
      const sdk = window.TsnRecipientCreditSdk;
      const status = await sdk.waitForTsnFundingReadiness({ workId: pending.workId, signal: pending.controller.signal,
        getStatus: async () => {
          const work = await api(`/api/tsn/sdk/tin-credit-status?operationId=${encodeURIComponent(pending.workId)}`);
          requireCurrentTinFunding(pending, generation);
          if (["FAILED", "REJECTED"].includes(work.status)) { pending.terminalWork = work; renderTinFundingControls(); }
          return work;
        } });
      requireCurrentTinFunding(pending, generation);
      const ready = await api("/api/tsn/sdk/prepare-tin-credit-funding", { method: "POST", body: JSON.stringify({ operationId: pending.workId }) });
      requireCurrentTinFunding(pending, generation);
      const checked = sdk.assertTsnFundingReadiness(ready, pending.request, pending.workId, new sdk.PublicKey(pending.prepared.tcapProgramId));
      if (checked.stateVersion !== status.stateVersion || checked.authorizationPayloadCommitment !== status.fundingReadiness.authorizationPayloadCommitment) {
        throw new Error("Node readiness changed while preparing funding approval.");
      }
      pending.readiness = checked;
      renderTinFundingControls();
      $("tinCreditResult").textContent = `Intent ${pending.workId} is ready. Approve the funding transaction when you are ready.`;
      log("TIN FUNDING READY", `Node checked intent ${pending.workId}. Use Ready to approve funding for the wallet transaction.`);
    } catch (error) {
      if (pending !== pendingTinCredit || generation !== tinCreditGeneration || pending.controller.signal.aborted
          || activeWallet?.publicKey?.toBase58() !== pending.senderWallet) return;
      if (pending.terminalWork) {
        $("tinCreditResult").textContent = `Intent ${pending.workId} was rejected. Select Check funding outcome to review it before a fresh authorization.`;
        log("TIN AUTHORIZATION ENDED", error instanceof Error ? error.message : String(error));
        return;
      }
      if (!/AUTHORIZATION_ENDED|DIFFERS_FROM_AUTHORIZATION|OPERATION_MISMATCH/.test(String(error.message))
          && Date.parse(pending.request.senderAuthorizationExpiresAt) > Date.now()) {
        if (!pending.watchRetryLogged) log("TIN AUTHORIZATION WAITING", error instanceof Error ? error.message : String(error));
        pending.watchRetryLogged = true;
        setTimeout(() => { if (pending === pendingTinCredit && !pending.controller.signal.aborted) void watchTinFundingAuthorization(pending, generation); }, 1000);
        return;
      }
      log("TIN AUTHORIZATION WAITING", error instanceof Error ? error.message : String(error));
      if ($("tinCreditResult")) $("tinCreditResult").textContent = "Funding approval is unavailable. Check the intent status or cancel this approval.";
    }
  }

  async function approveTinFunding() {
    if (tinCreditInFlight || !pendingTinCredit || pendingTinCredit.attached || pendingTinCredit.terminalWork) return;
    if (!pendingTinCredit.completion && !hasCurrentTinFundingReadiness(pendingTinCredit)) { renderTinFundingControls(); return; }
    const pending = pendingTinCredit, generation = tinCreditGeneration;
    let stage = "checking the ready intent";
    tinCreditInFlight = true; renderTinFundingControls();
    try {
      requireWallet(); requireNetwork(); requireCurrentTinFunding(pending, generation);
      const sdk = window.TsnRecipientCreditSdk;
      if (!pending.completion) {
        const ready = await api("/api/tsn/sdk/prepare-tin-credit-funding", { method: "POST", body: JSON.stringify({ operationId: pending.workId }) });
        requireCurrentTinFunding(pending, generation);
        pending.readiness = sdk.assertTsnFundingReadiness(ready, pending.request, pending.workId, new sdk.PublicKey(pending.prepared.tcapProgramId));
        renderTinFundingControls();
        stage = "issuing a fresh blockhash for funding approval";
        const latest = await api("/api/tsn/sdk/refresh-tin-credit-blockhash", { method: "POST", body: JSON.stringify({ operationId: pending.workId,
          expectedStateVersion: pending.readiness.stateVersion, authorizationPayloadCommitment: pending.readiness.authorizationPayloadCommitment }) });
        requireCurrentTinFunding(pending, generation);
        const context = sdk.assertSenderFundingBlockhashContext({ blockhash: latest.recentBlockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight, contextSlot: latest.contextSlot });
        const accounts = Object.fromEntries(Object.entries(pending.readiness.depositAccounts).map(([name, value]) => [name, new sdk.PublicKey(value)]));
        const transaction = sdk.buildTcapGpruWalletDepositTransaction({ accounts, amountBaseUnits: BigInt(pending.readiness.amountBaseUnits),
          fundingNoteCommitment: pending.request.fundingNote.commitment });
        transaction.recentBlockhash = context.blockhash;
        transaction.lastValidBlockHeight = context.lastValidBlockHeight;
        stage = "requesting the sender's funding transaction approval";
        const signed = await activeWallet.signTransaction(transaction);
        requireCurrentTinFunding(pending, generation);
        pending.completion = sdk.buildCompleteTsnFundingRequest({ request: pending.request, readiness: pending.readiness, workId: pending.workId,
          senderFundingDepositTxB64: encodeBase64(signed.serialize()), senderFundingBlockhashContext: context,
          tcapProgramId: new sdk.PublicKey(pending.prepared.tcapProgramId) });
        clearTinFundingReadinessTimer();
      }
      stage = "attaching the approved funding to the same intent";
      await api("/api/tsn/sdk/complete-tin-credit", { method: "POST", body: JSON.stringify({ completion: pending.completion }) });
      requireCurrentTinFunding(pending, generation);
      pending.attached = true;
      clearTinFundingReadinessTimer();
      $("tinCreditResult").textContent = `Funding approval attached to intent ${pending.workId}. Node final validation and Cranker submission are pending.`;
      log("TIN FUNDING APPROVAL ATTACHED", `Intent ${pending.workId}; the original message and private note are preserved.`);
      void watchTinCredit(pending.workId);
    } catch (error) { log("TIN FUNDING APPROVAL BLOCKED", `${stage}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { tinCreditInFlight = false; renderTinFundingControls(); }
  }

  async function watchTinCredit(operationId) {
    const pending = pendingTinCredit, generation = tinCreditGeneration;
    const current = () => pending && pending === pendingTinCredit && generation === tinCreditGeneration
      && pending.workId === operationId && activeWallet?.publicKey?.toBase58() === pending.senderWallet;
    let lastStatus = "";
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      if (!current()) return;
      try {
        const work = await api(`/api/tsn/sdk/tin-credit-status?operationId=${encodeURIComponent(operationId)}`);
        if (!current()) return;
        const fundingStatus = String(work.status ?? "UNKNOWN").toUpperCase();
        const creditStatus = String(work.settlement?.status ?? "WAITING_FOR_FUNDING").toUpperCase();
        const fundingReason = String(work.nodeDecisionReason ?? "").trim();
        const settlementReason = String(work.settlement?.nodeDecisionReason ?? "").trim();
        const progress = `${fundingStatus}/${creditStatus}/${fundingReason}/${settlementReason}`;
        if (progress !== lastStatus) {
          lastStatus = progress;
          if (fundingStatus === "REJECTED") {
            log("TIN CREDIT NODE REJECTED", `TSN Node rejected reserve funding${fundingReason ? `: ${fundingReason}` : "."} Settlement work remains ${creditStatus}.`);
          } else if (fundingStatus === "FAILED") {
            log("TIN CREDIT FUNDING FAILED", "Cranker could not complete reserve funding. Check its RPC/submission result and the original transaction signature before retrying. Settlement has not executed.");
          } else if (creditStatus === "REJECTED") {
            log("TIN CREDIT SETTLEMENT REJECTED", `TSN Node rejected TIN credit settlement${settlementReason ? `: ${settlementReason}` : "."} Reserve funding is ${fundingStatus}.`);
          } else if (creditStatus === "FAILED") {
            log("TIN CREDIT SETTLEMENT FAILED", `Receiver reports TIN credit settlement FAILED${settlementReason ? `: ${settlementReason}` : "."} Reserve funding is ${fundingStatus}. Check the saved submission result before retrying.`);
          } else if (fundingStatus === "NODE_VERIFYING") {
            log("TIN CREDIT NODE VERIFYING", `Receiver accepted the intent; TSN Node verification is in progress. Settlement work is ${creditStatus}.`);
          } else if (creditStatus === "CONFIRMED") {
            log("TIN CREDIT SETTLED", `GPRU credit finalized / Solana ${work.settlement?.result?.signature ?? "confirmed"}`);
            if (ownerTinIdentity) void refreshTinBalance();
          } else if (creditStatus === "RECEIVED") {
            log("TIN CREDIT SETTLEMENT WAITING", `Receiver has settlement work in ${creditStatus}; it has not executed. Reserve funding is ${fundingStatus}.`);
          } else {
            log("TIN CREDIT STATUS", `Reserve funding is ${fundingStatus}; settlement work is ${creditStatus}.`);
          }
        }
        if (creditStatus === "CONFIRMED" || ["FAILED", "REJECTED"].includes(fundingStatus) || ["FAILED", "REJECTED"].includes(creditStatus)) {
          const output = $("tinCreditResult");
          if (output) output.textContent = creditStatus === "CONFIRMED"
            ? `TIN credit ${operationId} confirmed${work.settlement?.result?.signature ? ` on Solana: ${work.settlement.result.signature}` : ""}.`
            : fundingStatus === "REJECTED"
              ? `TSN Node rejected reserve funding for ${operationId}${fundingReason ? `: ${fundingReason}` : "."} Settlement work is ${creditStatus} and has not executed.`
              : `TIN credit ${operationId} ended with reserve funding ${fundingStatus} and settlement ${creditStatus}${settlementReason ? `: ${settlementReason}` : "."}`;
          if (creditStatus === "CONFIRMED") {
            clearTinFundingReadinessTimer();
            pendingTinCredit.controller.abort();
            pendingTinCredit = null;
            tinCreditGeneration++;
            renderTinFundingControls();
          } else {
            pending.terminalWork = work;
            renderTinFundingControls();
            if (output) output.textContent += " Select Check funding outcome to review the original attempt before retrying.";
          }
          return;
        }
      } catch (error) {
        if (!current()) return;
        if (attempt === 0) log("TIN CREDIT STATUS WAITING", error instanceof Error ? error.message : String(error));
      }
    }
    if (current()) log("TIN CREDIT STATUS PENDING", `Check Receiver work ${operationId} for its latest Node and Cranker state.`);
  }

  async function buildWalletTransfer() {
    try {
      requireWallet();
      requireNetwork();
      const transfer = await api("/api/tsn/sdk/build-wallet-transfer", { method: "POST", body: JSON.stringify({ recipientWallet: $("walletRecipient").value.trim(), tokenMintAddress: $("walletMint").value.trim(), amountUi: $("walletAmount").value, tokenDecimals: 6 }) });
      log("SDK buildTsnSplTokenTransferTransaction", transfer.status ?? "Unsigned transfer ready");
    } catch (error) { log("WALLET TRANSFER BLOCKED", error.message); }
  }

  document.querySelectorAll('[role="tab"]').forEach((tab) => { tab.onclick = () => selectTab(tab.id); });
  document.querySelectorAll('.tab-panel:not(#panel-status)').forEach((panel) => {
    if (panel.querySelector('.modal-close')) return;
    const close = document.createElement('button');
    close.className = 'modal-close';
    close.type = 'button';
    close.textContent = 'Back';
    close.onclick = () => selectTab('tab-status');
    panel.prepend(close);
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => { button.onclick = () => selectTab('tab-status'); });
  document.querySelectorAll("[data-open-tab]").forEach((button) => {
    button.onclick = () => selectTab(button.dataset.openTab);
  });
  $("issueTinAction").onclick = () => selectTab("tab-create-tin");
  const closeMenu = () => {
    document.body.classList.remove("menu-open");
    $("menuToggle").setAttribute("aria-expanded", "false");
    $("menuToggle").textContent = "☰";
  };
  $("menuToggle").onclick = () => {
    const open = document.body.classList.toggle("menu-open");
    $("menuToggle").setAttribute("aria-expanded", String(open));
    $("menuToggle").textContent = open ? "×" : "☰";
  };
  $("menuClose").onclick = closeMenu;
  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("menu-open")) return;
    if (!$("menuToggle").contains(event.target) && !document.querySelector(".tabs").contains(event.target)) closeMenu();
  });
  document.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", () => {
    closeMenu();
  }));
  $("headerConnectWallet").onclick = connectWallet;
  window.addEventListener("focus", () => {
    if (activeWallet && activeWallet.isConnected === false) handleWalletDisconnect(activeWallet);
  });
  $("refreshStatus").onclick = syncNetworkStatus;
  $("refreshTinBalance").onclick = refreshTinBalance;
  $("resolveTin").onclick = resolveTinForReview;
  $("recipientTin").addEventListener("input", () => {
    resolvedTin = null;
    $("payTin").disabled = true;
    $("tinResolution").hidden = true;
  });
  $("payTin").onclick = payTin;
  $("resolveTinDebit").onclick = () => resolveTinForReview("debit");
  $("debitRecipientTin").addEventListener("input", () => {
    resolvedDebitTin = null;
    if (!pendingTinDebitId) $("tinDebitResolution").hidden = true;
  });
  $("sendTinDebit").onclick = sendTinDebit;
  $("approveTinFunding").onclick = approveTinFunding;
  $("cancelTinFunding").onclick = cancelTinFundingApproval;
  $("buildWalletTransfer").onclick = buildWalletTransfer;
  configureCurrentTinPath();
  document.querySelectorAll('.tab-panel:not(#panel-status)').forEach((panel) => {
    if (panel.querySelector('.modal-close')) return;
    const close = document.createElement('button');
    close.className = 'modal-close';
    close.type = 'button';
    close.textContent = 'Back';
    close.onclick = () => selectTab('tab-status');
    panel.prepend(close);
  });
  $("prepareTinIdentity").onclick = prepareTinIdentity;
  $("clearActivity").onclick = () => { events.splice(0); $("activity").innerHTML = '<div class="event"><time>CLEAR</time><span>Activity cleared.</span></div>'; $("log").textContent = "Activity cleared."; };
  const [walletName] = walletCandidate();
  if (walletName && $("walletKey")) $("walletKey").textContent = `${walletName} detected. Connect when ready.`;
  log("READY", walletName ? `${walletName} detected` : "No browser wallet detected");
  let statusInFlight = false;
  async function syncNetworkStatus() {
    if (statusInFlight) return;
    statusInFlight = true;
    try { await refreshStatus(); } finally { statusInFlight = false; }
  }
  syncNetworkStatus();
})();
