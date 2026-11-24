//! Mother-authorized TIN-Debit; owner approval is checked at Node's signing boundary.
use crate::tsn::{
    constants::{TSN_MOTHER_ESCROW_SEED, TSN_TCAP_AUTHORITY_SEED},
    errors::TsnError,
    state::MotherEscrow,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use tcap::instructions::debit_gpru_memo_v1::{
    self, DebitGpruMemoV1Args, TcapHiddenHeadTinDebitProofV1,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct RegisterTcapTinDebitAuthorizationV1Args {
    pub authorization_digest: [u8; 32],
    pub proof: TcapHiddenHeadTinDebitProofV1,
}

#[derive(Accounts)]
pub struct RegisterTcapTinDebitAuthorizationV1<'info> {
    pub authority: Signer<'info>,
    #[account(seeds=[TSN_MOTHER_ESCROW_SEED], bump=mother_escrow.bump,
        constraint=mother_escrow.authority==authority.key() @ TsnError::Unauthorized)]
    pub mother_escrow: Box<Account<'info, MotherEscrow>>,
    /// CHECK: fixed governed TCAP executable.
    #[account(executable, address=tcap::ID @ TsnError::Unauthorized)]
    pub tcap_program: UncheckedAccount<'info>,
    /// CHECK: fixed current TSNP executable is part of the deployment context.
    #[account(executable, address=crate::ID @ TsnError::Unauthorized)]
    pub tsn_program: UncheckedAccount<'info>,
    /// CHECK: TCAP validates its canonical config, owner, governance and pause state.
    pub config: UncheckedAccount<'info>,
    /// CHECK: TCAP validates the registered asset, policy and canonical reserve.
    pub asset_entry: UncheckedAccount<'info>,
    /// CHECK: TCAP validates and advances the canonical shared root after GPRU success.
    #[account(mut)]
    pub commitment_root: UncheckedAccount<'info>,
    /// CHECK: readonly reserve validated by TCAP; no category changes occur.
    pub reserve_state: UncheckedAccount<'info>,
    /// CHECK: digest-scoped TSNP PDA is derived below and signs only the TCAP CPI.
    pub authorization_signer: UncheckedAccount<'info>,
    /// CHECK: GPRU validates canonical TIP owner, PDA and shared-root layout.
    pub tip_route_root: UncheckedAccount<'info>,
    /// CHECK: GPRU validates its separate canonical TIN-Debit verifier.
    pub tin_debit_verifier: UncheckedAccount<'info>,
    /// CHECK: canonical instructions sysvar binds this call and both owner Memos.
    #[account(address=anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: fixed GPRU executable participates in the deployment context.
    #[account(executable, address=debit_gpru_memo_v1::TIN_DEBIT_GPRU_PROGRAM_ID @ TsnError::Unauthorized)]
    pub gpru_program: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<RegisterTcapTinDebitAuthorizationV1>,
    args: RegisterTcapTinDebitAuthorizationV1Args,
) -> Result<()> {
    let context = debit_gpru_memo_v1::tin_debit_context(
        &ctx.accounts.commitment_root.key(),
        &ctx.accounts.asset_entry.key(),
        &ctx.accounts.reserve_state.key(),
        &ctx.accounts.tip_route_root.key(),
        &ctx.accounts.tin_debit_verifier.key(),
    );
    let tcap_args = DebitGpruMemoV1Args {
        authorization_digest: args.authorization_digest,
        proof: args.proof,
    };
    // Public input 9 remains the circuit's Poseidon owner authorization. The
    // independent SHA digest authorizes precisely this deployment and statement.
    debit_gpru_memo_v1::validate_tin_debit_statement(&tcap_args, &context)?;
    let (expected, bump) = Pubkey::find_program_address(
        &[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest],
        &crate::ID,
    );
    require_keys_eq!(
        ctx.accounts.authorization_signer.key(),
        expected,
        TsnError::Unauthorized
    );
    let keys = [
        ctx.accounts.authority.key(),
        ctx.accounts.mother_escrow.key(),
        ctx.accounts.tcap_program.key(),
        ctx.accounts.tsn_program.key(),
        ctx.accounts.config.key(),
        ctx.accounts.asset_entry.key(),
        ctx.accounts.commitment_root.key(),
        ctx.accounts.reserve_state.key(),
        ctx.accounts.authorization_signer.key(),
        ctx.accounts.tip_route_root.key(),
        ctx.accounts.tin_debit_verifier.key(),
        ctx.accounts.instructions.key(),
        ctx.accounts.gpru_program.key(),
    ];
    let instruction = tcap_instruction(&keys, &tcap_args)?;
    invoke_signed(
        &instruction,
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.commitment_root.to_account_info(),
            ctx.accounts.asset_entry.to_account_info(),
            ctx.accounts.reserve_state.to_account_info(),
            ctx.accounts.tsn_program.to_account_info(),
            ctx.accounts.authorization_signer.to_account_info(),
            ctx.accounts.tip_route_root.to_account_info(),
            ctx.accounts.tin_debit_verifier.to_account_info(),
            ctx.accounts.instructions.to_account_info(),
            ctx.accounts.gpru_program.to_account_info(),
            ctx.accounts.tcap_program.to_account_info(),
        ],
        &[&[TSN_TCAP_AUTHORITY_SEED, &args.authorization_digest, &[bump]]],
    )?;
    Ok(())
}

fn tcap_instruction(keys: &[Pubkey; 13], args: &DebitGpruMemoV1Args) -> Result<Instruction> {
    let mut data = anchor_lang::solana_program::hash::hash(b"global:debit_gpru_memo_v1").to_bytes()
        [..8]
        .to_vec();
    data.extend_from_slice(&args.try_to_vec()?);
    // TCAP consumes eleven accounts. Only the shared root is writable; its
    // authorization signer gains the digest PDA signature at this CPI boundary.
    let accounts = [0, 4, 6, 5, 7, 3, 8, 9, 10, 11, 12]
        .iter()
        .map(|i| AccountMeta {
            pubkey: keys[*i],
            is_signer: *i == 0 || *i == 8,
            is_writable: *i == 6,
        })
        .collect();
    Ok(Instruction {
        program_id: tcap::ID,
        accounts,
        data,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{InstructionData, ToAccountMetas};
    #[test]
    fn top_level_and_cpi_accounts_preserve_readonly_reserve_and_authority() {
        let keys = std::array::from_fn(|_| Pubkey::new_unique());
        let accounts = crate::accounts::RegisterTcapTinDebitAuthorizationV1 {
            authority: keys[0],
            mother_escrow: keys[1],
            tcap_program: keys[2],
            tsn_program: keys[3],
            config: keys[4],
            asset_entry: keys[5],
            commitment_root: keys[6],
            reserve_state: keys[7],
            authorization_signer: keys[8],
            tip_route_root: keys[9],
            tin_debit_verifier: keys[10],
            instructions: keys[11],
            gpru_program: keys[12],
        }
        .to_account_metas(None);
        assert_eq!(accounts.len(), 13);
        for (i, a) in accounts.iter().enumerate() {
            assert_eq!(a.pubkey, keys[i]);
            assert_eq!(a.is_signer, i == 0);
            assert_eq!(a.is_writable, i == 6);
        }
        let args = RegisterTcapTinDebitAuthorizationV1Args {
            authorization_digest: [3; 32],
            proof: TcapHiddenHeadTinDebitProofV1 {
                public_inputs: [[1; 32]; 26],
                proof_a: [2; 64],
                proof_b: [4; 128],
                proof_c: [5; 64],
            },
        };
        let data = crate::instruction::TsnRegisterTcapTinDebitAuthorizationV1 { args }.data();
        assert_eq!(data.len(), 1128);
        assert_eq!(&data[8..40], &args.authorization_digest);
        assert_eq!(&data[40..], &args.proof.try_to_vec().unwrap());
        let ix = tcap_instruction(
            &keys,
            &DebitGpruMemoV1Args {
                authorization_digest: args.authorization_digest,
                proof: args.proof,
            },
        )
        .unwrap();
        assert_eq!(ix.program_id, tcap::ID);
        assert_eq!(ix.data.len(), 1128);
        for (a, i) in ix.accounts.iter().zip([0, 4, 6, 5, 7, 3, 8, 9, 10, 11, 12]) {
            assert_eq!(a.pubkey, keys[i]);
            assert_eq!(a.is_signer, i == 0 || i == 8);
            assert_eq!(a.is_writable, i == 6);
        }
    }
}
