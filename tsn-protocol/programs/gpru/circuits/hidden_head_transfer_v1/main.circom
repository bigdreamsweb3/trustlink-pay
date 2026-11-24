pragma circom 2.1.8;
include "primitives.circom";

template HiddenHeadTransferV1() {
    signal input oldGlobalRoot;
    signal input newGlobalRoot;
    signal input tipRouteRoot;
    signal input rootSequence;
    signal input deploymentCommitment;
    signal input assetId;
    signal input validAfterSlot;
    signal input expiresAtSlot;
    signal input amountCommitment;
    signal input authorizationCommitment;
    signal input actionCommitment;
    signal input nullifier;
    signal input memoCommitments[2];
    signal input successorPortfolioRoots[2];
    signal input successorBalanceX[2];
    signal input successorBalanceY[2];

    signal input amount;
    signal input amountBlinding;
    signal input nonce;
    signal input lookup[2];
    signal input routeKeys[2];
    signal input policies[2];
    signal input scanX[2];
    signal input scanY[2];
    signal input routeIndices[2];
    signal input routeSiblings[2][32];
    signal input sequences[2];
    signal input priorMemos[2];
    signal input priorActions[2];
    signal input priorPortfolios[2];
    signal input firstTokens[2];
    signal input portfolioSiblings[2][32];
    signal input priorBalanceX[2];
    signal input priorBalanceY[2];
    signal input oldBalances[2];
    signal input oldBlindings[2];
    signal input newBalances[2];
    signal input newBlindings[2];
    signal input blindingDeltas[2];
    signal input blindingCarries[2];
    // Recipient path is selected AFTER the sender update, so a single final
    // root authenticates both changes, including paths sharing ancestors.
    signal input accountSiblings[2][128];
    signal input nullifierSiblings[128];

    component assetBits = Num2Bits(32);
    assetBits.in <== assetId;
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;
    component startBits = Num2Bits(64);
    startBits.in <== validAfterSlot;
    component endBits = Num2Bits(64);
    endBits.in <== expiresAtSlot;
    component interval = LessEqThan(64);
    interval.in[0] <== validAfterSlot;
    interval.in[1] <== expiresAtSlot;
    interval.out === 1;
    component seqBits = Num2Bits(64);
    seqBits.in <== rootSequence;
    component nextSeqBits = Num2Bits(64);
    nextSeqBits.in <== rootSequence + 1;
    component nonzero[8];
    nonzero[0] = IsZero(); nonzero[0].in <== assetId;
    nonzero[1] = IsZero(); nonzero[1].in <== amount;
    nonzero[2] = IsZero(); nonzero[2].in <== amountBlinding;
    nonzero[3] = IsZero(); nonzero[3].in <== nonce;
    nonzero[4] = IsZero(); nonzero[4].in <== deploymentCommitment;
    nonzero[5] = IsZero(); nonzero[5].in <== nullifier;
    nonzero[6] = IsZero(); nonzero[6].in <== memoCommitments[0];
    nonzero[7] = IsZero(); nonzero[7].in <== memoCommitments[1];
    for (var i = 0; i < 8; i++) nonzero[i].out === 0;

    // Distinct hidden map indices are necessary even for distinct full keys.
    component keyBits[2];
    component indices[2];
    for (var i = 0; i < 2; i++) {
        keyBits[i] = Num2Bits_strict();
        keyBits[i].in <== routeKeys[i];
        indices[i] = Bits2Num(128);
        for (var j = 0; j < 128; j++) indices[i].in[j] <== keyBits[i].out[j];
    }
    component sameIndex = IsEqual();
    sameIndex.in[0] <== indices[0].out;
    sameIndex.in[1] <== indices[1].out;
    sameIndex.out === 0;

    // ASCII domain fields match offline/core.py. The secret nonce produces a
    // stable one-time identifier for re-proving the same approval.
    component spend = Poseidon(3);
    spend.inputs[0] <== 529319206433468356812386113548106742339945445416691172333105;
    spend.inputs[1] <== routeKeys[0];
    spend.inputs[2] <== nonce;
    spend.out === nullifier;
    component value = Poseidon(5);
    value.inputs[0] <== 123241731532259927320383981230694147302227412211249;
    value.inputs[1] <== assetId;
    value.inputs[2] <== amount;
    value.inputs[3] <== amountBlinding;
    value.inputs[4] <== nullifier;
    value.out === amountCommitment;
    component context = Poseidon(5);
    context.inputs[0] <== 8076770117698186596868684593934682171033851878354933297;
    context.inputs[1] <== deploymentCommitment;
    context.inputs[2] <== assetId;
    context.inputs[3] <== validAfterSlot;
    context.inputs[4] <== expiresAtSlot;
    component nonceContext = Poseidon(2);
    nonceContext.inputs[0] <== context.out;
    nonceContext.inputs[1] <== nonce;
    component approval = Poseidon(5);
    approval.inputs[0] <== 481413013797890341095249926682393123949190796849;
    approval.inputs[1] <== routeKeys[0];
    approval.inputs[2] <== routeKeys[1];
    approval.inputs[3] <== amountCommitment;
    approval.inputs[4] <== nonceContext.out;
    approval.out === authorizationCommitment;
    component action = Poseidon(5);
    action.inputs[0] <== 4;
    action.inputs[1] <== assetId;
    action.inputs[2] <== amountCommitment;
    action.inputs[3] <== authorizationCommitment;
    action.inputs[4] <== nullifier;
    action.out === actionCommitment;

    component legs[2];
    component oldHeads[2];
    component newHeads[2];
    for (var i = 0; i < 2; i++) {
        legs[i] = TransferLeg(2 * i - 1);
        legs[i].lookup <== lookup[i];
        legs[i].routeKey <== routeKeys[i];
        legs[i].policy <== policies[i];
        legs[i].scanX <== scanX[i];
        legs[i].scanY <== scanY[i];
        legs[i].routeIndex <== routeIndices[i];
        for (var j = 0; j < 32; j++) legs[i].routeSiblings[j] <== routeSiblings[i][j];
        legs[i].tipRoot <== tipRouteRoot;
        legs[i].sequence <== sequences[i];
        legs[i].priorMemo <== priorMemos[i];
        legs[i].priorAction <== priorActions[i];
        legs[i].priorPortfolio <== priorPortfolios[i];
        legs[i].firstToken <== firstTokens[i];
        for (var j = 0; j < 32; j++) legs[i].portfolioSiblings[j] <== portfolioSiblings[i][j];
        legs[i].asset <== assetId;
        legs[i].amount <== amount;
        legs[i].priorX <== priorBalanceX[i];
        legs[i].priorY <== priorBalanceY[i];
        legs[i].oldBalance <== oldBalances[i];
        legs[i].oldBlinding <== oldBlindings[i];
        legs[i].newBalance <== newBalances[i];
        legs[i].newBlinding <== newBlindings[i];
        legs[i].blindingDelta <== blindingDeltas[i];
        legs[i].blindingCarry <== blindingCarries[i];
        legs[i].nextMemo <== memoCommitments[i];
        legs[i].action <== actionCommitment;
        legs[i].nextPortfolio <== successorPortfolioRoots[i];
        legs[i].nextX <== successorBalanceX[i];
        legs[i].nextY <== successorBalanceY[i];
        oldHeads[i] = TransferPath(128);
        oldHeads[i].leaf <== legs[i].oldLeaf;
        oldHeads[i].key <== routeKeys[i];
        newHeads[i] = TransferPath(128);
        newHeads[i].leaf <== legs[i].newLeaf;
        newHeads[i].key <== routeKeys[i];
        for (var j = 0; j < 128; j++) {
            oldHeads[i].siblings[j] <== accountSiblings[i][j];
            newHeads[i].siblings[j] <== accountSiblings[i][j];
        }
    }
    oldHeads[1].root === newHeads[0].root;
    component nullifierKey = Poseidon(1);
    nullifierKey.inputs[0] <== nullifier;
    component oldSpend = TransferPath(128);
    oldSpend.leaf <== 0;
    oldSpend.key <== nullifierKey.out;
    component newSpend = TransferPath(128);
    newSpend.leaf <== nullifierKey.out;
    newSpend.key <== nullifierKey.out;
    for (var i = 0; i < 128; i++) {
        oldSpend.siblings[i] <== nullifierSiblings[i];
        newSpend.siblings[i] <== nullifierSiblings[i];
    }
    component oldRoot = Poseidon(2);
    oldRoot.inputs[0] <== oldHeads[0].root;
    oldRoot.inputs[1] <== oldSpend.root;
    oldRoot.out === oldGlobalRoot;
    component newRoot = Poseidon(2);
    newRoot.inputs[0] <== newHeads[1].root;
    newRoot.inputs[1] <== newSpend.root;
    newRoot.out === newGlobalRoot;
    component changedRoot = IsEqual();
    changedRoot.in[0] <== oldGlobalRoot;
    changedRoot.in[1] <== newGlobalRoot;
    changedRoot.out === 0;
}

component main {public [oldGlobalRoot, newGlobalRoot, tipRouteRoot, rootSequence, deploymentCommitment, assetId, validAfterSlot, expiresAtSlot, amountCommitment, authorizationCommitment, actionCommitment, nullifier, memoCommitments, successorPortfolioRoots, successorBalanceX, successorBalanceY]} = HiddenHeadTransferV1();
