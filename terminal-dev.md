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

intent - 10 usdc transfer

wallet top Up = https://solscan.io/tx/5u9HmqD5wNmBmHWfDWmw3vhpMhN42j15YPTmUVgpcMtbuwdGdhqRVqGrZAVF5ic1CiS1ZzuF1D2tMyVaanf4eqye?cluster=devnet

2 PRUs = https://solscan.io/tx/3wgVPZYzEqvht5pkPRetF8tFsXoWmy8obbSSqYYTmxaR1fw6oci2y93P96GhK4xXqu4ttSSD7mMYPyEoDjXVporU?cluster=devnet

2 PRUs = https://solscan.io/tx/2M26JcpSVhKAQvB5yC3Pp4L6NYLHiU8UTMFMsrMbJwt2Jj23dd3pqRG8nWTxerYrcXqm7R78Jt4992smK7jh7eWJ?cluster=devnet

settlement - 10 usdc

https://solscan.io/tx/46wGVb9sfBqWWonk3CQ14xZCc6Qzf2ksYyZMpG4TDhqzhh49pRS59CjhCgq9oPVnfEVhSKdJyb3Rib7HM99A8TfU?cluster=devnet

<!-- OKAY  -->

onchain receipint tx inspection

PS C:\Users\codepara\Desktop\trust-link\tsn-protocol\tsn-cranker-op-daemon> solana confirm -v n95iWNRuyb2afr9tGmvmEPxoKzU3k7jPWJEfR3mPiAETUKSambMDoqm12ENHjLAqnLavgufYp76Amwm66UPcpqS `

> > --url https://tsn-rpc-gateway.vercel.app
> > RPC URL: https://tsn-rpc-gateway.vercel.app
> > Default Signer Path: C:\Users\codepara\.config\solana\id.json
> > Commitment: confirmed

Transaction executed in slot 484225738:
Block Time: 2026-08-15T21:16:01+01:00
Version: legacy
Recent Blockhash: FsgXHGwiNRLKMcBzNtfxEyAVAVgxvUETnmtaVM48wB1f
Signature 0: n95iWNRuyb2afr9tGmvmEPxoKzU3k7jPWJEfR3mPiAETUKSambMDoqm12ENHjLAqnLavgufYp76Amwm66UPcpqS
Account 0: srw- FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG (fee payer)
Account 1: -rw- 12jag2da9dDFo4qbGXdy2GeV31yRd4xPsfTWaf9SZM2h
Account 2: -rw- 4fGSYNt2RaVkcj2U7vRZkPRGPzofc4Z8x2DDokRFeHWi
Account 3: -rw- 7UQziHY2KY2Y9pDkWSfk1BLBUKqSZZd4LBtCy1gPdJJZ
Account 4: -rw- ADwd3kTkycqjTppZrKp59uGRjbEs6gtqaAeAjV4T9DGZ
Account 5: -rw- DiBEnKqdYiDcaepK86nqWMN8mpRVWM46i4KpXFJv3dp
Account 6: -rw- HNGP4WuN6KQ5qqsJA662mJtezaTaT6bnA8kPAae9j7S7
Account 7: -r-- 11111111111111111111111111111111
Account 8: -r-- 4NivuRZ2WkrPNzgvH1aCjoGgUH1Nxhkxc5bkP6cjb28j
Account 9: -r-- 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
Account 10: -r-- 8jn3uvbMcCVMe64fDiipc3917TF9VBQRXUYv2qHc4wW9
Account 11: -r-- 9QZrnZZp5h77hzx9Ncbiid2UaVp2HDuFbaEd91GZr6ep
Account 12: -r-- ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
Account 13: -r-x Ed25519SigVerify111111111111111111111111111
Account 14: -r-- ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR
Account 15: -r-- Sysvar1nstructions1111111111111111111111111
Account 16: -r-- TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Account 17: -r-x TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
Instruction 0
Program: Ed25519SigVerify111111111111111111111111111 (13)
Data: [1, 0, 48, 0, 255, 255, 16, 0, 255, 255, 112, 0, 21, 1, 255, 255, 55, 112, 55, 81, 75, 110, 66, 67, 164, 179, 2, 115, 12, 132, 48, 53, 47, 99, 105, 241, 220, 141, 118, 23, 233, 206, 63, 159, 222, 153, 102, 57, 8, 186, 209, 219, 200, 204, 198, 21, 210, 89, 58, 73, 130, 198, 81, 76, 127, 117, 209, 130, 242, 171, 167, 95, 221, 190, 77, 222, 189, 48, 81, 80, 244, 64, 41, 182, 253, 121, 122, 69, 126, 203, 21, 53, 127, 28, 254, 52, 36, 192, 247, 136, 10, 23, 59, 150, 144, 40, 167, 31, 161, 218, 197, 14, 84, 83, 78, 95, 80, 82, 73, 86, 65, 84, 69, 95, 80, 65, 89, 79, 85, 84, 95, 86, 50, 6, 197, 199, 88, 146, 109, 195, 97, 71, 109, 32, 141, 224, 168, 20, 83, 113, 55, 217, 218, 28, 150, 193, 188, 135, 104, 86, 124, 166, 7, 198, 74, 199, 233, 30, 1, 154, 130, 224, 184, 3, 32, 153, 166, 199, 87, 103, 190, 151, 152, 226, 46, 158, 26, 216, 221, 135, 202, 2, 251, 152, 145, 222, 170, 219, 169, 29, 226, 168, 146, 248, 114, 116, 83, 3, 24, 69, 1, 115, 145, 32, 92, 167, 23, 66, 56, 170, 123, 152, 30, 104, 201, 221, 58, 53, 185, 205, 197, 175, 25, 95, 164, 186, 252, 50, 39, 234, 249, 41, 135, 93, 84, 228, 241, 82, 194, 215, 126, 250, 66, 22, 33, 226, 174, 128, 174, 50, 250, 24, 0, 0, 0, 0, 0, 0, 0, 3, 65, 135, 52, 9, 245, 121, 38, 23, 193, 97, 28, 123, 173, 48, 243, 133, 204, 15, 129, 238, 156, 169, 119, 179, 159, 182, 147, 108, 66, 222, 183, 0, 113, 186, 16, 54, 250, 49, 199, 138, 133, 177, 96, 122, 213, 190, 150, 198, 247, 136, 106, 74, 245, 220, 130, 149, 123, 164, 219, 131, 208, 208, 194, 59, 68, 44, 179, 145, 33, 87, 241, 58, 147, 61, 1, 52, 40, 45, 3, 43, 95, 254, 205, 1, 162, 219, 241, 183, 121, 6, 8, 223, 0, 46, 167, 64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 88, 201, 128, 106, 0, 0, 0, 0]
Instruction 1
Program: TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V (17)
Account 0: FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG (0)
Account 1: ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR (14)
Account 2: HNGP4WuN6KQ5qqsJA662mJtezaTaT6bnA8kPAae9j7S7 (6)
Account 3: 4NivuRZ2WkrPNzgvH1aCjoGgUH1Nxhkxc5bkP6cjb28j (8)
Account 4: 7UQziHY2KY2Y9pDkWSfk1BLBUKqSZZd4LBtCy1gPdJJZ (3)
Account 5: DiBEnKqdYiDcaepK86nqWMN8mpRVWM46i4KpXFJv3dp (5)
Account 6: 8jn3uvbMcCVMe64fDiipc3917TF9VBQRXUYv2qHc4wW9 (10)
Account 7: ADwd3kTkycqjTppZrKp59uGRjbEs6gtqaAeAjV4T9DGZ (4)
Account 8: 9QZrnZZp5h77hzx9Ncbiid2UaVp2HDuFbaEd91GZr6ep (11)
Account 9: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (9)
Account 10: 12jag2da9dDFo4qbGXdy2GeV31yRd4xPsfTWaf9SZM2h (1)
Account 11: Sysvar1nstructions1111111111111111111111111 (15)
Account 12: 4fGSYNt2RaVkcj2U7vRZkPRGPzofc4Z8x2DDokRFeHWi (2)
Account 13: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA (16)
Account 14: ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL (12)
Account 15: 11111111111111111111111111111111 (7)
Data: [122, 5, 27, 202, 86, 43, 139, 31, 205, 197, 175, 25, 95, 164, 186, 252, 50, 39, 234, 249, 41, 135, 93, 84, 228, 241, 82, 194, 215, 126, 250, 66, 22, 33, 226, 174, 128, 174, 50, 250, 24, 0, 0, 0, 0, 0, 0, 0, 64, 66, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 88, 201, 128, 106, 0, 0, 0, 0, 8, 186, 209, 219, 200, 204, 198, 21, 210, 89, 58, 73, 130, 198, 81, 76, 127, 117, 209, 130, 242, 171, 167, 95, 221, 190, 77, 222, 189, 48, 81, 80, 244, 64, 41, 182, 253, 121, 122, 69, 126, 203, 21, 53, 127, 28, 254, 52, 36, 192, 247, 136, 10, 23, 59, 150, 144, 40, 167, 31, 161, 218, 197, 14]
Status: Ok
Fee: ◎0.00001
Account 0 balance: ◎13.89627668
Account 1 balance: ◎0.00203928
Account 2 balance: ◎0.33399616 -> ◎0.33398616
Account 3 balance: ◎0.0012876
Account 4 balance: ◎0.00203928
Account 5 balance: ◎0.0020184
Account 6 balance: ◎0.00199056
Account 7 balance: ◎0.000000001
Account 8 balance: ◎0.00162864
Account 9 balance: ◎413.396035289
Account 10 balance: ◎0
Account 11 balance: ◎0
Account 12 balance: ◎5.93807054
Account 13 balance: ◎0.000000001
Account 14 balance: ◎0.00194184
Account 15 balance: ◎0
Account 16 balance: ◎15.367267856
Account 17 balance: ◎0.00114144
Compute Units Consumed: 39665
Log Messages:
Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V invoke [1]
Program log: Instruction: TsnExecutePrivatePayout
Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]
Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 76 of 168253 compute units
Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success
Program 11111111111111111111111111111111 invoke [2]
Program 11111111111111111111111111111111 success
Program data: OIR1wiXIAWvNxa8ZX6S6/DIn6vkph11U5PFSwtd++kIWIeKugK4y+hgAAAAAAAAA8y2UFFlxRFzFl8Qlv9nWhs7grT37FnuROsXYD5KQ/Hg7RCyzkSFX8TqTPQE0KC0DK1/+zQGi2/G3eQYI3wAup0BCDwAAAAAA
Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V consumed 39665 of 203000 compute units
Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V success

Finalized
PS C:\Users\codepara\Desktop\trust-link\tsn-protocol\tsn-cranker-op-daemon>
