# Archived: program-assigned TIN creation handoff
This handoff describes a retired implementation. Its APIs, SDK functions,
payload fields, account layout, and operational evidence are not current and
must not be used for new issuance or as a compatibility path.
The active flow generates the random TIN in the trusted issuer and submits a
private TIN V1 owner-authorized payload through Receiver. The Node verifies
Receiver-leased work, the Cranker executes only attested work, and `CreateTinV1`
creates the commitment-derived registry account. The program does not assign
the TIN. Current creation also uses a separate owner-indexed recovery PDA and
TCAP relationship commitments.
Use the [canonical TIN V1 service flow](protocol-flows/tin-creation/README.md),
the [current developer guide](../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx),
and the [current TIN V1 rules](team/tin/tin-v1-canonical-rules.md).