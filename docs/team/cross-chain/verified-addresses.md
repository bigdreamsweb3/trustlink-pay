# Verified cross-chain addresses

## Purpose and status

This is the team evidence register for public contract addresses, token
addresses, and network identifiers used by TSN. An entry is marked **verified**
only when it was checked on the target network or is supported by a mined
deployment record linked to the target explorer.

**Observed on:** 2026-09-12  
**Scope:** Solana Devnet and Creditcoin CC3 Testnet  
**Important:** Base, Ethereum, and other EVM destinations have no verified
TSN-owned deployment in this register yet. They must not be presented as live
routes.

## Network identifiers

| Network | Role | Identifier | Explorer |
| --- | --- | --- | --- |
| Solana Devnet | Source accounting and native settlement | `devnet` | [Solana Explorer](https://explorer.solana.com/?cluster=devnet) |
| Creditcoin CC3 Testnet | First EVM destination and settlement domain | EVM chain ID `102031` | [Blockscout](https://creditcoin-testnet.blockscout.com/) · [Subscan](https://creditcoin3-testnet.subscan.io/) |

Creditcoin EVM contracts are checked through Blockscout/RPC. Subscan shows
Creditcoin runtime activity and is not a Solana transaction explorer.

## Solana Devnet

| Component | Address | Evidence | Status |
| --- | --- | --- | --- |
| TSNP program | `TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V` | [Solana Explorer](https://explorer.solana.com/address/TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V?cluster=devnet) | Verified executable account on Devnet |
| TIN program | `TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT` | [Solana Explorer](https://explorer.solana.com/address/TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT?cluster=devnet) | Verified executable account on Devnet |
| Devnet test stablecoin mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | [Solana Explorer](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) | Verified SPL mint fixture; not production USDC |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` | [Solana Explorer](https://explorer.solana.com/address/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA?cluster=devnet) | Canonical program |

The repository contains a TCAP address reference, but that string did not pass
the live Solana account check in this inventory. It is intentionally not listed
as verified until the exact Devnet program ID is confirmed.

## Creditcoin CC3 Testnet contracts

### Core Creditcoin / Attestcoin boundary

| Component | Contract address | Deployment transaction | Status |
| --- | --- | --- | --- |
| DestinationLiquidityRegistry | [`0x87710a05770c84Dd706F2CfdC9862A44CC159973`](https://creditcoin-testnet.blockscout.com/address/0x87710a05770c84Dd706F2CfdC9862A44CC159973) | [`0x1e2ad1f1054d8e364f0fd7650e3eb594a8d4ed69e3963541d0f43ca09aaef984`](https://creditcoin-testnet.blockscout.com/tx/0x1e2ad1f1054d8e364f0fd7650e3eb594a8d4ed69e3963541d0f43ca09aaef984) | Bytecode and mined receipt verified |
| DestinationLiquidityASC | [`0x279668eaf51cC3e39F6AeDE46644BAaC689B3EC3`](https://creditcoin-testnet.blockscout.com/address/0x279668eaf51cC3e39F6AeDE46644BAaC689B3EC3) | [`0x8f7ce08b8b55d1d8eb370615baf6c3713c5a2403c317d1235e122c6024a0de76`](https://creditcoin-testnet.blockscout.com/tx/0x8f7ce08b8b55d1d8eb370615baf6c3713c5a2403c317d1235e122c6024a0de76) | Bytecode and mined receipt verified |
| CreditcoinSettlementHub | [`0x0EF8B97927eE1f7B3F6171E9308E1554886EEC74`](https://creditcoin-testnet.blockscout.com/address/0x0EF8B97927eE1f7B3F6171E9308E1554886EEC74) | [`0x06522b8aea73acee6b85d6bebdc3dc3991e66b299fe64f173dcde38179137c8f`](https://creditcoin-testnet.blockscout.com/tx/0x06522b8aea73acee6b85d6bebdc3dc3991e66b299fe64f173dcde38137c8f) | Bytecode and mined receipt verified |
| DestinationRegistry | [`0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0`](https://creditcoin-testnet.blockscout.com/address/0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0) | [`0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52`](https://creditcoin-testnet.blockscout.com/tx/0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52) | Governance registry deployed and verified |

### Direct Creditcoin destination prototype

| Component | Contract address | Deployment transaction | Status |
| --- | --- | --- | --- |
| CreditcoinDirectLiquidityRegistry | [`0xB6D69Cfe96610bfA626Cc18d02F2B1Af2B5227F7`](https://creditcoin-testnet.blockscout.com/address/0xB6D69Cfe96610bfA626Cc18d02F2B1Af2B5227F7) | [`0x1c842cdd50c009cc1f01e3108f3c31f220ba047a09ad0ab40030791edadda1b1`](https://creditcoin-testnet.blockscout.com/tx/0x1c842cdd50c009cc1f01e3108f3c31f220ba047a09ad0ab40030791edadda1b1) | Verified; registry is route authority |
| TSNERCLiquidityVault | [`0xC9E3d423cBddD19231a7E684391aeFdf64EaF966`](https://creditcoin-testnet.blockscout.com/address/0xC9E3d423cBddD19231a7E684391aeFdf64EaF966) | [`0xd63b1041c7fbc8ddf2c29715996ac56856cca537129599a88ff1a9982ceac2a7`](https://creditcoin-testnet.blockscout.com/tx/0xd63b1041c7fbc8ddf2c29715996ac56856cca537129599a88ff1a9982ceac2a7) | Verified; balance was `0` at last observation |
| CreditcoinDirectSettlementHub | [`0x3EcDB3c94959a435877bdEf41a9469194a4dedd0`](https://creditcoin-testnet.blockscout.com/address/0x3EcDB3c94959a435877bdEf41a9469194a4dedd0) | [`0x962fe8429ac60cd4717e00ee10d61f1267222d0479a3b3891bd482f0174f6d1b`](https://creditcoin-testnet.blockscout.com/tx/0x962fe8429ac60cd4717e00ee10d61f1267222d0479a3b3891bd482f0174f6d1b) | Verified; payout blocked until liquidity is funded |
| CreditcoinDirectSettlementExecutor | [`0x140C81a2D6a099129BD98f29064A19E7B7c33D57`](https://creditcoin-testnet.blockscout.com/address/0x140C81a2D6a099129BD98f29064A19E7B7c33D57) | [`0x214c187756c88d81a8f52a9d6a21bb95f268a03edcc4c6868ace0449c07e3cfb`](https://creditcoin-testnet.blockscout.com/tx/0x214c187756c88d81a8f52a9d6a21bb95f268a03edcc4c6868ace0449c07e3cfb) | Verified; releases the exact registry token |

Latest USDSET-bound route deployment:

| Component | Contract address | Transaction | Status |
| --- | --- | --- | --- |
| USDSET-bound registry | [`0x764Ac587b1fC0feBEE86012cF7A2489b575EE5D1`](https://creditcoin-testnet.blockscout.com/address/0x764Ac587b1fC0feBEE86012cF7A2489b575EE5D1) | [`0x60be7be5e02bdb67b02b8be2e2f5da84d9ba0f6320eef37a64338c23d6d95cde`](https://creditcoin-testnet.blockscout.com/tx/0x60be7be5e02bdb67b02b8be2e2f5da84d9ba0f6320eef37a64338c23d6d95cde) | Active route registry |
| USDSET-bound vault | [`0xe22A08706157EB59B70CA0Fa7b23bd13E4C890f0`](https://creditcoin-testnet.blockscout.com/address/0xe22A08706157EB59B70CA0Fa7b23bd13E4C890f0) | [`0x7f2ece90dc3c62d84f309ab450c95cacd7a766254ca07e7e80aea6a832ee77cb`](https://creditcoin-testnet.blockscout.com/tx/0x7f2ece90dc3c62d84f309ab450c95cacd7a766254ca07e7e80aea6a832ee77cb) | Funded with `1,000,000` USDSET |
| USDSET-bound Hub | [`0x29151Ff9266b8Fb15D86D22d73f084F59293438c`](https://creditcoin-testnet.blockscout.com/address/0x29151Ff9266b8Fb15D86D22d73f084F59293438c) | [`0x7d2d4abad5adc4b04316bade401a1e210dfa2834d54a865178589ffc6feeba45`](https://creditcoin-testnet.blockscout.com/tx/0x7d2d4abad5adc4b04316bade401a1e210dfa2834d54a865178589ffc6feeba45) | Registered to enforce USDSET route |
| USDSET-bound executor | [`0xeb040D046Fa4a39bB51203129BC82f2CB5084a5F`](https://creditcoin-testnet.blockscout.com/address/0xeb040D046Fa4a39bB51203129BC82f2CB5084a5F) | [`0xfc27a112c625bbbe4c84435a56d1bb9fda2c7cce25f5e78e240bf0e9b19a4978`](https://creditcoin-testnet.blockscout.com/tx/0xfc27a112c625bbbe4c84435a56d1bb9fda2c7cce25f5e78e240bf0e9b19a4978) | Bound to the USDSET vault |

The route configuration transaction is
[`0x4615fc7f1a0ce2deb33a3a6cb9f3ec0a8352ba7eaa5f68331bf0a6fbd3c33106`](https://creditcoin-testnet.blockscout.com/tx/0x4615fc7f1a0ce2deb33a3a6cb9f3ec0a8352ba7eaa5f68331bf0a6fbd3c33106),
the vault funding transaction is
[`0x68b994b46948dde08318ceb02579518cdd3e797f2d14ddfa9029a6b254780293`](https://creditcoin-testnet.blockscout.com/tx/0x68b994b46948dde08318ceb02579518cdd3e797f2d14ddfa9029a6b254780293),
and the liquidity observation transaction is
[`0x97c4fa8cc5be1aa9943ecce5c3c6d3e390e6f5b1a7812264117776c4476976b4`](https://creditcoin-testnet.blockscout.com/tx/0x97c4fa8cc5be1aa9943ecce5c3c6d3e390e6f5b1a7812264117776c4476976b4).
The final read-only RPC check returned an active route and a vault balance of
`1,000,000` USDSET base units scaled to 6 decimals.

## Creditcoin tokens

| Asset | Address | Evidence | Settlement status |
| --- | --- | --- | --- |
| CTC | Native asset; no ERC-20 contract address | [CC3 Blockscout](https://creditcoin-testnet.blockscout.com/) | Gas only; not payout liquidity |
| Bridge Test Token | [`0x914Cf96BF28b7b4921db27b264ecEd71aC91134E`](https://creditcoin-testnet.blockscout.com/address/0x914Cf96BF28b7b4921db27b264ecEd71aC91134E) | CC3 RPC metadata: `Bridge Test Token`, `BTKT`, 18 decimals | Test token only; deployer and direct vault balances were `0` |
| TSN Dollar Settlement | [`0xA6a0e01Dbaf91aE8fa46Ff7B832c23E735A269a9`](https://creditcoin-testnet.blockscout.com/address/0xA6a0e01Dbaf91aE8fa46Ff7B832c23E735A269a9) | Deployment [`0x6b7fd3338a1ac80bf3f884ab084132265d1f6199704e7f81846a1cfb45b665b3`](https://creditcoin-testnet.blockscout.com/tx/0x6b7fd3338a1ac80bf3f884ab084132265d1f6199704e7f81846a1cfb45b665b3); initial mint [`0x04acf72a7dc56f913839fc09c6bc60201412c5bec612efd49c4a27d38721c63c`](https://creditcoin-testnet.blockscout.com/tx/0x04acf72a7dc56f913839fc09c6bc60201412c5bec612efd49c4a27d38721c63c) | Verified TSN-owned CC3 test asset; 6 decimals; 1,000,000 USDSET minted to the deployer |
| USDC-Test | [`0xbB24c8DaC3cBe2021F3E3823724CE19f08B81135`](https://creditcoin-testnet.blockscout.com/address/0xbB24c8DaC3cBe2021F3E3823724CE19f08B81135) | CC3 Blockscout token index: `USDC-Test`, symbol `USDC-T`, 6 decimals | Test token only; deployer and direct vault balances were `0` |
| USDT-Test | [`0x64936984808ba2ba09E14c08cC2Ad7FD05b71FFF`](https://creditcoin-testnet.blockscout.com/address/0x64936984808ba2ba09E14c08cC2Ad7FD05b71FFF) | CC3 Blockscout token index: `USDT-Test`, symbol `USDT-T`, 6 decimals | Test token only; deployer and direct vault balances were `0` |

`USDC-T` and `USDT-T` are the usable CC3 testnet candidates found in the
explorer. Their names do not establish Circle or Tether issuance. They must be
described as Creditcoin test assets, not as official USDC or USDT.

The live registry stores the exact payout token address. A USDC route pays
only the registered USDC contract and a USDT route pays only the registered
USDT contract. The direct lane has no swap, router, or symbol substitution.

## Other EVM networks

| Network | TSN-owned contracts | TSN-approved payout tokens | Status |
| --- | --- | --- | --- |
| Ethereum | None verified | None verified | Not an active TSN route |
| Base | None verified | None verified | Not an active TSN route |
| Other EVM networks | None verified | None verified | Adapter and liquidity evidence required |

## Verification procedure

For every new entry, record the network, chain ID, address, deployment or
configuration transaction, explorer link, bytecode/account-owner check, token
metadata, and current liquidity observation. The current CC3 check used
`eth_getCode` against `https://rpc.cc3-testnet.creditcoin.network`; every
listed CC3 contract returned non-empty bytecode. The Solana check used
`solana account ... --url devnet`; the listed TSN and TIN accounts returned
executable BPF accounts, and the listed mint returned the canonical SPL Token
Program owner.

When an address is not verified, leave it out of active route configuration.
Do not fill the gap with a placeholder, guessed address, or token from another
network.

## Next evidence gate

The next valid update is a selected `USDC-T` or `USDT-T` route, a prefunded
route vault, a successful `observeLocalLiquidity` call, and the resulting
registry state. Until those artifacts exist, the direct Creditcoin lane is
deployed infrastructure with zero payout liquidity, not a completed stablecoin
settlement demonstration.
