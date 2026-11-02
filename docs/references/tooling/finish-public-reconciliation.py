"""Documentation-only reconciliation; preserves existing newline conventions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SITE = ROOT / "tsn-protocol/tsn-docs"


def revise(relative, transform):
    path = SITE / relative
    raw = path.read_bytes()
    content = raw.decode("utf-8").replace("\r\n", "\n")
    updated = transform(content)
    newline = "\r\n" if b"\r\n" in raw else "\n"
    path.write_bytes(updated.replace("\n", newline).encode("utf-8"))


privacy = "The native-credit proof hides the TIN route and predecessor witness from the on-chain statement, but its amount, asset, shared roots, nullifier, successor point and encrypted Memo remain public. The Node resolves private routing and constructs the witness, so this boundary does not establish owner-only knowledge or immunity to timing and transaction correlation. Direct wallet transfers expose their endpoints; confidential debit and exit require separate execution evidence. See [the privacy limits](/security/threat-model) for the current encoding and trust assumptions."


def replace_privacy(content):
    paragraphs = content.split("\n\n")
    for i, paragraph in enumerate(paragraphs):
        if paragraph.startswith("Each TIN settlement is designed") or paragraph.startswith("The hidden-head proof path is not established end to end. Each TIN settlement"):
            paragraphs[i] = privacy
        elif paragraph.startswith("The hidden-head proof path is not established end to end. Confidential debit"):
            paragraphs[i] = "Local hidden-head proof/build evidence does not establish completed live credit. Confidential debit and exit remain unverified as end-to-end capabilities. " + privacy
    return "\n\n".join(paragraphs)


for relative in ["about/current-technology.mdx", "about/engineering-principles.mdx", "developers/confidential-settlement.mdx", "security/invariants.mdx", "security/operator-boundaries.mdx"]:
    revise(relative, replace_privacy)

revise("about/trustlink-labs.mdx", lambda text: text.replace(
    "Each TIN settlement is designed as a new opaque record without a public pointer from funding or its private predecessor. The owner retains the lineage; TSNP/TCAP verify the proof without learning the hidden TIN link. Direct wallet-to-wallet transfers expose both endpoints, while a TIN-to-wallet exit exposes the output wallet without publishing the source TIN. The proof-gated hidden-state flow is not yet established end to end, so this design remains an unverified runtime guarantee.", privacy))

revise("developers/confidential-settlement.mdx", lambda text: text.replace(
    "    I[Authorized payment intent] --> P[Private user-state proof]\n    P --> G[GPRU verifies the state transition]\n    G --> T[TCAP checks asset, authorization, and liquidity]\n    T --> S[Atomic settlement on Solana]",
    "    I[Confirmed funding and Node-verified proof] --> A[Mother-authorized TSNP call]\n    A --> T[TCAP checks asset, authorization and liabilities]\n    T --> G[GPRU verifies roots, Memo and proof]\n    G --> T\n    T --> S[Atomic root and liability update]"))

for relative in ["developers/network-status.mdx", "developers/private-tin-issuance.mdx"]:
    revise(relative, lambda text: text if "This snippet is illustrative; caller variables" in text else text.replace("```ts", "This snippet is illustrative; caller variables and credentials must come from the application's configured environment. Complete typed examples and their checks are linked in the [SDK handbook](/sdk/getting-started).\n\n```ts", 1))

revise("developers/network-status.mdx", lambda text: text.replace(
    "`readyForNativeTransactions` reports readiness of the configured dependencies for native TSN actions.",
    "`readyForNativeTransactions` reports successful reachability probes for the configured dependencies. It does not inspect the verifier, asset flags, recipient schema or witness snapshots required for native credit."))

if __name__ == "__main__":
    print("Reconciled public privacy, call order, readiness and snippet scope; no production files edited.")
