# Architecture guides

Use this category for system boundaries and design authority.

- [Current architecture](../../CURRENT-ARCHITECTURE.md)
- [Protocol architecture](../../protocol-architecture.md)
- [Final TSN architecture](../../TSN-FINAL-ARCHITECTURE.md)
- [Receiver, Node, and Cranker architecture](../../tsn-receiver-node-architecture.md)
- [TSN whitepaper](../../TSN-WHITEPAPER.md)

Architecture changes must preserve the Receiver/Node/Cranker separation and
identify whether the change belongs to TSNP, TIP, GPRU, TCAP, DIP, or a
supporting TSN service. Treat Circle's CCTP as an external integration.
