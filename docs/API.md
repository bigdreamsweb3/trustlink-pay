# TrustLink Pay API Reference

> This API is under active development. Endpoints, request shapes, and response formats may change.

## Base URL

```
Development: http://localhost:3000
Production: https://api.trustlink.pay
```

## Authentication

Session-based via wallet, PIN, or application-supported social authentication. WhatsApp can support notifications and optional account linking.

## Endpoints

### Create Payment

```
POST /api/payment/create
```

**Request:**
```json
{
  "recipientTin": "1000000008",
  "amount": 100,
  "tokenMint": "EPjFWdd5AufqSSqeV6Z8oB2cX3Lv9iZ9pKQv2dNqV1mXg"
}
```

**Response:**
```json
{
  "paymentId": "pay_abc123",
  "escrowAddress": "7xKX...",
  "fee": 0.50,
  "expiresAt": 1234567890
}
```

### Estimate Fee

```
POST /api/payment/estimate
```

**Request:**
```json
{
  "recipientTin": "1000000008",
  "amount": 100
}
```

**Response:**
```json
{
  "networkFee": 0.005,
  "protocolFee": 0.50,
  "total": 100.51,
  "recipientReceives": 99.50
}
```

### Payment History

```
GET /api/payment/history?limit=20&offset=0
```

**Response:**
```json
{
  "payments": [
    {
      "id": "pay_abc123",
      "direction": "sent",
      "amount": 50,
      "status": "settled",
      "createdAt": 1234567890
    }
  ],
  "total": 100
}
```

## Webhooks

### payment.created

```json
{
  "type": "payment.created",
  "paymentId": "pay_abc123",
  "amount": 100,
  "sender": "DGV..."
}
```

### payment.claimed

```json
{
  "type": "payment.claimed",
  "paymentId": "pay_abc123",
  "cranker": "DGV...",
  "txHash": "abc..."
}
```

### payment.settled

```json
{
  "type": "payment.settled",
  "paymentId": "pay_abc123",
  "epoch": 42
}
```

## Error Codes

| Code | Description |
| --- | --- |
| `INVALID_TIN` | TIN not found or not routable |
| `INSUFFICIENT_BALANCE` | Sender lacks funds |
| `PAYMENT_EXPIRED` | Escrow expired |
| `INVALID_WALLET` | Invalid wallet address |
