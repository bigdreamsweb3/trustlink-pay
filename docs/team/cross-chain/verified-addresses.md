# Historical cross-network address evidence

**Status: HISTORICAL, retired integration; reviewed 2026-11-22.** The following addresses and receipt hashes preserve the former EVM testnet observations (chain ID `102031`) from the September 2026 register. They are not current configuration, live liquidity observations or deployments on any planned network. The entries have not been rechecked in this task. Old explorer links and operating instructions are removed from the current reading path.

Current native Solana evidence belongs in the [architecture map](../../laboratory/architecture-map.md), [credit ABI](../../laboratory/credit-abi.md) and dated experiments. No TSN destination on Base, Arbitrum or Polygon is established by this register; Ethereum Layer 1 is outside the current integration scope.

The earlier EVM operator gas-funding record was address `0x0f42c93F992AdA97d4a8aF3348D7141741de242d` and transaction `0x042bac062e15be7be44dcf7198eab6956ef8aa4cad74e1ab54a63eafe79198af`. Gas funding was separate from settlement liquidity.

## Preserved original observations

All verification/status wording below reports the earlier observation only. Earlier zero-vault and later funded-USDSET entries describe different checkpoints; none proves a complete Solana-origin payout. Component labels are editorial descriptions of the removed prototype, not renamed runtime exports.

## Former testnet contract observations

### Core prototype and proof-middleware boundary

| Component | Contract address | Deployment transaction | Status |
| --- | --- | --- | --- |
| DestinationLiquidityRegistry | `0x87710a05770c84Dd706F2CfdC9862A44CC159973` | `0x1e2ad1f1054d8e364f0fd7650e3eb594a8d4ed69e3963541d0f43ca09aaef984` | Bytecode and mined receipt verified |
| DestinationLiquidityASC | `0x279668eaf51cC3e39F6AeDE46644BAaC689B3EC3` | `0x8f7ce08b8b55d1d8eb370615baf6c3713c5a2403c317d1235e122c6024a0de76` | Bytecode and mined receipt verified |
| FormerSettlementHub | `0x0EF8B97927eE1f7B3F6171E9308E1554886EEC74` | `0x06522b8aea73acee6b85d6bebdc3dc3991e66b299fe64f173dcde38179137c8f` | Bytecode and mined receipt verified |
| DestinationRegistry | `0xd8DD919B3Cf8C365Bb0dc82Dd3D06Cf5B8f41ba0` | `0xe34fd69dc1e8b39e308e13493918b8238a5a69f9bc327d7ea57daeaef659bf52` | Governance registry deployed and verified |

### Direct destination prototype

| Component | Contract address | Deployment transaction | Status |
| --- | --- | --- | --- |
| FormerDirectLiquidityRegistry | `0xB6D69Cfe96610bfA626Cc18d02F2B1Af2B5227F7` | `0x1c842cdd50c009cc1f01e3108f3c31f220ba047a09ad0ab40030791edadda1b1` | Recorded historical check; registry is route authority |
| TSNERCLiquidityVault | `0xC9E3d423cBddD19231a7E684391aeFdf64EaF966` | `0xd63b1041c7fbc8ddf2c29715996ac56856cca537129599a88ff1a9982ceac2a7` | Recorded historical check; balance was `0` at last observation |
| FormerDirectSettlementHub | `0x3EcDB3c94959a435877bdEf41a9469194a4dedd0` | `0x962fe8429ac60cd4717e00ee10d61f1267222d0479a3b3891bd482f0174f6d1b` | Recorded historical check; payout blocked until liquidity is funded |
| FormerDirectSettlementExecutor | `0x140C81a2D6a099129BD98f29064A19E7B7c33D57` | `0x214c187756c88d81a8f52a9d6a21bb95f268a03edcc4c6868ace0449c07e3cfb` | Recorded historical check; releases the exact registry token |

Latest USDSET-bound route deployment:

| Component | Contract address | Transaction | Status |
| --- | --- | --- | --- |
| USDSET-bound registry | `0x764Ac587b1fC0feBEE86012cF7A2489b575EE5D1` | `0x60be7be5e02bdb67b02b8be2e2f5da84d9ba0f6320eef37a64338c23d6d95cde` | Historically active route registry |
| USDSET-bound vault | `0xe22A08706157EB59B70CA0Fa7b23bd13E4C890f0` | `0x7f2ece90dc3c62d84f309ab450c95cacd7a766254ca07e7e80aea6a832ee77cb` | Funded with `1,000,000` USDSET |
| USDSET-bound Hub | `0x29151Ff9266b8Fb15D86D22d73f084F59293438c` | `0x7d2d4abad5adc4b04316bade401a1e210dfa2834d54a865178589ffc6feeba45` | Registered to enforce USDSET route |
| USDSET-bound executor | `0xeb040D046Fa4a39bB51203129BC82f2CB5084a5F` | `0xfc27a112c625bbbe4c84435a56d1bb9fda2c7cce25f5e78e240bf0e9b19a4978` | Bound to the USDSET vault |

The route configuration transaction is
`0x4615fc7f1a0ce2deb33a3a6cb9f3ec0a8352ba7eaa5f68331bf0a6fbd3c33106`,
the vault funding transaction is
`0x68b994b46948dde08318ceb02579518cdd3e797f2d14ddfa9029a6b254780293`,
and the liquidity observation transaction is
`0x97c4fa8cc5be1aa9943ecce5c3c6d3e390e6f5b1a7812264117776c4476976b4`.
The final read-only RPC check returned an active route and a vault balance of
`1,000,000` USDSET base units scaled to 6 decimals.

## Historical test tokens

| Asset | Address | Evidence | Settlement status |
| --- | --- | --- | --- |
| CTC | Native asset; no ERC-20 contract address | former testnet Blockscout | Gas only; not payout liquidity |
| Bridge Test Token | `0x914Cf96BF28b7b4921db27b264ecEd71aC91134E` | former testnet RPC metadata: `Bridge Test Token`, `BTKT`, 18 decimals | Test token only; deployer and direct vault balances were `0` |
| TSN Dollar Settlement | `0xA6a0e01Dbaf91aE8fa46Ff7B832c23E735A269a9` | Deployment `0x6b7fd3338a1ac80bf3f884ab084132265d1f6199704e7f81846a1cfb45b665b3`; initial mint `0x04acf72a7dc56f913839fc09c6bc60201412c5bec612efd49c4a27d38721c63c` | Recorded historical TSN-owned former testnet test asset; 6 decimals; 1,000,000 USDSET minted to the deployer |
| USDC-Test | `0xbB24c8DaC3cBe2021F3E3823724CE19f08B81135` | former testnet Blockscout token index: `USDC-Test`, symbol `USDC-T`, 6 decimals | Test token only; deployer and direct vault balances were `0` |
| USDT-Test | `0x64936984808ba2ba09E14c08cC2Ad7FD05b71FFF` | former testnet Blockscout token index: `USDT-Test`, symbol `USDT-T`, 6 decimals | Test token only; deployer and direct vault balances were `0` |

`USDC-T` and `USDT-T` were the former testnet candidates found in the
explorer. Their names do not establish Circle or Tether issuance. They must be
described as retired EVM prototype test assets, not as official USDC or USDT.

The former registry stored the exact payout token address. A USDC route pays
only the registered USDC contract and a USDT route pays only the registered
USDT contract. The former direct lane had no swap, router, or symbol substitution.
