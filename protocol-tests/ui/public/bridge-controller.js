(() => {
  let bridgeSession = null;
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json", ...(bridgeSession ? { "x-trustlink-session": bridgeSession.sessionId, "x-trustlink-csrf": bridgeSession.csrfToken } : {}), ...(options.headers ?? {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? body.status ?? `HTTP_${response.status}`);
    return body;
  };

  function addBridgeGroup() {
    const scroll = document.querySelector(".left .scroll");
    if (!scroll || document.querySelector("#creditBridgeGroup")) return;
    const group = document.createElement("div");
    group.id = "creditBridgeGroup";
    group.className = "group";
    group.innerHTML = '<b>TSN → TCAP Credit Bridge</b><p class="small">ConfidentialSettlement authorization path</p><button onclick="startCreditBridge()">Start bridge test</button>';
    scroll.prepend(group);
    for (const item of scroll.querySelectorAll(".group")) {
      item.addEventListener("click", () => {
        for (const other of scroll.querySelectorAll(".group")) other.classList.remove("active");
        item.classList.add("active");
        if (item.id !== "creditBridgeGroup" && item.querySelector("button")?.getAttribute("onclick")?.includes("startFunding")) window.startFunding?.();
        if (item.id !== "creditBridgeGroup" && !item.querySelector("button")) {
          document.querySelector("#session").textContent = `Session: ${item.querySelector("b")?.textContent ?? "Test group"}`;
          document.querySelector("#scene").innerHTML = `<h2>${item.querySelector("b")?.textContent ?? "Test group"}</h2><p class="small">This test group is not wired for live submission yet.</p>`;
        }
      });
    }
  }

  window.startCreditBridge = async () => {
    const scene = document.querySelector("#scene");
    document.querySelector("#creditBridgeGroup")?.classList.add("active");
    for (const other of document.querySelectorAll(".left .group")) if (other.id !== "creditBridgeGroup") other.classList.remove("active");
    document.querySelector("#session").textContent = "Session: TSN → TCAP Credit Bridge";
    scene.innerHTML = '<h2>TSN → TCAP Credit Bridge</h2><p class="small">This panel performs a read-only Devnet account and authorization preflight. It does not submit funding, acceptance, settlement, or credit transactions.</p><div class="card"><h3>Safety gate</h3><p>Live submission is not exposed by this panel. The preflight reports real account ownership and missing ConfidentialSettlement fields.</p><button id="bridgeFixture">Load Devnet fixture wallet</button> <button id="bridgePreflight">Run bridge preflight</button><pre id="bridgeResult"></pre></div>';
    document.querySelector("#bridgeFixture").onclick = async () => {
      const output = document.querySelector("#bridgeResult");
      output.textContent = "Loading checked-in Devnet fixture wallet…";
      try {
        bridgeSession = window.trustlinkLabSession ?? await api("/api/session", { method: "POST", body: "{}" });
        window.trustlinkLabSession = bridgeSession;
        const wallet = await api("/api/session/wallet/fixture", { method: "POST", body: "{}" });
        output.textContent = JSON.stringify({ status: "WALLET_LOADED", walletPublicKey: wallet.publicKey, walletType: wallet.type }, null, 2);
      } catch (error) { output.textContent = `BLOCKED: ${error.message}`; }
    };
    document.querySelector("#bridgePreflight").onclick = async () => {
      const output = document.querySelector("#bridgeResult");
      output.textContent = "Checking Devnet accounts and authorization inputs…";
      try {
        bridgeSession = bridgeSession ?? window.trustlinkLabSession ?? await api("/api/session", { method: "POST", body: "{}" });
        window.trustlinkLabSession = bridgeSession;
        const result = await api("/api/tcap/credit/preflight", { method: "POST", body: "{}" });
        output.textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        const wallet = window.trustlinkLabWallet;
        output.textContent = wallet?.publicKey
          ? `BLOCKED: ${error.message}\nWallet connected: ${wallet.publicKey}\nThis is an account/authorization preflight block, not a wallet-detection failure.`
          : `BLOCKED: ${error.message}\nLoad the Devnet fixture wallet or connect a browser wallet first.`;
      }
    };
  };

  addBridgeGroup();
})();
