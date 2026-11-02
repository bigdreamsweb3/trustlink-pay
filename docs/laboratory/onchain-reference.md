# Program declarations and account schema reference

**Status: CURRENT source discovery.** This catalog extracts public instruction/function signatures and struct fields from Rust. It is not a generated IDL, byte-offset decoder or proof of deployed ABI compatibility. Account constraints, discriminators, PDA seeds and ordering must be read in the linked handler; the [credit ABI guide](credit-abi.md) explains the current nested call explicitly.

## TIP

### `create_pda_account`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/cpi.rs, line 3](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/cpi.rs).

```rust
pub fn create_pda_account<'a>( payer: &AccountInfo<'a>, account_to_create: &AccountInfo<'a>, system_program: &AccountInfo<'a>, owner: &solana_program::pubkey::Pubkey, space: usize, lamports: u64, signer_seeds: &[&[u8]], ) -> ProgramResult
```

### `process_instruction`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/entrypoint.rs, line 14](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/entrypoint.rs).

```rust
pub fn process_instruction( program_id: &Pubkey, accounts: &[AccountInfo], instruction_data: &[u8], ) -> ProgramResult
```

### `initialize_program`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 96](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn initialize_program( program_id: Pubkey, payer: Pubkey, global_state: Pubkey, params: InitializeProgramParams, ) -> Instruction
```

### `create_tin_v1`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 113](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn create_tin_v1( program_id: Pubkey, payer: Pubkey, global_state: Pubkey, route_root: Pubkey, registry: Pubkey, owner_recovery: Pubkey, instructions_sysvar: Pubkey, params: CreateTinV1Params, ) -> Instruction
```

### `stage_tin_v1_creation`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 138](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn stage_tin_v1_creation( program_id: Pubkey, payer: Pubkey, staging: Pubkey, params: StageTinV1CreationParams, ) -> Instruction
```

### `tin_v1_creation_chunk`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 155](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn tin_v1_creation_chunk( program_id: Pubkey, payer: Pubkey, staging: Pubkey, params: TinV1CreationChunkParams, ) -> Instruction
```

### `finalize_tin_v1_creation`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 168](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn finalize_tin_v1_creation( program_id: Pubkey, payer: Pubkey, global_state: Pubkey, route_root: Pubkey, registry: Pubkey, owner_recovery: Pubkey, instructions_sysvar: Pubkey, staging: Pubkey, params: FinalizeTinV1CreationParams, ) -> Instruction
```

### `close_tin_v1_creation_stage`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 195](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn close_tin_v1_creation_stage( program_id: Pubkey, cranker: Pubkey, staging: Pubkey, params: FinalizeTinV1CreationParams, ) -> Instruction
```

### `resolve_tin_v1`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 208](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
pub fn resolve_tin_v1( program_id: Pubkey, registry: Pubkey, instructions_sysvar: Pubkey, params: ResolveTinV1Params, ) -> Instruction
```

### `InitializeProgramParams` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 23](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
starting_sequence: u64
```

### `CreateTinV1Params` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 28](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
owner_pubkey: Pubkey
lookup_commitment: [u8; 32]
encrypted_tin_recovery: Vec<u8>
encrypted_identity_envelope: Vec<u8>
encrypted_master_seed: Vec<u8>
encrypted_metadata_hash: [u8; 32]
route_version: u64
route_nonce: [u8; 32]
tip_route_version: u8
gpru_elgamal_key_version: u8
gpru_elgamal_public_key: [u8; 32]
gpru_elgamal_key_commitment: [u8; 32]
gpru_balance_scan_key_version: u8
gpru_balance_scan_public_key_x: [u8; 32]
gpru_balance_scan_public_key_y: [u8; 32]
policy_commitment: [u8; 32]
intent_hash: [u8; 32]
expiry_ts: i64
```

### `StageTinV1CreationParams` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 50](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
owner_pubkey: Pubkey
lookup_commitment: [u8; 32]
intent_hash: [u8; 32]
encrypted_identity_envelope_len: u32
encrypted_tin_recovery_len: u32
encrypted_master_seed_len: u32
encrypted_metadata_hash: [u8; 32]
route_version: u64
route_nonce: [u8; 32]
tip_route_version: u8
gpru_elgamal_key_version: u8
gpru_elgamal_public_key: [u8; 32]
gpru_elgamal_key_commitment: [u8; 32]
gpru_balance_scan_key_version: u8
gpru_balance_scan_public_key_x: [u8; 32]
gpru_balance_scan_public_key_y: [u8; 32]
policy_commitment: [u8; 32]
expiry_ts: i64
```

### `TinV1CreationChunkParams` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 72](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
kind: u8
offset: u32
bytes: Vec<u8>
```

### `FinalizeTinV1CreationParams` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 79](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
intent_hash: [u8; 32]
```

### `ResolveTinV1Params` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs, line 84](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/instruction_auto.rs).

```rust
owner_pubkey: Pubkey
lookup_commitment: [u8; 32]
challenge_nonce: [u8; 32]
```

### `tip_route_root_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs, line 25](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs).

```rust
pub fn tip_route_root_pda(program_id: &Pubkey) -> (Pubkey, u8)
```

### `global_state_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs, line 31](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs).

```rust
pub fn global_state_pda(program_id: &Pubkey) -> (Pubkey, u8)
```

### `tin_v1_creation_staging_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs, line 35](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs).

```rust
pub fn tin_v1_creation_staging_pda( program_id: &Pubkey, owner_pubkey: &Pubkey, intent_hash: &[u8; 32], ) -> (Pubkey, u8)
```

### `tin_v1_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs, line 46](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs).

```rust
pub fn tin_v1_pda(program_id: &Pubkey, lookup_commitment: &[u8; 32]) -> (Pubkey, u8)
```

### `tin_v1_owner_recovery_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs, line 50](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/lib.rs).

```rust
pub fn tin_v1_owner_recovery_pda(program_id: &Pubkey, owner: &Pubkey) -> (Pubkey, u8)
```

### `process`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs, line 19](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs).

```rust
pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: CreateTinV1Params) -> ProgramResult
```

### `apply`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs, line 35](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/create_tin_v1.rs).

```rust
pub fn apply<'a>( program_id: &Pubkey, payer: &AccountInfo<'a>, global_state: &AccountInfo<'a>, route_root: &AccountInfo<'a>, registry: &AccountInfo<'a>, owner_recovery: &AccountInfo<'a>, instructions_sysvar: &AccountInfo<'a>, system_program: &AccountInfo<'a>, params: CreateTinV1Params, ) -> ProgramResult
```

### `process`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/init_program.rs, line 16](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/init_program.rs).

```rust
pub fn process( program_id: &Pubkey, accounts: &[AccountInfo], params: InitializeProgramParams, ) -> ProgramResult
```

### `process`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/resolve_tin_v1.rs, line 13](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/resolve_tin_v1.rs).

```rust
pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], params: ResolveTinV1Params) -> ProgramResult
```

### `stage`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs, line 23](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs).

```rust
pub fn stage( program_id: &Pubkey, accounts: &[AccountInfo], params: StageTinV1CreationParams, ) -> ProgramResult
```

### `append_chunk`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs, line 139](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs).

```rust
pub fn append_chunk( program_id: &Pubkey, accounts: &[AccountInfo], params: TinV1CreationChunkParams, ) -> ProgramResult
```

### `finalize`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs, line 189](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs).

```rust
pub fn finalize( program_id: &Pubkey, accounts: &[AccountInfo], params: FinalizeTinV1CreationParams, ) -> ProgramResult
```

### `close_expired`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs, line 259](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor/tin_v1_creation_staging.rs).

```rust
pub fn close_expired( program_id: &Pubkey, accounts: &[AccountInfo], params: FinalizeTinV1CreationParams, ) -> ProgramResult
```

### `process_instruction`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor.rs, line 20](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/processor.rs).

```rust
pub fn process_instruction( program_id: &Pubkey, accounts: &[AccountInfo], instruction_data: &[u8], ) -> ProgramResult
```

### `append_route`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/route_root.rs, line 89](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/route_root.rs).

```rust
pub fn append_route<'a>( account: &AccountInfo<'a>, payer: &AccountInfo<'a>, system_program: &AccountInfo<'a>, program_id: &solana_program::pubkey::Pubkey, lookup_commitment: &[u8; 32], gpru_key_commitment: &[u8; 32], balance_scan_public_key_x: &[u8; 32], balance_scan_public_key_y: &[u8; 32], policy_commitment: &[u8; 32], ) -> Result<u32, ProgramError>
```

### `validate_tip_route`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 11](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
pub fn validate_tip_route( tip_route_version: u8, gpru_elgamal_key_version: u8, gpru_elgamal_public_key: &[u8; 32], gpru_elgamal_key_commitment: &[u8; 32], gpru_balance_scan_key_version: u8, gpru_balance_scan_public_key_x: &[u8; 32], gpru_balance_scan_public_key_y: &[u8; 32], policy_commitment: &[u8; 32], ) -> bool
```

### `valid_gpru_elgamal_key_commitment`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 48](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
pub fn valid_gpru_elgamal_key_commitment( version: u8, public_key: &[u8; 32], commitment: &[u8; 32], ) -> bool
```

### `space`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 129](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
pub fn space(encrypted_tin_len: usize) -> usize
```

### `space`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 138](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
pub fn space(identity_len: usize, seed_len: usize) -> usize
```

### `space`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 178](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
pub fn space(identity_len: usize, recovery_len: usize, seed_len: usize) -> usize
```

### `GlobalState` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 62](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
version: u8
bump: u8
reserved: [u8; 6]
next_sequence: u64
```

### `TipRouteMerkleRootV1` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 77](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
version: u8
bump: u8
root: [u8; 32]
leaf_count: u64
frontier: [[u8; 32]; 32]
```

### `TinV1Account` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 94](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
version: u8
bump: u8
status: u8
reserved: [u8; 5]
lookup_commitment: [u8; 32]
owner_commitment: [u8; 32]
encrypted_identity_envelope: Vec<u8>
encrypted_master_seed: Vec<u8>
created_at: i64
encrypted_metadata_hash: [u8; 32]
route_version: u64
route_nonce: [u8; 32]
tip_route_version: u8
gpru_elgamal_key_version: u8
gpru_elgamal_public_key: [u8; 32]
gpru_elgamal_key_commitment: [u8; 32]
gpru_balance_scan_key_version: u8
gpru_balance_scan_public_key_x: [u8; 32]
gpru_balance_scan_public_key_y: [u8; 32]
policy_commitment: [u8; 32]
```

### `TinV1OwnerRecoveryAccount` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 119](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
version: u8
bump: u8
owner_pubkey: Pubkey
encrypted_tin: Vec<u8>
```

### `TinV1CreationStaging` fields

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs, line 148](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/state.rs).

```rust
version: u8
bump: u8
owner_pubkey: Pubkey
lookup_commitment: [u8; 32]
intent_hash: [u8; 32]
encrypted_identity_envelope: Vec<u8>
identity_written: u32
encrypted_tin_recovery: Vec<u8>
recovery_written: u32
encrypted_master_seed: Vec<u8>
master_seed_written: u32
encrypted_metadata_hash: [u8; 32]
route_version: u64
route_nonce: [u8; 32]
tip_route_version: u8
gpru_elgamal_key_version: u8
gpru_elgamal_public_key: [u8; 32]
gpru_elgamal_key_commitment: [u8; 32]
gpru_balance_scan_key_version: u8
gpru_balance_scan_public_key_x: [u8; 32]
gpru_balance_scan_public_key_y: [u8; 32]
policy_commitment: [u8; 32]
expiry_ts: i64
```

### `load_borsh`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs, line 8](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs).

```rust
pub fn load_borsh<T: BorshDeserialize>(account: &AccountInfo) -> Result<T, ProgramError>
```

### `load_borsh_with_zero_padding`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs, line 12](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs).

```rust
pub fn load_borsh_with_zero_padding<T: BorshDeserialize>(account: &AccountInfo) -> Result<T, ProgramError>
```

### `store_borsh`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs, line 22](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs).

```rust
pub fn store_borsh<T: BorshSerialize>(account: &AccountInfo, value: &T) -> Result<(), ProgramError>
```

### `assert_program_owned`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs, line 27](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs).

```rust
pub fn assert_program_owned(account: &AccountInfo, program_id: &Pubkey) -> Result<(), ProgramError>
```

### `assert_pda`

[Source: tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs, line 34](../../tsn-protocol/programs/transfer-identity-protocol/tin-registrar/program/src/utils.rs).

```rust
pub fn assert_pda(account: &AccountInfo, expected: &Pubkey) -> Result<(), ProgramError>
```

## GPRU

### `circuit_commitment_v1`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 96](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn circuit_commitment_v1() -> [u8; 32]
```

### `verifying_key_commitment_v1`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 104](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn verifying_key_commitment_v1(verifier: &GpruHiddenHeadVerifierV1) -> [u8; 32]
```

### `initialize_verifier`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 116](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn initialize_verifier( ctx: Context<InitializeHiddenHeadVerifierV1>, args: InitializeHiddenHeadVerifierArgsV1, ) -> Result<()>
```

### `write_verifier_ic`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 149](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn write_verifier_ic( ctx: Context<ConfigureHiddenHeadVerifierV1>, args: WriteHiddenHeadVerifierIcArgsV1, ) -> Result<()>
```

### `enable_verifier`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 167](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn enable_verifier(ctx: Context<ConfigureHiddenHeadVerifierV1>) -> Result<()>
```

### `verify_transition`

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 234](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
pub fn verify_transition( ctx: Context<VerifyHiddenHeadTransitionV1>, args: HiddenHeadProofArgsV1, ) -> Result<()>
```

### `GpruHiddenHeadVerifierV1` fields

[Source: tsn-protocol/programs/gpru/src/hidden_head.rs, line 56](../../tsn-protocol/programs/gpru/src/hidden_head.rs).

```rust
version: u16
authority: Pubkey
circuit_commitment: [u8; 32]
verifying_key_commitment: [u8; 32]
enabled: bool
bump: u8
alpha_g1: [u8; 64]
beta_g2: [u8; 128]
gamma_g2: [u8; 128]
delta_g2: [u8; 128]
ic: [[u8; 64]; HIDDEN_HEAD_PUBLIC_INPUTS + 1]
```

### `verify_dna_key_proof_v1`

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 93](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
pub fn verify_dna_key_proof_v1( ctx: Context<VerifyDnaKeyProof>, dna: [u8; 32], ephemeral_public_key: [u8; 32], one_time_public_key: [u8; 32], proof: gpru_ix::DnaKeyProofV1, ) -> Result<()>
```

### `verify_hidden_head_transition_v1`

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 112](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
pub fn verify_hidden_head_transition_v1( ctx: Context<VerifyHiddenHeadTransitionV1>, args: HiddenHeadProofArgsV1, ) -> Result<()>
```

### `initialize_hidden_head_verifier_v1`

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 123](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
pub fn initialize_hidden_head_verifier_v1( ctx: Context<InitializeHiddenHeadVerifierV1>, args: InitializeHiddenHeadVerifierArgsV1, ) -> Result<()>
```

### `write_hidden_head_verifier_ic_v1`

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 130](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
pub fn write_hidden_head_verifier_ic_v1( ctx: Context<ConfigureHiddenHeadVerifierV1>, args: WriteHiddenHeadVerifierIcArgsV1, ) -> Result<()>
```

### `enable_hidden_head_verifier_v1`

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 137](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
pub fn enable_hidden_head_verifier_v1( ctx: Context<ConfigureHiddenHeadVerifierV1>, ) -> Result<()>
```

### `VerifyDnaKeyProof` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 20](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
tip_registry: UncheckedAccount<'info>
```

### `HiddenHeadProofArgsV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 28](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
public_inputs: [[u8; 32]; hidden_head::HIDDEN_HEAD_PUBLIC_INPUTS]
proof_a: [u8; 64]
proof_b: [u8; 128]
proof_c: [u8; 64]
action_kind: u8
token_id: u32
amount: u64
authorization_commitment: [u8; 32]
```

### `VerifyHiddenHeadTransitionV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 40](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
tip_route_root: UncheckedAccount<'info>
tcap_commitment_root: UncheckedAccount<'info>
verifier: Box<Account<'info, hidden_head::GpruHiddenHeadVerifierV1>>
instructions: UncheckedAccount<'info>
```

### `InitializeHiddenHeadVerifierArgsV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 53](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
circuit_commitment: [u8; 32]
verifying_key_commitment: [u8; 32]
alpha_g1: [u8; 64]
beta_g2: [u8; 128]
gamma_g2: [u8; 128]
delta_g2: [u8; 128]
```

### `WriteHiddenHeadVerifierIcArgsV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 63](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
start_index: u8
points: Vec<[u8; 64]>
```

### `ConfigureHiddenHeadVerifierV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 69](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
authority: Signer<'info>
mother_escrow: UncheckedAccount<'info>
verifier: Box<Account<'info, hidden_head::GpruHiddenHeadVerifierV1>>
```

### `InitializeHiddenHeadVerifierV1` fields

[Source: tsn-protocol/programs/gpru/src/lib.rs, line 79](../../tsn-protocol/programs/gpru/src/lib.rs).

```rust
authority: Signer<'info>
mother_escrow: UncheckedAccount<'info>
verifier: Box<Account<'info, hidden_head::GpruHiddenHeadVerifierV1>>
system_program: Program<'info, System>
```

### `verify_dna_key_proof_v1`

[Source: tsn-protocol/programs/gpru/src/program.rs, line 154](../../tsn-protocol/programs/gpru/src/program.rs).

```rust
pub fn verify_dna_key_proof_v1( tip_registry: &UncheckedAccount, dna: [u8; 32], ephemeral_public_key: [u8; 32], one_time_public_key: [u8; 32], proof: DnaKeyProofV1, ) -> Result<()>
```

### `DnaKeyProofV1` fields

[Source: tsn-protocol/programs/gpru/src/program.rs, line 16](../../tsn-protocol/programs/gpru/src/program.rs).

```rust
shared_point: [u8; 32]
generator_commitment: [u8; 32]
scan_commitment: [u8; 32]
response: [u8; 32]
```

### `validate_successor_ciphertext_proofs`

[Source: tsn-protocol/programs/gpru/src/proofs/context.rs, line 29](../../tsn-protocol/programs/gpru/src/proofs/context.rs).

```rust
pub fn validate_successor_ciphertext_proofs( equality_context_account: &AccountInfo<'_>, range_context_account: &AccountInfo<'_>, expected_context_authority: &Pubkey, expected: &SuccessorCiphertextBinding, ) -> Result<(), ProgramError>
```

### `ciphertext_from_bytes`

[Source: tsn-protocol/programs/gpru/src/proofs/context.rs, line 75](../../tsn-protocol/programs/gpru/src/proofs/context.rs).

```rust
pub fn ciphertext_from_bytes(bytes: &[u8]) -> Result<ElGamalCiphertext, ProgramError>
```

### `SuccessorCiphertextBinding` fields

[Source: tsn-protocol/programs/gpru/src/proofs/context.rs, line 15](../../tsn-protocol/programs/gpru/src/proofs/context.rs).

```rust
encryption_pubkey: [u8; 32]
ciphertext: [u8; 64]
pedersen_commitment: [u8; 32]
```

### `derive_node_dna_key_v1`

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 102](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
pub fn derive_node_dna_key_v1( scan_public_key: &[u8; 32], dna: &[u8; 32], randomness: &[u8; 128], ) -> Result<NodeDerivedDnaKeyV1, ()>
```

### `derive_node_record_shared_point_v1`

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 160](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
pub fn derive_node_record_shared_point_v1( scan_public_key: &[u8; 32], randomness: &[u8; 64], ) -> Result<([u8; 32], [u8; 32]), ()>
```

### `verify_node_dna_key_proof_v1`

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 182](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
pub fn verify_node_dna_key_proof_v1( scan_public_key: &[u8; 32], dna: &[u8; 32], ephemeral_public_key: &[u8; 32], one_time_public_key: &[u8; 32], proof: &DnaKeyDerivationProofV1, ) -> Result<(), ()>
```

### `verify_node_dna_key_proof_v1`

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 231](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
pub fn verify_node_dna_key_proof_v1( scan_public_key: &[u8; 32], dna: &[u8; 32], ephemeral_public_key: &[u8; 32], one_time_public_key: &[u8; 32], proof: &DnaKeyDerivationProofV1, ) -> Result<(), ()>
```

### `derive_owner_dna_key_v1`

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 403](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
pub fn derive_owner_dna_key_v1( scan_secret_key: &[u8; 32], ephemeral_public_key: &[u8; 32], dna: &[u8; 32], ) -> Result<OwnerDerivedDnaKeyV1, ()>
```

### `NodeDerivedDnaKeyV1` fields

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 35](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
ephemeral_public_key: [u8; 32]
one_time_public_key: [u8; 32]
proof: DnaKeyDerivationProofV1
```

### `DnaKeyDerivationProofV1` fields

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 45](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
shared_point: [u8; 32]
generator_commitment: [u8; 32]
scan_commitment: [u8; 32]
response: [u8; 32]
```

### `OwnerDerivedDnaKeyV1` fields

[Source: tsn-protocol/programs/gpru/src/stealth_keys.rs, line 53](../../tsn-protocol/programs/gpru/src/stealth_keys.rs).

```rust
one_time_secret_key: [u8; 32]
one_time_public_key: [u8; 32]
```

## TSNP

### `tsn_accept_intent`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 14](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_accept_intent(ctx: Context<AcceptIntent>, args: AcceptIntentArgs) -> Result<()>
```

### `tsn_initialize_mother_escrow`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 19](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_initialize_mother_escrow( ctx: Context<InitializeMotherEscrow>, tins_program_id: Pubkey, protocol_seed: [u8; 32], epoch_seconds: i64, lease_seconds: i64, fee_split_cranker_bps: Option<u16>, fee_split_lp_bps: Option<u16>, fee_split_treasury_bps: Option<u16>, ) -> Result<()>
```

### `tsn_register_cranker`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 41](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_cranker(ctx: Context<RegisterCranker>) -> Result<()>
```

### `tsn_migrate_mother_escrow`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 45](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_migrate_mother_escrow( ctx: Context<MigrateMotherEscrow>, tins_program_id: Pubkey, protocol_seed: [u8; 32], epoch_seconds: i64, lease_seconds: i64, fee_split_cranker_bps: Option<u16>, fee_split_lp_bps: Option<u16>, fee_split_treasury_bps: Option<u16>, ) -> Result<()>
```

### `tsn_set_cranker_funding_policy`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 67](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_set_cranker_funding_policy( ctx: Context<SetCrankerFundingPolicy>, allow_external_funding: bool, ) -> Result<()>
```

### `tsn_initialize_cranker_vault`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 74](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_initialize_cranker_vault(ctx: Context<InitializeCrankerVault>) -> Result<()>
```

### `tsn_fund_cranker`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 78](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_fund_cranker(ctx: Context<FundCranker>, amount: u64) -> Result<()>
```

### `tsn_fund_epoch_treasury`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 82](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_fund_epoch_treasury(ctx: Context<FundEpochTreasury>, epoch_id: u64, amount: u64) -> Result<()>
```

### `tsn_withdraw_cranker_funds`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 86](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_withdraw_cranker_funds( ctx: Context<WithdrawCrankerFunds>, amount: u64, ) -> Result<()>
```

### `tsn_configure_private_settlement`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 93](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_configure_private_settlement( ctx: Context<ConfigurePrivateSettlement>, permit_signer: Pubkey, enabled: bool, ) -> Result<()>
```

### `tsn_create_settlement_dna`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 101](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_create_settlement_dna(ctx: Context<CreateSettlementDna>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], settlement_commitment: [u8; 32], payout_nullifier: [u8; 32], random_nonce: [u8; 32], cranker: Pubkey, cranker_vault: Pubkey, recipient: Pubkey, token_mint: Pubkey, amount: u64, lease_id_hash: [u8; 32], lease_expiry_ts: i64, authorization_expiry_ts: i64) -> Result<()>
```

### `tsn_execute_private_payout`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 105](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_execute_private_payout(ctx: Context<ExecutePrivatePayout>, slot: [u8; 32], settlement_commitment: [u8; 32], commitment_digest: [u8; 32], random_nonce: [u8; 32], payout_nullifier: [u8; 32], payout_amount: u64, claim_fee_amount: u64, lease_id_hash: [u8; 32], lease_version: u64, lease_expiry_ts: i64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()>
```

### `tsn_refund_epoch_claim`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 109](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_refund_epoch_claim(ctx: Context<RefundEpochClaim>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], refund_nullifier: [u8; 32], refund_amount: u64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()>
```

### `tsn_close_epoch_treasury`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 113](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_close_epoch_treasury(ctx: Context<CloseEpochTreasury>) -> Result<()>
```

### `tsn_withdraw_verifier_lamports`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 117](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_withdraw_verifier_lamports( ctx: Context<WithdrawVerifierLamports>, amount: u64, ) -> Result<()>
```

### `tsn_tin_action_fee_commitment`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 124](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_tin_action_fee_commitment( ctx: Context<CommitTinActionFee>, ) -> Result<()>
```

### `tsn_register_tcap_credit_authorization_v2`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 130](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_credit_authorization_v2( ctx: Context<RegisterTcapCreditAuthorizationV2>, args: RegisterTcapCreditAuthorizationV2Args, ) -> Result<()>
```

### `tsn_register_tcap_debit_authorization_v2`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 137](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_debit_authorization_v2( ctx: Context<RegisterTcapDebitAuthorizationV2>, args: RegisterTcapDebitAuthorizationV2Args, ) -> Result<()>
```

### `tsn_register_tcap_exit_debit_v1`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 144](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_exit_debit_v1(ctx: Context<RegisterTcapExitDebitV1>, args: RegisterTcapExitDebitV1Args) -> Result<()>
```

### `tsn_register_tcap_exit_payout_v1`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 145](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_exit_payout_v1(ctx: Context<RegisterTcapExitPayoutV1>, args: RegisterTcapExitPayoutV1Args) -> Result<()>
```

### `tsn_register_tcap_one_time_tip_authorization`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 147](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_one_time_tip_authorization( ctx: Context<RegisterTcapOneTimeTipAuthorization>, args: RegisterTcapOneTimeTipAuthorizationArgs, ) -> Result<()>
```

### `tsn_register_tcap_one_time_credit`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 154](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_one_time_credit( ctx: Context<RegisterTcapOneTimeCredit>, args: RegisterTcapOneTimeCreditArgs, ) -> Result<()>
```

### `tsn_register_tcap_one_time_transfer_credit`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs, line 161](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/lib.rs).

```rust
pub fn tsn_register_tcap_one_time_transfer_credit( ctx: Context<RegisterTcapOneTimeTransferCredit>, args: RegisterTcapOneTimeTransferCreditArgs, ) -> Result<()>
```

### `TsnMotherEscrowInitialized` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 4](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
mother_escrow: Pubkey
authority: Pubkey
epoch_seconds: i64
lease_seconds: i64
```

### `TsnCrankerRegistered` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
mother_escrow: Pubkey
cranker: Pubkey
operator: Pubkey
```

### `TsnIntentCreated` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 19](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
mother_escrow: Pubkey
intent: Pubkey
intent_id: [u8; 32]
amount: u64
token_mint: Pubkey
```

### `TsnLeaseClaimed` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 28](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
intent: Pubkey
cranker: Pubkey
lease_expiry_ts: i64
```

### `TsnLeaseExpired` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 35](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
intent: Pubkey
previous_cranker: Pubkey
```

### `TsnEpochSettled` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 41](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
mother_escrow: Pubkey
epoch_id: u64
```

### `TsnCrankerFundingPolicyUpdated` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 47](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
cranker: Pubkey
operator: Pubkey
allow_external_funding: bool
```

### `TsnCrankerVaultInitialized` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 54](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
cranker: Pubkey
cranker_vault: Pubkey
token_mint: Pubkey
vault_token_account: Pubkey
```

### `TsnCrankerFunded` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 62](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
cranker: Pubkey
cranker_vault: Pubkey
funder: Pubkey
amount: u64
```

### `TsnCrankerFundsWithdrawn` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 70](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
cranker: Pubkey
cranker_vault: Pubkey
funder: Pubkey
amount: u64
```

### `TsnCommitmentRegistered` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 78](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
vault: Pubkey
transfer_id: [u8; 32]
commitment_hash: [u8; 32]
epoch_id: u64
created_at_ts: i64
```

### `TsnPaymentIntentValidated` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 87](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
vault: Pubkey
cranker: Pubkey
amount: u64
claim_credits: u64
```

### `TsnPrivateSettlementConfigured` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 95](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
mother_escrow: Pubkey
permit_signer: Pubkey
enabled: bool
```

### `TsnPruSpendExecuted` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 102](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
tin: u64
pru_index: u16
nonce: u8
pru_authority: Pubkey
token_mint: Pubkey
amount: u64
commitment_hash: [u8; 32]
epoch_id: u64
```

### `TsnPrivatePayoutExecuted` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 114](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_treasury: Pubkey
claim_slot: Pubkey
settlement_commitment: [u8; 32]
cranker_vault: Pubkey
payout_nullifier: [u8; 32]
cranker: Pubkey
token_mint: Pubkey
payout_amount: u64
```

### `TsnEpochClaimRefunded` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 126](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_treasury: Pubkey
claim_slot: Pubkey
amount: u64
```

### `TsnPaymentCommitmentOpened` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 133](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_account: Pubkey
commitment_hash: [u8; 32]
amount: u64
```

### `TsnPrivacyReceiveCreated` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 140](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
privacy_receive: Pubkey
tin_route_hash: [u8; 32]
```

### `TsnEpochChallengeCommitted` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 146](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_account: Pubkey
root_hash: [u8; 32]
total_to_distribute: u64
cranker_credit_sum_mod: u64
```

### `TsnEpochReimbursementProcessed` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 154](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_account: Pubkey
winner: Pubkey
lp_amount: u64
operator_amount: u64
treasury_amount: u64
bonus_amount: u64
```

### `TsnResidualSwept` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs, line 164](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/events.rs).

```rust
epoch_account: Pubkey
swept_at_ts: i64
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 46](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
pub fn handler(ctx: Context<AcceptIntent>, args: AcceptIntentArgs) -> Result<()>
```

### `derive_accepted_intent_root`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 72](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
pub fn derive_accepted_intent_root(args: &AcceptIntentArgs) -> [u8; 32]
```

### `derive_gpru_scope_commitment`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 76](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
pub fn derive_gpru_scope_commitment(args: &AcceptIntentArgs) -> [u8; 32]
```

### `derive_settlement_nullifier`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 85](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
pub fn derive_settlement_nullifier(args: &AcceptIntentArgs) -> [u8; 32]
```

### `derive_settlement_commitment`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 92](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
pub fn derive_settlement_commitment(args: &AcceptIntentArgs) -> [u8; 32]
```

### `AcceptIntentArgs` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 19](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
epoch_id: u64
intent_commitment: [u8; 32]
amount: u64
token_id: u32
tip_root_commitment: [u8; 32]
settlement_commitment: [u8; 32]
asset_commitment: [u8; 32]
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
replay_nonce: [u8; 32]
nullifier: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
```

### `AcceptIntent` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs, line 37](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/accept_intent.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
accepted_intent: Account<'info, AcceptedIntentV1>
system_program: Program<'info, System>
```

### `close_epoch_treasury`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/close_epoch_treasury.rs, line 14](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/close_epoch_treasury.rs).

```rust
pub fn close_epoch_treasury(ctx: Context<CloseEpochTreasury>) -> Result<()>
```

### `CloseEpochTreasury` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/close_epoch_treasury.rs, line 5](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/close_epoch_treasury.rs).

```rust
authority: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
epoch_treasury: Box<Account<'info, EpochTreasury>>
epoch_ledger: Box<Account<'info, EpochSettlementLedger>>
treasury_authority: UncheckedAccount<'info>
treasury_token_account: Box<Account<'info, TokenAccount>>
token_program: Program<'info, Token>
```

### `configure_private_settlement`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/configure_private_settlement.rs, line 33](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/configure_private_settlement.rs).

```rust
pub fn configure_private_settlement( ctx: Context<ConfigurePrivateSettlement>, permit_signer: Pubkey, enabled: bool, ) -> Result<()>
```

### `ConfigurePrivateSettlement` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/configure_private_settlement.rs, line 13](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/configure_private_settlement.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
private_settlement_config: Account<'info, PrivateSettlementConfig>
system_program: Program<'info, System>
```

### `create_settlement_dna`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/create_settlement_dna.rs, line 14](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/create_settlement_dna.rs).

```rust
pub fn create_settlement_dna(ctx: Context<CreateSettlementDna>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], settlement_commitment: [u8; 32], payout_nullifier: [u8; 32], random_nonce: [u8; 32], cranker: Pubkey, cranker_vault: Pubkey, recipient: Pubkey, token_mint: Pubkey, amount: u64, lease_id_hash: [u8; 32], lease_expiry_ts: i64, authorization_expiry_ts: i64) -> Result<()>
```

### `CreateSettlementDna` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/create_settlement_dna.rs, line 6](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/create_settlement_dna.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
settlement_dna: Account<'info, SettlementDna>
system_program: Program<'info, System>
```

### `execute_private_payout`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/execute_private_payout.rs, line 33](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/execute_private_payout.rs).

```rust
pub fn execute_private_payout(ctx: Context<ExecutePrivatePayout>, slot: [u8; 32], settlement_commitment: [u8; 32], commitment_digest: [u8; 32], random_nonce: [u8; 32], payout_nullifier: [u8; 32], payout_amount: u64, claim_fee_amount: u64, lease_id_hash: [u8; 32], lease_version: u64, lease_expiry_ts: i64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()>
```

### `ExecutePrivatePayout` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/execute_private_payout.rs, line 7](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/execute_private_payout.rs).

```rust
operator: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
cranker: Box<Account<'info, Cranker>>
private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>
epoch_treasury: Box<Account<'info, EpochTreasury>>
epoch_ledger: Box<Account<'info, EpochSettlementLedger>>
settlement_dna: Box<Account<'info, SettlementDna>>
claim_slot: Box<Account<'info, EpochClaimSlot>>
cranker_vault: Box<Account<'info, CrankerVault>>
vault_authority: UncheckedAccount<'info>
vault_token_account: Box<Account<'info, TokenAccount>>
recipient_wallet: UncheckedAccount<'info>
recipient_token_account: UncheckedAccount<'info>
treasury_authority: UncheckedAccount<'info>
treasury_token_account: Box<Account<'info, TokenAccount>>
instructions_sysvar: UncheckedAccount<'info>
verifier_pda: UncheckedAccount<'info>
token_mint: Box<Account<'info, Mint>>
token_program: Program<'info, Token>
associated_token_program: Program<'info, AssociatedToken>
system_program: Program<'info, System>
```

### `fund_cranker`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_cranker.rs, line 55](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_cranker.rs).

```rust
pub fn fund_cranker(ctx: Context<FundCranker>, amount: u64) -> Result<()>
```

### `FundCranker` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_cranker.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_cranker.rs).

```rust
funder: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
cranker: Box<Account<'info, Cranker>>
cranker_vault: Box<Account<'info, CrankerVault>>
funder_token_account: Box<Account<'info, TokenAccount>>
vault_token_account: Box<Account<'info, TokenAccount>>
liquidity_position: Box<Account<'info, LiquidityPosition>>
token_program: Program<'info, Token>
system_program: Program<'info, System>
```

### `fund_epoch_treasury`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_epoch_treasury.rs, line 27](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_epoch_treasury.rs).

```rust
pub fn fund_epoch_treasury(ctx: Context<FundEpochTreasury>, epoch_id: u64, amount: u64) -> Result<()>
```

### `FundEpochTreasury` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_epoch_treasury.rs, line 7](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/fund_epoch_treasury.rs).

```rust
funder: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
funder_token_account: Box<Account<'info, TokenAccount>>
token_mint: Box<Account<'info, Mint>>
epoch_treasury: Box<Account<'info, EpochTreasury>>
epoch_ledger: Box<Account<'info, EpochSettlementLedger>>
treasury_authority: UncheckedAccount<'info>
treasury_token_account: Box<Account<'info, TokenAccount>>
associated_token_program: Program<'info, AssociatedToken>
token_program: Program<'info, Token>
system_program: Program<'info, System>
```

### `initialize_cranker_vault`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_cranker_vault.rs, line 53](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_cranker_vault.rs).

```rust
pub fn initialize_cranker_vault(ctx: Context<InitializeCrankerVault>) -> Result<()>
```

### `InitializeCrankerVault` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_cranker_vault.rs, line 11](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_cranker_vault.rs).

```rust
payer: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
cranker: Box<Account<'info, Cranker>>
token_mint: Box<Account<'info, Mint>>
cranker_vault: Box<Account<'info, CrankerVault>>
vault_authority: UncheckedAccount<'info>
vault_token_account: Box<Account<'info, TokenAccount>>
token_program: Program<'info, Token>
system_program: Program<'info, System>
rent: Sysvar<'info, Rent>
```

### `initialize_mother_escrow`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_mother_escrow.rs, line 28](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_mother_escrow.rs).

```rust
pub fn initialize_mother_escrow( ctx: Context<InitializeMotherEscrow>, tins_program_id: Pubkey, protocol_seed: [u8; 32], epoch_seconds: i64, lease_seconds: i64, fee_split_cranker_bps: Option<u16>, fee_split_lp_bps: Option<u16>, fee_split_treasury_bps: Option<u16>, ) -> Result<()>
```

### `InitializeMotherEscrow` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_mother_escrow.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/initialize_mother_escrow.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
system_program: Program<'info, System>
```

### `migrate_mother_escrow`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/migrate_mother_escrow.rs, line 27](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/migrate_mother_escrow.rs).

```rust
pub fn migrate_mother_escrow( ctx: Context<MigrateMotherEscrow>, tins_program_id: Pubkey, protocol_seed: [u8; 32], epoch_seconds: i64, lease_seconds: i64, fee_split_cranker_bps: Option<u16>, fee_split_lp_bps: Option<u16>, fee_split_treasury_bps: Option<u16>, ) -> Result<()>
```

### `MigrateMotherEscrow` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/migrate_mother_escrow.rs, line 16](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/migrate_mother_escrow.rs).

```rust
authority: Signer<'info>
mother_escrow: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `refund_epoch_claim`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/refund_epoch_claim.rs, line 26](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/refund_epoch_claim.rs).

```rust
pub fn refund_epoch_claim(ctx: Context<RefundEpochClaim>, slot: [u8; 32], lease_version: u64, commitment_digest: [u8; 32], refund_nullifier: [u8; 32], refund_amount: u64, expires_at_ts: i64, permit_signature: [u8; 64]) -> Result<()>
```

### `RefundEpochClaim` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/refund_epoch_claim.rs, line 7](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/refund_epoch_claim.rs).

```rust
operator: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
private_settlement_config: Box<Account<'info, PrivateSettlementConfig>>
epoch_treasury: Box<Account<'info, EpochTreasury>>
epoch_ledger: Box<Account<'info, EpochSettlementLedger>>
settlement_dna: Box<Account<'info, SettlementDna>>
claim_slot: Box<Account<'info, EpochClaimSlot>>
treasury_authority: UncheckedAccount<'info>
treasury_token_account: Box<Account<'info, TokenAccount>>
sender_wallet: UncheckedAccount<'info>
sender_token_account: UncheckedAccount<'info>
verifier_pda: UncheckedAccount<'info>
instructions_sysvar: UncheckedAccount<'info>
token_mint: Box<Account<'info, Mint>>
token_program: Program<'info, Token>
associated_token_program: Program<'info, AssociatedToken>
system_program: Program<'info, System>
```

### `register_cranker`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_cranker.rs, line 30](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_cranker.rs).

```rust
pub fn register_cranker(ctx: Context<RegisterCranker>) -> Result<()>
```

### `RegisterCranker` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_cranker.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_cranker.rs).

```rust
operator: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
cranker: Account<'info, Cranker>
system_program: Program<'info, System>
```

### `register_tcap_credit_authorization`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs, line 90](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs).

```rust
pub fn register_tcap_credit_authorization( ctx: Context<RegisterTcapCreditAuthorization>, args: RegisterTcapCreditAuthorizationArgs, ) -> Result<()>
```

### `derive_authorization_digest`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs, line 220](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs).

```rust
pub fn derive_authorization_digest(args: &RegisterTcapCreditAuthorizationArgs) -> [u8; 32]
```

### `RegisterTcapCreditAuthorizationArgs` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs, line 16](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs).

```rust
version: u16
tsn_program_id: Pubkey
epoch_id: u64
intent_commitment: [u8; 32]
amount: u64
settlement_commitment: [u8; 32]
accepted_intent_root: [u8; 32]
previous_tcap_root: [u8; 32]
transition_type: u8
asset_commitment: [u8; 32]
authorization_digest: [u8; 32]
verifier_domain_version: u16
valid_after_slot: u64
expires_at_slot: u64
replay_nonce: [u8; 32]
tin_tip: Pubkey
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
```

### `RegisterTcapCreditAuthorization` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs, line 49](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
tcap_asset_entry: UncheckedAccount<'info>
tcap_reserve_state: UncheckedAccount<'info>
tcap_commitment_root: UncheckedAccount<'info>
tsn_epoch_commitment: Account<'info, EpochCommitmentStateV1>
tcap_authorization_receipt: UncheckedAccount<'info>
accepted_intent: Account<'info, AcceptedIntentV1>
tcap_authorization_signer: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs, line 76](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).

```rust
pub fn handler( ctx: Context<RegisterTcapCreditAuthorizationV2>, args: RegisterTcapCreditAuthorizationV2Args, ) -> Result<()>
```

### `derive_authorization_digest_v2`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs, line 158](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).

```rust
pub fn derive_authorization_digest_v2( args: &RegisterTcapCreditAuthorizationV2Args, commitment_root: &Pubkey, ) -> [u8; 32]
```

### `HiddenHeadProofArgsV1` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs, line 15](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).

```rust
public_inputs: [[u8; 32]; 12]
proof_a: [u8; 64]
proof_b: [u8; 128]
proof_c: [u8; 64]
action_kind: u8
token_id: u32
amount: u64
authorization_commitment: [u8; 32]
```

### `RegisterTcapCreditAuthorizationV2Args` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs, line 27](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
previous_tcap_root: [u8; 32]
tcap_root_sequence: u64
token_id: u32
amount_base_units: u64
nullifier: [u8; 32]
proof: HiddenHeadProofArgsV1
```

### `RegisterTcapCreditAuthorizationV2` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs, line 41](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_credit_authorization_v2.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
tcap_asset_entry: UncheckedAccount<'info>
commitment_root: UncheckedAccount<'info>
reserve_state: UncheckedAccount<'info>
tcap_authorization_signer: UncheckedAccount<'info>
tip_route_root: UncheckedAccount<'info>
gpru_verifier: UncheckedAccount<'info>
instructions: UncheckedAccount<'info>
gpru_program: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs, line 44](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs).

```rust
pub fn handler(ctx: Context<RegisterTcapDebitAuthorizationV2>, args: RegisterTcapDebitAuthorizationV2Args) -> Result<()>
```

### `derive_debit_authorization_digest_v2`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs, line 81](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs).

```rust
pub fn derive_debit_authorization_digest_v2(args: &RegisterTcapDebitAuthorizationV2Args, tin_tip: &Pubkey) -> [u8; 32]
```

### `RegisterTcapDebitAuthorizationV2Args` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs, line 11](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
debit_amount: u64
sealed: [u8; 48]
seal_commitment: [u8; 32]
```

### `RegisterTcapDebitAuthorizationV2` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs, line 21](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_debit_authorization_v2.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
tcap_asset_entry: UncheckedAccount<'info>
tin_tip: UncheckedAccount<'info>
reserve_state: UncheckedAccount<'info>
liability: UncheckedAccount<'info>
tcap_authorization_signer: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs, line 11](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs).

```rust
pub fn handler(ctx:Context<RegisterTcapExitDebitV1>,args:RegisterTcapExitDebitV1Args)->Result<()>
```

### `RegisterTcapExitDebitV1Args` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs, line 8](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs).

```rust
permit_nonce: [u8;32]
destination_commitment: [u8;32]
mint: Pubkey
amount: u64
sequence: u64
sealed: [u8;48]
seal_commitment: [u8;32]
source_debit_signature: [u8;64]
```

### `RegisterTcapExitDebitV1` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs, line 9](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_debit_v1.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info,MotherEscrow>
tcap_program: UncheckedAccount<'info>
config: UncheckedAccount<'info>
tip: UncheckedAccount<'info>
reserve: UncheckedAccount<'info>
liability: UncheckedAccount<'info>
permit: UncheckedAccount<'info>
system_program: Program<'info,System>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs, line 10](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs).

```rust
pub fn handler(ctx:Context<RegisterTcapExitPayoutV1>, args:RegisterTcapExitPayoutV1Args)->Result<()>
```

### `RegisterTcapExitPayoutV1` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs, line 7](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info,MotherEscrow>
tcap_program: UncheckedAccount<'info>
config: UncheckedAccount<'info>
reserve: UncheckedAccount<'info>
asset_entry: UncheckedAccount<'info>
permit: UncheckedAccount<'info>
reserve_authority: UncheckedAccount<'info>
vault: UncheckedAccount<'info>
destination: UncheckedAccount<'info>
mint: UncheckedAccount<'info>
token_program: UncheckedAccount<'info>
```

### `RegisterTcapExitPayoutV1Args` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs, line 9](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_exit_payout_v1.rs).

```rust
destination_owner: Pubkey
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs, line 41](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs).

```rust
pub fn handler(ctx: Context<RegisterTcapOneTimeCredit>, args: RegisterTcapOneTimeCreditArgs) -> Result<()>
```

### `RegisterTcapOneTimeCreditArgs` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs, line 10](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
next_commitment: [u8; 32]
nonce: [u8; 32]
sequence: u64
token_id: u32
amount: u64
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
previous_commitment: [u8; 32]
sealed: [u8; 48]
seal_commitment: [u8; 32]
```

### `RegisterTcapOneTimeCredit` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs, line 19](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_credit.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
current_tip: UncheckedAccount<'info>
asset_entry: UncheckedAccount<'info>
reserve_state: UncheckedAccount<'info>
liability: UncheckedAccount<'info>
tcap_authorization_signer: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs, line 40](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs).

```rust
pub fn handler(ctx: Context<RegisterTcapOneTimeTipAuthorization>, args: RegisterTcapOneTimeTipAuthorizationArgs) -> Result<()>
```

### `RegisterTcapOneTimeTipAuthorizationArgs` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs, line 8](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
next_commitment: [u8; 32]
nullifier: [u8; 32]
sequence: u64
amount: u64
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
```

### `RegisterTcapOneTimeTipAuthorization` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs, line 21](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_tip_authorization.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
one_time_tip: UncheckedAccount<'info>
next_tip: UncheckedAccount<'info>
tcap_authorization_signer: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs, line 40](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs).

```rust
pub fn handler(ctx: Context<RegisterTcapOneTimeTransferCredit>, args: RegisterTcapOneTimeTransferCreditArgs) -> Result<()>
```

### `RegisterTcapOneTimeTransferCreditArgs` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs, line 10](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
next_commitment: [u8; 32]
nonce: [u8; 32]
sequence: u64
token_id: u32
amount: u64
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
previous_commitment: [u8; 32]
sealed: [u8; 48]
seal_commitment: [u8; 32]
```

### `RegisterTcapOneTimeTransferCredit` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs, line 18](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/register_tcap_one_time_transfer_credit.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
tcap_program: UncheckedAccount<'info>
tsn_program: UncheckedAccount<'info>
tcap_config: UncheckedAccount<'info>
current_tip: UncheckedAccount<'info>
asset_entry: UncheckedAccount<'info>
reserve_state: UncheckedAccount<'info>
liability: UncheckedAccount<'info>
tcap_authorization_signer: UncheckedAccount<'info>
```

### `set_cranker_funding_policy`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/set_cranker_funding_policy.rs, line 23](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/set_cranker_funding_policy.rs).

```rust
pub fn set_cranker_funding_policy( ctx: Context<SetCrankerFundingPolicy>, allow_external_funding: bool, ) -> Result<()>
```

### `SetCrankerFundingPolicy` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/set_cranker_funding_policy.rs, line 10](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/set_cranker_funding_policy.rs).

```rust
operator: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
cranker: Account<'info, Cranker>
```

### `commit_tin_action_fee`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/tin_action_fee.rs, line 63](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/tin_action_fee.rs).

```rust
pub fn commit_tin_action_fee( ctx: Context<CommitTinActionFee>, ) -> Result<()>
```

### `CommitTinActionFee` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/tin_action_fee.rs, line 11](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/tin_action_fee.rs).

```rust
cranker_operator: Signer<'info>
sender_token_account: Box<Account<'info, TokenAccount>>
token_mint: Box<Account<'info, Mint>>
team_treasury_token_account: Box<Account<'info, TokenAccount>>
reserve_pool_token_account: Box<Account<'info, TokenAccount>>
mother_escrow: Box<Account<'info, MotherEscrow>>
cranker: Box<Account<'info, Cranker>>
submitter_cranker_operator: UncheckedAccount<'info>
submitter_cranker: Box<Account<'info, Cranker>>
token_program: Program<'info, Token>
```

### `withdraw_cranker_funds`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_cranker_funds.rs, line 59](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_cranker_funds.rs).

```rust
pub fn withdraw_cranker_funds(ctx: Context<WithdrawCrankerFunds>, amount: u64) -> Result<()>
```

### `WithdrawCrankerFunds` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_cranker_funds.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_cranker_funds.rs).

```rust
funder: Signer<'info>
mother_escrow: Box<Account<'info, MotherEscrow>>
cranker: Box<Account<'info, Cranker>>
cranker_vault: Box<Account<'info, CrankerVault>>
vault_authority: UncheckedAccount<'info>
vault_token_account: Box<Account<'info, TokenAccount>>
funder_token_account: Box<Account<'info, TokenAccount>>
liquidity_position: Box<Account<'info, LiquidityPosition>>
token_program: Program<'info, Token>
```

### `withdraw_verifier_lamports`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_verifier_lamports.rs, line 35](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_verifier_lamports.rs).

```rust
pub fn withdraw_verifier_lamports( ctx: Context<WithdrawVerifierLamports>, amount: u64, ) -> Result<()>
```

### `WithdrawVerifierLamports` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_verifier_lamports.rs, line 13](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/instructions/withdraw_verifier_lamports.rs).

```rust
authority: Signer<'info>
mother_escrow: Account<'info, MotherEscrow>
verifier_pda: UncheckedAccount<'info>
destination: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `Cranker` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/cranker.rs, line 4](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/cranker.rs).

```rust
mother_escrow: Pubkey
operator: Pubkey
dna_hash: [u8; 32]
allow_external_funding: bool
staked_amount: u64
reputation_score: u32
claim_credits: u64
total_claims: u64
total_executes: u64
total_failures: u64
last_active_ts: i64
bump: u8
```

### `MotherEscrow` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/mother_escrow.rs, line 4](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/mother_escrow.rs).

```rust
authority: Pubkey
tins_program_id: Pubkey
protocol_seed: [u8; 32]
epoch_seconds: i64
lease_seconds: i64
fee_split_cranker_bps: u16
fee_split_lp_bps: u16
fee_split_treasury_bps: u16
tin_fee_split_verify_cranker_bps: u16
tin_fee_split_submit_cranker_bps: u16
tin_fee_split_team_bps: u16
tin_fee_split_reserve_pool_bps: u16
epoch_id: u64
last_epoch_settled_ts: i64
bump: u8
```

### `AcceptedIntentV1` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 9](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
version: u16
epoch_id: u64
intent_commitment: [u8; 32]
amount: u64
token_id: u32
tip_root_commitment: [u8; 32]
settlement_commitment: [u8; 32]
asset_commitment: [u8; 32]
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
replay_nonce: [u8; 32]
nullifier: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
accepted_intent_root: [u8; 32]
status: AcceptedIntentStatus
mother_escrow: Pubkey
bump: u8
```

### `EpochCommitmentStateV1` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 36](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
version: u16
epoch_id: u64
accepted_intent_root: [u8; 32]
previous_tcap_state_root: [u8; 32]
mother_escrow: Pubkey
bump: u8
```

### `PrivateSettlementConfig` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 51](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
mother_escrow: Pubkey
authority: Pubkey
permit_signer: Pubkey
enabled: bool
bump: u8
```

### `EpochTreasury` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 62](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
mother_escrow: Pubkey
epoch_id: u64
token_mint: Pubkey
token_account: Pubkey
total_funded: u64
pending_liability: u64
settled_total: u64
refunded_total: u64
reimbursed_total: u64
closed: bool
bump: u8
```

### `EpochSettlementLedger` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 78](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
epoch_treasury: Pubkey
epoch_id: u64
token_mint: Pubkey
pending_total: u64
settled_total: u64
refunded_total: u64
slot_count: u64
closed: bool
bump: u8
```

### `SettlementDna` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 98](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
mother_escrow: Pubkey
slot: [u8; 32]
commitment_digest: [u8; 32]
settlement_commitment: [u8; 32]
payout_nullifier: [u8; 32]
random_nonce: [u8; 32]
cranker: Pubkey
cranker_vault: Pubkey
recipient: Pubkey
token_mint: Pubkey
amount: u64
lease_id_hash: [u8; 32]
lease_version: u64
lease_expiry_ts: i64
authorization_expiry_ts: i64
status: SettlementDnaStatus
bump: u8
```

### `EpochClaimSlot` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs, line 122](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/private_settlement.rs).

```rust
epoch_treasury: Pubkey
slot: [u8; 32]
amount: u64
token_mint: Pubkey
status: ClaimSlotStatus
settlement_cranker: Pubkey
cranker_vault: Pubkey
commitment_digest: [u8; 32]
settlement_commitment: [u8; 32]
payout_nullifier: [u8; 32]
random_nonce: [u8; 32]
recipient: Pubkey
lease_id_hash: [u8; 32]
lease_version: u64
lease_expiry_ts: i64
authorization_expiry_ts: i64
reimbursed: bool
bump: u8
```

### `nonce_is_used`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs, line 51](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs).

```rust
pub fn nonce_is_used(&self, nonce: u8) -> bool
```

### `mark_nonce_used`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs, line 57](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs).

```rust
pub fn mark_nonce_used(&mut self, nonce: u8)
```

### `PruLifecycle` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs, line 22](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs).

```rust
tin_id: u64
token_mint: Pubkey
index: u16
state: PruLifecycleState
balance_state: TsnBalanceState
ata_created: bool
ata_rent_subsidies_used: u8
last_tx_hash: [u8; 32]
bump: u8
```

### `PruSpendGuard` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs, line 39](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/pru.rs).

```rust
tin: u64
pru_index: u16
spend_auth_hash: [u8; 32]
nonce_bitmask: [u8; 32]
active: bool
bump: u8
```

### `CrankerVault` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/vault.rs, line 4](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/vault.rs).

```rust
mother_escrow: Pubkey
cranker: Pubkey
token_mint: Pubkey
vault_token_account: Pubkey
vault_authority_bump: u8
total_liquidity: u64
total_shares: u64
reserved_liquidity: u64
total_withdrawn: u64
total_rewards_accrued: u64
bump: u8
```

### `LiquidityPosition` fields

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/vault.rs, line 39](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/state/vault.rs).

```rust
cranker_vault: Pubkey
funder: Pubkey
principal_amount: u64
withdrawn_amount: u64
reward_amount: u64
created_at_ts: i64
updated_at_ts: i64
bump: u8
```

### `default_fee_splits`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs, line 12](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs).

```rust
pub fn default_fee_splits() -> (u16, u16, u16)
```

### `is_valid_split`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs, line 16](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs).

```rust
pub fn is_valid_split(cranker_bps: u16, lp_bps: u16, treasury_bps: u16) -> bool
```

### `default_tin_fee_splits`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs, line 32](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs).

```rust
pub fn default_tin_fee_splits() -> (u16, u16, u16, u16)
```

### `is_valid_tin_fee_split`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs, line 41](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/fee_math.rs).

```rust
pub fn is_valid_tin_fee_split( verify_cranker_bps: u16, submit_cranker_bps: u16, team_bps: u16, reserve_pool_bps: u16, ) -> bool
```

### `compute_cranker_dna`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/hashing.rs, line 6](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/hashing.rs).

```rust
pub fn compute_cranker_dna(mother_escrow: &Pubkey, operator: &Pubkey, protocol_seed: &[u8; 32]) -> [u8; 32]
```

### `compute_tsn_domain`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/hashing.rs, line 16](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/hashing.rs).

```rust
pub fn compute_tsn_domain(tsn_vault_pubkey: &Pubkey) -> [u8; 32]
```

### `slot_settlement_message`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 16](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn slot_settlement_message( program_id: &Pubkey, mother: &Pubkey, operator: &Pubkey, epoch_treasury: &Pubkey, epoch_ledger: &Pubkey, claim_slot: &Pubkey, slot: &[u8; 32], settlement_commitment: &[u8; 32], commitment_digest: &[u8; 32], random_nonce: &[u8; 32], nullifier: &[u8; 32], vault: &Pubkey, recipient: &Pubkey, mint: &Pubkey, amount: u64, fee: u64, lease_id: &[u8; 32], lease_version: u64, lease_expiry: i64, expires: i64, ) -> Vec<u8>
```

### `slot_refund_message`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 26](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn slot_refund_message( program_id: &Pubkey, mother: &Pubkey, operator: &Pubkey, epoch_treasury: &Pubkey, epoch_ledger: &Pubkey, claim_slot: &Pubkey, slot: &[u8; 32], lease_version: u64, commitment_digest: &[u8; 32], sender: &Pubkey, mint: &Pubkey, amount: u64, nullifier: &[u8; 32], expires: i64, ) -> Vec<u8>
```

### `pru_root_authorization_message`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 36](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn pru_root_authorization_message( program_id: &Pubkey, main_wallet: &Pubkey, tin: u64, pru_index: u16, nonce: u8, commitment_hash: &[u8; 32], amount: u64, sender_fee_amount: u64, ) -> Vec<u8>
```

### `pru_child_authorization_message`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 60](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn pru_child_authorization_message( program_id: &Pubkey, pru_authority: &Pubkey, tin: u64, pru_index: u16, nonce: u8, commitment_hash: &[u8; 32], amount: u64, sender_fee_amount: u64, ) -> Vec<u8>
```

### `verify_ed25519_permit`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 84](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn verify_ed25519_permit( instructions_sysvar: &AccountInfo, permit_signer: &Pubkey, signature: &[u8; 64], message: &[u8], ) -> Result<()>
```

### `verify_ed25519_permit_at`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 101](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn verify_ed25519_permit_at( instructions_sysvar: &AccountInfo, index: usize, permit_signer: &Pubkey, signature: &[u8; 64], message: &[u8], ) -> Result<()>
```

### `verify_ed25519_message_at`

[Source: tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs, line 161](../../tsn-protocol/programs/tsn/protocol/programs/trustlink-escrow/src/tsn/utils/permit.rs).

```rust
pub fn verify_ed25519_message_at( instructions_sysvar: &AccountInfo, index: usize, permit_signer: &Pubkey, message: &[u8], ) -> Result<()>
```

## TCAP

### `require_v1_asset_instruction_enabled`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 28](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn require_v1_asset_instruction_enabled(config: &TcapGlobalConfigV1) -> Result<()>
```

### `raise_minimum_instruction_version_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 52](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn raise_minimum_instruction_version_v2( ctx: Context<RaiseMinimumInstructionVersionV2>, ) -> Result<()>
```

### `accepted_for_deposits`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 123](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn accepted_for_deposits(&self) -> bool
```

### `accepted_for_settlement`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 132](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn accepted_for_settlement(&self) -> bool
```

### `register_governed_asset_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 240](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn register_governed_asset_v2( ctx: Context<RegisterGovernedAssetV2>, args: RegisterGovernedAssetArgsV2, ) -> Result<()>
```

### `migrate_legacy_asset_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 388](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn migrate_legacy_asset_policy_v2( ctx: Context<MigrateLegacyAssetPolicyV2>, args: MigrateLegacyAssetPolicyArgsV2, ) -> Result<()>
```

### `set_asset_approval_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 468](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn set_asset_approval_v2( ctx: Context<GovernAssetV2>, new_status: TcapAssetApprovalStatusV2, ) -> Result<()>
```

### `set_asset_operational_status_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 583](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn set_asset_operational_status_v2( ctx: Context<ManageOperationalAssetV2>, new_status: TcapAssetOperationalStatusV2, ) -> Result<()>
```

### `revoke_asset_approval_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 708](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn revoke_asset_approval_v2(ctx: Context<ManageOperationalAssetV2>) -> Result<()>
```

### `set_asset_settlement_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 748](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn set_asset_settlement_policy_v2( ctx: Context<GovernAssetV2>, settlements_enabled: bool, public_exit_enabled: bool, confidential_settlement_enabled: bool, ) -> Result<()>
```

### `initialize_governed_reserve_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 820](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn initialize_governed_reserve_v2(ctx: Context<InitializeGovernedReserveV2>) -> Result<()>
```

### `initialize_governed_vault_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 909](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn initialize_governed_vault_v2(ctx: Context<InitializeGovernedVaultV2>) -> Result<()>
```

### `sync_governed_asset_infrastructure_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 988](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn sync_governed_asset_infrastructure_v2( ctx: Context<SyncGovernedAssetInfrastructureV2>, ) -> Result<()>
```

### `set_governed_deposit_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 1098](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
pub fn set_governed_deposit_policy_v2( ctx: Context<SetGovernedDepositPolicyV2>, enabled: bool, ) -> Result<()>
```

### `RaiseMinimumInstructionVersionV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 45](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
```

### `TcapAssetGovernancePolicyV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 98](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
version: u16
policy_version: u16
registry: Pubkey
asset_entry: Pubkey
mint: Pubkey
token_program: Pubkey
approval_status: TcapAssetApprovalStatusV2
operational_status: TcapAssetOperationalStatusV2
deposits_enabled: bool
settlements_enabled: bool
public_exit_enabled: bool
confidential_settlement_enabled: bool
reserve_initialized: bool
vault_initialized: bool
deprecated_irreversible: bool
last_updated_slot: u64
authority: Pubkey
bump: u8
reserved: [u8; 32]
```

### `TcapAssetExtensionPolicyV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 143](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
version: u16
asset_entry: Pubkey
mint: Pubkey
token_program: Pubkey
decimals: u8
mint_profile: TcapAssetMintProfileV2
required_extension_bitmap: u64
allowed_extension_bitmap: u64
extension_bitmap: u64
extension_config_hash: [u8; 32]
expected_mint_authority: Pubkey
expected_freeze_authority: Pubkey
confidential_transfer_enabled: bool
metadata_pointer_enabled: bool
token_metadata_enabled: bool
transfer_fee_enabled: bool
transfer_hook_enabled: bool
permanent_delegate_enabled: bool
default_account_state_enabled: bool
non_transferable_enabled: bool
interest_bearing_enabled: bool
mint_close_authority_enabled: bool
bump: u8
reserved: [u8; 32]
```

### `RegisterGovernedAssetArgsV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 175](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
asset_commitment: [u8; 32]
governance_approval: [u8; 32]
expected_decimals: u8
expected_mint_authority: Pubkey
expected_freeze_authority: Pubkey
mint_profile: TcapAssetMintProfileV2
required_extension_bitmap: u64
allowed_extension_bitmap: u64
```

### `MigrateLegacyAssetPolicyArgsV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 187](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
expected_mint_authority: Pubkey
expected_freeze_authority: Pubkey
mint_profile: TcapAssetMintProfileV2
required_extension_bitmap: u64
allowed_extension_bitmap: u64
```

### `RegisterGovernedAssetV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 204](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
registry_authority: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
mint: Box<InterfaceAccount<'info, Mint>>
token_program: Interface<'info, TokenInterface>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
system_program: Program<'info, System>
```

### `MigrateLegacyAssetPolicyV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 351](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
mint: Box<InterfaceAccount<'info, Mint>>
token_program: Interface<'info, TokenInterface>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
system_program: Program<'info, System>
```

### `GovernAssetV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 444](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
```

### `ManageOperationalAssetV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 529](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
mint: Box<InterfaceAccount<'info, Mint>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
token_program: Interface<'info, TokenInterface>
```

### `InitializeGovernedReserveV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 784](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
reserve_authority: UncheckedAccount<'info>
future_vault: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `InitializeGovernedVaultV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 860](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
mint: Box<InterfaceAccount<'info, Mint>>
reserve_authority: UncheckedAccount<'info>
vault: Box<InterfaceAccount<'info, TokenAccount>>
token_program: Interface<'info, TokenInterface>
system_program: Program<'info, System>
```

### `SyncGovernedAssetInfrastructureV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 943](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
mint: Box<InterfaceAccount<'info, Mint>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
token_program: Interface<'info, TokenInterface>
```

### `SetGovernedDepositPolicyV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs, line 1056](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/asset_governance.rs).

```rust
governance: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
governance_policy: Box<Account<'info, TcapAssetGovernancePolicyV2>>
extension_policy: Box<Account<'info, TcapAssetExtensionPolicyV2>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
mint: Box<InterfaceAccount<'info, Mint>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
token_program: Interface<'info, TokenInterface>
```

### `empty_gpru_hidden_head_root_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 31](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn empty_gpru_hidden_head_root_v1() -> Result<[u8; 32]>
```

### `derive_reserve_authority`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 45](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_reserve_authority(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_reserve_state`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 52](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_reserve_state(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_future_vault`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 56](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_future_vault(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_funding_root`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 60](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_funding_root(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_tcap_tin_tip_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 67](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_tcap_tin_tip_v1( blinded_tins_privacy_receiving_root_commitment: &[u8; 32], ) -> (Pubkey, u8)
```

### `derive_funding_claim`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 79](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_funding_claim(asset_entry: &Pubkey, funding_identifier: &[u8; 32]) -> (Pubkey, u8)
```

### `derive_funding_authorization_nonce`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 90](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_funding_authorization_nonce( asset_entry: &Pubkey, depositor: &Pubkey, ) -> (Pubkey, u8)
```

### `derive_asset_governance_policy`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 104](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_asset_governance_policy(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_asset_extension_policy`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 111](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_asset_extension_policy(asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `derive_tsn_authorization_signer`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 118](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_tsn_authorization_signer( approved_tsn_program: &Pubkey, authorization_digest: &[u8; 32], ) -> (Pubkey, u8)
```

### `derive_tcap_tip_liability_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs, line 128](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/authority.rs).

```rust
pub fn derive_tcap_tip_liability_v2(tin_tip: &Pubkey, asset_entry: &Pubkey) -> (Pubkey, u8)
```

### `TcapInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 6](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
config: Pubkey
governance: Pubkey
approved_tsn_program: Pubkey
protocol_version: u16
```

### `TcapTinTipInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 16](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
tin_tip: Pubkey
```

### `TcapTinTipCreditedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 23](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
tin_tip: Pubkey
sequence: u64
token_id: u32
transition_digest: [u8; 32]
```

### `TcapGpruMemoCreditedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 34](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
previous_root: [u8; 32]
current_root: [u8; 32]
settlement_sequence: u64
token_id: u32
transition_digest: [u8; 32]
```

### `AssetRegistryInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 43](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
registry_version: u32
```

### `AssetStateInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 49](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
asset_state: Pubkey
reserve_state: Pubkey
mint: Pubkey
token_program: Pubkey
```

### `AssetRegisteredV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 57](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
asset_entry: Pubkey
asset_commitment: [u8; 32]
registry_version: u32
```

### `AssetRegisteredV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 64](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
governance_policy: Pubkey
extension_policy: Pubkey
asset_commitment: [u8; 32]
registry_version: u32
mint: Pubkey
token_program: Pubkey
mint_profile: crate::asset_governance::TcapAssetMintProfileV2
approval_status: TcapAssetApprovalStatusV2
operational_status: TcapAssetOperationalStatusV2
authority: Pubkey
slot: u64
```

### `ReserveStateInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 81](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
reserve_state: Pubkey
asset_entry: Pubkey
reserve_authority: Pubkey
```

### `TsnProgramAuthorizedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 88](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
receipt: Pubkey
epoch_id: u64
authorization_digest: [u8; 32]
```

### `TcapPausedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 95](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
paused: bool
authority: Pubkey
```

### `ReserveVaultInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 101](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
version: u16
asset_entry: Pubkey
reserve_state: Pubkey
mint: Pubkey
vault: Pubkey
```

### `AssetDepositAcceptedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 110](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
version: u16
asset_entry: Pubkey
reserve_state: Pubkey
mint: Pubkey
vault: Pubkey
source: Pubkey
depositor: Pubkey
amount: u64
actual_assets: u64
accounting_epoch: u64
```

### `AssetDepositAcceptedV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 124](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
version: u16
registry: Pubkey
asset_entry: Pubkey
governance_policy: Pubkey
extension_policy: Pubkey
reserve_state: Pubkey
token_program: Pubkey
mint: Pubkey
vault: Pubkey
source: Pubkey
depositor: Pubkey
amount: u64
actual_assets: u64
accounting_epoch: u64
slot: u64
```

### `AssetDepositPolicyUpdatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 143](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
asset_entry: Pubkey
enabled: bool
```

### `AssetApprovalUpdatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 149](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
asset_commitment: [u8; 32]
mint: Pubkey
token_program: Pubkey
previous_status: TcapAssetApprovalStatusV2
new_status: TcapAssetApprovalStatusV2
authority: Pubkey
slot: u64
```

### `AssetStatusUpdatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 162](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
asset_commitment: [u8; 32]
mint: Pubkey
token_program: Pubkey
previous_status: TcapAssetOperationalStatusV2
new_status: TcapAssetOperationalStatusV2
authority: Pubkey
slot: u64
```

### `AssetSettlementPolicyUpdatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 175](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
previous_settlements_enabled: bool
previous_public_exit_enabled: bool
previous_confidential_settlement_enabled: bool
new_settlements_enabled: bool
new_public_exit_enabled: bool
new_confidential_settlement_enabled: bool
authority: Pubkey
slot: u64
```

### `AssetPausedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 189](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
asset_commitment: [u8; 32]
mint: Pubkey
token_program: Pubkey
previous_status: TcapAssetOperationalStatusV2
new_status: TcapAssetOperationalStatusV2
authority: Pubkey
slot: u64
```

### `AssetResumedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 202](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
asset_commitment: [u8; 32]
mint: Pubkey
token_program: Pubkey
previous_status: TcapAssetOperationalStatusV2
new_status: TcapAssetOperationalStatusV2
authority: Pubkey
slot: u64
```

### `AssetDeprecatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 215](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
asset_commitment: [u8; 32]
mint: Pubkey
token_program: Pubkey
previous_status: TcapAssetOperationalStatusV2
new_status: TcapAssetOperationalStatusV2
authority: Pubkey
slot: u64
```

### `CanonicalVaultInitializedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 228](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
reserve_state: Pubkey
vault: Pubkey
mint: Pubkey
token_program: Pubkey
authority: Pubkey
slot: u64
```

### `AssetDepositPolicyUpdatedV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 240](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
mint: Pubkey
token_program: Pubkey
previous_enabled: bool
new_enabled: bool
authority: Pubkey
slot: u64
```

### `ReserveInitializedV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 252](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
reserve_state: Pubkey
reserve_authority: Pubkey
canonical_vault: Pubkey
authority: Pubkey
slot: u64
```

### `ReserveAssetsReconciledV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 263](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
registry: Pubkey
asset_entry: Pubkey
reserve_state: Pubkey
vault: Pubkey
previous_actual_assets: u64
new_actual_assets: u64
total_liabilities: u64
reconciled_surplus: u64
authority: Pubkey
slot: u64
```

### `MinimumInstructionVersionRaisedV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 277](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
previous_version: u16
new_version: u16
authority: Pubkey
slot: u64
```

### `FundingClaimCreatedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 285](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
version: u16
funding_claim: Pubkey
asset_entry: Pubkey
reserve_state: Pubkey
funding_commitment: [u8; 32]
amount: u64
actual_assets: u64
pending_liabilities: u64
previous_funding_root: [u8; 32]
current_funding_root: [u8; 32]
funding_root_sequence: u64
```

### `FundingClaimCreatedV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs, line 300](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/events.rs).

```rust
version: u16
funding_claim: Pubkey
registry: Pubkey
asset_entry: Pubkey
governance_policy: Pubkey
extension_policy: Pubkey
reserve_state: Pubkey
token_program: Pubkey
mint: Pubkey
funding_commitment: [u8; 32]
amount: u64
actual_assets: u64
pending_liabilities: u64
previous_funding_root: [u8; 32]
current_funding_root: [u8; 32]
funding_root_sequence: u64
slot: u64
```

### `funding_domain_separator`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 21](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_domain_separator( protocol_version: u16, domain_version: u16, asset_commitment: &[u8; 32], ) -> [u8; 32]
```

### `depositor_authorization_commitment`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 36](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn depositor_authorization_commitment( protocol_version: u16, depositor: &Pubkey, funding_identifier: &[u8; 32], authorization_nonce: u64, expires_at_slot: u64, ) -> [u8; 32]
```

### `funding_domain_separator_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 55](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_domain_separator_v2( protocol_version: u16, domain_version: u16, asset_commitment: &[u8; 32], governance_policy: &Pubkey, extension_policy: &Pubkey, policy_version: u16, extension_config_hash: &[u8; 32], ) -> [u8; 32]
```

### `depositor_authorization_commitment_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 78](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn depositor_authorization_commitment_v2( protocol_version: u16, depositor: &Pubkey, asset_entry: &Pubkey, funding_identifier: &[u8; 32], authorization_nonce: u64, expires_at_slot: u64, ) -> [u8; 32]
```

### `funding_commitment_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 99](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_commitment_v2( protocol_version: u16, registry: &Pubkey, reserve_state: &Pubkey, asset: &TcapAssetIdV1, governance_policy: &Pubkey, extension_policy: &Pubkey, policy_version: u16, extension_config_hash: &[u8; 32], depositor_authorization: &[u8; 32], args: &DepositWithFundingCommitmentArgsV2, ) -> [u8; 32]
```

### `funding_domain_separator_v3`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 139](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_domain_separator_v3( protocol_version: u16, domain_version: u16, asset_commitment: &[u8; 32], ) -> [u8; 32]
```

### `depositor_authorization_commitment_v3`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 154](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn depositor_authorization_commitment_v3( protocol_version: u16, depositor: &Pubkey, asset_entry: &Pubkey, funding_identifier: &[u8; 32], authorization_nonce: u64, expires_at_slot: u64, ) -> [u8; 32]
```

### `funding_commitment_v3`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 175](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_commitment_v3( protocol_version: u16, reserve_state: &Pubkey, token_program: &Pubkey, mint: &Pubkey, asset_commitment: &[u8; 32], depositor_authorization: &[u8; 32], args: &DepositWithFundingCommitmentArgsV2, ) -> [u8; 32]
```

### `funding_commitment`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 206](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_commitment( protocol_version: u16, registry: &Pubkey, reserve_state: &Pubkey, asset: &TcapAssetIdV1, depositor_authorization: &[u8; 32], args: &DepositWithFundingCommitmentArgsV1, ) -> [u8; 32]
```

### `funding_commitment_for_program`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 225](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn funding_commitment_for_program( program_id: &Pubkey, protocol_version: u16, registry: &Pubkey, reserve_state: &Pubkey, asset: &TcapAssetIdV1, depositor_authorization: &[u8; 32], args: &DepositWithFundingCommitmentArgsV1, ) -> [u8; 32]
```

### `validate_and_advance_funding_nonce`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 258](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn validate_and_advance_funding_nonce(current: u64, provided: u64) -> Result<u64>
```

### `next_reserve_funding_accounting`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 268](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn next_reserve_funding_accounting( actual_assets: u64, pending_liabilities: u64, amount: u64, ) -> Result<(u64, u64)>
```

### `next_funding_sequence`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 286](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn next_funding_sequence(current: u64) -> Result<u64>
```

### `empty_funding_root`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 292](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn empty_funding_root(domain_separator: &[u8; 32], asset_entry: &Pubkey) -> [u8; 32]
```

### `next_funding_root`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs, line 302](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding.rs).

```rust
pub fn next_funding_root( domain_separator: &[u8; 32], previous_root: &[u8; 32], commitment: &[u8; 32], sequence: u64, ) -> [u8; 32]
```

### `FundingRootV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs, line 27](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs).

```rust
version: u16
protocol_version: u16
asset_entry: Pubkey
current_root: [u8; 32]
previous_root: [u8; 32]
sequence: u64
bump: u8
```

### `FundingClaimV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs, line 42](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs).

```rust
version: u16
protocol_version: u16
config: Pubkey
asset_entry: Pubkey
reserve_state: Pubkey
funding_identifier: [u8; 32]
funding_commitment: [u8; 32]
amount: u64
settlement_mode: FundingSettlementModeV1
destination_commitment: [u8; 32]
depositor_authorization_commitment: [u8; 32]
authorization_nonce: u64
expires_at_slot: u64
fee_authorization_commitment: [u8; 32]
domain_separator: [u8; 32]
funding_root_sequence: u64
status: FundingClaimStatusV1
bump: u8
```

### `FundingAuthorizationNonceV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs, line 68](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/funding_state.rs).

```rust
version: u16
asset_entry: Pubkey
depositor: Pubkey
next_nonce: u64
last_funding_claim: Pubkey
bump: u8
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/activate_commitment_root_v1.rs, line 22](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/activate_commitment_root_v1.rs).

```rust
pub fn handler(ctx: Context<ActivateCommitmentRootV1>) -> Result<()>
```

### `ActivateCommitmentRootV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/activate_commitment_root_v1.rs, line 8](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/activate_commitment_root_v1.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
commitment_root: Account<'info, TcapCommitmentRootStateV1>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs, line 75](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs).

```rust
pub fn handler(ctx: Context<CreditGpruMemoV1>, args: CreditGpruMemoV1Args) -> Result<()>
```

### `HiddenHeadProofArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs, line 12](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs).

```rust
public_inputs: [[u8; 32]; 12]
proof_a: [u8; 64]
proof_b: [u8; 128]
proof_c: [u8; 64]
action_kind: u8
token_id: u32
amount: u64
authorization_commitment: [u8; 32]
```

### `CreditGpruMemoV1Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs, line 24](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
previous_tcap_root: [u8; 32]
tcap_root_sequence: u64
token_id: u32
nullifier: [u8; 32]
amount: u64
proof: HiddenHeadProofArgsV1
```

### `CreditGpruMemoV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs, line 38](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_gpru_memo_v1.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
commitment_root: Account<'info, TcapCommitmentRootStateV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
tsn_program: UncheckedAccount<'info>
tsn_authorization_signer: UncheckedAccount<'info>
tip_route_root: UncheckedAccount<'info>
gpru_verifier: UncheckedAccount<'info>
instructions: UncheckedAccount<'info>
gpru_program: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip.rs, line 45](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip.rs).

```rust
pub fn handler( ctx: Context<CreditOneTimeTip>, authorization_digest: [u8; 32], previous_commitment: [u8; 32], new_commitment: [u8; 32], policy_commitment: [u8; 32], nonce: [u8; 32], sequence: u64, token_id: u32, amount: u64, valid_after_slot: u64, expires_at_slot: u64, sealed: [u8; 48], seal_commitment: [u8; 32], ) -> Result<()>
```

### `CreditOneTimeTip` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip.rs, line 22](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
current_tip: Account<'info, TcapOneTimeTip>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
tsn_program: UncheckedAccount<'info>
tsn_authorization_signer: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs, line 43](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs).

```rust
pub fn handler(ctx: Context<CreditOneTimeTipTransfer>, args: CreditOneTimeTipTransferArgs) -> Result<()>
```

### `CreditOneTimeTipTransferArgs` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs, line 8](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs).

```rust
authorization_digest: [u8; 32]
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
policy_commitment: [u8; 32]
nonce: [u8; 32]
sequence: u64
token_id: u32
amount: u64
valid_after_slot: u64
expires_at_slot: u64
sealed: [u8; 48]
seal_commitment: [u8; 32]
```

### `CreditOneTimeTipTransfer` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs, line 25](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_one_time_tip_transfer.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
current_tip: Account<'info, TcapOneTimeTip>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
tsn_program: UncheckedAccount<'info>
tsn_authorization_signer: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs, line 60](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs).

```rust
pub fn handler(ctx: Context<CreditTcapTinTipV1>, args: CreditTcapTinTipV1Args) -> Result<()>
```

### `CreditTcapTinTipV1Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs, line 12](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs).

```rust
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
```

### `CreditTcapTinTipV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs, line 24](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/credit_tcap_tin_tip_v1.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
tin_tip: Account<'info, TCapTinTipV1>
tip_root: UncheckedAccount<'info>
asset_entry: Account<'info, TcapAssetEntryV1>
authorization_receipt: Account<'info, TsnAuthorizationReceiptV1>
nullifier_record: Account<'info, NullifierRecordV1>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs, line 47](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs).

```rust
pub fn handler(ctx: Context<DebitTcapBalanceV1>, args: DebitTcapBalanceV1Args) -> Result<()>
```

### `DebitTcapBalanceV1Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs, line 13](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
debit_amount: u64
sealed: [u8; 48]
seal_commitment: [u8; 32]
```

### `DebitTcapBalanceV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs, line 31](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_balance_v1.rs).

```rust
authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
current_tip: Account<'info, TcapOneTimeTip>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
tsn_authorization_signer: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs, line 21](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs).

```rust
pub fn handler(ctx: Context<DebitTcapExitV1>, args: DebitTcapExitArgsV1) -> Result<()>
```

### `DebitTcapExitArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs, line 7](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs).

```rust
permit_nonce: [u8;32]
destination_commitment: [u8;32]
mint: Pubkey
amount: u64
sequence: u64
sealed: [u8;48]
seal_commitment: [u8;32]
source_debit_signature: [u8;64]
```

### `DebitTcapExitV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs, line 11](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_exit_v1.rs).

```rust
authority: Signer<'info>
config: Account<'info,TcapGlobalConfigV1>
current_tip: Account<'info,TcapOneTimeTip>
reserve_state: Account<'info,TcapReserveStateV1>
liability: Account<'info,TcapTipLiabilityV2>
permit: Account<'info,TcapExitPermitV1>
system_program: Program<'info,System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs, line 42](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs).

```rust
pub fn handler(ctx: Context<DebitTcapGpruTipV2>, args: DebitTcapGpruTipV2Args) -> Result<()>
```

### `DebitTcapGpruTipV2Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs, line 8](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
debit_amount: u64
```

### `DebitTcapGpruTipV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs, line 24](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/debit_tcap_gpru_tip_v2.rs).

```rust
authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
tin_tip: Account<'info, TCapTinTipV1>
tip_root: UncheckedAccount<'info>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
tsn_authorization_signer: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v1.rs).

```rust
pub fn handler(ctx: Context<DepositAssetV1>, amount: u64) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v2.rs, line 59](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v2.rs).

```rust
pub fn handler(ctx: Context<DepositAssetV2>, amount: u64) -> Result<()>
```

### `DepositAssetV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v2.rs, line 10](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_asset_v2.rs).

```rust
depositor: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
source: Box<InterfaceAccount<'info, TokenAccount>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
mint: Box<InterfaceAccount<'info, Mint>>
token_program: Interface<'info, TokenInterface>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs, line 95](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs).

```rust
pub fn handler( ctx: Context<DepositWithFundingCommitmentV1>, args: DepositWithFundingCommitmentArgsV1, ) -> Result<()>
```

### `DepositWithFundingCommitmentArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs, line 14](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs).

```rust
amount: u64
settlement_mode: u8
destination_commitment: [u8; 32]
funding_identifier: [u8; 32]
authorization_nonce: u64
expires_at_slot: u64
fee_authorization_commitment: [u8; 32]
salt: [u8; 32]
domain_separator: [u8; 32]
expected_funding_commitment: [u8; 32]
```

### `DepositWithFundingCommitmentV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs, line 29](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v1.rs).

```rust
depositor: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
funding_root: Box<Account<'info, FundingRootV1>>
funding_claim: Box<Account<'info, FundingClaimV1>>
funding_nonce: Box<Account<'info, FundingAuthorizationNonceV1>>
source: Box<InterfaceAccount<'info, TokenAccount>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
mint: Box<InterfaceAccount<'info, Mint>>
token_program: Interface<'info, TokenInterface>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs, line 112](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs).

```rust
pub fn handler( ctx: Context<DepositWithFundingCommitmentV2>, args: DepositWithFundingCommitmentArgsV2, ) -> Result<()>
```

### `DepositWithFundingCommitmentArgsV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs, line 12](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs).

```rust
amount: u64
settlement_mode: u8
destination_commitment: [u8; 32]
funding_identifier: [u8; 32]
authorization_nonce: u64
expires_at_slot: u64
fee_authorization_commitment: [u8; 32]
randomness_commitment: [u8; 32]
domain_separator: [u8; 32]
expected_funding_commitment: [u8; 32]
```

### `DepositWithFundingCommitmentV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs, line 29](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/deposit_with_funding_commitment_v2.rs).

```rust
depositor: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
registry: Box<Account<'info, TcapAssetRegistryV1>>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
reserve_state: Box<Account<'info, TcapReserveStateV1>>
funding_root: Box<Account<'info, FundingRootV1>>
funding_claim: Box<Account<'info, FundingClaimV1>>
funding_nonce: Box<Account<'info, FundingAuthorizationNonceV1>>
source: Box<InterfaceAccount<'info, TokenAccount>>
vault: Box<InterfaceAccount<'info, TokenAccount>>
mint: Box<InterfaceAccount<'info, Mint>>
token_program: Interface<'info, TokenInterface>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs, line 55](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs).

```rust
pub fn handler(ctx: Context<ExitTcapLiquidityV1>, args: ExitTcapLiquidityV1Args) -> Result<()>
```

### `ExitTcapLiquidityV1Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs, line 14](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs).

```rust
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
nullifier: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
exit_amount: u64
rate_version: u32
destination: Pubkey
destination_binding: [u8; 32]
exit_receipt_digest: [u8; 32]
proof_payload: Vec<u8>
```

### `ExitTcapLiquidityV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs, line 33](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/exit_tcap_liquidity_v1.rs).

```rust
payer: Signer<'info>
config: Box<Account<'info, TcapGlobalConfigV1>>
tin_tip: Box<Account<'info, TCapTinTipV1>>
tip_root: UncheckedAccount<'info>
asset_entry: Box<Account<'info, TcapAssetEntryV1>>
liquidity_pool: Box<Account<'info, TcapLiquidityPoolV1>>
exit_receipt: Box<Account<'info, TcapExitReceiptV1>>
proof_account: UncheckedAccount<'info>
nullifier_record: Box<Account<'info, NullifierRecordV1>>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_asset_registry_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_asset_registry_v1.rs).

```rust
pub fn handler(ctx: Context<InitializeAssetRegistryV1>) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_commitment_root_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_commitment_root_v1.rs).

```rust
pub fn handler( ctx: Context<InitializeCommitmentRootV1>, args: InitializeCommitmentRootArgsV1, ) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_nullifier_registry_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_nullifier_registry_v1.rs).

```rust
pub fn handler( ctx: Context<InitializeNullifierRegistryV1>, args: InitializeNullifierRegistryArgsV1, ) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs, line 28](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs).

```rust
pub fn handler(ctx: Context<InitializeOneTimeTipLiability>, args: InitializeOneTimeTipLiabilityArgs) -> Result<()>
```

### `InitializeOneTimeTipLiabilityArgs` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs, line 7](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs).

```rust
initial_available: u64
```

### `InitializeOneTimeTipLiability` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs, line 10](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_one_time_tip_liability.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
one_time_tip: Account<'info, TcapOneTimeTip>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_reserve_state_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_reserve_state_v1.rs).

```rust
pub fn handler(ctx: Context<InitializeReserveStateV1>) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_reserve_vault_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_reserve_vault_v1.rs).

```rust
pub fn handler(ctx: Context<InitializeReserveVaultV1>) -> Result<()>
```

### `initialize_tcap_tin_tip_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs, line 45](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs).

```rust
pub fn initialize_tcap_tin_tip_v1( ctx: Context<InitializeTcapTinTipV1>, args: InitializeTcapTinTipV1Args, ) -> Result<()>
```

### `InitializeTcapTinTipV1Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs, line 14](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs).

```rust
blinded_tins_privacy_receiving_root_commitment: [u8; 32]
current_commitment: [u8; 32]
policy_commitment: [u8; 32]
```

### `InitializeTcapTinTipV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs, line 24](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tin_tip_v1.rs).

```rust
payer: Signer<'info>
mother_escrow: UncheckedAccount<'info>
cranker: UncheckedAccount<'info>
tin_tip: Account<'info, TCapTinTipV1>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs, line 31](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs).

```rust
pub fn handler(ctx: Context<InitializeTcapTipLiabilityV2>, args: InitializeTcapTipLiabilityV2Args) -> Result<()>
```

### `InitializeTcapTipLiabilityV2Args` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs, line 8](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs).

```rust
initial_available: u64
```

### `InitializeTcapTipLiabilityV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs, line 13](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_tip_liability_v2.rs).

```rust
authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
tin_tip: Account<'info, TCapTinTipV1>
tip_root: UncheckedAccount<'info>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, crate::state::TcapReserveStateV1>
liability: Account<'info, TcapTipLiabilityV2>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/initialize_tcap_v1.rs).

```rust
pub fn handler(ctx: Context<InitializeTcapV1>, args: InitializeTcapArgsV1) -> Result<()>
```

### `initialize_tcap_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 45](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_tcap_v1( ctx: Context<InitializeTcapV1>, args: InitializeTcapArgsV1, ) -> Result<()>
```

### `initialize_asset_registry_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 121](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_asset_registry_v1(ctx: Context<InitializeAssetRegistryV1>) -> Result<()>
```

### `register_asset_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 168](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn register_asset_v1(ctx: Context<RegisterAssetV1>, args: RegisterAssetArgsV1) -> Result<()>
```

### `update_asset_status_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 242](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn update_asset_status_v1( ctx: Context<UpdateAssetStatusV1>, status: TcapAssetStatusV1, risk: TcapRiskStateV1, ) -> Result<()>
```

### `deprecate_asset_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 259](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn deprecate_asset_v1(ctx: Context<UpdateAssetStatusV1>) -> Result<()>
```

### `initialize_reserve_state_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 288](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_reserve_state_v1(ctx: Context<InitializeReserveStateV1>) -> Result<()>
```

### `initialize_nullifier_registry_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 337](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_nullifier_registry_v1( ctx: Context<InitializeNullifierRegistryV1>, domain_separator: [u8; 32], ) -> Result<()>
```

### `initialize_commitment_root_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 373](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_commitment_root_v1( ctx: Context<InitializeCommitmentRootV1>, empty_tree_root: [u8; 32], ) -> Result<()>
```

### `set_tcap_pause_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 405](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn set_tcap_pause_v1(ctx: Context<SetTcapPauseV1>, paused: bool) -> Result<()>
```

### `register_tsn_authorization_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 471](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn register_tsn_authorization_v1( ctx: Context<RegisterTsnAuthorizationV1>, authorization: TsnSettlementAuthorizationV1, ) -> Result<()>
```

### `initialize_reserve_vault_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 774](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn initialize_reserve_vault_v1(ctx: Context<InitializeReserveVaultV1>) -> Result<()>
```

### `set_asset_deposit_policy_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 825](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn set_asset_deposit_policy_v1( ctx: Context<SetAssetDepositPolicyV1>, enabled: bool, ) -> Result<()>
```

### `deposit_asset_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 884](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
pub fn deposit_asset_v1(ctx: Context<DepositAssetV1>, amount: u64) -> Result<()>
```

### `InitializeTcapArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 12](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
protocol_version: u16
emergency_authority: Pubkey
registry_authority: Pubkey
approved_tsn_program: Pubkey
domain_version: u16
```

### `InitializeTcapV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 22](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
approved_tsn_program: UncheckedAccount<'info>
asset_registry: UncheckedAccount<'info>
commitment_root_state: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `InitializeAssetRegistryV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 104](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
registry_authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
registry: Account<'info, TcapAssetRegistryV1>
system_program: Program<'info, System>
```

### `RegisterAssetArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 139](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
asset_commitment: [u8; 32]
transfer_fee_policy: u8
freeze_authority_policy: u8
issuer_control_policy: u8
governance_approval: [u8; 32]
```

### `RegisterAssetV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 148](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
registry_authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
registry: Account<'info, TcapAssetRegistryV1>
mint: InterfaceAccount<'info, Mint>
token_program: Interface<'info, TokenInterface>
asset_entry: Account<'info, TcapAssetEntryV1>
system_program: Program<'info, System>
```

### `UpdateAssetStatusV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 231](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
registry: Account<'info, TcapAssetRegistryV1>
```

### `InitializeReserveStateV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 264](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
reserve_authority: UncheckedAccount<'info>
future_vault: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `InitializeNullifierRegistryV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 327](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
nullifier_registry: Account<'info, NullifierRegistryV1>
system_program: Program<'info, System>
```

### `InitializeCommitmentRootV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 356](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
commitment_root: Account<'info, TcapCommitmentRootStateV1>
system_program: Program<'info, System>
```

### `SetTcapPauseV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 398](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
authority: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
```

### `RegisterTsnAuthorizationV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 442](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
commitment_root: Account<'info, TcapCommitmentRootStateV1>
tsn_program: UncheckedAccount<'info>
tsn_epoch_commitment: UncheckedAccount<'info>
tsn_authorization_signer: Signer<'info>
accepted_intent: UncheckedAccount<'info>
authorization_receipt: Account<'info, TsnAuthorizationReceiptV1>
system_program: Program<'info, System>
```

### `InitializeReserveVaultV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 746](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
mint: InterfaceAccount<'info, Mint>
reserve_authority: UncheckedAccount<'info>
vault: InterfaceAccount<'info, TokenAccount>
token_program: Interface<'info, TokenInterface>
system_program: Program<'info, System>
```

### `SetAssetDepositPolicyV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 811](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
vault: InterfaceAccount<'info, TokenAccount>
token_program: Program<'info, anchor_spl::token::Token>
```

### `DepositAssetV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs, line 868](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/legacy.rs).

```rust
depositor: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: Account<'info, TcapReserveStateV1>
source: InterfaceAccount<'info, TokenAccount>
vault: InterfaceAccount<'info, TokenAccount>
mint: InterfaceAccount<'info, Mint>
token_program: Interface<'info, TokenInterface>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_asset_entry_custody_graph_v2.rs, line 66](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_asset_entry_custody_graph_v2.rs).

```rust
pub fn handler(ctx: Context<MigrateAssetEntryCustodyGraphV2>) -> Result<()>
```

### `MigrateAssetEntryCustodyGraphV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_asset_entry_custody_graph_v2.rs, line 13](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_asset_entry_custody_graph_v2.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
governance_policy: Account<'info, TcapAssetGovernancePolicyV2>
asset_state: Account<'info, TcapAssetStateV1>
previous_reserve_state: Account<'info, TcapReserveStateV1>
previous_vault: InterfaceAccount<'info, TokenAccount>
target_reserve_state: Account<'info, TcapReserveStateV1>
target_vault: InterfaceAccount<'info, TokenAccount>
mint: InterfaceAccount<'info, Mint>
token_program: Interface<'info, TokenInterface>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_reserve_transfer_pending_v1.rs, line 25](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_reserve_transfer_pending_v1.rs).

```rust
pub fn handler(ctx: Context<MigrateReserveTransferPendingV1>) -> Result<()>
```

### `MigrateReserveTransferPendingV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_reserve_transfer_pending_v1.rs, line 12](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_reserve_transfer_pending_v1.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
asset_entry: Account<'info, TcapAssetEntryV1>
reserve_state: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs, line 18](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs).

```rust
pub fn handler(ctx: Context<MigrateTcapConfigLayoutV1>) -> Result<()>
```

### `MigrateTcapConfigLayoutV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs, line 9](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs).

```rust
governance: Signer<'info>
config: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `ConfigLayoutMigratedV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs, line 67](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tcap_config_layout_v1.rs).

```rust
config: Pubkey
governance: Pubkey
target_len: u32
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tip_seal_v1.rs, line 20](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tip_seal_v1.rs).

```rust
pub fn handler(ctx: Context<MigrateTipSealV1>) -> Result<()>
```

### `MigrateTipSealV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tip_seal_v1.rs, line 9](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/migrate_tip_seal_v1.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
tip: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `DepositWithFundingCommitmentArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs, line 42](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs).

```rust
amount: u64
settlement_mode: u8
destination_commitment: [u8; 32]
funding_identifier: [u8; 32]
authorization_nonce: u64
expires_at_slot: u64
fee_authorization_commitment: [u8; 32]
salt: [u8; 32]
domain_separator: [u8; 32]
expected_funding_commitment: [u8; 32]
```

### `UpdateAssetStatusArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs, line 65](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs).

```rust
status: crate::TcapAssetStatusV1
risk: crate::TcapRiskStateV1
```

### `InitializeCommitmentRootArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs, line 71](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs).

```rust
empty_tree_root: [u8; 32]
```

### `InitializeNullifierRegistryArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs, line 76](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/mod.rs).

```rust
domain_separator: [u8; 32]
```

### `initialize`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 33](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
pub fn initialize( ctx: Context<InitializeOneTimeTip>, args: InitializeOneTimeTipArgs, ) -> Result<()>
```

### `consume_authorized`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 90](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
pub fn consume_authorized( ctx: Context<ConsumeOneTimeTip>, args: ConsumeOneTimeTipArgs, ) -> Result<()>
```

### `InitializeOneTimeTipArgs` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 11](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
blinded_settlement_commitment: [u8; 32]
policy_commitment: [u8; 32]
token_id: u32
```

### `InitializeOneTimeTip` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 19](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
payer: Signer<'info>
one_time_tip: Account<'info, TcapOneTimeTip>
system_program: Program<'info, System>
```

### `ConsumeOneTimeTipArgs` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 53](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
authorization_digest: [u8; 32]
valid_after_slot: u64
expires_at_slot: u64
next_commitment: [u8; 32]
nullifier: [u8; 32]
sequence: u64
amount: u64
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
```

### `ConsumeOneTimeTip` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs, line 67](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/one_time_tip.rs).

```rust
payer: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
one_time_tip: Account<'info, TcapOneTimeTip>
next_tip: Account<'info, TcapOneTimeTip>
tsn_program: UncheckedAccount<'info>
tsn_authorization_signer: UncheckedAccount<'info>
system_program: Program<'info, System>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs, line 23](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs).

```rust
pub fn handler(ctx: Context<PayoutTcapExitV1>, args: PayoutTcapExitArgsV1) -> Result<()>
```

### `PayoutTcapExitArgsV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs, line 7](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs).

```rust
destination_owner: Pubkey
```

### `PayoutTcapExitV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs, line 10](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/payout_tcap_exit_v1.rs).

```rust
authority: Signer<'info>
config: Account<'info,TcapGlobalConfigV1>
reserve_state: Account<'info,TcapReserveStateV1>
asset_entry: Account<'info,TcapAssetEntryV1>
permit: Account<'info,TcapExitPermitV1>
reserve_authority: UncheckedAccount<'info>
vault: InterfaceAccount<'info,TokenAccount>
destination: InterfaceAccount<'info,TokenAccount>
mint: InterfaceAccount<'info,Mint>
token_program: Interface<'info,TokenInterface>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/register_asset_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/register_asset_v1.rs).

```rust
pub fn handler(ctx: Context<RegisterAssetV1>, args: RegisterAssetArgsV1) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/repair_tip_seal_v1.rs, line 16](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/repair_tip_seal_v1.rs).

```rust
pub fn handler(ctx: Context<RepairTipSealV1>) -> Result<()>
```

### `RepairTipSealV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/repair_tip_seal_v1.rs, line 6](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/repair_tip_seal_v1.rs).

```rust
governance: Signer<'info>
config: Account<'info, TcapGlobalConfigV1>
tip: UncheckedAccount<'info>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/set_asset_deposit_policy_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/set_asset_deposit_policy_v1.rs).

```rust
pub fn handler(ctx: Context<SetAssetDepositPolicyV1>, enabled: bool) -> Result<()>
```

### `handler`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/update_asset_status_v1.rs, line 4](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/instructions/update_asset_status_v1.rs).

```rust
pub fn handler(ctx: Context<UpdateAssetStatusV1>, args: UpdateAssetStatusArgsV1) -> Result<()>
```

### `initialize_tcap_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 27](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_tcap_v1( ctx: Context<InitializeTcapV1>, args: InitializeTcapArgsV1, ) -> Result<()>
```

### `initialize_one_time_tip`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 34](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_one_time_tip( ctx: Context<InitializeOneTimeTip>, args: InitializeOneTimeTipArgs, ) -> Result<()>
```

### `consume_one_time_tip`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 41](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn consume_one_time_tip( ctx: Context<ConsumeOneTimeTip>, args: ConsumeOneTimeTipArgs, ) -> Result<()>
```

### `credit_one_time_tip`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 48](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn credit_one_time_tip( ctx: Context<CreditOneTimeTip>, authorization_digest: [u8; 32], previous_commitment: [u8; 32], new_commitment: [u8; 32], policy_commitment: [u8; 32], nonce: [u8; 32], sequence: u64, token_id: u32, amount: u64, valid_after_slot: u64, expires_at_slot: u64, sealed: [u8; 48], seal_commitment: [u8; 32], ) -> Result<()>
```

### `credit_one_time_tip_transfer`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 82](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn credit_one_time_tip_transfer( ctx: Context<CreditOneTimeTipTransfer>, args: CreditOneTimeTipTransferArgs, ) -> Result<()>
```

### `initialize_one_time_tip_liability`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 89](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_one_time_tip_liability( ctx: Context<InitializeOneTimeTipLiability>, args: InitializeOneTimeTipLiabilityArgs, ) -> Result<()>
```

### `debit_tcap_balance_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 97](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn debit_tcap_balance_v1( ctx: Context<DebitTcapBalanceV1>, args: DebitTcapBalanceV1Args, ) -> Result<()>
```

### `debit_tcap_exit_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 104](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn debit_tcap_exit_v1(ctx: Context<DebitTcapExitV1>, args: DebitTcapExitArgsV1) -> Result<()>
```

### `payout_tcap_exit_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 108](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn payout_tcap_exit_v1(ctx: Context<PayoutTcapExitV1>, args: PayoutTcapExitArgsV1) -> Result<()>
```

### `exit_tcap_liquidity_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 112](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn exit_tcap_liquidity_v1( ctx: Context<ExitTcapLiquidityV1>, args: ExitTcapLiquidityV1Args, ) -> Result<()>
```

### `initialize_asset_registry_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 119](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_asset_registry_v1(ctx: Context<InitializeAssetRegistryV1>) -> Result<()>
```

### `migrate_reserve_transfer_pending_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 123](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn migrate_reserve_transfer_pending_v1( ctx: Context<MigrateReserveTransferPendingV1>, ) -> Result<()>
```

### `migrate_tip_seal_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 129](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn migrate_tip_seal_v1(ctx: Context<MigrateTipSealV1>) -> Result<()>
```

### `repair_tip_seal_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 133](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn repair_tip_seal_v1(ctx: Context<RepairTipSealV1>) -> Result<()>
```

### `raise_minimum_instruction_version_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 137](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn raise_minimum_instruction_version_v2( ctx: Context<RaiseMinimumInstructionVersionV2>, ) -> Result<()>
```

### `register_governed_asset_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 143](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn register_governed_asset_v2( ctx: Context<RegisterGovernedAssetV2>, args: RegisterGovernedAssetArgsV2, ) -> Result<()>
```

### `migrate_legacy_asset_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 150](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn migrate_legacy_asset_policy_v2( ctx: Context<MigrateLegacyAssetPolicyV2>, args: MigrateLegacyAssetPolicyArgsV2, ) -> Result<()>
```

### `set_asset_approval_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 157](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn set_asset_approval_v2( ctx: Context<GovernAssetV2>, new_status: TcapAssetApprovalStatusV2, ) -> Result<()>
```

### `set_asset_settlement_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 164](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn set_asset_settlement_policy_v2( ctx: Context<GovernAssetV2>, settlements_enabled: bool, public_exit_enabled: bool, confidential_settlement_enabled: bool, ) -> Result<()>
```

### `initialize_governed_reserve_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 178](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_governed_reserve_v2( ctx: Context<InitializeGovernedReserveV2>, ) -> Result<()>
```

### `initialize_governed_vault_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 184](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_governed_vault_v2( ctx: Context<InitializeGovernedVaultV2>, ) -> Result<()>
```

### `sync_governed_asset_infrastructure_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 190](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn sync_governed_asset_infrastructure_v2( ctx: Context<SyncGovernedAssetInfrastructureV2>, ) -> Result<()>
```

### `set_governed_deposit_policy_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 196](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn set_governed_deposit_policy_v2( ctx: Context<SetGovernedDepositPolicyV2>, enabled: bool, ) -> Result<()>
```

### `set_asset_operational_status_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 203](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn set_asset_operational_status_v2( ctx: Context<ManageOperationalAssetV2>, new_status: TcapAssetOperationalStatusV2, ) -> Result<()>
```

### `revoke_asset_approval_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 210](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn revoke_asset_approval_v2( ctx: Context<ManageOperationalAssetV2>, ) -> Result<()>
```

### `initialize_nullifier_registry_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 216](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_nullifier_registry_v1( ctx: Context<InitializeNullifierRegistryV1>, domain_separator: [u8; 32], ) -> Result<()>
```

### `initialize_commitment_root_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 223](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_commitment_root_v1( ctx: Context<InitializeCommitmentRootV1>, empty_tree_root: [u8; 32], ) -> Result<()>
```

### `activate_commitment_root_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 230](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn activate_commitment_root_v1( ctx: Context<ActivateCommitmentRootV1>, ) -> Result<()>
```

### `migrate_tcap_config_layout_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 236](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn migrate_tcap_config_layout_v1( ctx: Context<MigrateTcapConfigLayoutV1>, ) -> Result<()>
```

### `register_tsn_authorization_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 242](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn register_tsn_authorization_v1( ctx: Context<RegisterTsnAuthorizationV1>, authorization: TsnSettlementAuthorizationV1, ) -> Result<()>
```

### `credit_gpru_memo_v1`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 250](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn credit_gpru_memo_v1( ctx: Context<CreditGpruMemoV1>, args: CreditGpruMemoV1Args, ) -> Result<()>
```

### `initialize_tcap_tip_liability_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 257](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn initialize_tcap_tip_liability_v2( ctx: Context<InitializeTcapTipLiabilityV2>, args: InitializeTcapTipLiabilityV2Args, ) -> Result<()>
```

### `migrate_asset_entry_custody_graph_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 264](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn migrate_asset_entry_custody_graph_v2( ctx: Context<MigrateAssetEntryCustodyGraphV2>, ) -> Result<()>
```

### `debit_tcap_gpru_tip_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 270](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn debit_tcap_gpru_tip_v2( ctx: Context<DebitTcapGpruTipV2>, args: DebitTcapGpruTipV2Args, ) -> Result<()>
```

### `deposit_asset_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 277](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn deposit_asset_v2(ctx: Context<DepositAssetV2>, amount: u64) -> Result<()>
```

### `deposit_with_funding_commitment_v2`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs, line 281](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/lib.rs).

```rust
pub fn deposit_with_funding_commitment_v2( ctx: Context<DepositWithFundingCommitmentV2>, args: DepositWithFundingCommitmentArgsV2, ) -> Result<()>
```

### `total_liabilities`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 230](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
pub fn total_liabilities(&self) -> Option<u64>
```

### `transfer_liabilities`

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 241](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
pub fn transfer_liabilities(&self) -> Option<u64>
```

### `TCapTinTipV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 11](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
current_commitment: [u8; 32]
sequence: u64
policy_commitment: [u8; 32]
last_transition_nullifier: [u8; 32]
frozen: bool
bump: u8
```

### `TcapOneTimeTip` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 25](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
commitment: [u8; 32]
sequence: u64
sealed: [u8; 48]
seal_commitment: [u8; 32]
policy_commitment: [u8; 32]
transition_nullifier: [u8; 32]
token_id: u32
consumed: bool
bump: u8
```

### `TcapTipLiabilityV2` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 52](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
tip: Pubkey
asset_entry: Pubkey
available: u64
spent: u64
bump: u8
```

### `TcapGlobalConfigV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 73](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
minimum_instruction_version: u16
governance_authority: Pubkey
registry_authority: Pubkey
asset_registry: Pubkey
emergency_authority: Pubkey
approved_tsn_program: Pubkey
proof_verifier_program: Pubkey
proof_verifier_enabled: bool
paused: bool
commitment_root_state: Pubkey
domain_version: u16
migration_state: TcapMigrationStateV1
bump: u8
```

### `TcapAssetIdV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 96](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
token_program: Pubkey
mint: Pubkey
registry_version: u32
asset_commitment: [u8; 32]
```

### `TcapAssetRegistryV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 121](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
config: Pubkey
authority: Pubkey
registry_version: u32
entry_root: [u8; 32]
entry_count: u32
frozen: bool
bump: u8
```

### `TcapAssetEntryV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 137](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
registry: Pubkey
token_id: u32
asset: TcapAssetIdV1
reserve_state: Pubkey
future_vault: Pubkey
reserve_authority: Pubkey
decimals: u8
deposits_enabled: bool
withdrawals_enabled: bool
paused: bool
transfer_fee_policy: u8
freeze_authority_policy: u8
issuer_control_policy: u8
governance_approval: [u8; 32]
status: TcapAssetStatusV1
risk_state: TcapRiskStateV1
deprecated: bool
bump: u8
```

### `TcapMintBindingV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 183](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
token_program: Pubkey
mint: Pubkey
```

### `TcapAssetStateV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 189](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
config: Pubkey
asset: TcapMintBindingV1
reserve_state: Pubkey
future_vault: Pubkey
reserve_authority: Pubkey
decimals: u8
bump: u8
```

### `TcapReserveStateV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 206](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
asset_state: Pubkey
asset_entry: Pubkey
future_vault: Pubkey
reserve_authority: Pubkey
actual_assets: u64
pending_liabilities: u64
settled_confidential_liabilities: u64
authorized_withdrawal_liabilities: u64
reserved_refund_liabilities: u64
accounting_epoch: u64
funding_enabled: bool
paused: bool
bump: u8
reserve_authority_bump: u8
future_vault_bump: u8
transfer_pending: u64
```

### `TcapLiquidityPoolV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 252](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
config: Pubkey
token_id: u32
asset_entry: Pubkey
governance_authority: Pubkey
actual_assets: u64
reserved_liabilities: u64
pending_exits: u64
paused: bool
bump: u8
```

### `TcapExitReceiptV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 270](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
config: Pubkey
token_id: u32
nullifier: [u8; 32]
destination: Pubkey
destination_binding: [u8; 32]
amount: u64
consumed: bool
bump: u8
```

### `TcapPendingLiabilityV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 297](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
asset_commitment: [u8; 32]
principal_commitment: [u8; 32]
fee_relationship_commitment: [u8; 32]
refund_authority_commitment: [u8; 32]
funding_record_digest: [u8; 32]
epoch_absorption_commitment: [u8; 32]
expiry_ts: i64
status: TcapPendingStatusV1
carry_forward_count: u16
bump: u8
```

### `NullifierRegistryV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 328](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
config: Pubkey
domain_separator: [u8; 32]
storage_model: NullifierStorageModelV1
shard_count: u32
consumed_count: u64
paused: bool
bump: u8
```

### `NullifierShardV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 345](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
registry: Pubkey
shard_index: u32
domain: NullifierDomainV1
record_count: u32
accumulator_root: [u8; 32]
bump: u8
```

### `NullifierRecordV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 360](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
registry: Pubkey
shard: Pubkey
domain: NullifierDomainV1
nullifier: [u8; 32]
epoch_id: u64
consumed: bool
creation_authority: Pubkey
bump: u8
```

### `TcapCommitmentRootStateV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 377](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
protocol_version: u16
current_root: [u8; 32]
previous_root: [u8; 32]
root_version: u32
sequence: u64
history_policy: u8
verifier_config: Pubkey
verifier_enabled: bool
paused: bool
bump: u8
```

### `TsnSettlementAuthorizationV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 403](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
tsn_program_id: Pubkey
epoch_id: u64
intent_commitment: [u8; 32]
amount: u64
settlement_commitment: [u8; 32]
accepted_intent_root: [u8; 32]
previous_tcap_root: [u8; 32]
transition_type: TcapTransitionTypeV1
asset_commitment: [u8; 32]
authorization_digest: [u8; 32]
verifier_domain_version: u16
valid_after_slot: u64
expires_at_slot: u64
replay_nonce: [u8; 32]
tin_tip: Pubkey
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
```

### `TsnAuthorizationReceiptV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 430](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
version: u16
config: Pubkey
tsn_program_id: Pubkey
epoch_id: u64
intent_commitment: [u8; 32]
amount: u64
settlement_commitment: [u8; 32]
accepted_intent_root: [u8; 32]
previous_tcap_root: [u8; 32]
asset_commitment: [u8; 32]
authorization_digest: [u8; 32]
replay_nonce: [u8; 32]
tin_tip: Pubkey
previous_commitment: [u8; 32]
new_commitment: [u8; 32]
sequence: u64
token_id: u32
policy_commitment: [u8; 32]
gpru_scope_commitment: [u8; 32]
nullifier: [u8; 32]
transition_type: TcapTransitionTypeV1
valid_after_slot: u64
expires_at_slot: u64
non_spendable: bool
consumed: bool
bump: u8
```

### `TcapExitPermitV1` fields

[Source: tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs, line 464](../../tsn-protocol/programs/tcap-protocol/programs/tcap/src/state.rs).

```rust
tip: Pubkey
destination_commitment: [u8; 32]
mint: Pubkey
amount: u64
sequence: u64
nonce: [u8; 32]
source_debit_signature: [u8; 64]
consumed: bool
bump: u8
```
