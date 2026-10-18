(() => {
  let session;
  let resolvedTin;
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
      setWalletConnectedView(true);
      if (typeof wallet.on === "function") wallet.on("disconnect", () => handleWalletDisconnect(wallet));
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
    log("TIN RECOVERED", `Wallet-authorized recovery / TIN ${identity.tin}${displayName ? ` · ${displayName}` : ""}`);
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

  async function resolveTinForReview() {
    const tin = $("recipientTin").value.trim();
    const result = $("tinResolution");
    resolvedTin = null;
    $("payTin").disabled = true;
    result.hidden = false;
    result.textContent = "Resolving the TIN display name through TSN Node…";
    try {
      requireNetwork();
      const identity = await api("/api/tsn/sdk/resolve-tin", { method: "POST", body: JSON.stringify({ tin }) });
      resolvedTin = identity;
      result.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = identity.displayName || "No display name provided";
      const detail = document.createElement("p");
      detail.textContent = "Display name supplied by the TIN owner. No government identity attestation is attached.";
      const match = document.createElement("small");
      match.textContent = `Resolved TIN ${identity.tin}`;
      result.append(heading, detail, match);
      $("payTin").disabled = false;
      log("TSN Node resolve TIN", `TIN ${tin} / ${identity.displayName || "no display name"} / owner-provided name`);
    } catch (error) {
      result.textContent = `TIN could not be resolved: ${error.message}`;
      log("TIN RESOLUTION BLOCKED", error.message);
    }
  }

  async function payTin() {
    let stage = "validating sender and recipient";
    try {
      requireWallet();
      requireNetwork();
      const recipientTin = $("recipientTin").value.trim();
      if (!resolvedTin || resolvedTin.tin !== recipientTin) throw new Error("Resolve the TIN and review its identity before continuing.");
      if (!/^[a-f0-9]{64}$/i.test(resolvedTin.ownerPubkeyHash ?? "")) throw new Error("Node did not return a valid recipient owner hash.");
      const amount = String($("tinAmount").value ?? "").trim();
      const mint = String($("tinMint").value ?? "").trim();
      if (!/^\d+(?:\.\d{1,9})?$/.test(amount) || Number(amount) <= 0) throw new Error("Enter a positive amount with a supported token precision.");
      if (!mint) throw new Error("Enter a token mint registered and enabled in the TCAP asset registry.");
      if (typeof activeWallet.signTransaction !== "function") throw new Error("The connected wallet must support transaction signing.");
      const sdk = window.TsnRecipientCreditSdk;
      if (!sdk?.buildTcapGpruWalletDepositTransaction) throw new Error("The browser TSN SDK bundle is missing the reserve deposit builder.");

      stage = "checking the TCAP reserve and sender wallet token balance";
      const prepared = await api("/api/tsn/sdk/prepare-tin-credit", {
        method: "POST", body: JSON.stringify({ recipientTin, tokenMintAddress: mint, amount }),
      });
      const amountBaseUnits = BigInt(prepared.amountBaseUnits);
      stage = "building the wallet-authorized TCAP reserve deposit";
      const key = (value) => new sdk.PublicKey(value);
      const accounts = Object.fromEntries(Object.entries(prepared.depositAccounts).map(([name, value]) => [name, key(value)]));
      const transaction = sdk.buildTcapGpruWalletDepositTransaction({
        accounts,
        amountBaseUnits,
      });
      transaction.recentBlockhash = prepared.recentBlockhash;
      transaction.lastValidBlockHeight = prepared.lastValidBlockHeight;

      stage = "requesting the sender's amount authorization";
      const authorization = sdk.createPaymentAuthorization({
        senderWallet: activeWallet.publicKey.toBase58(),
        senderIdentity: activeWallet.publicKey.toBase58(),
        receiverIdentity: `tin:${recipientTin}`,
        recipientDisplayName: resolvedTin.displayName,
        recipientDisplayNameSource: resolvedTin.displayNameSource,
        recipientVerifiedCredentials: resolvedTin.verifiedCredentials,
        tokenMintAddress: prepared.depositAccounts.mint,
        amount,
        senderFeeAmount: "0",
        totalTokenRequiredUi: amount,
        tokenDecimals: prepared.decimals,
        fundingMode: "tcap_deposit_v2",
      });
      if (authorization.amountBaseUnits !== amountBaseUnits.toString()) {
        throw new Error("The SDK amount does not match the TCAP registry amount; review the token and amount before signing.");
      }
      const senderAuthorizationSignature = await sign(authorization.message);

      stage = "requesting the sender's TCAP deposit transaction signature";
      const signedTransaction = await activeWallet.signTransaction(transaction);
      const senderSignedFundingTransaction = encodeBase64(signedTransaction.serialize());
      const paymentId = crypto.randomUUID();
      const request = sdk.buildPaymentAuthorizationIntentRequest({
        paymentId,
        recipientHash: resolvedTin.ownerPubkeyHash.toLowerCase(),
        recipientTin,
        tokenMintAddress: prepared.depositAccounts.mint,
        tokenDecimals: prepared.decimals,
        senderWallet: activeWallet.publicKey.toBase58(),
        senderAuthorizationMessage: authorization.message,
        senderAuthorizationSignature,
        senderAuthorizationNonce: authorization.nonce,
        senderAuthorizationIssuedAt: authorization.issuedAt,
        senderAuthorizationExpiresAt: authorization.expiresAt,
        senderFeeAmount: "0",
        senderSignedFundingTransaction,
        senderFundingMode: "tcap_deposit_v2",
        amount,
        source: "TSN XP",
      });
      stage = "validating the signed intent before Receiver ingress";
      const accepted = await api("/api/tsn/sdk/submit-tin-credit", { method: "POST", body: JSON.stringify({ request }) });
      const output = document.createElement("div");
      output.id = "tinCreditResult";
      output.className = "notice";
      output.style.marginTop = "12px";
      output.textContent = `Receiver accepted intent ${accepted.id ?? paymentId}. TSN Node verification is pending.`;
      $("tinResolution").after(output);
      log("SDK depositToTinCredit", `TIN ${recipientTin} / ${amount} / ${prepared.depositAccounts.mint} / wallet authorized`);
      log("TIN CREDIT RECEIVER ACCEPTED", `Receiver accepted ${accepted.id ?? paymentId}; TSN Node verification is pending.`);
      void watchTinCredit(accepted.id ?? paymentId);
    } catch (error) {
      log("TIN CREDIT BLOCKED", `${stage}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function watchTinCredit(operationId) {
    let lastStatus = "";
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        const work = await api(`/api/tsn/sdk/tin-credit-status?operationId=${encodeURIComponent(operationId)}`);
        const fundingStatus = String(work.status ?? "UNKNOWN").toUpperCase();
        const creditStatus = String(work.settlement?.status ?? "WAITING_FOR_FUNDING").toUpperCase();
        const nodeReason = String(work.nodeDecisionReason ?? "").trim();
        const progress = `${fundingStatus}/${creditStatus}/${nodeReason}`;
        if (progress !== lastStatus) {
          lastStatus = progress;
          if (fundingStatus === "REJECTED") {
            log("TIN CREDIT NODE REJECTED", `TSN Node rejected reserve funding${nodeReason ? `: ${nodeReason}` : "."} Settlement work remains ${creditStatus}.`);
          } else if (fundingStatus === "NODE_VERIFYING") {
            log("TIN CREDIT NODE VERIFYING", `Receiver accepted the intent; TSN Node verification is in progress. Settlement work is ${creditStatus}.`);
          } else if (creditStatus === "CONFIRMED") {
            log("TIN CREDIT SETTLED", `GPRU credit finalized / Solana ${work.settlement?.result?.signature ?? "confirmed"}`);
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
              ? `TSN Node rejected reserve funding for ${operationId}${nodeReason ? `: ${nodeReason}` : "."} Settlement work is ${creditStatus} and has not executed.`
              : `TIN credit ${operationId} ended with reserve funding ${fundingStatus} and settlement ${creditStatus}.`;
          return;
        }
      } catch (error) {
        if (attempt === 0) log("TIN CREDIT STATUS WAITING", error instanceof Error ? error.message : String(error));
      }
    }
    log("TIN CREDIT STATUS PENDING", `Check Receiver work ${operationId} for its latest Node and Cranker state.`);
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
  $("resolveTin").onclick = resolveTinForReview;
  $("recipientTin").addEventListener("input", () => {
    resolvedTin = null;
    $("payTin").disabled = true;
    $("tinResolution").hidden = true;
  });
  $("payTin").onclick = payTin;
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
