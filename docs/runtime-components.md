# Runtime Components

## TrustLink Pay Frontend

**Location**: `frontend/`

Web application for sending and receiving stablecoin payments.

### Key Files
- `src/lib/tin-spend-planner.ts`: TIN spend planning utilities
- `src/lib/tin-client.ts`: TIN API client
- `src/components/experiences/send-experience.tsx`: Send payment UI

## TSN SDK

**Location**: `tsn-protocol/tsn-sdk/`

Canonical planner and authorization layer.

### Key Files
- `src/zk-pru-execution-planner.ts`: Execution plan V2 builder
- `src/zk-pru-state-manager.ts`: PRU lifecycle management
- `src/zk-pru-receive-accumulator.ts`: Receipt accumulation logic
- `src/payment-authorization.ts`: Authorization builders

## TSN Node (Python Backend)

**Location**: `tsn-protocol/tsn-mempool-backend/`

Python FastAPI backend for transaction verification and reservation.

### Key Files
- `server.py`: Main backend (~4700 lines)
- `app/services/tins.py`: TIN service functions
- `app/routes/payment_intents.py`: Payment intent API

## Cranker

**Location**: `tsn-protocol/tsn-cranker-op-daemon/`

Node.js daemon for fee payment and transaction submission.

### Key Files
- `scripts/cranker.ts`: Main Cranker daemon (~2500 lines)
- `src/epoch-settlement.ts`: Epoch settlement logic

## TSN Program

**Location**: `tsn-protocol/tsn-solana-program/`

Solana on-chain program for settlement enforcement.

### Key Files
- `programs/tsn-solana-program/src/instructions/`: Instruction handlers
- `programs/tsn-solana-program/src/state/`: Account structures

## TIN Protocol

**Location**: `tsn-protocol/tin-protocol/`

Transfer Identity Protocol for privacy-preserving identity resolution.

### Key Files
- `programs/tin-protocol/src/instructions/`: Instruction handlers
- `programs/tin-protocol/src/state/`: Account structures
