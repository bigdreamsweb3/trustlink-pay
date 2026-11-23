# TSN publication handoff: 2026-11-22

**Continuation revised 2026-11-23:** Ten-digit blockchain payment identity, recipient confidence and TSN settlement infrastructure lead the product vision; implementation and proof progress remain in dedicated sections.

All changes in this handoff are local. The Blogger site, GitHub Pages pitch and search-engine index have not been updated by this task. The user will publish the revised material. Demo video 2 production follows this documentation phase.

## Positioning and status

Use the same vision-led core description in site settings and page introductions: **Transfer Settlement Network (TSN) is the hybrid decentralized blockchain settlement protocol infrastructure we are building for the Internet of Value: ten-digit TIN payment identity, owner-consented attested recipient confidence and confidential value connected to supported settlement networks.** Explain the full intended product from that building anchor, with mobile money used only as familiar interface context. Keep implementation and proof status in a dedicated development section. Solana is the current experimental domain. Base, Arbitrum and Polygon PoS are planned lower-fee EVM targets; they have fees and distinct security assumptions. Ethereum Layer 1 is outside the current integration priority.

Optional issuer-verified personal and business credentials remain proposed. Current name resolution is an owner-provided display name, with an empty verified-credential collection; the presence of signed credential-shaped data does not authenticate an issuer. Solana Attestation Service and Sumsub must not be shown as integrated TSN features or announced partners.

## Replace the existing Blogger pages

1. Use `pages/about-transfer-settlement-network-tsn.html` for the About page.
2. Replace the whitepaper page with `pages/tsn-protocol-whitepaper.html`, which is reconciled with `../docs/TSN-WHITEPAPER.md`.
3. Replace the identity page with `pages/identity-and-tin.html`.
4. Replace the GPRU page with `pages/gpru.html`.
5. Replace the TCAP page with `pages/tcap.html`.
6. Replace the payment-flow page with `pages/tsn-flow.html`.
7. Apply `tsn-theme.xml` through the Blogger theme workflow. Its homepage, fallback descriptions, structured answers and technical chapter now use the current hybrid model and actual privacy/status boundaries.

Use the existing page URLs when replacing content so inbound links remain valid. Check each rendered page's title, canonical URL, description, structured data, mobile layout, internal links and source references after publishing.

## Publish the three new articles

- `posts/transfer-settlement-network-solana-integration.html`: **Transfer Settlement Network Solana Integration: Wallet Deposit to TIN Credit**. Explains the current actor order, separate funding/settlement outcomes and retained Devnet evidence.
- `posts/transfer-settlement-network-low-fee-evm-integration.html`: **TSN Cross-Network Integration: Base, Arbitrum and Polygon PoS**. Explains candidate network status, actual fees, value delivery, source finality and recovery requirements.
- `posts/tin-identity-verified-credentials-internet-of-value.html`: **TIN Identity and Verified Credentials in the Internet of Value**. Separates current display-name resolution from future issuer-verified credentials and owner consent.

Each file contains its proposed title, search description and labels. Assign the actual publishing URL in Blogger; no fabricated published URL or publication date is embedded in these drafts. Add links between the published articles and the existing identity, flow and whitepaper pages using the observed live URLs.

## Replace the older article copies

The local files in `posts/` and the privacy-first settlement cluster have revised TSN architecture sections. Apply each revised file to its corresponding existing post by title. Preserve valuable external research and its source dates. The changes remove older temporary-GPRU, per-TIN-TCAP-tip, automatic credential-verification and generalized custody/privacy claims from current TSN explanations.

## Publish the public handbook

Review the public handbook changes in `../tsn-protocol/tsn-docs/`, including `docs.json` navigation and the four new Overview pages: `overview/payment-solutions.mdx`, `overview/solana-integration.mdx`, `overview/cross-network-roadmap.mdx` and `overview/identity-attestations.mdx`. Publish these alongside the revised existing concept, SDK, API and operator-boundary pages through the user's normal Mintlify/repository workflow. Local MDX and example checks do not establish that the hosted handbook is updated.

Keep `../docs/RUN-YOUR-OWN-TSN.md` internal; this task does not authorize publishing or promoting that operating guide.

## Reconcile older indexed external copies

Use `dorahacks-buidl-page/tsn-dorahacks-submission (1).md` as the revised source for any existing DoraHacks description. Older Paragraph-hosted articles and other externally hosted pitch or whitepaper copies should be manually reconciled with the current canonical whitepaper. Preserve the original dates and unique research history while correcting present-day architecture and integration claims. No external page or submission was edited by this task.

## Update the hosted pitch and exports

The current 15-slide source is `../pitch-deck/index.html`. Its pitch repository is a separate checkout, so the user should review that checkout's existing changes before updating the hosted deck. The main PDF export is `../docs/decks/TSN_Pitch_Deck.pdf`; the neutral concise export is `../docs/decks/TSN_Integration_Deck_2026_Fall.pdf`. The previous campaign-named PDF is replaced by the neutral export. Both present the complete TSN identity and settlement network being built, with development evidence on its own slide.

Nine existing PNG slide exports and `../docs/decks/TSN_Pitch_Deck_contact.png` are refreshed from the current deck. The updated project submission draft and diagrams are in `dorahacks-buidl-page/`. The two vector diagrams now show the native hybrid credit flow and actual funding/accounting boundaries. `tsn_demo_storyboard.txt` marks the earlier MP4 and thumbnail as historical planning material rather than current settlement evidence.

The resume source is `../resume/daniel-matthew-resume-2026-updated.html`; its updated three-page PDF is `../resume/daniel-matthew-resume-2026-updated1.pdf`. Both remove the obsolete network integration claim. No external resume distribution occurred.

## Request indexing after publication

Verify the observed live Blogger pages and GitHub Pages deck before requesting reindexing through the available webmaster tools. Related-search suggestions in the saved search page identify useful topics; they do not establish query volume, user intent or a guaranteed ranking. Search engines may retain older snippets until they recrawl the published sources, and publication alone cannot guarantee the top search position.

## Next demo phase

Demo video 1 covered TIN creation. The next planned video is wallet deposit to TIN credit, with separate approval, funding confirmation, settlement proving and finalized credit evidence. Only show owner recovery as completed if its independent validation is available. Video recording and production were not performed in this task.
