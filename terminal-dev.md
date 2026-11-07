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

node scripts/tin-lookup.mjs 5306028334 --rpc https://api.devnet.solana.com

# PROGRAM BUILD/DEPLOY SCRIPTS RUNNER

npm run tsn:program:build:devnet
npm run tsn:program:deploy:devnet

npm run tcap:program:build:devnet
npm run tcap:program:deploy:devnet

solana program show TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V
solana program show tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF

export TCAP_RPC_URL=https://devnet.helius-rpc.com/?api-key=92a02527-5eef-4999-868a-aec60e19f6c3

<!-- INIT FUNDING ROOT -->

# INIT FUNDING ROOT

node scripts/hidden-head-setup.mjs init-funding-root \
 --rpc https://api.devnet.solana.com \
 --wallet /home/bigdream/.config/solana/id.json \
 --send

 <!-- What really happened here -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ node scripts/hidden-head-setup.mjs migrate-verifier \
 --rpc https://api.devnet.solana.com \
 --wallet "$PWD/tsn-protocol/services/tsn-node/keys/mother-node-keypair.json" \
 --args /mnt/c/Users/codepara/AppData/Local/Temp/trustlink-funded-note-validation-01a1a17e/dev/verifier-init-args.json \
 --send
(node:2664) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

{
"checkedAt": "2026-11-05T13:14:58.965Z",
"slot": 518949831,
"rpc": "https://api.devnet.solana.com",
"motherAuthority": "FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG",
"governanceAuthority": "78AacdSEWquuus5QyU654C7Gjb6gFb8okLNb8v1hn5MX",
"accounts": {
"mother": "ETNJWb2KDNdHSscVNbEiz1iWboddZdr8EPgmzw53hNkR",
"config": "52vjTMjqRoCjTLvPKPqKh2QjfVjcskiAkfhHdjw34xwa",
"root": "ESunnNGeKYHiJx6ECsCUEh95zTVwsmJKRRZBo6vQwWbq",
"fundingRoot": "FxKRFAtT1zJfAe5wtAPKbt4HKMc3NoQngW3qU5wfZsGm",
"verifier": "4qordCRiPw4XFZcPPK8LLJTCpmugTDDawonpfqvpN9cT"
},
"config": {
"version": 1,
"paused": false,
"proofVerifierProgram": "11111111111111111111111111111111",
"proofVerifierEnabled": false
},
"root": {
"currentRoot": "18c7a837c64208efc9bc31b922a20aee3033a48b977894e97ed5cd20ba68ca26",
"previousRoot": "0fd9681fddea4e538364bd6f41c632c42c72b74b82298ce11727bf946fdf962c",
"sequence": "4",
"paused": false
},
"fundingRoot": {
"currentRoot": "2f68a1c58e257e42a17a6c61dff5551ed560b9922ab119d5ac8e184c9734ead9",
"leafCount": "0"
},
"verifier": {
"version": 1,
"exists": true,
"bytes": 1388,
"enabled": true
}
}
{"mode":"SEND","command":"migrate-verifier","authority":"FnTrWDNgsXedkoCxpgKvwmEF3By4G6wzu9oyoU1n9xUG","transactions":6,"packetBytes":[790,506,506,506,378,244]}
{"transaction":1,"signature":"624ZMJEFnojbSN355WPawsaauJYtFeKC6SR7rS4YD9LkbnfP7DfnjFoRmzpMzETWrEyQngcLtWxdSebAhMQVfvec"}
{"transaction":2,"signature":"4k8KMAj2g6bSQR6qp5RXCSQRMFEP3ucmy2jGjd5tLTvMmZ1cDUkGqsqJhxRaZc5xsuVESx4V95P577MKqgYQrR7S"}
{"transaction":3,"signature":"2j5VqgiDPhkWsKHsmZ5cgdrVV6DMUZgvGHGf4bRWqXSTCbdX5tVb1hpbdNn8LntDATdd2XmfirM2PzGadzNs9Kk5"}
{"transaction":4,"signature":"2NA3EohNY8uEcxbg59DNd3vdkdaKK54aQHMiHrQMvzgmn1dNXAYupHybvHkUP13KstbveNq4GUYQTGWLQ8nrLJ6Y"}
{"transaction":5,"signature":"3ryUb4CxRnanx3PD2xTjqj86M9xBWfSMLT7G3wfBqkR8hy56r78ZanGQ6aDgyKq4vdcdSabm5M44WCfxNMcmPFeY"}
{"transaction":6,"signature":"2urV8iFjCFkHoELEexaMLFZCixG2NL2tTahehTzFsqjzeKCH6ZWgarUEAx5zAfVrkfQDNDxxkREGG2Ny59x172aS"}
CONFIRMED: GPRU verifier enabled with the exact circuit/key commitments and all fourteen IC points.
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

Then we ran this " C:\Users\codepara\Desktop\trust-link> Set-Location "C:\Users\codepara\Desktop\trust-link"

> > cargo build --locked --release `js init-funding-root --rpc http://127.0.0.1:8787
  --manifest-path tsn-protocol/programs/gpru/Cargo.toml ` timeout
> > --target-dir tsn-protocol/programs/gpru/target/node-native-funded-note"

then restarted node "

<!-- Rejected settlement guarded retry -->

# Rejected settlement guarded retry

./.venv/Scripts/python.exe scripts/retry-settlement-snapshot.py --work-id settlement-69f6df71a5e93936ae0ba0f2a451b30c --expected-version 3 --execute

<!-- ABout -->

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

<!--  -->

I found the key distinction: the verifier’s proof context can prove that a particular successor ciphertext represents an in-range value, but it does not by itself prove that the successor equals the previous balance minus the requested debit. I’m coding the reusable verifier-context binding as a GPRU core module and keeping the spend path closed until that predecessor-to-successor relation is also enforced.

<!--  -->

For Solana’s ElGamal key format, if the stable public key is \(P=s^{-1}H\), Node can choose a random \(r\), publish \(E=rH\), and compute the shared point \(S=rP\). The owner computes the same \(S\) from \(E\) and their secret. Both derive a tweak \(t\) from \(S\) and the unique DNA, then use one-time public key \(P\_{\text{DNA}}=tP\); the owner recovers its matching secret as \(s/t\). Solana’s implementation defines its public key using the inverse secret scalar, which is why the matching secret derivation takes this form. Solana ElGamal implementation https://github.com/solana-program/zk-elgamal-proof/blob/main/zk-sdk/src/encryption/elgamal.rs

<!-- Groth16 circuit prover making -->

bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$ npm ci --prefix tsn-protocol/programs/gpru/circuits/hidden_head_v1
GPRU_DEV_SETUP_DIR=/mnt/c/Users/codepara/Desktop/trust-link/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev-run-20261031 npm run gpru:prover:setup:dev

added 68 packages, and audited 69 packages in 5m

16 packages are looking for funding
run `npm fund` for details

8 vulnerabilities (5 moderate, 3 high)

To address issues that do not require attention, run:
npm audit fix

To address all issues (including breaking changes), run:
npm audit fix --force

Run `npm audit` for details.

> trustlink-pay@1.0.0 gpru:prover:setup:dev
> npm --prefix tsn-protocol/programs/gpru/circuits/hidden_head_v1 run setup:dev

> @tsn/gpru-hidden-head-circuit-v1@1.0.0 setup:dev
> node scripts/setup-dev.mjs

[dev setup] Create local Powers of Tau ceremony
[DEBUG] snarkJS: tauG1: 100000
[DEBUG] snarkJS: tauG1: 200000
[DEBUG] snarkJS: tauG1: 300000

<!-- Other prcocesses ran -->

[dev setup] Verify development key against R1CS and Powers of Tau
[INFO] snarkJS: Reading r1cs
[INFO] snarkJS: Reading tauG1
[INFO] snarkJS: Reading tauG2
[INFO] snarkJS: Reading alphatauG1
[INFO] snarkJS: Reading betatauG1
[INFO] snarkJS: Circuit hash:
5245af47 5ec133e3 10ae201c 69e52fe8
c9c7b67c 0e5e0e75 92881769 de9f5033
78fdde50 53e13692 b63a92df 1c3a976f
a04969b5 54859622 84f5ccd6 ce6c19a1
[INFO] snarkJS: Circuit Hash:
5245af47 5ec133e3 10ae201c 69e52fe8
c9c7b67c 0e5e0e75 92881769 de9f5033
78fdde50 53e13692 b63a92df 1c3a976f
a04969b5 54859622 84f5ccd6 ce6c19a1
[INFO] snarkJS: -------------------------
[INFO] snarkJS: contribution #1 LOCAL DEVELOPMENT ONLY:
a2f9ff2e 41dda112 9cb84fae b8888793
31e13d48 85986299 2ea3c989 75a0f724
92a37bae 53e4105d 108e9127 8fad6820
f65810af 25b63c88 8146f7eb 91df5995
[INFO] snarkJS: -------------------------
[INFO] snarkJS: ZKey Ok!
[dev setup] Export development verification key
[INFO] snarkJS: EXPORT VERIFICATION KEY STARTED
[INFO] snarkJS: > Detected protocol: groth16
[INFO] snarkJS: EXPORT VERIFICATION KEY FINISHED
[dev setup] Encode the verifier initializer arguments for groth16-solana
Wrote /mnt/c/Users/codepara/Desktop/trust-link/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev/verifier-init-args.json
Circuit commitment: b0e01c74246022d1a689587f155d5992b2d2b54e2b49e0dd1b8115303ca17ff4
Verifying-key commitment: 8f07f8ef1f16729f1d2ab5a7d99684ede8c0f339c0f70b049d023fc3332b3ae1
Encoded 13 IC points (constant plus 12 public inputs) for the GPRU V1 verifier initializer.
[dev setup] Ready: /mnt/c/Users/codepara/Desktop/trust-link/tsn-protocol/programs/gpru/circuits/hidden_head_v1/build/hidden_head_v1/dev
[dev setup] Do not use these artifacts for production or a production Mother verifier initialization.
bigdream@DESKTOP-FRI99BQ:/mnt/c/Users/codepara/Desktop/trust-link$

<!--  -->

Before the XP credit test:

1. Deploy those four builds, initialize GPRU’s verifier, and activate TCAP’s currently paused root.
2. Apply the prepared [Node prover settings](C:/Users/codepara/Desktop/trust-link/protocol-test-runs/hidden-head-readiness-20261102/node-prover-settings.env) and start the local services and XP.
3. Create a fresh recipient TIN and refresh its TIP snapshot. The existing TIN lacks the new balance scan key.
4. Wallet-authorize a fresh 0.01 Devnet USDC credit. USDC is already Active and Approved.
   I saved the source-bound manifest, snapshots, and [verification report](C:/Users/codepara/Desktop/trust-link/protocol-test-runs/hidden-head-readiness-20261102/README.md). No deployment, service start, or transaction signing/submission was performed; live credit remains unverified.

<!-- BUILDER QUEST -->

- Please explain what tip route root, how it was derived and how is it used across this infra and protocols
- How does this proving-key work, from how it created with code in program/script to what really happens?
- What is R1CS? How run the Groth16 setup? and this is zk-snarks right and please which protocol own this zk gpru or tcap or what?
- What are all this tip snapshot we are talking about where is it needed or coming from who owns it and what is it for?

- where is this nullifier seen publicly in a credit tx "hashing your public deposit signature with the fixed label and TCAP program ID reproduced the credit’s published nullifier exactly."?

<!-- TO DO -->

on next grpu circuit setup we need add a security layer that will tsn, the gpru prover system to only interact with a setup circuit or something that is created and signed by authority key... i mean if an impersonator tries to use a circuit setup to trick it will from start becuase that setup was not signed by a valid authority key

WHAT COURSES THIS "TIN CREDIT NODE REJECTED - TSN Node rejected reserve funding: Signed deposit blockhash was not recognized by any configured Solana RPC endpoint; prepare and sign a fresh deposit transaction Settlement work remains RECEIVED."?

if this so ir should fail bro "The finalized credit did accept the hidden-head proof, encrypted owner record, and atomic accounting update" what happened unlinking is the goal?

<!-- NOTICESSSSSSSSS -->

Trace the failed credits through blockhash preparation, wallet approval, and Node verification to find where they become stale or get misclassified. I’ll also carry the findings into the operator guide, while leaving deployments and services under your control.

Found: The report shows funding rejected during Node simulation, so settlement never became eligible to execute. I found two possible contributors: XP fetches the blockhash before both wallet approvals, and Node can report it as invalid even when one RPC timed out. I’m checking the recorded timing and gateway behavior to separate those causes.
