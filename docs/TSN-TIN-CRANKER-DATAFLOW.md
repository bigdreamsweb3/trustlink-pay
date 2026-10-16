# Archived: earlier program-assigned TIN walkthrough
This file is retained only as historical project material. The payloads, APIs,
SDK names, program behavior, and operational steps described by the former
walkthrough are retired and must not be used, copied, or treated as a fallback.
Current issuance generates the random TIN in the trusted issuer and uses the
private TIN V1 registry flow. The TIN program does not assign a number. There
is no `programAssigned` flag, public-route envelope, PRU route payload, or
public Node `/tin-operations` endpoint in the current protocol.
Use the [canonical TIN V1 service flow](protocol-flows/tin-creation/README.md),
its [Receiver payload contract](protocol-flows/tin-creation/01-receiver-ingress.md),
the [Node verification contract](protocol-flows/tin-creation/02-node-verification.md),
and the [private TIN developer guide](../tsn-protocol/tsn-docs/developers/private-tin-issuance.mdx).