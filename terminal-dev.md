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

<!-- MIGRATION THING ON TCAP -->

Node.js v22.22.2
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ cd /mnt/c/Users/codepara/Desktop/trust-link
npm run tcap:reserve:transfer-pending:migrate:devnet

> trustlink-pay@1.0.0 tcap:reserve:transfer-pending:migrate:devnet
> node protocol-tests/scenarios/tcap-reserve-transfer-pending-migrate.mjs

(node:579) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "MIGRATED",
"governance": "78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX",
"reserve": "3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d",
"assetEntry": "GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"dataLengthBefore": 193,
"dataLengthAfter": 201,
"pendingLiabilitiesBefore": "1000000",
"pendingLiabilitiesAfter": "1000000",
"transferPending": "0",
"signature": "VFp2Xv6H2X6tLeoE7yMdA1VTpQZ41wx27WSJYtgfqWAU8z5YxcVCHHTyeSnB3LPDM48ciKYMUMcaGCKiJaqBGzP"
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- TIN LIABILTY TCAP TIP INIT -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:tip-liability:user:init:devnet -- --tip B

> trustlink-pay@1.0.0 tcap:tip-liability:user:init:devnet
> node protocol-tests/scenarios/tcap-tip-liability-init-user.mjs --tip B

(node:696) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "INITIALIZED",
"user": "B",
"tip": "GBQdwd13J9xTNat4rc96eTqNqQcFab8NbfuTgnPHsKJN",
"liability": "4JhLphoCAqkNaA1eFkFw9AP3qbW5GxicePfk7g5QJEbs",
"initialAvailable": "0",
"signature": "5CyCtVJuEPjS9cvZ8Lo3RJoQpuRkmSK2QVFmBAWbGaA8ppqpwNaGDt4eaRFZkeu1YEEGc5Roacc9qNU961ya6Fb9"
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- PAPERS -->

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

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:credit:devnet

> trustlink-pay@1.0.0 tcap:credit:devnet
> node scripts/tcap-credit-devnet.mjs

[devnet] Bootstrap governed TSN/TCAP accounts
RPC: devnet.helius-rpc.com
Wallet: /mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-devnet-test-wallet.json (7vjGCdLddCx7W33q8fkjppWnhXZKkqZn9WcApsD6dLeb)
Governance wallet: /home/bigdream/.config/solana/id.json (78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX)
TSN: TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
TCAP: TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x
Defaults: /mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-credit-devnet.defaults.env (loaded; environment overrides win)
(node:17899) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
TSN Mother Escrow: ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR (reused)
TSN Mother authority: FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG (TSN_MOTHER_AUTHORITY_WALLET signer)
TCAP config: 2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY (reused)
TCAP asset registry: 6oGZV9yt5M6uPH66UZPhJZsGsqfJg2Ec1mtV8VEjQjbE (reused)
TCAP commitment root: DG41e3M1hvmw1cgo8cEK2w9UDcCjkrUXdyghhWZJfwbd (reused)
TCAP mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (6 decimals; 1000000 base units)
TCAP asset entry: GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW (reused)
TCAP reserve state: GVnNCckbpoXTMLQCdVmMiXvnjhVg2vMzDU2zfNUGRj3N (reused)
Derived controlled Devnet tip root (test identity only): 9fd26b1250199d824daabae987161cdeda3861511413181704a9d424b09c5840
Derived controlled Devnet policy commitment (test identity only): 9e1971b325ab1a60ef033846b78fcaabfd2dac075968929f1a9ab2564501d1dd
TCAP tip: FcBZh6NQXkmp1npUuq82iWcseyX2jq4LaUcoy2CgkaXB (reused; previous commitment read from chain)
Derived current TSN epoch from Mother Escrow: 0
TSN epoch commitment: EVTBhSGfQvZ5DLGZmyfMPo6cnPB1BFvpbCgtsbVsuUew (missing)
TSN epoch commitment is canonical and will be created/reused by tsn_register_tcap_credit_authorization; it is not an opaque account.
Derived canonical replay nonce from the controlled signed-intent fields: c7beb56c0321254094d6f4356b036ed8f89381507e2ce7dc9a1ed695a961c992
Derived canonical Devnet payment intent commitment: 5b06ba475bb3e04e7e6b2c6da7830a02a15d91940057f25bab2fa038f78ce604
Derived canonical GPRU scope commitment: 77294b3ecfb01e56691cc7e6dc4f3e94e064dcf44c2debd77a59265c22927a63
Derived canonical TSN settlement commitment: 7dc803ea6a9010677d7531b67d09cb114a1ccf3507163771b442e73e9dd5509c
Derived canonical settlement nullifier: 58e52c98d800f8c7008f8af0c1cb21d9463d89b165c43d4b039b3b1d87b29875
Created TSN AcceptedIntentV1 atomically with funding: Fco5qXpBcYfyqwBQKzUCJgj9JE7qZpD9z7qJvvDtvMAv tx=2ovwim24gv9cgAmMo8AoukrNquFTRVeyHRiDVNaP7WEZXdsQ7PMn7fP95AiUsCVqZeVFhNvezeGrS5yRy2D6rrG2
Atomic instructions: tsn_fund_epoch_treasury + tsn_accept_intent; funder token account=5YVTyjG9YxxdFJKRpmyTWi3HLkwgj5dyUcVgE9KPhsqJ
Derived TCAP previous root from commitment root account: 47f64a304f10f65277568d1a061f669389cca93a55cac74712d7c1d99dddedff
Derived canonical ConfidentialSettlement authorization digest: 472cc26d24461aa3f22802e727c8a5a836fcdb1e1788140aa300ec41c3d00f58
Wrote real Devnet credit env: /mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-credit-devnet.env
No transaction was submitted for credit; register + credit remains the next explicit smoke step.
[devnet] Run TCAP credit smoke
(node:17911) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
Registered TSN TCAP credit authorization: whPPVQxGXHuvFK3gSR1UCPzUCXib5j2msqVGjs7ewiefbduDiPWPm2dbNZnDRvLiNz2h9CwdccgJqr23SAvaVjy
Submitted TCAP credit: R4G3fwBLvEgCDKD8mmqBtekkLtVa2RjA3rxpwa2ubDhMtLbVnxgiCr34ryhcKEjL8gTUhXovEJHsUs9YvDat6gx
file:///mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/tcap-sdk/dist/tip-rpc.js:3
throw new Error(message);
^

Error: tip_account_version_unsupported
at fail (file:///mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/tcap-sdk/dist/tip-rpc.js:3:11)
at decodeTcapTinTipV1Account (file:///mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/tcap-sdk/dist/tip-rpc.js:43:9)
at fetchTcapTinTipV1 (file:///mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/tcap-sdk/dist/tip-rpc.js:79:12) at async file:///mnt/c/Users/codepara/Desktop/trust-link/tcap-protocol/scripts/devnet-credit-smoke.mjs:193:13

Node.js v22.22.2
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ export TCAP_RPC_URL=https://api.devnet.solana.com

node --input-type=module -e '
import fs from "node:fs";
import { fetchTcapTinTipV1 } from "./tcap-protocol/tcap-sdk/dist/tip-rpc.js";
const env = Object.fromEntries(
fs.readFileSync("protocol-tests/tcap-credit-devnet.env","utf8")
.split(/\r?\n/)
.filter(x => x && !x.startsWith("#"))
.map(x => x.split("="))
);
const tip = await fetchTcapTinTipV1({
rpcUrl: process.env.TCAP_RPC_URL,
address: env.TCAP_TIP,
expectedProgramId: env.TCAP_PROGRAM_ID
});
console.log(tip);
'
{
address: 'FcBZh6NQXkmp1npUuq82iWcseyX2jq4LaUcoy2CgkaXB',
owner: 'TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x',
lamports: 1698240,
version: 1,
current_commitment: '192717d50173df1ddc7aafc295ec91d73aff26daae3e98b0e4796c16163940cd',
sequence: 1n,
policy_commitment: '9e1971b325ab1a60ef033846b78fcaabfd2dac075968929f1a9ab2564501d1dd',
last_transition_nullifier: '58e52c98d800f8c7008f8af0c1cb21d9463d89b165c43d4b039b3b1d87b29875',
frozen: false,
bump: 252
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ unset TCAP_SKIP_FUNDING
npm run tcap:credit:v2:devnet
trustlink-pay@1.0.0 tcap:credit:v2:devnet
node protocol-tests/scenarios/tcap-credit-v2.mjs
(node:5710) [DEP0040] DeprecationWarning: The punycode module is deprecated. Please use a userland alternative instead.
(Use node --trace-deprecation ... to show where the warning was created)
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "4GxeAZUfQrVkTwCeKYqQ9es3e65qBbwm86Nhh6eUFEL9KD2Qd6qbEtCPt9mNrsmupxD2kJUGbSDgzLC13Tx1zBSk",
"slot": 489354615,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "5YVTyjG9YxxdFJKRpmyTWi3HLkwgj5dyUcVgE9KPhsqJ",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"sourceBalanceAfter": "17999992",
"vaultBalanceAfter": "3000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_credit_authorization_v2 -> credit_tcap_tin_tip_v2",
"signature": "4NRHnkW2vTciZFC3vo8Jg9WigZkQruvxMLfam9n2fBuE5Eqo6VEXdbtYviD9YCBoWj9jfHsQctzauQZ7TJeeRDSx",
"slot": 489354632,
"tip": "FcBZh6NQXkmp1npUuq82iWcseyX2jq4LaUcoy2CgkaXB",
"sequence": "2",
"authorizationDigest": "522a5fc6a02ed6fb717674a8a627c0d1aa2d27039120b509d9dea23014b9769b",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"FcBZh6NQXkmp1npUuq82iWcseyX2jq4LaUcoy2CgkaXB",
"11111111111111111111111111111111",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"BksvJDFnk8qdYaRqeH3dDNg3bnnE2DcN7kZ55NMP8aBZ",
"C9Sd8CbQw3n5D9mvtd4LEmgR4192G6EuLg4dpMFihs6N",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_credit_authorization_v2"
},
{
"scope": "inner:0",
"name": "credit_tcap_tin_tip_v2"
}
]
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains only opaque GPRU tip-transition accounts; funding bookkeeping and token accounts are absent."
}
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:credit:v2:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:credit:v2:devnet
> node protocol-tests/scenarios/tcap-credit-v2.mjs --user A --amount 1000000

{"identity":{"user":"A","tin":"1000000001","privacyPubkey":"8f0b34fb","gpru":"6dfe3d84","tip":"FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs","available":"2000000"}}
(node:9209) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
ws error:
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "51qKF4hQJwdg244gNCF3UPYFgBkmsquAJV4qfWVnosYoiJoE7w8uxXY7kq9U9t9gBhGt4j2h23Rpr2gs2c2MtNzH",
"slot": 490427551,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "5YVTyjG9YxxdFJKRpmyTWi3HLkwgj5dyUcVgE9KPhsqJ",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"sourceBalanceAfter": "4999992",
"vaultBalanceAfter": "16000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_credit_authorization_v2 -> credit_tcap_tin_tip_v2",
"signature": "uJ4E1Ruf5kxtY5qHZt8UpC6n5nCh4SuhDyMdLXXGu3xA5bcPbbaLzH27d4tzTQKL42rMbG4C6wrVhV1sT7eM5fs",
"slot": 490427583,
"tip": "FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs",
"sequence": "2",
"authorizationDigest": "60189aa419743f8d3ce9a1be3b5a2d98c568cb5ef042264a9c1afbc0d3be8514",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs",
"11111111111111111111111111111111",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"CK5rkfvNm5u1FB6fc5AvTionqMegFeRuhYuvCggez1Bs",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GXkyniQtxTC7f1vhjn5ieiATVKkxw8jQiC39A1ZAYV1P",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_credit_authorization_v2"
},
{
"scope": "inner:0",
"name": "credit_tcap_tin_tip_v2"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/701b42f027b5f016ae3c291002a7b51520666df08e6dfe9755e970196e3978e3.json",
"identity": {
"user": "A",
"tin": "1000000001",
"privacyRoot": "e6c0749b",
"gpru": "6dfe3d84"
}
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains only opaque GPRU tip-transition accounts; funding bookkeeping and token accounts are absent."
}
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:credit:v2:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:credit:v2:devnet
> node protocol-tests/scenarios/tcap-credit-v2.mjs --user A --amount 1000000

{"identity":{"user":"A","tin":"1000000001","privacyPubkey":"8f0b34fb","gpru":"6dfe3d84","tip":"FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs","available":"3000000"}}
(node:9242) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "2heUUH7nuQACJ472AxXuqes42fvqU7WWkd67u4x4ZrcauZ7Xr6VQm7SihrXd58nbavtqCReQQH4Lsi1U63oXHYoa",
"slot": 490431592,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "5YVTyjG9YxxdFJKRpmyTWi3HLkwgj5dyUcVgE9KPhsqJ",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"sourceBalanceAfter": "3999992",
"vaultBalanceAfter": "17000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_credit_authorization_v2 -> credit_tcap_tin_tip_v2",
"signature": "2FfDjEMytDSk67Sk6E5Si5pPhc8f7d25ik49ej7TMuyMyHnBGxrTHpvz5vFM5zyDxs8FBMF7hkVMXZocVTAeZQUx",
"slot": 490431607,
"tip": "FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs",
"sequence": "3",
"authorizationDigest": "86bbfe939e7fb762a5e9814a0ef442fc9346aa26476574f679b0dfe964802853",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"FgHMXMdyeDN7NGnaf1XTSGsN5BCy1n7swQdGpNUkotxs",
"11111111111111111111111111111111",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"8882qheXju472EdYBfMyKhKzDiqodWVk4D1FxSafcKA7",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GXkyniQtxTC7f1vhjn5ieiATVKkxw8jQiC39A1ZAYV1P",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_credit_authorization_v2"
},
{
"scope": "inner:0",
"name": "credit_tcap_tin_tip_v2"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/a2f3595476cb1ed3ab2a2260d3a24eeb6e517cef7a9c1bd2d1466f1b63c9b195.json",
"identity": {
"user": "A",
"tin": "1000000001",
"privacyRoot": "e6c0749b",
"gpru": "6dfe3d84"
}
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains only opaque GPRU tip-transition accounts; funding bookkeeping and token accounts are absent."
}
}

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-credit.mjs --user A --amount 1000000

(node:10738) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "one-time TIP in-place credit",
"user": "A",
"fundingSignature": "3PV73ngBteqRCsFBe4dguwj9nxkPcgEr89oWCFFexebEUW4v6faTDRXLAuHdcxZa2dUQQhLbXxLbnmgugWqLgxdM",
"fundingSourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"vault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "40010000",
"vaultBalanceAfter": "41010000",
"vaultTokenDelta": "1000000",
"creditSignature": "4i1AMdeJReURqrpw6WMy5KjPGdJZFJnz2ujC5uPn5vgpuWMKvtjP7HEN85E33QSCdKiCPU2oRz5anG2oKjKBWfts", "snapshotPath": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/ab8c7b99a12c71aa3f8d6513e224c5eaee073595bc3e5b9702c20fd065223090.json",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"previousCommitment": "1d376951be302a11e1b5b7d25b7697741b53dfd2c48b513a2fda9d76db221467",
"commitment": "ab8c7b99a12c71aa3f8d6513e224c5eaee073595bc3e5b9702c20fd065223090",
"sequence": "15",
"availableBefore": "13000000",
"availableAfter": "14000000",
"newTcapAccounts": 0
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!--  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-credit.mjs --user A --amount 1000000

(node:158) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "one-time TIP in-place credit",
"user": "A",
"fundingSignature": "2fibcqGD2G2ckeQ8qM7ki547c9eB2rtTZqLGDFBV9hb3YugPREZVawneByB97XBqCVUY3iGVDR6uB6CYxKB2MLT4",
"fundingSourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"vault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "42010000",
"vaultBalanceAfter": "43010000",
"vaultTokenDelta": "1000000",
"reservePendingBefore": "0",
"reservePendingAfterDeposit": "1000000",
"reservePendingAfterCredit": "0",
"creditSignature": "SvsBSLtaQ1vGgo6vjxY7z3amFxYLHHakqr52iZDGqkCxLYnwDfjENbHrFhLBSzetXhF3T2t7ZvEf1xG9MjRiHCV",
"snapshotPath": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/913cb2eab06fcf9d65c64996190ee6e48c90e00f71decb683912b8f2ff9381be.json",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"previousCommitment": "24b6f063e033f4913463aeb3eac8b38a7dba4d70dfaa7b838cbb2eaf8465b17c",
"commitment": "913cb2eab06fcf9d65c64996190ee6e48c90e00f71decb683912b8f2ff9381be",
"sequence": "17",
"availableBefore": "15000000",
"availableAfter": "16000000",
"newTcapAccounts": 0
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-credit.mjs --user A --amount 1000000

(node:218) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"user": "A",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "5rx3BLmZHwchqaFLuoT7q3bWqbzNctV8EHKx6dHu93Bpw9qaVsVKFp4tiWkWgpWCHV7WKtgNScAC1jrzPaskEDr3",
"slot": 491525814,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "43010000",
"vaultBalanceAfter": "44010000",
"vaultTokenDelta": "1000000",
"reservePendingBefore": "0",
"reservePendingAfter": "1000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_one_time_credit -> credit_one_time_tip",
"signature": "3FuXg4KTEZrczcRje5fJqccbadNfJPUUB3NfY5ebFMgsTosNBvummAVau5AU4xRUTaQBZ3Bw9LJnqEyENqX6Zn1X",
"slot": 491525833,
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"sequence": "18",
"previousCommitment": "913cb2eab06fcf9d65c64996190ee6e48c90e00f71decb683912b8f2ff9381be",
"commitment": "cb8f038264c143fa3c468ec36534b04eff0749e5447171dcc574240d8013a99c",
"authorizationDigest": "780861757afeae554270b60fe614284836304112bbe1fe82109538d024a00a23",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d",
"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"kNVDDfHCimRD6KbUkkhyXuizGR6SMQ426oo1BW4acg3",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_one_time_credit"
},
{
"scope": "inner:0",
"name": "credit_one_time_tip"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/cb8f038264c143fa3c468ec36534b04eff0749e5447171dcc574240d8013a99c.json",
"identity": {
"user": "A",
"tin": "1000000001",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"availableBefore": "16000000",
"availableAfter": "17000000"
},
"reservePendingAfter": "0",
"newTcapAccounts": 0
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains no funding token account, vault, or per-deposit PDA; the stable TIP is updated in place."
}
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000 --skip-funding

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-credit.mjs --user A --amount 1000000 --skip-funding

(node:257) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
/mnt/c/Users/codepara/Desktop/trust-link/node_modules/@solana/web3.js/lib/index.cjs.js:8208
throw new SendTransactionError({
^

SendTransactionError: Simulation failed.
Message: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x17a5.
Logs:
[
"Program log: TSN TCap CPI args len=204 valid_after_slot=0 expires_at_slot=501527476 sequence=19 token_id=2 amount=1000000",
"Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x invoke [2]",
"Program log: Instruction: CreditOneTimeTip",
"Program log: TCap credit_one_time_tip: clock_slot=491527480 valid_after_slot=0 expires_at_slot=501527476",
"Program log: TCap credit_one_time_tip: sequence=19 token_id=2 amount=1000000",
"Program log: AnchorError thrown in programs/tcap/src/instructions/credit_one_time_tip.rs:71. Error Code: InvalidReserveLiability. Error Number: 6053. Error Message: The reserve liability invariant is invalid.",
"Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x consumed 23986 of 183031 compute units",
"Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x failed: custom program error: 0x17a5",
"Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V consumed 40955 of 200000 compute units",
"Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V failed: custom program error: 0x17a5"
].
Catch the `SendTransactionError` and call `getLogs()` on it for full details.
at Connection.sendEncodedTransaction (/mnt/c/Users/codepara/Desktop/trust-link/node_modules/@solana/web3.js/lib/index.cjs.js:8208:13)
at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
at async Connection.sendRawTransaction (/mnt/c/Users/codepara/Desktop/trust-link/node_modules/@solana/web3.js/lib/index.cjs.js:8173:20)
at async Connection.sendTransaction (/mnt/c/Users/codepara/Desktop/trust-link/node_modules/@solana/web3.js/lib/index.cjs.js:8164:12)
at async sendAndConfirmTransaction (/mnt/c/Users/codepara/Desktop/trust-link/node_modules/@solana/web3.js/lib/index.cjs.js:2273:21)
at async file:///mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/scenarios/tcap-one-time-credit.mjs:121:25 {
signature: '',
transactionMessage: 'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x17a5',
transactionLogs: [
'Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V invoke [1]',
'Program log: Instruction: TsnRegisterTcapOneTimeCredit',
'Program log: TSN forwarding one-time credit slots: valid_after_slot=0 expires_at_slot=501527476 sequence=19 token_id=2 amount=1000000',
'Program log: TSN TCap CPI args len=204 valid_after_slot=0 expires_at_slot=501527476 sequence=19 token_id=2 amount=1000000',
'Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x invoke [2]',
'Program log: Instruction: CreditOneTimeTip',
'Program log: TCap credit_one_time_tip: clock_slot=491527480 valid_after_slot=0 expires_at_slot=501527476',
'Program log: TCap credit_one_time_tip: sequence=19 token_id=2 amount=1000000',
'Program log: AnchorError thrown in programs/tcap/src/instructions/credit_one_time_tip.rs:71. Error Code: InvalidReserveLiability. Error Number: 6053. Error Message: The reserve liability invariant is invalid.',
'Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x consumed 23986 of 183031 compute units',
'Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x failed: custom program error: 0x17a5',
'Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V consumed 40955 of 200000 compute units',
'Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V failed: custom program error: 0x17a5'
]
}

Node.js v22.22.2
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- DISCOVERED MESSAGE LEAKED DATA -->

Summary
Interact with
program
instruction
on
TSN31jNoRP8V
Signature
5w7F2jm8ZFDqL82NzPo6Jh4LWB2skQ2xxQrCgfDrHdwv7tcVDLiUesPwRPr9U92rhqKSYXVgT76QfnxvX1Ws9e2T
Inspect Tx
Block & Timestamp
492663599

49 minutes ago
20:05:27 Sep 03, 2026 (UTC)
Result
Success
finalized (MAX confirmations)
Signer
FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG
Sponsored

Fee
0.055
SOL
Compute Units Consumed
35,083
Transaction Version
legacy
Recent Block Hash

2xa5ypwrD8H16b1Cv9mfTkSwoX5WtNYTHVbvTSrCX2gT
Instruction Details
List
Tree

Compute Units Distribution
Total:
35,083
Instruction #1:
35,083

#1 - Unknown: Unknown
Raw

Program Logs
Hide details
View Raw Data

Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V invoke [1]
Program log: Instruction: TsnRegisterTcapOneTimeCredit
Program log: TSN forwarding one-time credit slots: valid_after_slot=0 expires_at_slot=502663594 sequence=20 token_id=2 amount=1000000
Program log: TSN TCap CPI args len=204 valid_after_slot=0 expires_at_slot=502663594 sequence=20 token_id=2 amount=1000000
Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x invoke [2]
Program log: Instruction: CreditOneTimeTip
Program log: TCap credit_one_time_tip: clock_slot=492663599 valid_after_slot=0 expires_at_slot=502663594
Program log: TCap credit_one_time_tip: sequence=20 token_id=2 amount=1000000
Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x consumed 20796 of 186031 compute units
Program TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x success
Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V consumed 35083 of 200000 compute units
Program TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V success
Collapse All

<!-- FIRST DEB - CRED TX -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:debit-credit:devnet -- --from A --to B --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:debit-credit:devnet
> node protocol-tests/scenarios/tcap-one-time-debit-credit.mjs --from A --to B --amount 1000000

(node:1961) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{"debitInstruction":{"keyCount":11,"keys":[{"index":0,"pubkey":"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG","isSigner":true,"isWritable":true},{"index":1,"pubkey":"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR","isSigner":false,"isWritable":false},{"index":2,"pubkey":"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x","isSigner":false,"isWritable":false},{"index":3,"pubkey":"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V","isSigner":false,"isWritable":false},{"index":4,"pubkey":"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY","isSigner":false,"isWritable":false},{"index":5,"pubkey":"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW","isSigner":false,"isWritable":false},{"index":6,"pubkey":"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj","isSigner":false,"isWritable":true},{"index":7,"pubkey":"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d","isSigner":false,"isWritable":true},{"index":8,"pubkey":"241Jos16AjhRat17bRVqXNEoe7Dcmrk8s454hXqcjMCp","isSigner":false,"isWritable":true},{"index":9,"pubkey":"2c1A1X582fXoK7nDgcCbuzecuzdZGT6xD4JstMjLRaET","isSigner":false,"isWritable":false},{"index":10,"pubkey":"11111111111111111111111111111111","isSigner":false,"isWritable":false}]}}
{"creditInstruction":{"keyCount":10,"keys":[{"index":0,"pubkey":"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG","isSigner":true,"isWritable":true},{"index":1,"pubkey":"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR","isSigner":false,"isWritable":false},{"index":2,"pubkey":"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x","isSigner":false,"isWritable":false},{"index":3,"pubkey":"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V","isSigner":false,"isWritable":false},{"index":4,"pubkey":"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY","isSigner":false,"isWritable":false},{"index":5,"pubkey":"GBQdwd13J9xTNat4rc96eTqNqQcFab8NbfuTgnPHsKJN","isSigner":false,"isWritable":true},{"index":6,"pubkey":"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW","isSigner":false,"isWritable":false},{"index":7,"pubkey":"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d","isSigner":false,"isWritable":true},{"index":8,"pubkey":"4JhLphoCAqkNaA1eFkFw9AP3qbW5GxicePfk7g5QJEbs","isSigner":false,"isWritable":true},{"index":9,"pubkey":"2ezq4QksdEJkAvjnGXE54vSQ417FVBmQhay7k1S1bjL7","isSigner":false,"isWritable":false}]}}
{
"status": "PASSED",
"path": "private TIP debit -> separate private TIP credit",
"debit": {
"user": "A",
"signature": "61JY1kaM2UodNS18ReMpMreMF7gaDUQCZpw3fwoYBLsFiU77hHJ76h5SiCvdsYPf8v3eDNMFeMSmFDbW8Ed7112s",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"availableBefore": "1000000",
"availableAfter": "0",
"vaultDelta": "0"
},
"credit": {
"user": "B",
"signature": "ssZNTt4fC1dtY4pYDZzS2h8EivRAEirJkAMTCiGZeYeCsZJNjQUnQX2DL9aJ9W6Noy9r9XDnn9NN6WZZkTSf6yX",
"tip": "GBQdwd13J9xTNat4rc96eTqNqQcFab8NbfuTgnPHsKJN",
"availableBefore": "0",
"availableAfter": "1000000",
"vaultDelta": "0"
},
"custody": {
"vaultBefore": "49010000",
"vaultAfter": "49010000",
"vaultDelta": "0",
"pendingLiabilitiesBefore": "1000000",
"pendingLiabilitiesAfter": "1000000",
"transferPendingBefore": "0",
"transferPendingAfter": "0"
},
"invariants": {
"debitExcludesDestinationTip": true,
"debitExcludesVault": true,
"creditExcludesSourceTip": true,
"creditExcludesVault": true,
"newTcapAccounts": 0
}
}

<!-- CRED TX NO MESSAGE PRIVATE DATA LEAKED -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-deposit-credit.mjs --user A --amount 1000000

(node:3066) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"user": "A",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "5VGMsRFBmhw97pFweK57a3t7NfWid1uvXg85NRwgNz1RDuCpjzK41rww2c4vh9EA1mZT5PaNFAdwVCy4E1tUkaot",
"slot": 492687402,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "49010000",
"vaultBalanceAfter": "50010000",
"vaultTokenDelta": "1000000",
"reservePendingBefore": "1000000",
"reservePendingAfter": "2000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_one_time_credit -> credit_one_time_tip",
"signature": "4xA7iPPwEQ27DF9CzUEaZAEppGCWCfPAxd7UhQKG7unSNGoTLbGiq8Hn8c4dEHLHzmqbZJEo1aiUP9kVn4Tesgkq",
"slot": 492687417,
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"sequence": "22",
"previousCommitment": "44d2e3d1fa93e228b888e60d09cec4d92c95552fb83e0228bc6b23ddab259f0d",
"commitment": "93b1bde340233ebbd00bfb4cf24e1f783f6d0b3a78b0bcbfaa1e25ad0e792351",
"authorizationDigest": "3e0a0eb4900e0eb0e93703a51909ba07f50db4311ba7ea9dd5252f1a19298b91",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d",
"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"7fuRhzB6R2ASstmRtjnQaFPhjQRafJ2tFnT9xfK3fm2j",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_one_time_credit"
},
{
"scope": "inner:0",
"name": "credit_one_time_tip"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/93b1bde340233ebbd00bfb4cf24e1f783f6d0b3a78b0bcbfaa1e25ad0e792351.json",
"identity": {
"user": "A",
"tin": "1000000001",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"availableBefore": "18000000",
"availableAfter": "19000000"
},
"reservePendingAfter": "1000000",
"newTcapAccounts": 0
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains no funding token account, vault, or per-deposit PDA; the stable TIP is updated in place."
}
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- I DISCOVERED EVERY CREDIT HAS 9 INPUT ACCOUNTS AND num 9 IS DIFF WHAT IS 9 IS IT GPRU? -->

<!-- CREDIT 1 -->

#1 - Unknown: Unknown
Raw

Interact With
Unknown

- TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
  Input Accounts
  #1 - Account:
  FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG
  Writable
  Signer
  Fee Payer
  #2 - Account:
  ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR
  #3 - Account:
  TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x
  Program
  #4 - Account:
  TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
  Program
  #5 - Account:
  2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY
  #6 - Account:
  6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj
  Writable
  #7 - Account:
  GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW
  #8 - Account:
  3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d
  Writable
  #9 - Account:
  BYnoz62frzzsyoiWDZsCMZJZQ1AR2F3PMr126VeRfnKB

<!-- CREDIT 2 -->

#1 - Unknown: Unknown
Raw

Interact With
Unknown

- TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
  Input Accounts
  #1 - Account:
  FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG
  Writable
  Signer
  Fee Payer
  #2 - Account:
  ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR
  #3 - Account:
  TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x
  Program
  #4 - Account:
  TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
  Program
  #5 - Account:
  2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY
  #6 - Account:
  6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj
  Writable
  #7 - Account:
  GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW
  #8 - Account:
  3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d
  Writable
  #9 - Account:
  7fuRhzB6R2ASstmRtjnQaFPhjQRafJ2tFnT9xfK3fm2j

<!-- DEBIT ISSUE -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-deposit-credit.mjs --user A --amount 1000000

(node:3120) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"user": "A",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "4pbp4C9dkCmry1ZkSQ9BEdBwgd2Fkom7jdNBQ4hocZTPtrsJXv4JBPAedC65Hk7b5RdSwz2GyiiSNB5SMnYEPQDs",
"slot": 492689229,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "50010000",
"vaultBalanceAfter": "51010000",
"vaultTokenDelta": "1000000",
"reservePendingBefore": "1000000",
"reservePendingAfter": "2000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_one_time_credit -> credit_one_time_tip",
"signature": "5c3nHtnNLxAFQAJCqcfsSH8bRDbUFQpMcmmKzKqZrKRDKtrDHQFZU1AcGTDVr4ur1WhehWH9un5tcTpbsgyz6fot",
"slot": 492689243,
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"sequence": "23",
"previousCommitment": "93b1bde340233ebbd00bfb4cf24e1f783f6d0b3a78b0bcbfaa1e25ad0e792351",
"commitment": "bf7c9fb9a308e35982dc01ea1c76bcbba13bd6af5d2f53d0a153d3974592d64e",
"authorizationDigest": "7d4bf5686d50d57f6299959f8a2df6070051dd661339ae7dbafa3bca4e7b63c8",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d",
"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"71XNpWhReycY72HCbMuupfC1V9rGLHELFmdY2s9TYq9q",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_one_time_credit"
},
{
"scope": "inner:0",
"name": "credit_one_time_tip"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/bf7c9fb9a308e35982dc01ea1c76bcbba13bd6af5d2f53d0a153d3974592d64e.json",
"identity": {
"user": "A",
"tin": "1000000001",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"availableBefore": "19000000",
"availableAfter": "20000000"
},
"reservePendingAfter": "1000000",
"newTcapAccounts": 0
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains no funding token account, vault, or per-deposit PDA; the stable TIP is updated in place."
}
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:debit-credit:devnet -- --from A --to B --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:debit-credit:devnet
> node protocol-tests/scenarios/tcap-one-time-debit-credit.mjs --from A --to B --amount 1000000

(node:3156) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
file:///mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/scenarios/tcap-one-time-debit-credit.mjs:72
const aBalance = liabilityState(Buffer.from(aLiabilityInfo.data)); const bBalance = liabilityState(Buffer.from(bLiabilityInfo.data)); if (aBalance.available < amount) throw new Error(`A available ${aBalance.available} is below ${amount}`);
^

Error: A available 0 is below 1000000
at file:///mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/scenarios/tcap-one-time-debit-credit.mjs:72:174
at process.processTicksAndRejections (node:internal/process/task_queues:103:5)

Node.js v22.22.2
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- What will happen to tx that was not successfully settled -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ RPC="$RPC" node --input-type=module - <<'JS'
import { Connection, PublicKey } from "@solana/web3.js";

const c = new Connection(process.env.RPC, "confirmed");
const r = await c.getAccountInfo(
new PublicKey("3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d")
);

if (!r) throw new Error("reserve account not found");

const d = Buffer.from(r.data);
console.log(JSON.stringify({
pendingLiabilities: d.readBigUInt64LE(148).toString(),
transferPending: d.readBigUInt64LE(193).toString()
}, null, 2));
JS
(node:200) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"pendingLiabilities": "7000000",
"transferPending": "2000000"
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!-- WHAT DEBIT EXIT LOOKS LIKE  -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:credit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:credit:devnet
> node protocol-tests/scenarios/tcap-one-time-deposit-credit.mjs --user A --amount 1000000

(node:463) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{"tip":"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj","liability":"241Jos16AjhRat17bRVqXNEoe7Dcmrk8s454hXqcjMCp","available":"0","liveCommitment":"3b004eefd6882e5dd5b9dc185e0505e79b2a0b25e336d363f642e0e55703dc95","snapshotCommitment":"3b004eefd6882e5dd5b9dc185e0505e79b2a0b25e336d363f642e0e55703dc95","adoptedLiveCommitment":false}
{
"status": "PASSED",
"scenario": "TCAP V2 funding + GPRU credit",
"user": "A",
"programs": {
"tsn": "TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V",
"tcap": "TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x"
},
"funding": {
"instruction": "deposit_asset_v2",
"signature": "3CxAaSWYj5FT7LnHeDbMvWBgycdSWBWMzok2f3i2VFpRaEsmSZUZVZAqtb1eyAAEiZQPNtHqmqzbkC7XMx7Evk8",
"slot": 493046639,
"amountBaseUnits": "1000000",
"sourceTokenAccount": "LPQpFgL3EhZxs5DhrTaLnjP4eLyRwLztUkvG7i7FaPU",
"sourceResolution": "derived-associated-token-account",
"governedVault": "2R76WD9xbzt3yMHtXEBLoxEbi2bkXYN9Hpk8nQoxsAnh",
"vaultBalanceBefore": "60010000",
"vaultBalanceAfter": "61010000",
"vaultTokenDelta": "1000000",
"reservePendingBefore": "7000000",
"reservePendingAfter": "8000000",
"reserveStatePresent": true
},
"credit": {
"instruction": "tsn_register_tcap_one_time_credit -> credit_one_time_tip",
"signature": "57fze1RPYEpSDzGDa8hLBNvpiBQCKQVnGbJSDGVvyCN5CZhyn53vFw6Xr6sQ64yE6xyrZuXZk6T6C7fbyRCjDTEH",
"slot": 493046651,
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"sequence": "30",
"previousCommitment": "3b004eefd6882e5dd5b9dc185e0505e79b2a0b25e336d363f642e0e55703dc95",
"commitment": "cbb0404dcc8323fc94e1bdbfcd873ab4097acabecaea8fc2f04cb5a743ce25c5",
"authorizationDigest": "80600dbc46568db7c481b7f41d129ea004c46b02711fef029526d58f1c2c40c0",
"accountKeys": [
"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"241Jos16AjhRat17bRVqXNEoe7Dcmrk8s454hXqcjMCp",
"3f6KxF1FRPY4ntyXxr1RbMEMwMHngV7vMGcAdBKdEc5d",
"6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"2Q48b1TAhJECiGtLwMirvyNerFSBUBcpQvCPPemQryVY",
"3kwWtAzSPwapeVanTkZstfPNTTTmioLp4GSve1RNvSjE",
"ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"GzZboGDkJTDpRredv6N5GSwF1Gb9BD6KHeHyprczsFbW",
"TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x",
"TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V"
],
"v2Instructions": [
{
"scope": "outer",
"name": "tsn_register_tcap_one_time_credit"
},
{
"scope": "inner:0",
"name": "credit_one_time_tip"
}
],
"encryptedSnapshot": "/mnt/c/Users/codepara/Desktop/trust-link/protocol-tests/tcap-v2-fixture/users/A/snapshots/cbb0404dcc8323fc94e1bdbfcd873ab4097acabecaea8fc2f04cb5a743ce25c5.json",
"identity": {
"user": "A",
"tin": "1000000001",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"availableBefore": "0",
"availableAfter": "1000000"
},
"reservePendingAfter": "7000000",
"newTcapAccounts": 0
},
"unlinkability": {
"status": "PASSED",
"forbiddenAccounts": [],
"forbiddenInstructions": [],
"fundingAccountsInCredit": [],
"note": "Credit transaction contains no funding token account, vault, or per-deposit PDA; the stable TIP is updated in place."
}
}

<!-- DEBIT EXIT -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm run tcap:one-time:debit-exit:devnet -- --user A --amount 1000000

> trustlink-pay@1.0.0 tcap:one-time:debit-exit:devnet
> node protocol-tests/scenarios/tcap-one-time-debit-exit.mjs --user A --amount 1000000

(node:487) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
{
"status": "PASSED",
"path": "private TIP debit -> public wallet exit",
"signature": "5nCqZzqy7wYU1nEyMK84o12epP6W6bHvRqxqSmkbTGREAvPeNWJ4YgzHuriHkmTHYn3SgKnabdZpAmWhPFMCyaTF",
"user": "A",
"tip": "6ZS66tZLLuEFKovAjzb5vRLLMqqEJUia8UMr4hBNdWLj",
"destination": "GRx2SwHBhqpBWc8NtQBSJHDcZAh6EioEjtxBdtufY4i6",
"amount": "1000000",
"sequence": "31",
"vaultDelta": "-1000000",
"newTcapAccounts": 0
}
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$
