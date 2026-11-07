pragma circom 2.1.9;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

// Open every accepted hiding commitment in the chain-ordered epoch transcript.
// The public total is aggregate only. Empty, singleton and partial transcripts fail.
template TcapCreditEpoch() {
    signal input seed;
    signal input digest;
    signal input total;
    signal input count;
    signal input tokenId;
    signal input amounts[64];
    signal input blindings[64];
    signal input nullifiers[64];
    component countBits=Num2Bits(7);countBits.in <== count;
    component minCount=LessThan(7);minCount.in[0]<==1;minCount.in[1]<==count;minCount.out===1;
    component maxCount=LessThan(7);maxCount.in[0]<==count;maxCount.in[1]<==65;maxCount.out===1;
    component tokenBits=Num2Bits(32);tokenBits.in<==tokenId;
    component tokenZero=IsZero();tokenZero.in<==tokenId;tokenZero.out===0;
    component totalBits=Num2Bits(64);totalBits.in<==total;
    signal hashes[65];signal sums[65];
    hashes[0]<==seed;sums[0]<==0;
    component active[64];component valueBits[64];component valueZero[64];component blindZero[64];component nullZero[64];
    component commitments[64];component append[64];
    for(var i=0;i<64;i++) {
        active[i]=LessThan(7);active[i].in[0]<==i;active[i].in[1]<==count;
        valueBits[i]=Num2Bits(64);valueBits[i].in<==amounts[i];
        valueZero[i]=IsZero();valueZero[i].in<==amounts[i];active[i].out*valueZero[i].out===0;
        blindZero[i]=IsZero();blindZero[i].in<==blindings[i];active[i].out*blindZero[i].out===0;
        nullZero[i]=IsZero();nullZero[i].in<==nullifiers[i];active[i].out*nullZero[i].out===0;
        (1-active[i].out)*amounts[i]===0;(1-active[i].out)*blindings[i]===0;(1-active[i].out)*nullifiers[i]===0;
        commitments[i]=Poseidon(5);
        commitments[i].inputs[0]<==1880519585059740412114005250091737410720192050;commitments[i].inputs[1]<==tokenId;
        commitments[i].inputs[2]<==amounts[i];commitments[i].inputs[3]<==blindings[i];commitments[i].inputs[4]<==nullifiers[i];
        append[i]=Poseidon(3);append[i].inputs[0]<==hashes[i];append[i].inputs[1]<==commitments[i].out;append[i].inputs[2]<==nullifiers[i];
        hashes[i+1]<==hashes[i]+active[i].out*(append[i].out-hashes[i]);
        sums[i+1]<==sums[i]+amounts[i];
    }
    hashes[64]===digest;sums[64]===total;
}
component main {public [seed,digest,total,count,tokenId]} = TcapCreditEpoch();
