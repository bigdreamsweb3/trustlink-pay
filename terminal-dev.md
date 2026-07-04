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
