import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function writeJson(runDir, name, value) {
  await fs.writeFile(path.join(runDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeRunReport(runDir, report) {
  await writeJson(runDir, "run-summary.json", report.summary);
  await writeJson(runDir, "environment.json", report.environment);
  await writeJson(runDir, "scenario-status.json", report.scenarios);
  await writeJson(runDir, "full-timeline.json", report.timeline);
  await writeJson(runDir, "program-interactions.json", report.programInteractions);
  await writeJson(runDir, "account-interactions.json", report.accountInteractions);
  await writeJson(runDir, "token-movements.json", report.tokenMovements);
  await writeJson(runDir, "state-transitions.json", report.stateTransitions);
  await writeJson(runDir, "public-private-classification.json", report.classification);
  await writeJson(runDir, "intent-settlement-comparison.json", { status: "NOT_IMPLEMENTED", reason: "No TSN settlement instruction exists in the current phase" });
  await writeJson(runDir, "privacy-linkage.json", report.privacyLinkage);
  await writeJson(runDir, "invariant-results.json", report.invariants);
  await writeJson(runDir, "errors.json", report.errors);
  await writeJson(runDir, "sanitized-evidence.json", report.sanitizedEvidence ?? {});
  await writeJson(runDir, "ai-review.json", report.aiReviewJson ?? { status: "AI_REVIEW_UNAVAILABLE", advisoryOnly: true });
  await writeJson(runDir, "ai-conversation.json", report.aiConversation ?? []);
  await writeJson(runDir, "scenes.json", report.timeline);
  await writeJson(runDir, "claude-commentary.json", { status: report.aiReviewJson?.status ?? "UNKNOWN", commentary: report.aiExecutiveSummary ?? report.aiReview });
  await writeJson(runDir, "commitment-debug.json", { status: report.summary.status, note: "Field-level commitment comparison is emitted only from deterministic executor evidence; no secrets are exposed." });
  await writeJson(runDir, "ui-state.json", { status: report.summary.status, currentScene: report.timeline.at(-1)?.step ?? null, generatedAt: report.summary.generatedAt });
  await writeJson(runDir, "playback-data.json", { summary: report.summary, timeline: report.timeline, scenarios: report.scenarios, tokenMovements: report.tokenMovements, errors: report.errors });
  await fs.writeFile(path.join(runDir, "full-timeline.md"), report.timeline.map((x) => `- ${x.step}: ${x.status}`).join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(runDir, "ai-review.md"), report.aiReview, "utf8");
  await fs.writeFile(path.join(runDir, "ai-executive-summary.md"), report.aiExecutiveSummary ?? report.aiReview, "utf8");
  const playbackEvents = report.timeline.map((event) => JSON.stringify(event)).join(",");
  await fs.writeFile(path.join(runDir, "playback.html"), `<!doctype html><meta charset="utf-8"><title>TrustLink Protocol Playback</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#07101d;color:#e8f0fb;font:13px system-ui}main{height:100%;display:grid;grid-template-columns:22% 53% 25%;gap:8px;padding:8px;box-sizing:border-box}.p{min-height:0;overflow:auto;background:#0d192a;border:1px solid #223650;border-radius:8px;padding:10px}.scene{padding:9px;margin:6px 0;background:#111f33;border-left:3px solid #75aefc;border-radius:6px}.failed{border-color:#ff7182}.muted{color:#8fa4bd}button{background:#172a43;color:#fff;border:1px solid #223650;border-radius:5px;padding:5px 9px}</style><main><section class="p"><b>PROCESS</b><div id="list"></div></section><section class="p"><h2 id="title"></h2><div id="body"></div><button onclick="prev()">Previous</button> <button onclick="next()">Next</button> <button onclick="play()">Play</button></section><section class="p"><b>EVIDENCE</b><pre id="raw"></pre></section></main><script>const E=[${playbackEvents}],L=document.querySelector('#list'),T=document.querySelector('#title'),B=document.querySelector('#body'),R=document.querySelector('#raw');let i=0,timer;function draw(){const e=E[i]||{};T.textContent=e.title||e.step||e.type||'Run';B.innerHTML='<div class="scene '+(e.status==='FAILED'?'failed':'')+'"><b>'+String(e.status||'UNKNOWN')+'</b><p>'+(e.explanation||e.reason||e.error?.message||'')+'</p><p class="muted">No unconfirmed movement is shown as real.</p></div>';R.textContent=JSON.stringify(e,null,2);L.innerHTML=E.map((x,n)=>'<div class="scene '+(n===i?'active ':'')+(x.status==='FAILED'?'failed':'')+'" onclick="i='+n+';draw()">'+String(n+1).padStart(2,'0')+' '+(x.title||x.step||x.type||'event')+'</div>').join('')}function prev(){i=Math.max(0,i-1);draw()}function next(){i=Math.min(E.length-1,i+1);draw()}function play(){clearInterval(timer);timer=setInterval(()=>{if(i>=E.length-1)return clearInterval(timer);next()},900)}draw();</script>`, "utf8");
  const files = ["run-summary.json", "environment.json", "scenario-status.json", "full-timeline.json", "full-timeline.md", "program-interactions.json", "account-interactions.json", "token-movements.json", "state-transitions.json", "public-private-classification.json", "intent-settlement-comparison.json", "privacy-linkage.json", "invariant-results.json", "errors.json", "sanitized-evidence.json", "ai-review.md", "ai-review.json", "ai-executive-summary.md", "ai-conversation.json", "live-events.jsonl", "scenes.json", "claude-commentary.json", "commitment-debug.json", "ui-state.json", "playback-data.json", "playback.html"];
  const manifest = [];
  for (const filename of files) {
    const bytes = await fs.readFile(path.join(runDir, filename));
    manifest.push({ filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), status: bytes.length ? "GENERATED" : "EMPTY" });
  }
  await writeJson(runDir, "report-manifest.json", manifest);
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
