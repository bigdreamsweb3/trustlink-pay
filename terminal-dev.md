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
solana program show TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x

export TCAP_RPC_URL=https://devnet.helius-rpc.com/?api-key=92a02527-5eef-4999-868a-aec60e19f6c3

ABout

I’m a self-taught developer who became obsessed with blockchain technology after seeing how badly the current system breaks trust around money, identity, and user funds. In 2021-2022, I studied how programs gain authority over user funds by building EVM drainer contract simulations and security-related software for educational purposes after I personally got drained. That experience changed my direction.

Since then, I’ve focused on building Transfer Settlement Network (TSN), a privacy-preserving stablecoin settlement protocol designed to move value through identity rather than wallet exposure. I care about building real infrastructure that solves everyday payment problems, not just speculative tools. I’ve taken TSN from concept to a working DevNet prototype with cross-chain testing and am now turning it into a clearer developer experience, product demo, and real-world deployment path.

I’m especially interested in the intersection of payments, identity, trust, and infrastructure. I believe the next big layer in crypto is not just faster settlement — it’s better payment behavior, stronger privacy, and systems that people can actually trust.

