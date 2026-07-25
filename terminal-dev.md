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

PAPERS
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol$ cd /mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol

node scripts/devnet-initialize.mjs
(node:2486) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
TCAP initialized on devnet: TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x
Config PDA: 2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY
Registry PDA: 6oGZV9yt5M6uPH66UZPhJZsGsqfJg2Ec1mtV8VEjQjbE
Signature: 5YyRWBndQYxDVBGL6JRPUeU46e5S8mGo4jbTSJYvQYsi8d9kfmdUPcdUXS6H9gs1Uzum654dT6tnB9e1vbkYok9n
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol$

spl-token create-token --decimals 2
Creating token 9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK under program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

Address: 9ZqZ4fLxzSedkoZfUFYVXrbezNUbf41KxU9N5i6R92PK
Decimals: 2

Signature: 4K1fzTKTpbvypWgJ6Za3tYwk7wdxi8NJBsCQ9ZhtC6URs8tSfdkGNHiJZv5SxbtR8Q3CAxmdGCih6ZmcYLzNZb1L

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol$ cd /mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol
set -euo pipefail

FAUCET_PROGRAM_ID="E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h"

test -s target/deploy/stable_tcap_faucet.so

test "$(solana-keygen pubkey \
  target/deploy/stable_tcap_faucet-keypair.json)" = "$FAUCET_PROGRAM_ID"

stat -c 'artifact_bytes=%s' \
 target/deploy/stable_tcap_faucet.so

sha256sum \
 target/deploy/stable_tcap_faucet.so \
 target/deploy/stable_tcap_faucet-keypair.json.pubkey 2>/dev/null || \
sha256sum target/deploy/stable_tcap_faucet.so

anchor deploy \
 --program-name stable_tcap_faucet
artifact_bytes=329992
951d453748d64d8c7dbfe8c47e0974538defe6d29e235deda63fc680d71cb1d6 target/deploy/stable_tcap_faucet.so
951d453748d64d8c7dbfe8c47e0974538defe6d29e235deda63fc680d71cb1d6 target/deploy/stable_tcap_faucet.so
Deploying cluster: https://devnet.helius-rpc.com/?api-key=<REDACTED>
Upgrade authority: /home/bigdream/.config/solana/id.json
Deploying program "stable_tcap_faucet"...
Program path: /mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/target/deploy/stable_tcap_faucet.so...
Program Id: E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h

Deploy success
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol$ solana program show \
 "$FAUCET_PROGRAM_ID" \
 --url 'https://devnet.helius-rpc.com/?api-key=<REDACTED>'

Program Id: E7jSHdPLzgGafBou5PswKcsS5JxiPnek7TxquFAxXm6h
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: 4zNx8a3sSykoKRRLpi6h1YN1wDZniKp9y856d9qVDUBB
Authority: 78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX
Last Deployed In Slot: 478088497
Data Length: 329992 (0x50908) bytes
Balance: 2.2979484 SOL

<!--  -->
