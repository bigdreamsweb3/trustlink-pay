import test from 'node:test';
import assert from 'node:assert/strict';

import { estimatePruSpendTxBytes, maxPruSelectionsPerTx } from '../dist/private-settlement.js';

const SOLANA_MAX_TX_BYTES = 1232;

test('PRU spend batching stays within Solana transaction byte limits', () => {
    const maxSelections = maxPruSelectionsPerTx();
    assert.ok(maxSelections <= 3, `expected a conservative batch size, got ${maxSelections}`);

    const estimatedBytes = estimatePruSpendTxBytes(maxSelections);
    assert.ok(
        estimatedBytes <= SOLANA_MAX_TX_BYTES,
        `expected ${maxSelections} PRU selections to fit within ${SOLANA_MAX_TX_BYTES} bytes, got ${estimatedBytes}`,
    );
});
