import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyLib = readFileSync(
  new URL("../../../tsn-protocol/tsn/protocol/programs/trustlink-escrow/src/lib.rs", import.meta.url),
  "utf8",
);
const legacyVault = readFileSync(
  new URL("../../../tsn-protocol/tsn/protocol/programs/trustlink-escrow/src/tsn/state/vault.rs", import.meta.url),
  "utf8",
);
const tcapLib = readFileSync(new URL("../../programs/tcap/src/lib.rs", import.meta.url), "utf8");
const tcapAuthority = readFileSync(new URL("../../programs/tcap/src/authority.rs", import.meta.url), "utf8");

test("legacy TSN program does not compile a TCAP-owned module", () => {
  assert.doesNotMatch(legacyLib, /pub mod tcap/);
  assert.doesNotMatch(legacyLib, /FQoYvo8fYyGB4ewfQiZCuQKoKT4oZg6dUnMGUS3v8Zw1/);
});

test("TCAP has an independent program ID and reserve-authority seed domain", () => {
  assert.match(tcapLib, /TcApT4CytBqvqEDpRYVB7Wfi6aFzmtSZdWvDsq6bp9x/);
  assert.match(tcapAuthority, /tcap:reserve-authority:v1/);
  const productionAuthorityCode = tcapAuthority.split("#[cfg(test)]", 1)[0];
  assert.doesNotMatch(productionAuthorityCode, /TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V/);
});

test("legacy liquidity account layouts contain no TCAP reserve authority", () => {
  assert.match(legacyVault, /pub struct CrankerVault/);
  assert.doesNotMatch(legacyVault, /TcapReserve|TCAP_RESERVE|tcap-reserve/);
});

test("Phase 3 TCAP program exposes initialization-only instructions", () => {
  assert.match(tcapLib, /#\[program\]/);
  assert.match(tcapLib, /initialize_tcap_v1/);
  assert.match(tcapLib, /register_tsn_authorization_v1/);
  assert.doesNotMatch(tcapLib, /TransferChecked|token::transfer|public_exit|redeem/);
});
