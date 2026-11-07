//! Separate aggregate verifier for the complete TCAP credit epoch transcript.
use anchor_lang::prelude::*;
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use solana_program::hash::hashv;
use crate::hidden_head::{TCAP_PROGRAM_ID, TSN_PROGRAM_ID};
pub const VERIFIER_SEED: &[u8]=b"gpru:tcap-epoch-verifier:v1";
pub const PUBLIC_INPUTS: usize=5;
const Q: [u8;32]=[0x30,0x64,0x4e,0x72,0xe1,0x31,0xa0,0x29,0xb8,0x50,0x45,0xb6,0x81,0x81,0x58,0x5d,0x28,0x33,0xe8,0x48,0x79,0xb9,0x70,0x91,0x43,0xe1,0xf5,0x93,0xf0,0x00,0x00,0x01];
#[account]
pub struct GpruTcapEpochVerifierV1 {
    pub version:u16,pub authority:Pubkey,pub circuit_commitment:[u8;32],pub key_commitment:[u8;32],
    pub enabled:bool,pub bump:u8,pub alpha:[u8;64],pub beta:[u8;128],pub gamma:[u8;128],pub delta:[u8;128],
    pub ic:[[u8;64];PUBLIC_INPUTS+1],
}
impl GpruTcapEpochVerifierV1 {pub const SPACE:usize=8+2+32*3+2+64+128*3+64*(PUBLIC_INPUTS+1);}
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct ConfigureTcapEpochVerifierArgsV1 {
    pub circuit_commitment:[u8;32],pub key_commitment:[u8;32],
    pub alpha:[u8;64],pub beta:[u8;128],pub gamma:[u8;128],pub delta:[u8;128],
}
#[derive(AnchorSerialize,AnchorDeserialize,Clone)]
pub struct WriteTcapEpochVerifierIcArgsV1 {pub start:u8,pub points:Vec<[u8;64]>}
#[derive(AnchorSerialize,AnchorDeserialize,Clone,Copy)]
pub struct TcapEpochProofV1 {
    pub public_inputs:[[u8;32];PUBLIC_INPUTS],pub proof_a:[u8;64],pub proof_b:[u8;128],pub proof_c:[u8;64],
}
#[derive(Accounts)]
pub struct InitializeTcapEpochVerifierV1<'info> {
    #[account(mut)]pub authority:Signer<'info>,
    /// CHECK: canonical TSNP Mother Escrow and signer checked below.
    pub mother:UncheckedAccount<'info>,
    #[account(init_if_needed,payer=authority,space=GpruTcapEpochVerifierV1::SPACE,seeds=[VERIFIER_SEED],bump)]
    pub verifier:Box<Account<'info,GpruTcapEpochVerifierV1>>,
    pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
pub struct ConfigureTcapEpochVerifierV1<'info> {
    pub authority:Signer<'info>,
    /// CHECK: canonical TSNP Mother Escrow and signer checked below.
    pub mother:UncheckedAccount<'info>,
    #[account(mut,seeds=[VERIFIER_SEED],bump=verifier.bump)]pub verifier:Box<Account<'info,GpruTcapEpochVerifierV1>>,
}
#[derive(Accounts)]
pub struct VerifyTcapCreditEpochV1<'info> {
    /// CHECK: TCAP-owned canonical ledger parsed and bound to every input below.
    pub epoch:UncheckedAccount<'info>,
    #[account(seeds=[VERIFIER_SEED],bump=verifier.bump)]pub verifier:Box<Account<'info,GpruTcapEpochVerifierV1>>,
}
#[error_code]
pub enum EpochError { #[msg("Epoch authority mismatch")]Authority,#[msg("Epoch verifier unavailable or key mismatch")]Verifier,
    #[msg("Invalid epoch transcript or public inputs")]Statement,#[msg("Invalid aggregate epoch proof")]Proof }
fn check_mother(mother:&UncheckedAccount,authority:&Signer)->Result<()> {
    let(key,_)=Pubkey::find_program_address(&[b"tsn_mother_escrow"],&TSN_PROGRAM_ID);
    require_keys_eq!(mother.key(),key,EpochError::Authority);require_keys_eq!(*mother.owner,TSN_PROGRAM_ID,EpochError::Authority);
    let bytes=mother.try_borrow_data()?;let disc=hashv(&[b"account:MotherEscrow"]).to_bytes();
    require!(bytes.len()>=40 && bytes[..8]==disc[..8] && bytes[8..40]==authority.key().to_bytes(),EpochError::Authority);Ok(())
}
pub fn circuit_commitment()->[u8;32] {hashv(&[b"TSN_TCAP_CREDIT_EPOCH_CIRCUIT_V1\0",
    include_bytes!("../circuits/tcap_epoch_v1/main.circom"),b"circomlib-poseidon-bn254-v1"]).to_bytes()}
fn key_commitment(v:&GpruTcapEpochVerifierV1)->[u8;32] {
    let mut bytes=Vec::with_capacity(64+128*3+64*6);bytes.extend_from_slice(&v.alpha);
    bytes.extend_from_slice(&v.beta);bytes.extend_from_slice(&v.gamma);bytes.extend_from_slice(&v.delta);
    for p in v.ic.iter(){bytes.extend_from_slice(p);}hashv(&[b"TSN_TCAP_CREDIT_EPOCH_KEY_V1\0",&bytes]).to_bytes()
}
pub fn initialize(ctx:Context<InitializeTcapEpochVerifierV1>,args:ConfigureTcapEpochVerifierArgsV1)->Result<()> {
    check_mother(&ctx.accounts.mother,&ctx.accounts.authority)?;
    require!(args.circuit_commitment==circuit_commitment() && args.key_commitment!=[0;32],EpochError::Verifier);
    let v=&mut ctx.accounts.verifier;v.version=1;v.authority=ctx.accounts.authority.key();v.circuit_commitment=args.circuit_commitment;
    v.key_commitment=args.key_commitment;v.enabled=false;v.bump=ctx.bumps.verifier;
    v.alpha=args.alpha;v.beta=args.beta;v.gamma=args.gamma;v.delta=args.delta;v.ic=[[0;64];6];Ok(())
}
pub fn write_ic(ctx:Context<ConfigureTcapEpochVerifierV1>,args:WriteTcapEpochVerifierIcArgsV1)->Result<()> {
    check_mother(&ctx.accounts.mother,&ctx.accounts.authority)?;
    let v=&mut ctx.accounts.verifier;let start=args.start as usize;
    require!(!v.enabled && v.authority==ctx.accounts.authority.key() && !args.points.is_empty()
        && args.points.len()<=4 && start+args.points.len()<=6,EpochError::Verifier);
    for(i,p)in args.points.iter().enumerate(){v.ic[start+i]=*p;}Ok(())
}
pub fn enable(ctx:Context<ConfigureTcapEpochVerifierV1>)->Result<()> {
    check_mother(&ctx.accounts.mother,&ctx.accounts.authority)?;let v=&mut ctx.accounts.verifier;
    require!(v.version==1 && v.authority==ctx.accounts.authority.key() && v.circuit_commitment==circuit_commitment()
        && v.ic.iter().all(|p|*p!=[0;64]) && key_commitment(v)==v.key_commitment,EpochError::Verifier);v.enabled=true;Ok(())
}
fn scalar_u64(v:u64)->[u8;32]{let mut b=[0;32];b[24..].copy_from_slice(&v.to_be_bytes());b}
pub fn verify(ctx:Context<VerifyTcapCreditEpochV1>,args:TcapEpochProofV1)->Result<()> {
    require_keys_eq!(*ctx.accounts.epoch.owner,TCAP_PROGRAM_ID,EpochError::Statement);
    let data=ctx.accounts.epoch.try_borrow_data()?;let disc=hashv(&[b"account:TcapCreditEpochV1"]).to_bytes();
    require!(data.len()==136 && data[..8]==disc[..8] && data[8..10]==1u16.to_le_bytes() && data[135]==0,EpochError::Statement);
    let asset:Pubkey=Pubkey::new_from_array(data[11..43].try_into().unwrap());
    let(key,bump)=Pubkey::find_program_address(&[b"tcap:credit-epoch:v1",asset.as_ref(),&data[43..51]],&TCAP_PROGRAM_ID);
    require_keys_eq!(key,ctx.accounts.epoch.key(),EpochError::Statement);require!(bump==data[10],EpochError::Statement);
    let count=u64::from_le_bytes(data[119..127].try_into().unwrap());
    let token=u32::from_le_bytes(data[51..55].try_into().unwrap());
    require!((2..=64).contains(&count) && token>0 && args.public_inputs.iter().all(|v|*v<Q),EpochError::Statement);
    require!(args.public_inputs[0]==data[55..87] && args.public_inputs[1]==data[87..119]
        && args.public_inputs[3]==scalar_u64(count) && args.public_inputs[4]==scalar_u64(token as u64)
        && args.public_inputs[2][..24]==[0;24] && args.public_inputs[2][24..]!=[0;8],EpochError::Statement);
    let v=&ctx.accounts.verifier;
    require!(v.version==1 && v.enabled && v.circuit_commitment==circuit_commitment(),EpochError::Verifier);
    let vk=Groth16Verifyingkey{nr_pubinputs:5,vk_alpha_g1:v.alpha,vk_beta_g2:v.beta,vk_gamme_g2:v.gamma,vk_delta_g2:v.delta,vk_ic:&v.ic};
    let mut proof=Groth16Verifier::<5>::new(&args.proof_a,&args.proof_b,&args.proof_c,&args.public_inputs,&vk).map_err(|_|error!(EpochError::Proof))?;
    proof.verify().map_err(|_|error!(EpochError::Proof))?;Ok(())
}

#[cfg(test)]
mod proof_tests {
    use super::*;
    #[test]
    #[ignore = "requires an explicitly supplied serialized five-input real epoch proof"]
    fn serialized_epoch_proof_rejects_every_changed_public_input() {
        let data=std::fs::read(std::env::var("TSN_GPRU_EPOCH_PROOF_FIXTURE").expect("set epoch fixture")).unwrap();
        assert_eq!(data.len(),1248);
        let ic:Vec<[u8;64]>=data[448..832].chunks_exact(64).map(|v|v.try_into().unwrap()).collect();
        let key=Groth16Verifyingkey{nr_pubinputs:5,vk_alpha_g1:data[..64].try_into().unwrap(),
            vk_beta_g2:data[64..192].try_into().unwrap(),vk_gamme_g2:data[192..320].try_into().unwrap(),
            vk_delta_g2:data[320..448].try_into().unwrap(),vk_ic:&ic};
        let mut inputs=[[0u8;32];5];
        for (input,v) in inputs.iter_mut().zip(data[832..992].chunks_exact(32)){input.copy_from_slice(v);}
        let a:[u8;64]=data[992..1056].try_into().unwrap();let b:[u8;128]=data[1056..1184].try_into().unwrap();
        let c:[u8;64]=data[1184..1248].try_into().unwrap();
        Groth16Verifier::<5>::new(&a,&b,&c,&inputs,&key).unwrap().verify().expect("honest epoch proof");
        for index in 0..5 {let mut altered=inputs;altered[index][31]^=1;
            assert!(Groth16Verifier::<5>::new(&a,&b,&c,&altered,&key).unwrap().verify().is_err());}
    }
}
