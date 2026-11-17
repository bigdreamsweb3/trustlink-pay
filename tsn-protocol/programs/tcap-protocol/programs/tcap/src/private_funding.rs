use anchor_lang::prelude::*;
use solana_program::poseidon::{hashv, Endianness, Parameters};
use crate::error::TcapError;

pub const FUNDING_TREE_DEPTH: usize = 32;
pub const FUNDING_TREE_CAPACITY: u64 = 1u64 << FUNDING_TREE_DEPTH;
pub const FUNDING_ROOT_HISTORY_CAPACITY: usize = 128;
pub const LEGACY_FUNDING_ROOT_SPACE: usize = 1081;
pub const FUNDED_LEAF_DOMAIN: [u8; 32] = [
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x54,0x53,0x4e,0x5f,0x46,0x55,0x4e,0x44,0x45,0x44,0x5f,0x4c,0x45,0x41,0x46,0x5f,0x56,0x31,
];
pub const BN254_MODULUS: [u8; 32] = [
    0x30,0x64,0x4e,0x72,0xe1,0x31,0xa0,0x29,0xb8,0x50,0x45,0xb6,0x81,0x81,0x58,0x5d,
    0x28,0x33,0xe8,0x48,0x79,0xb9,0x70,0x91,0x43,0xe1,0xf5,0x93,0xf0,0x00,0x00,0x01,
];

#[account]
pub struct TcapFundingMerkleRootV1 {
    pub version: u16,
    pub protocol_version: u16,
    pub bump: u8,
    pub current_root: [u8; 32],
    pub leaf_count: u64,
    // Heap-backed decoding avoids the SBF stack cost of nested fixed arrays.
    pub frontier: Vec<[u8; 32]>,
    pub history: Vec<FundingRootHistoryEntryV2>,
    pub next_history_index: u16,
    pub history_count: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct FundingRootHistoryEntryV2 {
    pub root: [u8; 32],
    pub leaf_count: u64,
}

impl TcapFundingMerkleRootV1 {
    pub const VERSION: u16 = 2;
    pub const SPACE: usize = LEGACY_FUNDING_ROOT_SPACE + 4 + 40 * FUNDING_ROOT_HISTORY_CAPACITY + 4;
    pub fn validate(&self) -> Result<()> {
        require!(self.version == Self::VERSION && self.protocol_version == 1
            && self.frontier.len() == FUNDING_TREE_DEPTH && self.leaf_count <= FUNDING_TREE_CAPACITY
            && self.current_root != [0;32] && self.current_root < BN254_MODULUS
            && self.frontier.iter().all(|node| *node < BN254_MODULUS), TcapError::InvalidFundingRoot);
        let count = usize::from(self.history_count);
        let next = usize::from(self.next_history_index);
        require!(self.history.len() == FUNDING_ROOT_HISTORY_CAPACITY && count <= FUNDING_ROOT_HISTORY_CAPACITY
            && next < FUNDING_ROOT_HISTORY_CAPACITY
            && (count == FUNDING_ROOT_HISTORY_CAPACITY || next == count)
            && ((self.leaf_count == 0 && count == 0) || (self.leaf_count > 0 && count > 0 && count as u64 <= self.leaf_count)),
            TcapError::InvalidFundingRoot);
        let start = if count == FUNDING_ROOT_HISTORY_CAPACITY { next } else { 0 };
        for index in 0..count {
            let entry = &self.history[(start + index) % FUNDING_ROOT_HISTORY_CAPACITY];
            require!(entry.root != [0;32] && entry.root < BN254_MODULUS
                && entry.leaf_count == self.leaf_count - count as u64 + index as u64 + 1,
                TcapError::InvalidFundingRoot);
        }
        for entry in self.history.iter().skip(count) {
            require!(count == FUNDING_ROOT_HISTORY_CAPACITY || *entry == FundingRootHistoryEntryV2::default(),
                TcapError::InvalidFundingRoot);
        }
        if count > 0 {
            let latest = &self.history[(start + count - 1) % FUNDING_ROOT_HISTORY_CAPACITY];
            require!(latest.root == self.current_root && latest.leaf_count == self.leaf_count, TcapError::InvalidFundingRoot);
        }
        Ok(())
    }

    pub fn accepts_root(&self, selected: &[u8;32]) -> Result<()> {
        self.validate()?;
        require!(self.leaf_count > 0 && *selected != [0;32] && *selected < BN254_MODULUS
            && (*selected == self.current_root || self.history.iter().take(usize::from(self.history_count)).any(|entry| entry.root == *selected)),
            TcapError::InvalidFundingRoot);
        Ok(())
    }
}

/// One-time raw V1 decoding is isolated from the V2 runtime account contract.
pub fn migrate_legacy_funding_root(data: &[u8], bump: u8) -> Result<TcapFundingMerkleRootV1> {
    use anchor_lang::Discriminator;
    require!(data.len() == LEGACY_FUNDING_ROOT_SPACE && data[..8] == TcapFundingMerkleRootV1::DISCRIMINATOR
        && data[8..10] == 1u16.to_le_bytes() && data[10..12] == 1u16.to_le_bytes()
        && data[12] == bump && data[53..57] == 32u32.to_le_bytes(), TcapError::InvalidFundingRoot);
    let current_root: [u8;32] = data[13..45].try_into().unwrap();
    let leaf_count = u64::from_le_bytes(data[45..53].try_into().unwrap());
    let frontier = data[57..LEGACY_FUNDING_ROOT_SPACE].chunks_exact(32).map(|value| value.try_into().unwrap()).collect();
    let mut root = TcapFundingMerkleRootV1 { version: TcapFundingMerkleRootV1::VERSION, protocol_version: 1, bump,
        current_root, leaf_count, frontier, history: vec![FundingRootHistoryEntryV2::default();FUNDING_ROOT_HISTORY_CAPACITY],
        next_history_index: 0, history_count: 0 };
    if leaf_count > 0 {
        root.history[0] = FundingRootHistoryEntryV2 { root: current_root, leaf_count };
        root.next_history_index = 1; root.history_count = 1;
    }
    root.validate()?;
    Ok(root)
}

fn poseidon2(left: &[u8;32], right: &[u8;32]) -> Result<[u8;32]> {
    hashv(Parameters::Bn254X5, Endianness::BigEndian, &[left.as_slice(), right.as_slice()])
        .map(|hash| hash.to_bytes()).map_err(|_| error!(TcapError::InvalidFundingRoot))
}

pub fn funding_zero_hashes() -> Result<Vec<[u8;32]>> {
    let mut nodes = vec![[0;32]];
    for level in 0..FUNDING_TREE_DEPTH { nodes.push(poseidon2(&nodes[level], &nodes[level])?); }
    Ok(nodes)
}

pub fn funded_leaf(note_commitment: &[u8;32], token_id: u32, amount: u64) -> Result<[u8;32]> {
    require!(*note_commitment != [0;32] && *note_commitment < BN254_MODULUS, TcapError::FundingCommitmentMismatch);
    require!(token_id > 0 && amount > 0, TcapError::InvalidDepositAmount);
    let mut token = [0;32]; token[28..].copy_from_slice(&token_id.to_be_bytes());
    let mut value = [0;32]; value[24..].copy_from_slice(&amount.to_be_bytes());
    hashv(Parameters::Bn254X5, Endianness::BigEndian,
        &[FUNDED_LEAF_DOMAIN.as_slice(), note_commitment.as_slice(), token.as_slice(), value.as_slice()])
        .map(|hash| hash.to_bytes()).map_err(|_| error!(TcapError::FundingCommitmentMismatch))
}

pub fn append_funded_leaf(root: &mut TcapFundingMerkleRootV1, leaf: [u8;32]) -> Result<u32> {
    root.validate()?;
    require!(root.leaf_count < FUNDING_TREE_CAPACITY && leaf != [0;32] && leaf < BN254_MODULUS, TcapError::InvalidFundingRoot);
    let index = root.leaf_count as u32;
    let zeros = funding_zero_hashes()?;
    let mut node = leaf;
    let mut frontier = root.frontier.clone();
    for (level, zero) in zeros.iter().take(FUNDING_TREE_DEPTH).enumerate() {
        if (root.leaf_count >> level) & 1 == 0 {
            frontier[level] = node;
            node = poseidon2(&node, zero)?;
        } else { node = poseidon2(&frontier[level], &node)?; }
    }
    root.current_root = node;
    root.frontier = frontier;
    root.leaf_count += 1;
    root.history[usize::from(root.next_history_index)] = FundingRootHistoryEntryV2 { root: node, leaf_count: root.leaf_count };
    root.next_history_index = ((usize::from(root.next_history_index) + 1) % FUNDING_ROOT_HISTORY_CAPACITY) as u16;
    root.history_count = root.history_count.saturating_add(1).min(FUNDING_ROOT_HISTORY_CAPACITY as u16);
    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn append_matches_independent_two_leaf_paths_and_layout() {
        let zeros = funding_zero_hashes().unwrap();
        let mut root = empty_root(9);
        let mut note = [0;32]; note[31]=17;
        let a = funded_leaf(&note, 7, 500).unwrap(); note[31]=18;
        let b = funded_leaf(&note, 7, 501).unwrap();
        assert_eq!(append_funded_leaf(&mut root, a).unwrap(),0);
        let mut expected = a;
        for zero in zeros.iter().take(32) { expected = poseidon2(&expected, zero).unwrap(); }
        assert_eq!(root.current_root, expected);
        assert_eq!(append_funded_leaf(&mut root, b).unwrap(),1);
        expected = poseidon2(&a,&b).unwrap();
        for zero in zeros.iter().take(32).skip(1) { expected = poseidon2(&expected,zero).unwrap(); }
        assert_eq!(root.current_root,expected);
        let mut bytes = vec![]; root.try_serialize(&mut bytes).unwrap();
        assert_eq!(bytes.len(),6209); assert_eq!(&bytes[13..45],&root.current_root);
        assert_eq!(u64::from_le_bytes(bytes[45..53].try_into().unwrap()),2);
        assert_eq!(u32::from_le_bytes(bytes[53..57].try_into().unwrap()),32);
        assert_eq!(u32::from_le_bytes(bytes[1081..1085].try_into().unwrap()),128);
        assert_eq!(u16::from_le_bytes(bytes[6205..6207].try_into().unwrap()),2);
        assert_eq!(u16::from_le_bytes(bytes[6207..6209].try_into().unwrap()),2);
    }
    #[test]
    fn amount_asset_and_canonical_commitment_are_enforced() {
        let mut note=[0;32];note[31]=1;
        assert_ne!(funded_leaf(&note,1,100).unwrap(),funded_leaf(&note,1,101).unwrap());
        assert_ne!(funded_leaf(&note,1,100).unwrap(),funded_leaf(&note,2,100).unwrap());
        assert!(funded_leaf(&BN254_MODULUS,1,100).is_err());
        assert!(funded_leaf(&[0;32],1,100).is_err());
        assert!(funded_leaf(&note,0,100).is_err());
        assert!(funded_leaf(&note,1,0).is_err());
    }
    #[test]
    fn funded_leaf_matches_sdk_and_native_poseidon_vector() {
        // SDK/native vector: secret 1, blinding 2, registered token 7, amount 1000.
        let note = [
            0x25,0xe2,0xb2,0x21,0xe2,0x2c,0xe1,0xd8,0x57,0xcb,0x8b,0x21,0xb1,0x04,0x43,0x2d,
            0x92,0xf3,0x9a,0xcf,0x19,0xf1,0x4b,0x45,0x81,0x8a,0x47,0x1f,0x03,0xbf,0x17,0x56,
        ];
        let expected = [
            0x1c,0x54,0x6a,0xea,0xea,0x68,0xbc,0x79,0x05,0x0f,0x46,0xc8,0x92,0x6e,0x37,0xff,
            0x7d,0x07,0x53,0xca,0x5b,0x2b,0x2d,0xcb,0xd1,0x92,0x95,0xc3,0x32,0x0c,0x98,0x38,
        ];
        assert_eq!(funded_leaf(&note,7,1000).unwrap(), expected);
    }
    #[test]
    fn full_or_malformed_root_rejects_append_without_mutation() {
        let mut root=empty_root(1); root.leaf_count=FUNDING_TREE_CAPACITY;
        root.history[0]=FundingRootHistoryEntryV2{root:root.current_root,leaf_count:root.leaf_count};
        root.history_count=1;root.next_history_index=1;
        let before=root.current_root;
        let mut leaf=[0;32];leaf[31]=1;
        assert!(append_funded_leaf(&mut root,leaf).is_err()); assert_eq!(root.current_root,before);
        root.leaf_count=0;root.frontier.pop(); assert!(append_funded_leaf(&mut root,leaf).is_err());
    }

    fn empty_root(bump:u8) -> TcapFundingMerkleRootV1 {
        TcapFundingMerkleRootV1 { version:2, protocol_version:1,bump,current_root:funding_zero_hashes().unwrap()[32],
            leaf_count:0,frontier:vec![[0;32];32],history:vec![FundingRootHistoryEntryV2::default();128],next_history_index:0,history_count:0 }
    }
    #[test]
    fn retained_roots_survive_appends_and_oldest_is_evicted_after_wrap() {
        let mut root=empty_root(1);assert!(root.accepts_root(&root.current_root).is_err());
        let mut first=[0;32];let mut second=[0;32];
        for index in 0..129 {
            let mut leaf=[0;32];leaf[30..].copy_from_slice(&((index+1) as u16).to_be_bytes());
            append_funded_leaf(&mut root,leaf).unwrap();root.validate().unwrap();
            if index==0 {first=root.current_root;} if index==1 {second=root.current_root;}
        }
        assert_eq!(root.history_count,128);assert_eq!(root.next_history_index,1);
        assert!(root.accepts_root(&first).is_err());root.accepts_root(&second).unwrap();
        root.accepts_root(&root.current_root).unwrap();
    }
    #[test]
    fn malformed_history_and_legacy_runtime_are_rejected_before_append() {
        for mode in 0..8 {
            let mut root=empty_root(1);append_funded_leaf(&mut root,[1;32]).unwrap();
            match mode {0=>root.version=1,1=>root.history.pop().map(|_|()).unwrap(),2=>root.next_history_index=128,
                3=>root.history_count=129,4=>root.history[0].root=BN254_MODULUS,5=>root.history[0].leaf_count=0,
                6=>root.history[1].root=[1;32],_=>root.history[0].root=[2;32]}
            let mut before=vec![];root.try_serialize(&mut before).unwrap();
            assert!(append_funded_leaf(&mut root,[3;32]).is_err());
            let mut after=vec![];root.try_serialize(&mut after).unwrap();assert_eq!(before,after);
        }
    }
    #[test]
    fn migration_preserves_exact_prefix_and_seeds_only_current_root() {
        use anchor_lang::Discriminator;
        for count in [0u64,17] {
            let mut old=vec![0;1081];old[..8].copy_from_slice(&TcapFundingMerkleRootV1::DISCRIMINATOR);
            old[8..10].copy_from_slice(&1u16.to_le_bytes());old[10..12].copy_from_slice(&1u16.to_le_bytes());old[12]=7;
            old[13..45].copy_from_slice(&funding_zero_hashes().unwrap()[32]);old[45..53].copy_from_slice(&count.to_le_bytes());
            old[53..57].copy_from_slice(&32u32.to_le_bytes());old[88]=3;
            let current=migrate_legacy_funding_root(&old,7).unwrap();let mut bytes=vec![];current.try_serialize(&mut bytes).unwrap();
            assert_eq!(&bytes[..8],&old[..8]);assert_eq!(&bytes[10..1081],&old[10..1081]);
            assert_eq!(current.history_count,if count==0 {0} else {1});
            assert!(migrate_legacy_funding_root(&bytes,7).is_err());assert!(migrate_legacy_funding_root(&old,6).is_err());
            old[13..45].copy_from_slice(&BN254_MODULUS);assert!(migrate_legacy_funding_root(&old,7).is_err());
        }
    }
}
