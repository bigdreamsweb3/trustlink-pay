//! Verify sender-authorized TIN-Debit ownership reassignment without custody changes.
use crate::hidden_head::{TCAP_PROGRAM_ID, TIP_PROGRAM_ID, TIP_ROUTE_ROOT_SEED, TSN_PROGRAM_ID};
use anchor_lang::prelude::*;
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use solana_program::{
    hash::{hash, hashv},
    instruction::Instruction,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};

pub const TIN_DEBIT_PUBLIC_INPUTS: usize = 26;
pub const GPRU_TIN_DEBIT_VERIFIER_SEED: &[u8] = b"gpru:tin-debit-verifier:v1";
pub const TIN_DEBIT_CONTEXT_DOMAIN: &[u8] = b"TSN_GPRU_TCAP_TIN_DEBIT_CONTEXT_V1\0";
pub const TIN_DEBIT_AUTHORIZATION_DOMAIN: &[u8] = b"TSN_GPRU_TIN_DEBIT_AUTHORIZATION_V1\0";
const MEMO_PREFIX: &[u8] = b"TSN_GPRU_TIN_DEBIT_MEMO_V1:";
const Q: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

// Borrow the verifier in place. Borsh Account<T> duplicated this 2,276-byte
// body on the SBF stack; its public 2,284-byte encoding remains unchanged.
#[account(zero_copy)]
pub struct GpruTinDebitVerifierV1 {
    pub version: u16,
    pub authority: Pubkey,
    pub circuit_commitment: [u8; 32],
    pub verifying_key_commitment: [u8; 32],
    pub bump: u8,
    pub enabled: u8,
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
    pub ic: [[u8; 64]; TIN_DEBIT_PUBLIC_INPUTS + 1],
}
impl GpruTinDebitVerifierV1 {
    pub const SPACE: usize = 2284;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct HiddenHeadTinDebitProofV1 {
    pub public_inputs: [[u8; 32]; TIN_DEBIT_PUBLIC_INPUTS],
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeTinDebitVerifierArgsV1 {
    pub circuit_commitment: [u8; 32],
    pub verifying_key_commitment: [u8; 32],
    pub alpha_g1: [u8; 64],
    pub beta_g2: [u8; 128],
    pub gamma_g2: [u8; 128],
    pub delta_g2: [u8; 128],
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WriteTinDebitVerifierIcArgsV1 {
    pub start_index: u8,
    pub points: Vec<[u8; 64]>,
}
#[derive(Accounts)]
pub struct InitializeTinDebitVerifierV1<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: canonical Mother Escrow and its authority validated below.
    pub mother_escrow: UncheckedAccount<'info>,
    #[account(init, payer=authority, space=GpruTinDebitVerifierV1::SPACE, seeds=[GPRU_TIN_DEBIT_VERIFIER_SEED], bump)]
    pub verifier: AccountLoader<'info, GpruTinDebitVerifierV1>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ConfigureTinDebitVerifierV1<'info> {
    pub authority: Signer<'info>,
    /// CHECK: canonical Mother Escrow and its authority validated below.
    pub mother_escrow: UncheckedAccount<'info>,
    #[account(mut, seeds=[GPRU_TIN_DEBIT_VERIFIER_SEED], bump=verifier.load()?.bump)]
    pub verifier: AccountLoader<'info, GpruTinDebitVerifierV1>,
}
#[derive(Accounts)]
pub struct VerifyHiddenHeadTinDebitV1<'info> {
    /// CHECK: canonical TIP shared route root and layout validated below.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: canonical TCAP shared root and layout validated below.
    pub tcap_commitment_root: UncheckedAccount<'info>,
    #[account(seeds=[GPRU_TIN_DEBIT_VERIFIER_SEED], bump=verifier.load()?.bump)]
    pub verifier: AccountLoader<'info, GpruTinDebitVerifierV1>,
    /// CHECK: canonical instructions sysvar binds TSNP and both following Memos.
    #[account(address=solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}
#[error_code]
pub enum TinDebitError {
    #[msg("TIN-Debit verifier unavailable or key mismatch")]
    Verifier,
    #[msg("Invalid TIN-Debit authority")]
    Authority,
    #[msg("Invalid TIN-Debit circuit commitment")]
    Circuit,
    #[msg("Invalid TIN-Debit public statement or transaction context")]
    Statement,
    #[msg("Invalid TIN-Debit Memo framing or binding")]
    Memo,
    #[msg("Invalid TIN-Debit root account")]
    Root,
    #[msg("TIN-Debit Groth16 proof failed")]
    Proof,
}

pub fn circuit_commitment() -> [u8; 32] {
    hashv(&[
        b"TSN_GPRU_HIDDEN_HEAD_TIN_DEBIT_V1\0",
        include_bytes!("../circuits/hidden_head_tin_debit_v1/main.circom"),
        include_bytes!("../circuits/hidden_head_tin_debit_v1/primitives.circom"),
    ])
    .to_bytes()
}
pub fn key_commitment(v: &GpruTinDebitVerifierV1) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(448 + 64 * 27);
    bytes.extend_from_slice(&v.alpha_g1);
    bytes.extend_from_slice(&v.beta_g2);
    bytes.extend_from_slice(&v.gamma_g2);
    bytes.extend_from_slice(&v.delta_g2);
    for p in &v.ic {
        bytes.extend_from_slice(p);
    }
    hashv(&[b"GPRU_TIN_DEBIT_VERIFYING_KEY_V1\0", &bytes]).to_bytes()
}
fn check_mother(mother: &UncheckedAccount, authority: &Signer) -> Result<()> {
    let (key, _) = Pubkey::find_program_address(&[b"tsn_mother_escrow"], &TSN_PROGRAM_ID);
    require_keys_eq!(mother.key(), key, TinDebitError::Authority);
    require_keys_eq!(*mother.owner, TSN_PROGRAM_ID, TinDebitError::Authority);
    let b = mother.try_borrow_data()?;
    let disc = hash(b"account:MotherEscrow").to_bytes();
    require!(
        b.len() >= 40 && b[..8] == disc[..8] && b[8..40] == authority.key().to_bytes(),
        TinDebitError::Authority
    );
    Ok(())
}
pub fn initialize(
    ctx: Context<InitializeTinDebitVerifierV1>,
    args: InitializeTinDebitVerifierArgsV1,
) -> Result<()> {
    check_mother(&ctx.accounts.mother_escrow, &ctx.accounts.authority)?;
    require!(
        args.circuit_commitment == circuit_commitment(),
        TinDebitError::Circuit
    );
    require!(
        args.verifying_key_commitment != [0; 32],
        TinDebitError::Verifier
    );
    let v = &mut ctx.accounts.verifier.load_init()?;
    v.version = 1;
    v.authority = ctx.accounts.authority.key();
    v.bump = ctx.bumps.verifier;
    v.enabled = 0;
    v.circuit_commitment = args.circuit_commitment;
    v.verifying_key_commitment = args.verifying_key_commitment;
    v.alpha_g1 = args.alpha_g1;
    v.beta_g2 = args.beta_g2;
    v.gamma_g2 = args.gamma_g2;
    v.delta_g2 = args.delta_g2;
    for point in &mut v.ic { point.fill(0); }
    Ok(())
}
pub fn write_ic(
    ctx: Context<ConfigureTinDebitVerifierV1>,
    args: WriteTinDebitVerifierIcArgsV1,
) -> Result<()> {
    check_mother(&ctx.accounts.mother_escrow, &ctx.accounts.authority)?;
    let mut v = ctx.accounts.verifier.load_mut()?;
    require_keys_eq!(
        v.authority,
        ctx.accounts.authority.key(),
        TinDebitError::Authority
    );
    write_ic_points(&mut v, &args)
}
fn write_ic_points(
    v: &mut GpruTinDebitVerifierV1,
    args: &WriteTinDebitVerifierIcArgsV1,
) -> Result<()> {
    let start = usize::from(args.start_index);
    require!(
        v.version == 1
            && v.enabled == 0
            && !args.points.is_empty()
            && args.points.len() <= 4
            && start + args.points.len() <= 27
            && args.points.iter().all(|p| *p != [0; 64]),
        TinDebitError::Verifier
    );
    v.ic[start..start + args.points.len()].copy_from_slice(&args.points);
    Ok(())
}
pub fn enable(ctx: Context<ConfigureTinDebitVerifierV1>) -> Result<()> {
    check_mother(&ctx.accounts.mother_escrow, &ctx.accounts.authority)?;
    let mut v = ctx.accounts.verifier.load_mut()?;
    require_keys_eq!(
        v.authority,
        ctx.accounts.authority.key(),
        TinDebitError::Authority
    );
    enable_complete_key(&mut v)
}
fn enable_complete_key(v: &mut GpruTinDebitVerifierV1) -> Result<()> {
    require!(
        v.version == 1
            && v.enabled == 0
            && v.circuit_commitment == circuit_commitment()
            && v.ic.iter().all(|p| *p != [0; 64])
            && v.verifying_key_commitment == key_commitment(&v),
        TinDebitError::Verifier
    );
    v.enabled = 1;
    Ok(())
}

pub fn verify(
    ctx: Context<VerifyHiddenHeadTinDebitV1>,
    args: HiddenHeadTinDebitProofV1,
) -> Result<()> {
    let v = ctx.accounts.verifier.load()?;
    require!(
        v.version == 1
            && v.enabled == 1
            && v.circuit_commitment == circuit_commitment()
            && v.verifying_key_commitment == key_commitment(&v),
        TinDebitError::Verifier
    );
    validate_public_inputs(&args.public_inputs)?;
    let (root, sequence) = validate_tcap_root(&ctx.accounts.tcap_commitment_root)?;
    let tip_root = validate_tip_root(&ctx.accounts.tip_route_root)?;
    require!(
        args.public_inputs[0] == root
            && args.public_inputs[2] == tip_root
            && args.public_inputs[3] == scalar_u64(sequence),
        TinDebitError::Statement
    );
    let clock = Clock::get()?;
    require!(
        clock.slot >= read_u64(&args.public_inputs[6])?
            && clock.slot <= read_u64(&args.public_inputs[7])?,
        TinDebitError::Statement
    );
    let sysvar = ctx.accounts.instructions.to_account_info();
    let index = usize::from(load_current_index_checked(&sysvar)?);
    let caller = load_instruction_at_checked(index, &sysvar)?;
    validate_caller(
        &caller,
        &args,
        &ctx.accounts.tcap_commitment_root.key(),
        &ctx.accounts.tip_route_root.key(),
        &ctx.accounts.verifier.key(),
    )?;
    for leg in 0..2 {
        let memo = load_instruction_at_checked(
            index.checked_add(leg + 1).ok_or(TinDebitError::Memo)?,
            &sysvar,
        )?;
        validate_memo(&memo, &caller.accounts[0].pubkey, leg, &args.public_inputs)?;
    }
    // The two records terminate this action's canonical transaction projection.
    require!(
        load_instruction_at_checked(index.checked_add(3).ok_or(TinDebitError::Memo)?, &sysvar)
            .is_err(),
        TinDebitError::Memo
    );
    let vk = Groth16Verifyingkey {
        nr_pubinputs: 26,
        vk_alpha_g1: v.alpha_g1,
        vk_beta_g2: v.beta_g2,
        vk_gamme_g2: v.gamma_g2,
        vk_delta_g2: v.delta_g2,
        vk_ic: &v.ic,
    };
    let mut verifier = Groth16Verifier::<26>::new(
        &args.proof_a,
        &args.proof_b,
        &args.proof_c,
        &args.public_inputs,
        &vk,
    )
    .map_err(|_| error!(TinDebitError::Proof))?;
    verifier
        .verify()
        .map_err(|_| error!(TinDebitError::Proof))?;
    msg!("GPRU TIN-Debit proof verified");
    Ok(())
}
fn validate_public_inputs(p: &[[u8; 32]; 26]) -> Result<()> {
    require!(
        p.iter().all(|x| *x < Q)
            && [0, 1, 2, 4, 8, 9, 10, 11, 12, 13, 14, 15]
                .iter()
                .all(|i| p[*i] != [0; 32])
            && p[0] != p[1],
        TinDebitError::Statement
    );
    let sequence = read_u64(&p[3])?;
    let asset = read_u64(&p[5])?;
    require!(
        sequence < u64::MAX
            && asset > 0
            && asset <= u32::MAX as u64
            && read_u64(&p[6])? <= read_u64(&p[7])?,
        TinDebitError::Statement
    );
    Ok(())
}
fn validate_caller(
    caller: &Instruction,
    args: &HiddenHeadTinDebitProofV1,
    root: &Pubkey,
    tip: &Pubkey,
    verifier: &Pubkey,
) -> Result<()> {
    let disc = hash(b"global:tsn_register_tcap_tin_debit_authorization_v1").to_bytes();
    require!(
        caller.program_id == TSN_PROGRAM_ID
            && caller.accounts.len() == 13
            && caller.data.len() == 1128
            && caller.data[..8] == disc[..8],
        TinDebitError::Statement
    );
    require!(
        caller.data[40..] == args.try_to_vec()?,
        TinDebitError::Statement
    );
    let a = &caller.accounts;
    for (i, m) in a.iter().enumerate() {
        require!(
            m.is_signer == (i == 0) && m.is_writable == (i == 6),
            TinDebitError::Statement
        );
    }
    let mother = Pubkey::find_program_address(&[b"tsn_mother_escrow"], &TSN_PROGRAM_ID).0;
    let config = Pubkey::find_program_address(&[b"tcap:global-config:v1"], &TCAP_PROGRAM_ID).0;
    let reserve = Pubkey::find_program_address(
        &[b"tcap:reserve-state:v1", a[5].pubkey.as_ref()],
        &TCAP_PROGRAM_ID,
    )
    .0;
    require!(
        a[1].pubkey == mother
            && a[2].pubkey == TCAP_PROGRAM_ID
            && a[3].pubkey == TSN_PROGRAM_ID
            && a[4].pubkey == config
            && a[6].pubkey == *root
            && a[7].pubkey == reserve
            && a[9].pubkey == *tip
            && a[10].pubkey == *verifier
            && a[11].pubkey == solana_program::sysvar::instructions::ID
            && a[12].pubkey == crate::ID,
        TinDebitError::Statement
    );
    let context = [
        TSN_PROGRAM_ID,
        TCAP_PROGRAM_ID,
        crate::ID,
        TIP_PROGRAM_ID,
        *root,
        a[5].pubkey,
        a[7].pubkey,
        *tip,
        *verifier,
    ];
    let bytes: Vec<u8> = context.iter().flat_map(|k| k.to_bytes()).collect();
    require!(
        args.public_inputs[4]
            == reduce_scalar(hashv(&[TIN_DEBIT_CONTEXT_DOMAIN, &bytes]).to_bytes()),
        TinDebitError::Statement
    );
    let inputs: Vec<u8> = args.public_inputs.iter().flat_map(|p| *p).collect();
    let digest = hashv(&[TIN_DEBIT_AUTHORIZATION_DOMAIN, &bytes, &inputs]).to_bytes();
    let signer =
        Pubkey::find_program_address(&[b"tsn:tcap-authorization:v1", &digest], &TSN_PROGRAM_ID).0;
    require!(
        caller.data[8..40] == digest && a[8].pubkey == signer,
        TinDebitError::Statement
    );
    Ok(())
}
fn validate_tcap_root(a: &UncheckedAccount) -> Result<([u8; 32], u64)> {
    let (key, bump) = Pubkey::find_program_address(&[b"tcap:commitment-root:v1"], &TCAP_PROGRAM_ID);
    require!(
        a.key() == key && *a.owner == TCAP_PROGRAM_ID,
        TinDebitError::Root
    );
    let b = a.try_borrow_data()?;
    let disc = hash(b"account:TcapCommitmentRootStateV1").to_bytes();
    require!(
        b.len() == 124
            && b[..8] == disc[..8]
            && b[8..10] == 1u16.to_le_bytes()
            && b[10..12] == 1u16.to_le_bytes()
            && b[122] == 0
            && b[123] == bump,
        TinDebitError::Root
    );
    let root: [u8; 32] = b[12..44].try_into().unwrap();
    require!(root != [0; 32] && root < Q, TinDebitError::Root);
    Ok((root, u64::from_le_bytes(b[80..88].try_into().unwrap())))
}
fn validate_tip_root(a: &UncheckedAccount) -> Result<[u8; 32]> {
    let (key, bump) = Pubkey::find_program_address(&[TIP_ROUTE_ROOT_SEED], &TIP_PROGRAM_ID);
    require!(
        a.key() == key && *a.owner == TIP_PROGRAM_ID,
        TinDebitError::Root
    );
    let b = a.try_borrow_data()?;
    require!(
        b.len() >= 42
            && b[0] == 1
            && b[1] == bump
            && u64::from_le_bytes(b[34..42].try_into().unwrap()) > 0,
        TinDebitError::Root
    );
    let root: [u8; 32] = b[2..34].try_into().unwrap();
    require!(root != [0; 32] && root < Q, TinDebitError::Root);
    Ok(root)
}
fn validate_memo(
    memo: &Instruction,
    authority: &Pubkey,
    leg: usize,
    p: &[[u8; 32]; 26],
) -> Result<()> {
    require!(
        memo.program_id == pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")
            && memo.accounts.len() == 1
            && memo.accounts[0].pubkey == *authority
            && memo.accounts[0].is_signer
            && !memo.accounts[0].is_writable,
        TinDebitError::Memo
    );
    let b = decode_memo(&memo.data)?;
    require!(
        usize::from(b[1]) == leg && reduce_scalar(hash(&memo.data).to_bytes()) == p[12 + leg],
        TinDebitError::Memo
    );
    for (offset, index) in [
        (2, 14 + leg),
        (34, 16 + leg),
        (66, 18 + leg),
        (98, 10),
        (130, 20 + leg),
        (162, 22 + leg),
        (194, 24 + leg),
    ] {
        require!(b[offset..offset + 32] == p[index], TinDebitError::Memo);
    }
    Ok(())
}
fn decode_memo(data: &[u8]) -> Result<[u8; 416]> {
    require!(
        data.len() == MEMO_PREFIX.len() + 555 && data.starts_with(MEMO_PREFIX),
        TinDebitError::Memo
    );
    let input = &data[MEMO_PREFIX.len()..];
    let mut out = [0u8; 416];
    let mut accumulator = 0u32;
    let mut bits = 0usize;
    let mut pos = 0usize;
    for byte in input {
        let value = match *byte {
            b'A'..=b'Z' => *byte - b'A',
            b'a'..=b'z' => *byte - b'a' + 26,
            b'0'..=b'9' => *byte - b'0' + 52,
            b'-' => 62,
            b'_' => 63,
            _ => return err!(TinDebitError::Memo),
        };
        accumulator = (accumulator << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            require!(pos < 416, TinDebitError::Memo);
            out[pos] = (accumulator >> bits) as u8;
            pos += 1;
        }
        accumulator &= (1u32 << bits) - 1;
    }
    require!(
        pos == 416 && bits == 2 && accumulator == 0 && out[0] == 1 && out[1] < 2,
        TinDebitError::Memo
    );
    Ok(out)
}
fn scalar_u64(v: u64) -> [u8; 32] {
    let mut b = [0; 32];
    b[24..].copy_from_slice(&v.to_be_bytes());
    b
}
fn read_u64(b: &[u8; 32]) -> Result<u64> {
    require!(b[..24] == [0; 24], TinDebitError::Statement);
    Ok(u64::from_be_bytes(b[24..].try_into().unwrap()))
}
fn reduce_scalar(mut b: [u8; 32]) -> [u8; 32] {
    while b >= Q {
        let mut borrow = 0u16;
        for i in (0..32).rev() {
            let a = u16::from(b[i]);
            let v = u16::from(Q[i]) + borrow;
            if a >= v {
                b[i] = (a - v) as u8;
                borrow = 0;
            } else {
                b[i] = (a + 256 - v) as u8;
                borrow = 1;
            }
        }
    }
    b
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> GpruTinDebitVerifierV1 {
        GpruTinDebitVerifierV1 {
            version: 1,
            authority: Pubkey::new_unique(),
            circuit_commitment: circuit_commitment(),
            verifying_key_commitment: [0; 32],
            bump: 9,
            enabled: 0,
            alpha_g1: [1; 64],
            beta_g2: [2; 128],
            gamma_g2: [3; 128],
            delta_g2: [4; 128],
            ic: [[5; 64]; 27],
        }
    }
    #[test]
    fn separate_layout_and_complete_key_gate() {
        let mut v = fixture();
        assert_eq!(core::mem::size_of::<GpruTinDebitVerifierV1>(), 2276);
        let mut bytes = <GpruTinDebitVerifierV1 as anchor_lang::Discriminator>::DISCRIMINATOR.to_vec();
        bytes.extend_from_slice(bytemuck::bytes_of(&v));
        assert_eq!(bytes.len(), 2284);
        assert_eq!(bytes[106], 9);
        assert_eq!(bytes[107], 0);
        assert_eq!(&bytes[8..10], &1u16.to_le_bytes());
        assert_eq!(&bytes[10..42], v.authority.as_ref());
        assert_eq!(&bytes[42..74], &v.circuit_commitment);
        assert_eq!(&bytes[74..106], &v.verifying_key_commitment);
        for (offset, point) in [
            (108, v.alpha_g1.as_slice()),
            (172, v.beta_g2.as_slice()),
            (300, v.gamma_g2.as_slice()),
            (428, v.delta_g2.as_slice()),
        ] {
            assert_eq!(&bytes[offset..offset + point.len()], point);
        }
        assert_eq!(
            &bytes[556..],
            &v.ic.iter().flat_map(|p| *p).collect::<Vec<_>>()
        );
        assert_eq!(crate::hidden_head::GpruHiddenHeadVerifierV2::SPACE, 1452);
        v.verifying_key_commitment = key_commitment(&v);
        v.ic = [[0; 64]; 27];
        assert!(enable_complete_key(&mut v).is_err());
        for start in (0..27).step_by(4) {
            write_ic_points(
                &mut v,
                &WriteTinDebitVerifierIcArgsV1 {
                    start_index: start as u8,
                    points: vec![[5; 64]; (27 - start).min(4)],
                },
            )
            .unwrap();
        }
        enable_complete_key(&mut v).unwrap();
        assert_eq!(v.enabled, 1);
        assert!(write_ic_points(
            &mut v,
            &WriteTinDebitVerifierIcArgsV1 {
                start_index: 0,
                points: vec![[1; 64]]
            }
        )
        .is_err());
        assert_ne!(
            Pubkey::find_program_address(&[GPRU_TIN_DEBIT_VERIFIER_SEED], &crate::ID).0,
            Pubkey::find_program_address(
                &[crate::hidden_head::GPRU_HIDDEN_HEAD_VERIFIER_SEED],
                &crate::ID
            )
            .0
        );
    }
    #[test]
    fn altered_circuit_key_and_invalid_chunks_fail_without_write() {
        let mut v = fixture();
        v.verifying_key_commitment = key_commitment(&v);
        v.ic[26][0] ^= 1;
        assert!(enable_complete_key(&mut v).is_err());
        v.ic[26][0] ^= 1;
        v.circuit_commitment[0] ^= 1;
        assert!(enable_complete_key(&mut v).is_err());
        assert_eq!(v.enabled, 0);
        for (start, points) in [
            (0, vec![]),
            (0, vec![[5; 64]; 5]),
            (26, vec![[5; 64]; 2]),
            (0, vec![[0; 64]]),
        ] {
            let before = v.ic;
            assert!(write_ic_points(
                &mut v,
                &WriteTinDebitVerifierIcArgsV1 {
                    start_index: start,
                    points
                }
            )
            .is_err());
            assert_eq!(before, v.ic);
        }
    }
    fn encode(b: &[u8]) -> Vec<u8> {
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = MEMO_PREFIX.to_vec();
        let mut acc = 0u32;
        let mut bits = 0usize;
        for byte in b {
            acc = (acc << 8) | u32::from(*byte);
            bits += 8;
            while bits >= 6 {
                bits -= 6;
                out.push(alphabet[((acc >> bits) & 63) as usize]);
            }
            acc &= (1u32 << bits) - 1;
        }
        if bits > 0 {
            out.push(alphabet[(acc << (6 - bits)) as usize]);
        }
        out
    }
    #[test]
    fn strict_compact_memo_rejects_alternate_encodings_and_tampered_legs() {
        let mut binary = [0; 416];
        binary[0] = 1;
        let encoded = encode(&binary);
        assert_eq!(encoded.len(), 582);
        assert_eq!(decode_memo(&encoded).unwrap(), binary);
        for offset in [0, 27, 581] {
            let mut b = encoded.clone();
            b[offset] = b'=';
            assert!(decode_memo(&b).is_err());
        }
        let mut b = encoded.clone();
        b[581] = b'B';
        assert!(decode_memo(&b).is_err());
        binary[1] = 2;
        assert!(decode_memo(&encode(&binary)).is_err());
        assert!(decode_memo(&encoded[..581]).is_err());
        let mut longer = encoded;
        longer.push(b'A');
        assert!(decode_memo(&longer).is_err());
    }
    fn statement_and_caller() -> (HiddenHeadTinDebitProofV1, Instruction) {
        use solana_program::instruction::AccountMeta;
        let asset = Pubkey::new_unique();
        let root = Pubkey::find_program_address(&[b"tcap:commitment-root:v1"], &TCAP_PROGRAM_ID).0;
        let tip = Pubkey::find_program_address(&[TIP_ROUTE_ROOT_SEED], &TIP_PROGRAM_ID).0;
        let verifier = Pubkey::find_program_address(&[GPRU_TIN_DEBIT_VERIFIER_SEED], &crate::ID).0;
        let reserve = Pubkey::find_program_address(
            &[b"tcap:reserve-state:v1", asset.as_ref()],
            &TCAP_PROGRAM_ID,
        )
        .0;
        let mut p = std::array::from_fn(|i| scalar_u64((i + 1) as u64));
        let context = [
            TSN_PROGRAM_ID,
            TCAP_PROGRAM_ID,
            crate::ID,
            TIP_PROGRAM_ID,
            root,
            asset,
            reserve,
            tip,
            verifier,
        ];
        let bytes = context
            .iter()
            .flat_map(|k| k.to_bytes())
            .collect::<Vec<_>>();
        p[4] = reduce_scalar(hashv(&[TIN_DEBIT_CONTEXT_DOMAIN, &bytes]).to_bytes());
        let digest = hashv(&[
            TIN_DEBIT_AUTHORIZATION_DOMAIN,
            &bytes,
            &p.iter().flat_map(|v| *v).collect::<Vec<_>>(),
        ])
        .to_bytes();
        let keys = [
            Pubkey::new_unique(),
            Pubkey::find_program_address(&[b"tsn_mother_escrow"], &TSN_PROGRAM_ID).0,
            TCAP_PROGRAM_ID,
            TSN_PROGRAM_ID,
            Pubkey::find_program_address(&[b"tcap:global-config:v1"], &TCAP_PROGRAM_ID).0,
            asset,
            root,
            reserve,
            Pubkey::find_program_address(&[b"tsn:tcap-authorization:v1", &digest], &TSN_PROGRAM_ID)
                .0,
            tip,
            verifier,
            solana_program::sysvar::instructions::ID,
            crate::ID,
        ];
        let args = HiddenHeadTinDebitProofV1 {
            public_inputs: p,
            proof_a: [1; 64],
            proof_b: [2; 128],
            proof_c: [3; 64],
        };
        let mut data =
            hash(b"global:tsn_register_tcap_tin_debit_authorization_v1").to_bytes()[..8].to_vec();
        data.extend_from_slice(&digest);
        data.extend_from_slice(&args.try_to_vec().unwrap());
        let accounts = keys
            .iter()
            .enumerate()
            .map(|(i, key)| AccountMeta {
                pubkey: *key,
                is_signer: i == 0,
                is_writable: i == 6,
            })
            .collect();
        (
            args,
            Instruction {
                program_id: TSN_PROGRAM_ID,
                accounts,
                data,
            },
        )
    }
    fn check_caller(caller: &Instruction, args: &HiddenHeadTinDebitProofV1) -> Result<()> {
        validate_caller(
            caller,
            args,
            &caller.accounts[6].pubkey,
            &caller.accounts[9].pubkey,
            &caller.accounts[10].pubkey,
        )
    }
    #[test]
    fn caller_binds_all_fields_programs_accounts_and_privilege_masks() {
        let (args, caller) = statement_and_caller();
        validate_public_inputs(&args.public_inputs).unwrap();
        check_caller(&caller, &args).unwrap();
        assert_ne!(&caller.data[8..40], &args.public_inputs[9]);
        for i in 0..26 {
            let mut changed = args;
            changed.public_inputs[i][31] ^= 1;
            assert!(check_caller(&caller, &changed).is_err());
        }
        for i in 0..13 {
            let mut changed = caller.clone();
            changed.accounts[i].is_signer ^= true;
            assert!(check_caller(&changed, &args).is_err());
            let mut changed = caller.clone();
            changed.accounts[i].is_writable ^= true;
            assert!(check_caller(&changed, &args).is_err());
        }
        for i in 1..13 {
            let mut changed = caller.clone();
            changed.accounts[i].pubkey = Pubkey::new_unique();
            assert!(check_caller(&changed, &args).is_err());
        }
        for offset in [0, 8, 40, 1127] {
            let mut changed = caller.clone();
            changed.data[offset] ^= 1;
            assert!(check_caller(&changed, &args).is_err());
        }
        let mut changed = caller.clone();
        changed.program_id = TCAP_PROGRAM_ID;
        assert!(check_caller(&changed, &args).is_err());
        let mut changed = caller.clone();
        changed.data.push(0);
        assert!(check_caller(&changed, &args).is_err());
        let mut changed = caller.clone();
        changed.accounts.pop();
        assert!(validate_caller(
            &changed,
            &args,
            &caller.accounts[6].pubkey,
            &caller.accounts[9].pubkey,
            &caller.accounts[10].pubkey
        )
        .is_err());
        for index in [3, 5, 6, 7] {
            let mut p = args.public_inputs;
            p[index][0] = 1;
            assert!(validate_public_inputs(&p).is_err());
        }
        for index in 0..26 {
            let mut p = args.public_inputs;
            p[index] = Q;
            assert!(validate_public_inputs(&p).is_err());
        }
    }
    #[test]
    fn both_memos_bind_leg_points_ciphertext_fields_and_signed_authority() {
        use solana_program::instruction::AccountMeta;
        let (args, caller) = statement_and_caller();
        let authority = caller.accounts[0].pubkey;
        for leg in 0..2 {
            let mut p = args.public_inputs;
            let mut binary = [11; 416];
            binary[0] = 1;
            binary[1] = leg as u8;
            for (offset, index) in [
                (2, 14 + leg),
                (34, 16 + leg),
                (66, 18 + leg),
                (98, 10),
                (130, 20 + leg),
                (162, 22 + leg),
                (194, 24 + leg),
            ] {
                binary[offset..offset + 32].copy_from_slice(&p[index]);
            }
            let data = encode(&binary);
            p[12 + leg] = reduce_scalar(hash(&data).to_bytes());
            let memo = Instruction {
                program_id: pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
                accounts: vec![AccountMeta::new_readonly(authority, true)],
                data,
            };
            validate_memo(&memo, &authority, leg, &p).unwrap();
            assert!(validate_memo(&memo, &authority, 1 - leg, &p).is_err());
            for offset in 0..416 {
                let mut changed = binary;
                changed[offset] ^= 1;
                let mut m = memo.clone();
                m.data = encode(&changed);
                assert!(validate_memo(&m, &authority, leg, &p).is_err());
            }
            // Rebinding only the Memo hash cannot bypass the circuit-bound fields.
            for offset in [2, 34, 66, 98, 130, 162, 194] {
                let mut changed = binary;
                changed[offset + 31] ^= 1;
                let mut m = memo.clone();
                m.data = encode(&changed);
                let mut fields = p;
                fields[12 + leg] = reduce_scalar(hash(&m.data).to_bytes());
                assert!(validate_memo(&m, &authority, leg, &fields).is_err());
            }
            let mut changed = memo.clone();
            changed.accounts[0].is_writable = true;
            assert!(validate_memo(&changed, &authority, leg, &p).is_err());
            let mut changed = memo.clone();
            changed.accounts[0].is_signer = false;
            assert!(validate_memo(&changed, &authority, leg, &p).is_err());
            let mut changed = memo.clone();
            changed.program_id = TSN_PROGRAM_ID;
            assert!(validate_memo(&changed, &authority, leg, &p).is_err());
            assert!(validate_memo(&memo, &Pubkey::new_unique(), leg, &p).is_err());
        }
    }
    #[test]
    #[ignore = "requires explicitly supplied local 26-input tin_debit proof fixture"]
    fn actual_tin_debit_proof_and_all_public_input_tampering() {
        let file =
            std::env::var("TSN_GPRU_TIN_DEBIT_PROOF_FIXTURE").expect("set local tin_debit fixture");
        let b = std::fs::read(file).unwrap();
        assert_eq!(b.len(), 3264);
        let ic: Vec<[u8; 64]> = b[448..2176]
            .chunks_exact(64)
            .map(|p| p.try_into().unwrap())
            .collect();
        let vk = Groth16Verifyingkey {
            nr_pubinputs: 26,
            vk_alpha_g1: b[..64].try_into().unwrap(),
            vk_beta_g2: b[64..192].try_into().unwrap(),
            vk_gamme_g2: b[192..320].try_into().unwrap(),
            vk_delta_g2: b[320..448].try_into().unwrap(),
            vk_ic: &ic,
        };
        let mut p = [[0; 32]; 26];
        for (slot, field) in p.iter_mut().zip(b[2176..3008].chunks_exact(32)) {
            slot.copy_from_slice(field);
        }
        let a = b[3008..3072].try_into().unwrap();
        let proof_b = b[3072..3200].try_into().unwrap();
        let c = b[3200..3264].try_into().unwrap();
        Groth16Verifier::<26>::new(&a, &proof_b, &c, &p, &vk)
            .unwrap()
            .verify()
            .unwrap();
        for i in 0..26 {
            let mut changed = p;
            changed[i][31] ^= 1;
            assert!(Groth16Verifier::<26>::new(&a, &proof_b, &c, &changed, &vk)
                .unwrap()
                .verify()
                .is_err());
        }
    }
}
