# Historical USDSET test asset

**Status: HISTORICAL retired-route evidence, reviewed 2026-11-22.** TSN Dollar Settlement (USDSET) was a six-decimal ERC-20 test asset in the former EVM prototype. It was neither Circle USDC nor Tether USDT and did not establish fiat backing. Its old deployment helper and route setup are removed from current operations.

The recorded contract was `0xA6a0e01Dbaf91aE8fa46Ff7B832c23E735A269a9`; deployment transaction `0x6b7fd3338a1ac80bf3f884ab084132265d1f6199704e7f81846a1cfb45b665b3` and initial mint `0x04acf72a7dc56f913839fc09c6bc60201412c5bec612efd49c4a27d38721c63c` recorded an explicit supply of 1,000,000 USDSET. Later vault funding and route observations are retained in the [historical register](verified-addresses.md).

Token deployment and minting did not establish source accounting, route admission or payout. A future integration must independently select the accepted asset and verify its official issuer, contract, decimals and destination liquidity under the [integration plan](../../CROSS-NETWORK-PAYMENTS-BUILD-PLAN.md).
