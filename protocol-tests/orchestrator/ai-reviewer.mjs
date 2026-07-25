import { createHash } from "node:crypto";

export async function reviewEvidence(evidence) {
  const sanitizedEvidenceHash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  if (process.env.TCAP_ENABLE_AI_REVIEW !== "1" || !process.env.ANTHROPIC_API_KEY) {
    return {
      json: { status: "AI_REVIEW_UNAVAILABLE", provider: "Anthropic", model: null, generatedAt: new Date().toISOString(), sanitizedEvidenceHash, advisoryOnly: true, error: "AI review disabled or ANTHROPIC_API_KEY unavailable" },
      markdown: "AI_REVIEW_UNAVAILABLE\n\nDeterministic chain evidence remains authoritative.\n",
      executive: "Claude Protocol Observer is unavailable because opt-in AI review is disabled or ANTHROPIC_API_KEY is not configured.\n",
      conversation: [],
      sanitizedEvidence: evidence,
    };
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", max_tokens: 2000, system: "You are the TrustLink Protocol Observer. Address Daniel. Review only sanitized confirmed-chain evidence. Never invent missing events. Clearly distinguish executed, blocked, and not implemented.", messages: [{ role: "user", content: JSON.stringify(evidence) }] }) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API request failed: HTTP ${response.status}${body ? ` - ${body.slice(0, 500)}` : ""}`);
  }
  const payload = await response.json();
  const text = payload.content?.map((part) => part.text ?? "").join("\n") ?? "";
  return { json: { status: "COMPLETED", provider: "Anthropic", model: payload.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest", generatedAt: new Date().toISOString(), sanitizedEvidenceHash, responseId: payload.id ?? null, advisoryOnly: true }, markdown: text, executive: text, conversation: payload, sanitizedEvidence: evidence };
}
