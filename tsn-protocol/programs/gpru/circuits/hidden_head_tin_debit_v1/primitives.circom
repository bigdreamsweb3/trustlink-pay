pragma circom 2.1.8;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/escalarmulany.circom";
include "circomlib/circuits/escalarmulfix.circom";
include "circomlib/circuits/comparators.circom";

// The existing TCAP snapshot uses low-bit indices, Poseidon parents, zero
// empty leaves and a 128-level head/nullifier map. Full field decomposition
// prevents aliases; the unused high bits never change the selected index.
// Sharing one strict key decomposition across predecessor/successor paths
// preserves canonical indices while avoiding duplicate boolean constraints.
template TinDebitPathBits(depth) {
    signal input leaf;
    signal input bits[depth];
    signal input siblings[depth];
    signal output root;
    signal nodes[depth + 1];
    signal left[depth];
    signal right[depth];
    component parents[depth];
    nodes[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        left[i] <== nodes[i] + bits[i] * (siblings[i] - nodes[i]);
        right[i] <== siblings[i] + bits[i] * (nodes[i] - siblings[i]);
        parents[i] = Poseidon(2);
        parents[i].inputs[0] <== left[i];
        parents[i].inputs[1] <== right[i];
        nodes[i + 1] <== parents[i].out;
    }
    root <== nodes[depth];
}

template TinDebitPath(depth) {
    signal input leaf;
    signal input key;
    signal input siblings[depth];
    signal output root;
    component bits = Num2Bits_strict();
    bits.in <== key;
    component path = TinDebitPathBits(depth);
    path.leaf <== leaf;
    for (var i = 0; i < depth; i++) {
        path.bits[i] <== bits.out[i];
        path.siblings[i] <== siblings[i];
    }
    root <== path.root;
}

template TinDebitPathPair(depth) {
    signal input leaf[2];
    signal input key;
    signal input siblings[depth];
    signal output root[2];
    component bits = Num2Bits_strict();
    bits.in <== key;
    component paths[2];
    for (var leg = 0; leg < 2; leg++) {
        paths[leg] = TinDebitPathBits(depth);
        paths[leg].leaf <== leaf[leg];
        for (var i = 0; i < depth; i++) {
            paths[leg].bits[i] <== bits.out[i];
            paths[leg].siblings[i] <== siblings[i];
        }
        root[leg] <== paths[leg].root;
    }
}

template TinDebitBalance() {
    var G_X = 5299619240641551281634865583518297030282874472190772894086521144482721001553;
    var G_Y = 16950150798460657717958625567821834550301663161624707787222815936182638968203;
    var H_X = 9398968040714586016327675940839568983565095581299035530848626576251201023018;
    var H_Y = 15860466305030097496204584978173195991965382154782248789896917824218270823860;
    var Q = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    signal input balance;
    signal input blinding;
    signal output x;
    signal output y;
    // The registered amount stays u64. A recovered balance can accumulate
    // multiple credits, so the new transfer opening uses the lineage's u128 bound.
    component balanceBits = Num2Bits(128);
    balanceBits.in <== balance;
    component blindBits = Num2Bits(252);
    blindBits.in <== blinding;
    component blindBound = LessThan(252);
    blindBound.in[0] <== blinding;
    blindBound.in[1] <== Q;
    blindBound.out === 1;
    component amountPoint = EscalarMulFix(128, [G_X, G_Y]);
    for (var i = 0; i < 128; i++) amountPoint.e[i] <== balanceBits.out[i];
    component blindPoint = EscalarMulFix(252, [H_X, H_Y]);
    for (var i = 0; i < 252; i++) blindPoint.e[i] <== blindBits.out[i];
    component sum = BabyAdd();
    sum.x1 <== amountPoint.out[0];
    sum.y1 <== amountPoint.out[1];
    sum.x2 <== blindPoint.out[0];
    sum.y2 <== blindPoint.out[1];
    x <== sum.xout;
    y <== sum.yout;
}

// Direction is fixed at compilation: -1 for the sender, +1 for the recipient.
// The sender opens its balance to prove sufficiency. The offline recipient
// receives the same homomorphic point credit as the existing deposit-credit path.
template TinDebitLeg(direction) {
    var Q = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    signal input lookup;
    signal input routeKey;
    signal input policy;
    signal input scanX;
    signal input scanY;
    signal input routeIndex;
    signal input routeSiblings[32];
    signal input tipRoot;
    signal input sequence;
    signal input priorMemo;
    signal input priorAction;
    signal input priorPortfolio;
    signal input firstToken;
    signal input portfolioSiblings[32];
    signal input asset;
    signal input amount;
    signal input priorX;
    signal input priorY;
    signal input oldBalance;
    signal input oldBlinding;
    signal input newBalance;
    signal input newBlinding;
    signal input blindingDelta;
    signal input blindingCarry;
    signal input nextMemo;
    signal input action;
    signal input nextPortfolio;
    signal input nextX;
    signal input nextY;
    signal output oldLeaf;
    signal output newLeaf;

    component route = Poseidon(5);
    route.inputs[0] <== lookup;
    route.inputs[1] <== routeKey;
    route.inputs[2] <== scanX;
    route.inputs[3] <== scanY;
    route.inputs[4] <== policy;
    component scanCheck = BabyCheck();
    scanCheck.x <== scanX;
    scanCheck.y <== scanY;
    component scanNonidentity = IsZero();
    scanNonidentity.in <== scanX;
    scanNonidentity.out === 0;
    component subgroup = EscalarMulAny(252);
    subgroup.p[0] <== scanX;
    subgroup.p[1] <== scanY;
    for (var i = 0; i < 252; i++) subgroup.e[i] <== (Q >> i) & 1;
    subgroup.out[0] === 0;
    subgroup.out[1] === 1;
    component indexBits = Num2Bits(32);
    indexBits.in <== routeIndex;
    component membership = TinDebitPath(32);
    membership.leaf <== route.out;
    membership.key <== routeIndex;
    for (var i = 0; i < 32; i++) membership.siblings[i] <== routeSiblings[i];
    membership.root === tipRoot;

    component seqBits = Num2Bits(64);
    seqBits.in <== sequence;
    component nextSeqBits = Num2Bits(64);
    nextSeqBits.in <== sequence + 1;
    component firstHead = IsZero();
    firstHead.in <== sequence;
    component tokenBits = Num2Bits(1);
    tokenBits.in <== firstToken;
    firstHead.out * (firstToken - 1) === 0;
    firstHead.out * priorMemo === 0;
    firstHead.out * priorAction === 0;
    if (direction == -1) {
        firstHead.out === 0;
        firstToken === 0;
        oldBalance === newBalance + amount;
    } else {
        // Canonical placeholders are not recipient openings. No recipient
        // balance, blinding or successor range enters this transfer witness.
        oldBalance === 0;
        oldBlinding === 0;
        newBalance === 0;
        newBlinding === 0;
        blindingCarry === 0;
    }
    component priorCurve = BabyCheck();
    priorCurve.x <== priorX;
    priorCurve.y <== priorY;
    firstToken * priorX === 0;
    firstToken * (priorY - 1) === 0;
    signal empty[33];
    component zeroParents[32];
    empty[0] <== 0;
    for (var i = 0; i < 32; i++) {
        zeroParents[i] = Poseidon(2);
        zeroParents[i].inputs[0] <== empty[i];
        zeroParents[i].inputs[1] <== empty[i];
        empty[i + 1] <== zeroParents[i].out;
        firstHead.out * (portfolioSiblings[i] - empty[i]) === 0;
    }
    firstHead.out * (priorPortfolio - empty[32]) === 0;

    component deltaBits = Num2Bits(252);
    deltaBits.in <== blindingDelta;
    component deltaBound = LessThan(252);
    deltaBound.in[0] <== blindingDelta;
    deltaBound.in[1] <== Q;
    deltaBound.out === 1;
    component nonzeroDelta = IsZero();
    nonzeroDelta.in <== blindingDelta;
    nonzeroDelta.out === 0;
    if (direction == -1) {
        component priorPoint = TinDebitBalance();
        priorPoint.balance <== oldBalance;
        priorPoint.blinding <== oldBlinding;
        priorPoint.x === priorX;
        priorPoint.y === priorY;
        component nextPoint = TinDebitBalance();
        nextPoint.balance <== newBalance;
        nextPoint.blinding <== newBlinding;
        nextPoint.x === nextX;
        nextPoint.y === nextY;
        component carryBits = Num2Bits(1);
        carryBits.in <== blindingCarry;
        oldBlinding + blindingDelta === newBlinding + blindingCarry * Q;
    } else {
        component incrementPoint = TinDebitBalance();
        incrementPoint.balance <== amount;
        incrementPoint.blinding <== blindingDelta;
        component creditedPoint = BabyAdd();
        creditedPoint.x1 <== priorX;
        creditedPoint.y1 <== priorY;
        creditedPoint.x2 <== incrementPoint.x;
        creditedPoint.y2 <== incrementPoint.y;
        creditedPoint.xout === nextX;
        creditedPoint.yout === nextY;
    }

    component priorToken = Poseidon(3);
    priorToken.inputs[0] <== asset;
    priorToken.inputs[1] <== priorX;
    priorToken.inputs[2] <== priorY;
    component portfolios = TinDebitPathPair(32);
    portfolios.leaf[0] <== (1 - firstToken) * priorToken.out;
    portfolios.key <== asset;
    for (var i = 0; i < 32; i++) portfolios.siblings[i] <== portfolioSiblings[i];
    component successorToken = Poseidon(3);
    successorToken.inputs[0] <== asset;
    successorToken.inputs[1] <== nextX;
    successorToken.inputs[2] <== nextY;
    portfolios.leaf[1] <== successorToken.out;
    portfolios.root[0] === priorPortfolio;
    portfolios.root[1] === nextPortfolio;
    component priorHead = Poseidon(5);
    priorHead.inputs[0] <== routeKey;
    priorHead.inputs[1] <== sequence;
    priorHead.inputs[2] <== priorMemo;
    priorHead.inputs[3] <== priorAction;
    priorHead.inputs[4] <== priorPortfolio;
    oldLeaf <== (1 - firstHead.out) * priorHead.out;
    component successorHead = Poseidon(5);
    successorHead.inputs[0] <== routeKey;
    successorHead.inputs[1] <== sequence + 1;
    successorHead.inputs[2] <== nextMemo;
    successorHead.inputs[3] <== action;
    successorHead.inputs[4] <== nextPortfolio;
    newLeaf <== successorHead.out;
}

// Bind each recoverable delta to the hidden TIP scan key and the same private
// blinding delta used by its balance transition.
template TinDebitDeltaCipher() {
    var Q = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    signal input scanX;
    signal input scanY;
    signal input delta;
    signal input ephemeralScalar;
    signal input sharedXReduction;
    signal input sharedXCarry;
    signal input encryptedDeltaCarry;
    signal input ciphertext;
    signal input ephemeralX;
    signal input ephemeralY;
    component bits = Num2Bits(252);
    bits.in <== ephemeralScalar;
    component bound = LessThan(252);
    bound.in[0] <== ephemeralScalar;
    bound.in[1] <== Q;
    bound.out === 1;
    component nonzero = IsZero();
    nonzero.in <== ephemeralScalar;
    nonzero.out === 0;
    component ephemeral = EscalarMulFix(252, [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203]);
    component shared = EscalarMulAny(252);
    shared.p[0] <== scanX;
    shared.p[1] <== scanY;
    for (var i = 0; i < 252; i++) {
        ephemeral.e[i] <== bits.out[i];
        shared.e[i] <== bits.out[i];
    }
    ephemeral.out[0] === ephemeralX;
    ephemeral.out[1] === ephemeralY;
    component carryBits = Num2Bits(3);
    carryBits.in <== sharedXCarry;
    component reductionBits = Num2Bits(252);
    reductionBits.in <== sharedXReduction;
    component reductionBound = LessThan(252);
    reductionBound.in[0] <== sharedXReduction;
    reductionBound.in[1] <== Q;
    reductionBound.out === 1;
    // A field equation alone admits an alternate sum above the BN254 modulus.
    // Quotient seven needs the tighter remainder bound to make reduction unique.
    component lastCarry = IsEqual();
    lastCarry.in[0] <== sharedXCarry;
    lastCarry.in[1] <== 7;
    component lastRemainder = LessThan(252);
    lastRemainder.in[0] <== sharedXReduction;
    lastRemainder.in[1] <== 21888242871839275222246405745257275088548364400416034343698204186575808495617 - 7 * Q;
    lastCarry.out * (1 - lastRemainder.out) === 0;
    shared.out[0] === sharedXReduction + sharedXCarry * Q;
    component encryptedCarry = Num2Bits(1);
    encryptedCarry.in <== encryptedDeltaCarry;
    component ciphertextBits = Num2Bits(252);
    ciphertextBits.in <== ciphertext;
    component ciphertextBound = LessThan(252);
    ciphertextBound.in[0] <== ciphertext;
    ciphertextBound.in[1] <== Q;
    ciphertextBound.out === 1;
    ciphertext === delta + sharedXReduction - encryptedDeltaCarry * Q;
}
