//! Atomically reassign private TIN ownership by advancing only the shared root.
use crate::{
    authority::{derive_tsn_authorization_signer, TCAP_COMMITMENT_ROOT_SEED},
    error::TcapError,
    state::{
        TcapAssetEntryV1, TcapAssetStatusV1, TcapCommitmentRootStateV1, TcapGlobalConfigV1,
        TcapReserveStateV1, TcapRiskStateV1,
    },
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

pub const TIN_DEBIT_GPRU_PROGRAM_ID: Pubkey =
    pubkey!("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
pub const TIN_DEBIT_TIP_PROGRAM_ID: Pubkey = pubkey!("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
pub const TIN_DEBIT_TSN_PROGRAM_ID: Pubkey = pubkey!("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
pub const TIN_DEBIT_VERIFIER_SEED: &[u8] = b"gpru:tin-debit-verifier:v1";
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct TcapHiddenHeadTinDebitProofV1 {
    pub public_inputs: [[u8; 32]; 26],
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct DebitGpruMemoV1Args {
    pub authorization_digest: [u8; 32],
    pub proof: TcapHiddenHeadTinDebitProofV1,
}
#[derive(Accounts)]
pub struct DebitGpruMemoV1<'info> {
    pub authority: Signer<'info>,
    #[account(seeds=[crate::authority::TCAP_GLOBAL_CONFIG_SEED],bump=config.bump,constraint=!config.paused @ TcapError::ProtocolPaused)]
    pub config: Box<Account<'info, TcapGlobalConfigV1>>,
    #[account(mut,seeds=[TCAP_COMMITMENT_ROOT_SEED],bump=commitment_root.bump,
        constraint=config.commitment_root_state==commitment_root.key() @ TcapError::InvalidPda,
        constraint=!commitment_root.paused @ TcapError::ProtocolPaused)]
    pub commitment_root: Box<Account<'info, TcapCommitmentRootStateV1>>,
    #[account(seeds=[crate::authority::TCAP_ASSET_ENTRY_SEED,asset_entry.registry.as_ref(),asset_entry.asset.token_program.as_ref(),asset_entry.asset.mint.as_ref()],bump=asset_entry.bump)]
    pub asset_entry: Box<Account<'info, TcapAssetEntryV1>>,
    #[account(seeds=[crate::authority::TCAP_RESERVE_STATE_SEED,asset_entry.key().as_ref()],bump=reserve_state.bump,
        address=asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint=reserve_state.asset_entry==asset_entry.key() @ TcapError::InvalidReserve,
        constraint=!reserve_state.paused @ TcapError::AssetUnavailable)]
    pub reserve_state: Box<Account<'info, TcapReserveStateV1>>,
    /// CHECK: configured and fixed TSNP executable authenticated below.
    #[account(executable,address=config.approved_tsn_program @ TcapError::InvalidTsnProgram)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: digest-scoped TSNP CPI signer authenticated below.
    pub tsn_authorization_signer: UncheckedAccount<'info>,
    /// CHECK: canonical TIP account authenticated by GPRU.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: canonical separate TIN-Debit verifier authenticated by GPRU.
    pub tin_debit_verifier: UncheckedAccount<'info>,
    /// CHECK: canonical instructions sysvar binds top-level TSNP call and both Memos.
    #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: fixed deployed GPRU executable.
    #[account(executable,address=TIN_DEBIT_GPRU_PROGRAM_ID)]
    pub gpru_program: UncheckedAccount<'info>,
}
pub fn tin_debit_context(
    root: &Pubkey,
    asset: &Pubkey,
    reserve: &Pubkey,
    tip: &Pubkey,
    verifier: &Pubkey,
) -> Vec<u8> {
    [
        TIN_DEBIT_TSN_PROGRAM_ID,
        crate::ID,
        TIN_DEBIT_GPRU_PROGRAM_ID,
        TIN_DEBIT_TIP_PROGRAM_ID,
        *root,
        *asset,
        *reserve,
        *tip,
        *verifier,
    ]
    .iter()
    .flat_map(|key| key.to_bytes())
    .collect()
}
pub fn tin_debit_deployment_commitment(context: &[u8]) -> [u8; 32] {
    reduce_scalar(hashv(&[b"TSN_GPRU_TCAP_TIN_DEBIT_CONTEXT_V1\0", context]).to_bytes())
}
pub fn tin_debit_authorization_digest(context: &[u8], inputs: &[[u8; 32]; 26]) -> [u8; 32] {
    let bytes: Vec<u8> = inputs.iter().flat_map(|p| *p).collect();
    hashv(&[b"TSN_GPRU_TIN_DEBIT_AUTHORIZATION_V1\0", context, &bytes]).to_bytes()
}
pub fn validate_tin_debit_statement(args: &DebitGpruMemoV1Args, context: &[u8]) -> Result<()> {
    let p = &args.proof.public_inputs;
    require!(
        p.iter().all(|v| *v < crate::private_funding::BN254_MODULUS)
            && [0, 1, 2, 4, 8, 9, 10, 11, 12, 13, 14, 15]
                .iter()
                .all(|i| p[*i] != [0; 32])
            && p[0] != p[1],
        TcapError::ProofPayloadRequired
    );
    require!(
        read_tin_debit_u64(&p[3])? < u64::MAX
            && read_tin_debit_u64(&p[5])? > 0
            && read_tin_debit_u64(&p[5])? <= u32::MAX as u64
            && read_tin_debit_u64(&p[6])? <= read_tin_debit_u64(&p[7])?,
        TcapError::ProofPayloadRequired
    );
    require!(
        p[4] == tin_debit_deployment_commitment(context)
            && args.authorization_digest != [0; 32]
            && args.authorization_digest == tin_debit_authorization_digest(context, p),
        TcapError::InvalidTsnAuthorizationSigner
    );
    Ok(())
}
pub fn read_tin_debit_u64(b: &[u8; 32]) -> Result<u64> {
    require!(b[..24] == [0; 24], TcapError::ProofPayloadRequired);
    Ok(u64::from_be_bytes(b[24..].try_into().unwrap()))
}
pub fn handler(ctx: Context<DebitGpruMemoV1>, args: DebitGpruMemoV1Args) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.tsn_program.key(),
        TIN_DEBIT_TSN_PROGRAM_ID,
        TcapError::InvalidTsnProgram
    );
    require!(
        ctx.accounts.config.version == crate::TCAP_STATE_VERSION_V1
            && ctx.accounts.config.protocol_version == 1
            && ctx.accounts.asset_entry.version == crate::TCAP_STATE_VERSION_V1
            && ctx.accounts.asset_entry.protocol_version == 1
            && ctx.accounts.asset_entry.registry == ctx.accounts.config.asset_registry
            && ctx.accounts.reserve_state.version == crate::TCAP_STATE_VERSION_V1
            && ctx.accounts.reserve_state.protocol_version == 1,
        TcapError::InvalidPda
    );
    let context = tin_debit_context(
        &ctx.accounts.commitment_root.key(),
        &ctx.accounts.asset_entry.key(),
        &ctx.accounts.reserve_state.key(),
        &ctx.accounts.tip_route_root.key(),
        &ctx.accounts.tin_debit_verifier.key(),
    );
    validate_tin_debit_statement(&args, &context)?;
    let p = &args.proof.public_inputs;
    let asset = &ctx.accounts.asset_entry;
    require!(
        u64::from(asset.token_id) == read_tin_debit_u64(&p[5])?
            && matches!(asset.status, TcapAssetStatusV1::Active)
            && matches!(asset.risk_state, TcapRiskStateV1::Approved)
            && !asset.paused
            && !asset.deprecated,
        TcapError::AssetUnavailable
    );
    require!(
        ctx.accounts.commitment_root.version == crate::TCAP_STATE_VERSION_V1
            && ctx.accounts.commitment_root.protocol_version == 1,
        TcapError::InvalidPda
    );
    validate_root_transition(&ctx.accounts.commitment_root, p)?;
    let expected = derive_tsn_authorization_signer(
        &ctx.accounts.config.approved_tsn_program,
        &args.authorization_digest,
    )
    .0;
    require!(
        ctx.accounts.tsn_authorization_signer.is_signer
            && ctx.accounts.tsn_authorization_signer.key() == expected,
        TcapError::InvalidTsnAuthorizationSigner
    );
    let slot = Clock::get()?.slot;
    require!(
        slot >= read_tin_debit_u64(&p[6])? && slot <= read_tin_debit_u64(&p[7])?,
        TcapError::AuthorizationExpired
    );
    require!(
        ctx.accounts.reserve_state.actual_assets
            >= ctx
                .accounts
                .reserve_state
                .total_liabilities()
                .ok_or(TcapError::ArithmeticOverflow)?,
        TcapError::InvalidReserveLiability
    );
    let ix = gpru_instruction(
        &ctx.accounts.tip_route_root.key(),
        &ctx.accounts.commitment_root.key(),
        &ctx.accounts.tin_debit_verifier.key(),
        &ctx.accounts.instructions.key(),
        &args.proof,
    )?;
    // Nothing is mutated until both-head/nullifier/Memo verification succeeds.
    invoke(
        &ix,
        &[
            ctx.accounts.tip_route_root.to_account_info(),
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.tin_debit_verifier.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
        ],
    )?;
    apply_verified_transition(&mut ctx.accounts.commitment_root, p)?;
    Ok(())
}
fn gpru_instruction(
    tip: &Pubkey,
    root: &Pubkey,
    verifier: &Pubkey,
    instructions: &Pubkey,
    proof: &TcapHiddenHeadTinDebitProofV1,
) -> Result<Instruction> {
    let mut data =
        anchor_lang::solana_program::hash::hash(b"global:verify_hidden_head_tin_debit_v1")
            .to_bytes()[..8]
            .to_vec();
    data.extend_from_slice(&proof.try_to_vec()?);
    Ok(Instruction {
        program_id: TIN_DEBIT_GPRU_PROGRAM_ID,
        data,
        accounts: [*tip, *root, *verifier, *instructions]
            .iter()
            .map(|key| AccountMeta::new_readonly(*key, false))
            .collect(),
    })
}
fn validate_root_transition(root: &TcapCommitmentRootStateV1, p: &[[u8; 32]; 26]) -> Result<()> {
    require!(
        root.current_root == p[0] && root.sequence == read_tin_debit_u64(&p[3])? && p[1] != p[0],
        TcapError::WrongTcapRoot
    );
    root.sequence
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;
    root.root_version
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;
    Ok(())
}
fn apply_verified_transition(
    root: &mut TcapCommitmentRootStateV1,
    p: &[[u8; 32]; 26],
) -> Result<()> {
    validate_root_transition(root, p)?;
    let sequence = root
        .sequence
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;
    let version = root
        .root_version
        .checked_add(1)
        .ok_or(TcapError::ArithmeticOverflow)?;
    root.previous_root = root.current_root;
    root.current_root = p[1];
    root.sequence = sequence;
    root.root_version = version;
    Ok(())
}
fn reduce_scalar(mut b: [u8; 32]) -> [u8; 32] {
    let q = crate::private_funding::BN254_MODULUS;
    while b >= q {
        let mut borrow = 0u16;
        for i in (0..32).rev() {
            let a = u16::from(b[i]);
            let v = u16::from(q[i]) + borrow;
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
    use anchor_lang::ToAccountMetas;
    fn scalar(v: u64) -> [u8; 32] {
        let mut b = [0; 32];
        b[24..].copy_from_slice(&v.to_be_bytes());
        b
    }
    fn root() -> TcapCommitmentRootStateV1 {
        TcapCommitmentRootStateV1 {
            version: 1,
            protocol_version: 1,
            current_root: scalar(1),
            previous_root: scalar(0),
            root_version: 7,
            sequence: 9,
            history_policy: 0,
            verifier_config: Pubkey::new_unique(),
            verifier_enabled: true,
            paused: false,
            bump: 1,
        }
    }
    #[test]
    fn replay_stale_root_and_overflow_reject_without_mutation() {
        let mut r = root();
        let mut p = [[0; 32]; 26];
        p[0] = r.current_root;
        p[1] = scalar(2);
        p[3] = scalar(9);
        apply_verified_transition(&mut r, &p).unwrap();
        assert_eq!(r.sequence, 10);
        assert_eq!(r.root_version, 8);
        assert_eq!(r.previous_root, scalar(1));
        let before = r.try_to_vec().unwrap();
        assert!(apply_verified_transition(&mut r, &p).is_err());
        assert_eq!(r.try_to_vec().unwrap(), before);
        p[0] = r.current_root;
        p[1] = scalar(3);
        p[3] = scalar(r.sequence);
        r.root_version = u32::MAX;
        let before = r.try_to_vec().unwrap();
        assert!(apply_verified_transition(&mut r, &p).is_err());
        assert_eq!(r.try_to_vec().unwrap(), before);
    }
    #[test]
    fn digest_binds_every_field_and_context_without_replacing_owner_authorization() {
        let keys = [Pubkey::new_unique(); 5];
        let context = tin_debit_context(&keys[0], &keys[1], &keys[2], &keys[3], &keys[4]);
        let mut p = [[0; 32]; 26];
        for i in 0..26 {
            p[i] = scalar((i + 1) as u64);
        }
        p[4] = tin_debit_deployment_commitment(&context);
        let digest = tin_debit_authorization_digest(&context, &p);
        assert_ne!(digest, p[9]);
        let args = DebitGpruMemoV1Args {
            authorization_digest: digest,
            proof: TcapHiddenHeadTinDebitProofV1 {
                public_inputs: p,
                proof_a: [0; 64],
                proof_b: [0; 128],
                proof_c: [0; 64],
            },
        };
        validate_tin_debit_statement(&args, &context).unwrap();
        for i in 0..26 {
            let mut altered = args;
            altered.proof.public_inputs[i][31] ^= 1;
            assert!(validate_tin_debit_statement(&altered, &context).is_err());
        }
        let mut changed = context.clone();
        changed[287] ^= 1;
        assert!(validate_tin_debit_statement(&args, &changed).is_err());
        assert_eq!(args.try_to_vec().unwrap().len() + 8, 1128);
    }
    #[test]
    fn canonical_tcap_and_gpru_accounts_cannot_mutate_custody_or_epoch_state() {
        let keys: [Pubkey; 11] = std::array::from_fn(|_| Pubkey::new_unique());
        let accounts = crate::accounts::DebitGpruMemoV1 {
            authority: keys[0],
            config: keys[1],
            commitment_root: keys[2],
            asset_entry: keys[3],
            reserve_state: keys[4],
            tsn_program: keys[5],
            tsn_authorization_signer: keys[6],
            tip_route_root: keys[7],
            tin_debit_verifier: keys[8],
            instructions: keys[9],
            gpru_program: keys[10],
        }
        .to_account_metas(None);
        assert_eq!(accounts.len(), 11);
        for (i, a) in accounts.iter().enumerate() {
            assert_eq!(a.pubkey, keys[i]);
            assert_eq!(a.is_writable, i == 2);
            assert_eq!(a.is_signer, i == 0);
        }
        let proof = TcapHiddenHeadTinDebitProofV1 {
            public_inputs: [[1; 32]; 26],
            proof_a: [2; 64],
            proof_b: [3; 128],
            proof_c: [4; 64],
        };
        let ix = gpru_instruction(&keys[7], &keys[2], &keys[8], &keys[9], &proof).unwrap();
        assert_eq!(ix.program_id, TIN_DEBIT_GPRU_PROGRAM_ID);
        assert_eq!(ix.data.len(), 1096);
        assert_eq!(&ix.data[8..], &proof.try_to_vec().unwrap());
        assert_eq!(ix.accounts.len(), 4);
        for (a, key) in ix.accounts.iter().zip([keys[7], keys[2], keys[8], keys[9]]) {
            assert_eq!(a.pubkey, key);
            assert!(!a.is_writable && !a.is_signer);
        }
    }
}
