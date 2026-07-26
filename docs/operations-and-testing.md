# Operations and Testing

## Development Setup

### Prerequisites
- Node.js 18+
- Python 3.8+
- Solana CLI
- Anchor CLI

### Environment Variables
- `RPC_URL`: Solana RPC endpoint
- `TRUSTLINK_PIN`: User PIN for encryption
- `DATABASE_URL`: PostgreSQL connection string

## Running Services

### TSN Node (Python Backend)
```bash
cd tsn-protocol/tsn-mempool-backend
python server.py
```

### Cranker
```bash
cd tsn-protocol/tsn-cranker-op-daemon
npm run dev
```

### Frontend
```bash
cd frontend
npm run dev
```

## Testing

### SDK Tests
```bash
cd tsn-protocol/tsn-sdk
npm test
```

### SDK Simulation
```bash
cd tsn-protocol/tsn-sdk
npm run simulate
```

### Root Scripts
```bash
# Run all tests
npm run test

# Run ZK-PRU simulation
npm run pru:simulate
```

## Test Coverage

- 71/71 tests passing
- 15 new Phase 1 tests
- 5 simulation scenarios

## Deployment

### Solana Program
```bash
cd tsn-protocol/tsn-solana-program
anchor deploy
```

### Backend
```bash
# Deploy TSN Node
# Deploy Cranker
```

## Monitoring

- Monitor TSN Node logs
- Monitor Cranker logs
- Track settlement success rates
- Monitor PRU lifecycle transitions

## Troubleshooting

### Common Issues
- RPC connection failures
- Insufficient SOL for fees
- Authorization verification failures
- Settlement timeouts

### Debug Mode
- Enable verbose logging
- Check state transitions
- Verify authorization signatures
- Monitor on-chain transactions
