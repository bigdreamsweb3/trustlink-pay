//! Native credit accounting. Individual credits append hiding commitments;
//! only a verified aggregate epoch reclassifies existing funded liabilities.
use anchor_lang::prelude::*;
use solana_program::poseidon::{hashv, Endianness, Parameters};
use crate::{error::TcapError, private_funding::BN254_MODULUS, state::TcapReserveStateV1};
pub const EPOCH_SEED: &[u8] = b"tcap:credit-epoch:v1";
pub const MAX_EPOCH_CREDITS: u64 = 64;

#[account]
pub struct TcapCreditEpochV1 {
    pub version: u16,
    pub bump: u8,
    pub asset_entry: Pubkey,
    pub epoch: u64,
    pub token_id: u32,
    pub seed: [u8; 32],
    pub digest: [u8; 32],
    pub credit_count: u64,
    pub started_slot: u64,
    pub accounted: bool,
}
impl TcapCreditEpochV1 {
    pub const SPACE: usize = 136;
    pub fn append(&mut self, amount_commitment: [u8;32], nullifier: [u8;32]) -> Result<()> {
        require!(self.version == 1 && !self.accounted && self.credit_count < MAX_EPOCH_CREDITS,
            TcapError::InvalidReserveLiability);
        require!(amount_commitment != [0;32] && amount_commitment < BN254_MODULUS
            && nullifier != [0;32] && nullifier < BN254_MODULUS,
            TcapError::EmptyCommitment);
        let next = hashv(Parameters::Bn254X5, Endianness::BigEndian,
            &[&self.digest, &amount_commitment, &nullifier])
            .map_err(|_| error!(TcapError::InvalidReserveLiability))?.to_bytes();
        self.digest = next;
        self.credit_count += 1;
        Ok(())
    }
}
pub fn scalar(mut value: [u8;32]) -> [u8;32] {
    while value >= BN254_MODULUS {
        let mut borrow = 0u16;
        for i in (0..32).rev() {
            let a = value[i] as u16;
            let b = BN254_MODULUS[i] as u16 + borrow;
            if a >= b { value[i]=(a-b) as u8;borrow=0; }
            else { value[i]=(a+256-b) as u8;borrow=1; }
        }
    }
    value
}
pub fn epoch_seed(key: &Pubkey) -> [u8;32] {
    scalar(solana_program::hash::hashv(&[b"TSN_TCAP_CREDIT_EPOCH_V1\0",key.as_ref()]).to_bytes())
}
/// Call only after aggregate-proof verification against the complete epoch digest.
/// Compute all fallible arithmetic before mutating either account.
pub fn account_verified_epoch(epoch: &mut TcapCreditEpochV1, reserve: &mut TcapReserveStateV1, total: u64) -> Result<()> {
    require!(epoch.version == 1 && !epoch.accounted && epoch.epoch == reserve.accounting_epoch
        && (2..=MAX_EPOCH_CREDITS).contains(&epoch.credit_count) && total > 0
        && epoch.asset_entry == reserve.asset_entry, TcapError::InvalidReserveLiability);
    let liabilities = reserve.total_liabilities().ok_or(TcapError::ArithmeticOverflow)?;
    require!(reserve.actual_assets >= liabilities, TcapError::InvalidReserveLiability);
    let pending = reserve.pending_liabilities.checked_sub(total).ok_or(TcapError::InvalidReserveLiability)?;
    let settled = reserve.settled_confidential_liabilities.checked_add(total).ok_or(TcapError::ArithmeticOverflow)?;
    let next_epoch = reserve.accounting_epoch.checked_add(1).ok_or(TcapError::ArithmeticOverflow)?;
    reserve.pending_liabilities=pending;
    reserve.settled_confidential_liabilities=settled;
    reserve.accounting_epoch=next_epoch;
    epoch.accounted=true;
    Ok(())
}

#[derive(AnchorSerialize,AnchorDeserialize,Clone,Copy)]
pub struct TcapEpochProofV1 {
    pub public_inputs:[[u8;32];5],pub proof_a:[u8;64],pub proof_b:[u8;128],pub proof_c:[u8;64],
}
#[derive(AnchorSerialize,AnchorDeserialize,Clone,Copy)]
pub struct AccountCreditEpochArgsV1 {pub total:u64,pub proof:TcapEpochProofV1}
#[derive(Accounts)]
pub struct AccountCreditEpochV1<'info> {
    pub authority:Signer<'info>,
    /// CHECK: canonical approved TSNP Mother Escrow, owner and signer checked below.
    pub mother:UncheckedAccount<'info>,
    #[account(seeds=[crate::authority::TCAP_GLOBAL_CONFIG_SEED],bump=config.bump,constraint=!config.paused @ TcapError::ProtocolPaused)]
    pub config:Account<'info,crate::state::TcapGlobalConfigV1>,
    #[account(seeds=[crate::authority::TCAP_ASSET_ENTRY_SEED,asset_entry.registry.as_ref(),asset_entry.asset.token_program.as_ref(),asset_entry.asset.mint.as_ref()],bump=asset_entry.bump)]
    pub asset_entry:Account<'info,crate::state::TcapAssetEntryV1>,
    #[account(mut,address=asset_entry.reserve_state @ TcapError::InvalidReserve,
        constraint=reserve_state.asset_entry==asset_entry.key() @ TcapError::InvalidReserve,
        constraint=!reserve_state.paused @ TcapError::AssetUnavailable)]
    pub reserve_state:Account<'info,TcapReserveStateV1>,
    #[account(mut,seeds=[EPOCH_SEED,asset_entry.key().as_ref(),&reserve_state.accounting_epoch.to_le_bytes()],bump=epoch.bump,
        constraint=epoch.asset_entry==asset_entry.key() && epoch.token_id==asset_entry.token_id @ TcapError::WrongAsset)]
    pub epoch:Account<'info,TcapCreditEpochV1>,
    /// CHECK: canonical GPRU epoch verifier validated by GPRU.
    pub verifier:UncheckedAccount<'info>,
    /// CHECK: pinned executable GPRU.
    #[account(executable,address=crate::instructions::credit_gpru_memo_v1::GPRU_PROGRAM_ID)]
    pub gpru_program:UncheckedAccount<'info>,
}
pub(crate) fn require_mother(mother:&UncheckedAccount,authority:&Signer,tsn:Pubkey)->Result<()> {
    let(key,_)=Pubkey::find_program_address(&[b"tsn_mother_escrow"],&tsn);
    require_keys_eq!(mother.key(),key,TcapError::InvalidAuthority);require_keys_eq!(*mother.owner,tsn,TcapError::InvalidAuthority);
    let data=mother.try_borrow_data()?;let disc=solana_program::hash::hash(b"account:MotherEscrow").to_bytes();
    require!(data.len()>=40 && data[..8]==disc[..8] && data[8..40]==authority.key().to_bytes(),TcapError::InvalidAuthority);Ok(())
}
pub fn account_epoch(ctx:Context<AccountCreditEpochV1>,args:AccountCreditEpochArgsV1)->Result<()> {
    require_mother(&ctx.accounts.mother,&ctx.accounts.authority,ctx.accounts.config.approved_tsn_program)?;
    let mut total=[0;32];total[24..].copy_from_slice(&args.total.to_be_bytes());
    require!(args.total>0 && args.proof.public_inputs[2]==total,TcapError::InvalidReserveLiability);
    let mut data=solana_program::hash::hash(b"global:verify_tcap_credit_epoch_v1").to_bytes()[..8].to_vec();
    data.extend_from_slice(&args.proof.try_to_vec()?);
    let ix=solana_program::instruction::Instruction{program_id:ctx.accounts.gpru_program.key(),
        accounts:vec![solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.epoch.key(),false),
            solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.verifier.key(),false)],data};
    solana_program::program::invoke(&ix,&[ctx.accounts.epoch.to_account_info(),ctx.accounts.verifier.to_account_info(),ctx.accounts.gpru_program.to_account_info()])?;
    account_verified_epoch(&mut ctx.accounts.epoch,&mut ctx.accounts.reserve_state,args.total)?;
    emit!(TcapCreditEpochAccountedV1{asset_entry:ctx.accounts.asset_entry.key(),epoch:ctx.accounts.epoch.epoch,
        credit_count:ctx.accounts.epoch.credit_count,total:args.total,digest:ctx.accounts.epoch.digest});Ok(())
}
#[event]
pub struct TcapCreditEpochAccountedV1 {pub asset_entry:Pubkey,pub epoch:u64,pub credit_count:u64,pub total:u64,pub digest:[u8;32]}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (TcapCreditEpochV1,TcapReserveStateV1) {
        let asset=Pubkey::new_unique();
        let epoch=TcapCreditEpochV1{version:1,bump:1,asset_entry:asset,epoch:3,token_id:1,
            seed:[1;32],digest:[1;32],credit_count:0,started_slot:0,accounted:false};
        let reserve=TcapReserveStateV1{version:1,protocol_version:1,asset_state:Pubkey::new_unique(),asset_entry:asset,
            future_vault:Pubkey::new_unique(),reserve_authority:Pubkey::new_unique(),actual_assets:1500,
            pending_liabilities:1000,settled_confidential_liabilities:200,authorized_withdrawal_liabilities:50,
            reserved_refund_liabilities:50,accounting_epoch:3,funding_enabled:true,paused:false,bump:1,
            reserve_authority_bump:1,future_vault_bump:1,transfer_pending:100};
        (epoch,reserve)
    }
    #[test] fn grouped_accounting_preserves_backing_and_uncredited_pending() {
        let(mut epoch,mut reserve)=fixture();
        epoch.append([2;32],[3;32]).unwrap();epoch.append([4;32],[5;32]).unwrap();
        let before=reserve.total_liabilities().unwrap();
        account_verified_epoch(&mut epoch,&mut reserve,300).unwrap();
        assert_eq!(reserve.pending_liabilities,700);assert_eq!(reserve.settled_confidential_liabilities,500);
        assert_eq!(reserve.total_liabilities(),Some(before));assert_eq!(reserve.actual_assets,1500);
        assert_eq!(reserve.transfer_pending,100);assert_eq!(reserve.accounting_epoch,4);
        assert!(account_verified_epoch(&mut epoch,&mut reserve,300).is_err());
        assert!(epoch.append([6;32],[7;32]).is_err());
    }
    #[test] fn singleton_insolvent_wrong_epoch_and_excess_total_do_not_mutate() {
        for mode in 0..4 {
            let(mut epoch,mut reserve)=fixture();epoch.credit_count=2;
            if mode==0 {epoch.credit_count=1;} if mode==1 {reserve.actual_assets=1;}
            if mode==2 {epoch.epoch=2;}
            let before=(reserve.pending_liabilities,reserve.settled_confidential_liabilities,reserve.accounting_epoch);
            assert!(account_verified_epoch(&mut epoch,&mut reserve,if mode==3{1001}else{300}).is_err());
            assert_eq!(before,(reserve.pending_liabilities,reserve.settled_confidential_liabilities,reserve.accounting_epoch));
            assert!(!epoch.accounted);
        }
    }
    #[test] fn capacity_and_serialization_are_bounded() {
        let(mut epoch,_)=fixture();epoch.credit_count=MAX_EPOCH_CREDITS;
        assert!(epoch.append([2;32],[3;32]).is_err());
        let mut bytes=vec![];epoch.try_serialize(&mut bytes).unwrap();assert_eq!(bytes.len(),TcapCreditEpochV1::SPACE);
        assert_eq!(&bytes[87..119],&epoch.digest);
    }
}
