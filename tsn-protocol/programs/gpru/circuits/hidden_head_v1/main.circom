pragma circom 2.1.8;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/comparators.circom";

template BalanceScalarMul(n, baseX, baseY) {
    signal input scalar;
    signal output x;
    signal output y;
    component bits = Num2Bits(n);
    bits.in <== scalar;
    component mul = EscalarMulAny(n);
    mul.p[0] <== baseX;
    mul.p[1] <== baseY;
    for (var i = 0; i < n; i++) mul.e[i] <== bits.out[i];
    x <== mul.out[0];
    y <== mul.out[1];
}

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
    // BabyJubjub BASE8 and the independently generated Pedersen blinding base.
    // H is SHA-256(domain || counter=0) mapped to the curve and multiplied by 8.
    var BALANCE_G_X = 5299619240641551281634865583518297030282874472190772894086521144482721001553;
    var BALANCE_G_Y = 16950150798460657717958625567821834550301663161624707787222815936182638968203;
    var BALANCE_H_X = 9398968040714586016327675940839568983565095581299035530848626576251201023018;
    var BALANCE_H_Y = 15860466305030097496204584978173195991965382154782248789896917824218270823860;
    var BABYJUB_SUBORDER = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    // Public signals are intentionally limited to shared protocol state and
    // one-time action data. They do not contain a TIP/TIN account, route key,
    // per-TIN sequence, predecessor, or private sparse-tree index.
    signal input oldGlobalRoot;
    signal input newGlobalRoot;
    signal input memoCommitment;
    signal input actionCommitment;
    signal input nullifier;
    signal input tipRouteRoot;
    // Freshly blinded output commitment; GPRU requires the same point in the
    // fixed Memo prefix, while the hidden map stores it as the successor head.
    signal input successorPortfolioRoot;
    signal input successorBalanceX;
    signal input successorBalanceY;

    // Private TIP membership opening.
    signal input tipLookupCommitment;
    signal input routeKeyCommitment;
    signal input routePolicyCommitment;
    signal input tipRouteIndex;
    signal input tipSiblings[32];

    // Private latest per-TIN portfolio head and its authenticated-map path.
    signal input accountPathKey;
    signal input priorSequence;
    signal input predecessorMemoCommitment;
    signal input predecessorActionCommitment;
    signal input predecessorPortfolioRoot;
    signal input accountSiblings[128];

    // Private token leaf and its path inside the per-TIN portfolio tree.
    // The token tree root is committed once by the outer per-TIN head.
    signal input isFirstToken;
    signal input predecessorBalanceX;
    signal input predecessorBalanceY;
    signal input portfolioSiblings[32];

    // Private nullifier-map path. The public nullifier is one-time and
    // independent of the TIN identity; an existing leaf must be empty.
    signal input nullifierSiblings[128];

    // Private action fields bind the memo/head update to the action authorized
    // by TSN and checked for liquidity by TCAP.
    signal input actionKind;
    signal input assetId;
    signal input amount;
    signal input authorizationCommitment;
    signal input balanceBlindingDelta;
    signal input balanceBlindingCarry;
    signal input predecessorBalance;
    signal input predecessorBlinding;
    signal input successorBalance;
    signal input successorBlinding;

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

    routeKeyCommitment === accountPathKey;

    component priorLeafHash = Poseidon(5);
    priorLeafHash.inputs[0] <== routeKeyCommitment;
    priorLeafHash.inputs[1] <== priorSequence;
    priorLeafHash.inputs[2] <== predecessorMemoCommitment;
    priorLeafHash.inputs[3] <== predecessorActionCommitment;
    priorLeafHash.inputs[4] <== predecessorPortfolioRoot;

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
    isFirstHead.out * predecessorMemoCommitment === 0;
    isFirstHead.out * predecessorActionCommitment === 0;
    component firstTokenBits = Num2Bits(1);
    firstTokenBits.in <== isFirstToken;
    isFirstHead.out * (isFirstToken - 1) === 0;

    // A zero-root ladder defines the empty accepted-token map. On a TIN's
    // first action, both the old portfolio root and the selected token path
    // must be empty; later actions authenticate the selected token leaf.
    signal emptyPortfolioNodes[33];
    component emptyPortfolioHashes[32];
    emptyPortfolioNodes[0] <== 0;
    for (var i = 0; i < 32; i++) {
        emptyPortfolioHashes[i] = Poseidon(2);
        emptyPortfolioHashes[i].inputs[0] <== emptyPortfolioNodes[i];
        emptyPortfolioHashes[i].inputs[1] <== emptyPortfolioNodes[i];
        emptyPortfolioNodes[i + 1] <== emptyPortfolioHashes[i].out;
        isFirstHead.out * (portfolioSiblings[i] - emptyPortfolioNodes[i]) === 0;
    }
    isFirstHead.out * (predecessorPortfolioRoot - emptyPortfolioNodes[32]) === 0;

    component priorTokenLeafHash = Poseidon(3);
    priorTokenLeafHash.inputs[0] <== assetId;
    priorTokenLeafHash.inputs[1] <== predecessorBalanceX;
    priorTokenLeafHash.inputs[2] <== predecessorBalanceY;
    component priorTokenPath = SparsePath32();
    priorTokenPath.leaf <== (1 - isFirstToken) * priorTokenLeafHash.out;
    priorTokenPath.index <== assetId;
    for (var i = 0; i < 32; i++) priorTokenPath.siblings[i] <== portfolioSiblings[i];
    priorTokenPath.root === predecessorPortfolioRoot;
    isFirstToken * predecessorBalanceX === 0;
    isFirstToken * (predecessorBalanceY - 1) === 0;

    component currentHeadPath = SparsePath128();
    currentHeadPath.leaf <== (1 - isFirstHead.out) * priorLeafHash.out;
    currentHeadPath.key <== accountPathKey;
    for (var i = 0; i < 128; i++) currentHeadPath.siblings[i] <== accountSiblings[i];

    component successorTokenLeafHash = Poseidon(3);
    successorTokenLeafHash.inputs[0] <== assetId;
    successorTokenLeafHash.inputs[1] <== successorBalanceX;
    successorTokenLeafHash.inputs[2] <== successorBalanceY;
    component successorPortfolioPath = SparsePath32();
    successorPortfolioPath.leaf <== successorTokenLeafHash.out;
    successorPortfolioPath.index <== assetId;
    for (var i = 0; i < 32; i++) successorPortfolioPath.siblings[i] <== portfolioSiblings[i];
    successorPortfolioPath.root === successorPortfolioRoot;

    component nextLeafHash = Poseidon(5);
    nextLeafHash.inputs[0] <== routeKeyCommitment;
    nextLeafHash.inputs[1] <== nextSequence;
    nextLeafHash.inputs[2] <== memoCommitment;
    nextLeafHash.inputs[3] <== actionCommitment;
    nextLeafHash.inputs[4] <== successorPortfolioRoot;

    component nextHeadPath = SparsePath128();
    nextHeadPath.leaf <== nextLeafHash.out;
    nextHeadPath.key <== accountPathKey;
    for (var i = 0; i < 128; i++) nextHeadPath.siblings[i] <== accountSiblings[i];

    // A Pedersen commitment is the hidden balance state. DBrix Memo encrypts
    // the owner's balance/history record; this point exists only inside the
    // hidden authenticated-map leaf and the randomized public Memo binding.
    component isCredit = IsEqual();
    isCredit.in[0] <== actionKind;
    isCredit.in[1] <== 1;
    component isDebit = IsEqual();
    isDebit.in[0] <== actionKind;
    isDebit.in[1] <== 2;
    component isExit = IsEqual();
    isExit.in[0] <== actionKind;
    isExit.in[1] <== 3;
    isCredit.out + isDebit.out + isExit.out === 1;
    isFirstHead.out * (1 - isCredit.out) === 0;
    isFirstToken * (1 - isCredit.out) === 0;

    // Credit: update the hidden Pedersen point homomorphically. The Node needs
    // neither the balance nor its blinding opening to add a confirmed amount.
    component deltaBound = LessThan(252);
    deltaBound.in[0] <== balanceBlindingDelta;
    deltaBound.in[1] <== BABYJUB_SUBORDER;
    component deltaIsZero = IsZero();
    deltaIsZero.in <== balanceBlindingDelta;
    component priorBlindBound = LessThan(252);
    priorBlindBound.in[0] <== predecessorBlinding;
    priorBlindBound.in[1] <== BABYJUB_SUBORDER;
    component nextBlindBound = LessThan(252);
    nextBlindBound.in[0] <== successorBlinding;
    nextBlindBound.in[1] <== BABYJUB_SUBORDER;
    component carryBits = Num2Bits(1);
    carryBits.in <== balanceBlindingCarry;
    signal requiresBalanceOpening;
    requiresBalanceOpening <== isDebit.out + isExit.out;
    (1 - deltaBound.out) === 0;
    deltaIsZero.out === 0;
    // A credit prover only needs the predecessor commitment point and a fresh
    // delta. The owner applies that delta to its locally recovered opening.
    // Debit/exit proofs must open both points and preserve the blinding link.
    requiresBalanceOpening * (1 - priorBlindBound.out) === 0;
    requiresBalanceOpening * (1 - nextBlindBound.out) === 0;
    requiresBalanceOpening * (predecessorBlinding + balanceBlindingDelta - successorBlinding - balanceBlindingCarry * BABYJUB_SUBORDER) === 0;
    component amountPoint = BalanceScalarMul(64, BALANCE_G_X, BALANCE_G_Y);
    amountPoint.scalar <== amount;
    component deltaPoint = BalanceScalarMul(252, BALANCE_H_X, BALANCE_H_Y);
    deltaPoint.scalar <== balanceBlindingDelta;
    component creditPartial = BabyAdd();
    creditPartial.x1 <== predecessorBalanceX;
    creditPartial.y1 <== predecessorBalanceY;
    creditPartial.x2 <== amountPoint.x;
    creditPartial.y2 <== amountPoint.y;
    component creditSuccessor = BabyAdd();
    creditSuccessor.x1 <== creditPartial.xout;
    creditSuccessor.y1 <== creditPartial.yout;
    creditSuccessor.x2 <== deltaPoint.x;
    creditSuccessor.y2 <== deltaPoint.y;
    isCredit.out * (successorBalanceX - creditSuccessor.xout) === 0;
    isCredit.out * (successorBalanceY - creditSuccessor.yout) === 0;

    // Debit and exit: the proving wallet opens both points and proves that the
    // successor is nonnegative. No balance or blinding is a public input.
    component oldBalanceBits = Num2Bits(64);
    oldBalanceBits.in <== predecessorBalance;
    component newBalanceBits = Num2Bits(64);
    newBalanceBits.in <== successorBalance;
    component oldValuePoint = BalanceScalarMul(64, BALANCE_G_X, BALANCE_G_Y);
    oldValuePoint.scalar <== predecessorBalance;
    component oldBlindPoint = BalanceScalarMul(252, BALANCE_H_X, BALANCE_H_Y);
    oldBlindPoint.scalar <== predecessorBlinding;
    component openedOld = BabyAdd();
    openedOld.x1 <== oldValuePoint.x;
    openedOld.y1 <== oldValuePoint.y;
    openedOld.x2 <== oldBlindPoint.x;
    openedOld.y2 <== oldBlindPoint.y;
    component newValuePoint = BalanceScalarMul(64, BALANCE_G_X, BALANCE_G_Y);
    newValuePoint.scalar <== successorBalance;
    component newBlindPoint = BalanceScalarMul(252, BALANCE_H_X, BALANCE_H_Y);
    newBlindPoint.scalar <== successorBlinding;
    component openedNew = BabyAdd();
    openedNew.x1 <== newValuePoint.x;
    openedNew.y1 <== newValuePoint.y;
    openedNew.x2 <== newBlindPoint.x;
    openedNew.y2 <== newBlindPoint.y;
    (isDebit.out + isExit.out) * (predecessorBalanceX - openedOld.xout) === 0;
    (isDebit.out + isExit.out) * (predecessorBalanceY - openedOld.yout) === 0;
    (isDebit.out + isExit.out) * (successorBalanceX - openedNew.xout) === 0;
    (isDebit.out + isExit.out) * (successorBalanceY - openedNew.yout) === 0;
    (isDebit.out + isExit.out) * (predecessorBalance - successorBalance - amount) === 0;

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

component main {public [oldGlobalRoot, newGlobalRoot, memoCommitment, actionCommitment, nullifier, tipRouteRoot, successorPortfolioRoot, successorBalanceX, successorBalanceY]} = HiddenHeadTransitionV1();
