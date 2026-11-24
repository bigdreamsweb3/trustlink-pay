# TSN contract catalog

These machine-readable records describe the current first-release instruction and cross-component contracts. Executable programs, SDK serialization and service validation enforce them. Catalog entries are compared with those implementations by offline checks; a JSON record alone does not initialize an account, enable a verifier or prove a live operation.

- [TIN Creation](tin-creation-v1.json) records the direct and staged TIP registration layouts and owner approval boundary.
- [Wallet Deposit Intent](wallet-deposit-intent-v1.json) records reserve funding and its authorized next action. It distinguishes the retained intent-bearing claim, current native funded-note deposit and reserve-only deposit ABIs.
- [TIN-Credit](tin-credit-v1.json) records funded private credit, its existing thirteen-input verifier, Memo and independent credit-epoch accounting.
- [TIN-Debit](tin-debit-v1.json) records the new paired ownership reassignment: sender debit and recipient credit, with custody assets and reserve obligations unchanged. Its twenty-six-input runtime is under integration.

Wallet Deposit Intent separates funding from its purpose: a TIN destination requires a later TIN-Credit, while wallet delivery has a distinct settlement contract. The retained `deposit_with_funding_commitment_v2` binds a destination commitment and `ConfidentialOwner` or `PublicWallet` mode, then creates a pending funding claim. Its wallet claim has no identified settlement consumer. Current native intent ingress requires a TIN and uses `deposit_private_funding_v1`; the retained TSNP wallet-payout source belongs to a separate Epoch Treasury/DNA flow.

Every Wallet Deposit Intent is required to keep its destination, requested action, authorization material and private openings restricted to authorized processing. Ordinary wallet funding remains observable on chain. Current native funding encrypts ingress in Receiver storage and omits its contents from the staged public funding view; trusted Receiver/Node processing can read it. The retained claim publicly exposes its settlement mode and metadata, so it does not meet the required private-intent boundary. This record distinguishes that implementation gap from the intended contract.

TIN-Debit is the network operation label. An authenticated owner's history labels its sender leg as **TIN-Debit / outgoing** and its recipient leg as **TIN-Credit / incoming**. Receiving requires the recipient's registered public keys, not a recipient signature or balance opening. The existing deposit-credit instructions and encodings remain unchanged.

The JSON suffixes and serialized method names identify internal first-release encodings. The [canonical architecture](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/architecture-map.md) and [credit ABI](https://github.com/bigdreamsweb3/trustlink-pay/blob/main/docs/laboratory/credit-abi.md) document implementation and evidence boundaries.
