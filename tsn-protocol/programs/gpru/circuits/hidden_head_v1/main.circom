pragma circom 2.1.8;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// A sparse Merkle path whose index is derived from a field element. Only the
// low 128 bits select the path; strict decomposition prevents field aliases.
template SparsePath128() {
    signal input leaf;
    signal input key;
    signal input siblings[128];
    signal output root;

    component keyBits = Num2Bits_strict();
    keyBits.in <== key;

    signal nodes[129];
    signal left[128];
    signal right[128];
    nodes[0] <== leaf;
    component hashes[128];
    for (var i = 0; i < 128; i++) {
        // keyBits.out[i] is constrained to 0 or 1 by Num2Bits_strict.
        // Algebraic selection avoids relying on a signal-valued conditional.
        left[i] <== nodes[i] + keyBits.out[i] * (siblings[i] - nodes[i]);
        right[i] <== siblings[i] + keyBits.out[i] * (nodes[i] - siblings[i]);
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== left[i];
        hashes[i].inputs[1] <== right[i];
        nodes[i + 1] <== hashes[i].out;
    }
    root <== nodes[128];
}

template SparsePath32() {
    signal input leaf;
    signal input index;
    signal input siblings[32];
    signal output root;

    component indexBits = Num2Bits(32);
    indexBits.in <== index;
    signal nodes[33];
    signal left[32];
    signal right[32];
    nodes[0] <== leaf;
    component hashes[32];
    for (var i = 0; i < 32; i++) {
        left[i] <== nodes[i] + indexBits.out[i] * (siblings[i] - nodes[i]);
        right[i] <== siblings[i] + indexBits.out[i] * (nodes[i] - siblings[i]);
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== left[i];
        hashes[i].inputs[1] <== right[i];
        nodes[i + 1] <== hashes[i].out;
    }
    root <== nodes[32];
}

template HiddenHeadTransitionV1() {
    // Public signals are intentionally limited to shared protocol state and
    // one-time action data. They do not contain a TIP/TIN account, route key,
    // per-TIN sequence, predecessor, or private sparse-tree index.
    signal input oldGlobalRoot;
    signal input newGlobalRoot;
    signal input memoCommitment;
    signal input actionCommitment;
    signal input nullifier;
    signal input tipRouteRoot;

    // Private TIP membership opening.
    signal input tipLookupCommitment;
    signal input routeKeyCommitment;
    signal input routePolicyCommitment;
    signal input tipRouteIndex;
    signal input tipSiblings[32];

    // Private latest-head state and its authenticated-map path.
    signal input accountPathKey;
    signal input assetCommitment;
    signal input priorSequence;
    signal input predecessorMemoCommitment;
    signal input predecessorActionCommitment;
    signal input accountSiblings[128];

    // Private nullifier-map path. The public nullifier is one-time and
    // independent of the TIN identity; an existing leaf must be empty.
    signal input nullifierSiblings[128];

    // Private action fields bind the memo/head update to the action authorized
    // by TSN and checked for liquidity by TCAP.
    signal input actionKind;
    signal input assetId;
    signal input amount;
    signal input authorizationCommitment;

    signal routeLeaf;
    component routeHash = Poseidon(3);
    routeHash.inputs[0] <== tipLookupCommitment;
    routeHash.inputs[1] <== routeKeyCommitment;
    routeHash.inputs[2] <== routePolicyCommitment;
    routeLeaf <== routeHash.out;

    component tipPath = SparsePath32();
    tipPath.leaf <== routeLeaf;
    tipPath.index <== tipRouteIndex;
    for (var i = 0; i < 32; i++) tipPath.siblings[i] <== tipSiblings[i];
    tipPath.root === tipRouteRoot;

    component accountKeyHash = Poseidon(2);
    accountKeyHash.inputs[0] <== routeKeyCommitment;
    accountKeyHash.inputs[1] <== assetCommitment;
    accountKeyHash.out === accountPathKey;

    component priorLeafHash = Poseidon(5);
    priorLeafHash.inputs[0] <== routeKeyCommitment;
    priorLeafHash.inputs[1] <== assetCommitment;
    priorLeafHash.inputs[2] <== priorSequence;
    priorLeafHash.inputs[3] <== predecessorMemoCommitment;
    priorLeafHash.inputs[4] <== predecessorActionCommitment;

    component isFirstHead = IsZero();
    isFirstHead.in <== priorSequence;
    component sequenceBits = Num2Bits(64);
    sequenceBits.in <== priorSequence;
    signal nextSequence;
    nextSequence <== priorSequence + 1;
    component nextSequenceBits = Num2Bits(64);
    nextSequenceBits.in <== nextSequence;
    component assetBits = Num2Bits(32);
    assetBits.in <== assetId;
    component actionKindBits = Num2Bits(8);
    actionKindBits.in <== actionKind;
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;
    assetCommitment === assetId;
    isFirstHead.out * predecessorMemoCommitment === 0;
    isFirstHead.out * predecessorActionCommitment === 0;

    component currentHeadPath = SparsePath128();
    currentHeadPath.leaf <== (1 - isFirstHead.out) * priorLeafHash.out;
    currentHeadPath.key <== accountPathKey;
    for (var i = 0; i < 128; i++) currentHeadPath.siblings[i] <== accountSiblings[i];

    component nextLeafHash = Poseidon(5);
    nextLeafHash.inputs[0] <== routeKeyCommitment;
    nextLeafHash.inputs[1] <== assetCommitment;
    nextLeafHash.inputs[2] <== nextSequence;
    nextLeafHash.inputs[3] <== memoCommitment;
    nextLeafHash.inputs[4] <== actionCommitment;

    component nextHeadPath = SparsePath128();
    nextHeadPath.leaf <== nextLeafHash.out;
    nextHeadPath.key <== accountPathKey;
    for (var i = 0; i < 128; i++) nextHeadPath.siblings[i] <== accountSiblings[i];

    component actionHash = Poseidon(5);
    actionHash.inputs[0] <== actionKind;
    actionHash.inputs[1] <== assetId;
    actionHash.inputs[2] <== amount;
    actionHash.inputs[3] <== authorizationCommitment;
    actionHash.inputs[4] <== nullifier;
    actionHash.out === actionCommitment;

    component nullifierKeyHash = Poseidon(1);
    nullifierKeyHash.inputs[0] <== nullifier;
    component nullifierOldPath = SparsePath128();
    nullifierOldPath.leaf <== 0;
    nullifierOldPath.key <== nullifierKeyHash.out;
    for (var i = 0; i < 128; i++) nullifierOldPath.siblings[i] <== nullifierSiblings[i];

    component nullifierLeafHash = Poseidon(1);
    nullifierLeafHash.inputs[0] <== nullifier;
    component nullifierNewPath = SparsePath128();
    nullifierNewPath.leaf <== nullifierLeafHash.out;
    nullifierNewPath.key <== nullifierKeyHash.out;
    for (var i = 0; i < 128; i++) nullifierNewPath.siblings[i] <== nullifierSiblings[i];

    component oldRootHash = Poseidon(2);
    oldRootHash.inputs[0] <== currentHeadPath.root;
    oldRootHash.inputs[1] <== nullifierOldPath.root;
    oldRootHash.out === oldGlobalRoot;

    component newRootHash = Poseidon(2);
    newRootHash.inputs[0] <== nextHeadPath.root;
    newRootHash.inputs[1] <== nullifierNewPath.root;
    newRootHash.out === newGlobalRoot;
}

component main {public [oldGlobalRoot, newGlobalRoot, memoCommitment, actionCommitment, nullifier, tipRouteRoot]} = HiddenHeadTransitionV1();
