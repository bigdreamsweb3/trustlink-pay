# Terminal Command Reference

# Purpose:

# Use this file as a cheat sheet for commands you want to remember.

# Keep commands organized by category, with a short explanation for each.

# General usage:

# - Copy the full command into a terminal.

# - Replace placeholders like <ADDRESS>, <PROGRAM_ID>, <CLUSTER> with your values.

# - Add new sections or commands as you discover useful workflows.

## Solana CLI - Wallet and Account Checks

# Check the balance of the current Solana wallet

solana balance --url devnet

# Check the balance of a specific wallet address

solana balance <ADDRESS> --url devnet

# Print the current Solana CLI configuration

solana config get

# Show the current wallet public key

solana address

## Solana CLI - Cluster and Network

# Get the current cluster version

<!--  -->

solana cluster-version --url devnet

# Show cluster health and node status

solana cluster-health --url devnet

# Check the current slot on the cluster

solana slot --url devnet

## Solana CLI - Programs and Buffers

# Show deployed program buffers on devnet

solana program show --buffers --url devnet

# Close program buffer accounts for a specific program on devnet

# Replace <PROGRAM_ID> with the actual program public key

solana program close --buffers <PROGRAM_ID> --url devnet

or

solana program close --buffers --url devnet

# Show deployed programs for the current wallet on devnet

solana program show --url devnet

## Solana CLI - Transaction and Airdrop

# Request an airdrop to the current wallet on devnet

solana airdrop 1 --url devnet

# Get the status for a transaction signature

solana confirm <SIGNATURE> --url devnet

## Shell / Repo Commands

# Example: run repo-specific scripts or commands as needed

# npm run <script-name>

# Example: move to workspace root

# cd c:\Users\codepara\Desktop\trust-link

# Add your own useful commands below, grouped by topic.

## Notes

# Keep this file as your quick reference.

# Add a new line for every command you want to remember.

# Use comments (#) to explain what each command does.

# PROGRAM BUILD/DEPLOY SCRIPTS RUNNER

npm run tsn:program:build:devnet
npm run tsn:program:deploy:devnet

npm run tcap:program:build:devnet
npm run tcap:program:deploy:devnet

solana program show TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
solana program show tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF

export TCAP_RPC_URL=https://devnet.helius-rpc.com/?api-key=92a02527-5eef-4999-868a-aec60e19f6c3

ABout

I’m a self-taught developer who became obsessed with blockchain technology after seeing how badly the current system breaks trust around money, identity, and user funds. In 2021-2022, I studied how programs gain authority over user funds by building EVM drainer contract simulations and security-related software for educational purposes after I personally got drained. That experience changed my direction.

Since then, I’ve focused on building Transfer Settlement Network (TSN), a privacy-preserving stablecoin settlement protocol designed to move value through identity rather than wallet exposure. I care about building real infrastructure that solves everyday payment problems, not just speculative tools. I’ve taken TSN from concept to a working DevNet prototype with cross-chain testing and am now turning it into a clearer developer experience, product demo, and real-world deployment path.

I’m especially interested in the intersection of payments, identity, trust, and infrastructure. I believe the next big layer in crypto is not just faster settlement — it’s better payment behavior, stronger privacy, and systems that people can actually trust.

<!--  -->

I fixed the TCAP liability setup path. **The Cranker now pays the transaction fee and, when needed, rent** to initialize the empty liability account, then submits the credit. Node verifies the deposit and attests the exact liability PDA; the TSN-authorized credit checks remain in place.

The program now permits any signer to initialize that PDA with a zero balance, and the SDK and standalone builder match the updated instruction. I removed the Node’s governance-key signing path. Your main wallet was not changed, no key was created, and nothing was deployed to Devnet.

**Checks passed:** SDK build, Cranker typecheck, Rust `cargo check`, Node syntax parse, and `node --check` for the standalone builder. The TCAP source change must be built and deployed before this flow can run on Devnet.

<!-- NBs -->

The receiving root comes from the TIN owner’s master seed. GPRU uses it with each transaction’s context to derive a unique public key for that transaction. That per-transaction key identifies the recipient’s credit route without reusing the same key each time.

<!--  -->

**Recommendation:** keep settlement details off-chain until the final credit transaction, and don’t create a public settlement record when the intent first arrives. The Receiver currently creates a small internal settlement queue record at ingress, but it contains only a reference to the funding work. It is not an on-chain account or event, and it cannot be leased until funding is confirmed. That internal placeholder is fine for coordinating the work. [Receiver store](C:/Users/codepara/Desktop/trust-link/tsn-protocol/services/tsn-receiver/lib/store.ts:82)

PV 9239
