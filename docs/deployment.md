# TrustLink Pay Deployment Guide

## Environment Variables

### Frontend Environment Variables

Create `frontend/.env.local` for development and set these in your Vercel dashboard for production:

```bash
# Development (frontend/.env.local)
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_TRUSTLINK_BUSINESS_NUMBER=+1234567890

# Production (Vercel Environment Variables)
NEXT_PUBLIC_BACKEND_URL=https://trustlink-pay.vercel.app
NEXT_PUBLIC_TRUSTLINK_BUSINESS_NUMBER=+1234567890
```

### Backend Environment Variables

Create `backend/.env.local` for development and set these in your Vercel dashboard for production:

```bash
# Core Configuration
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_secure_session_secret
APP_BASE_URL=https://trustlink-pay.vercel.app

# Solana Configuration
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=your_helius_api_key
SOLANA_PROGRAM_ID=your_solana_program_id
SOLANA_ESCROW_AUTHORITY_SECRET_KEY=[your_keypair_array]
SOLANA_CLAIM_VERIFIER_SECRET_KEY=[your_keypair_array]
SOLANA_ALLOWED_SPL_TOKENS=[{"mintAddress":"your_mint_address","symbol":"USDC","name":"USD Coin","logo":"$","decimals":6}]
SOLANA_MOCK_MODE=false

# TrustLink Configuration
TRUSTLINK_TREASURY_OWNER=your_treasury_wallet_address
TRUSTLINK_CLAIM_FEE_BPS=10000
TRUSTLINK_CLAIM_FEE_MAX_UI_AMOUNT=0.02
TRUSTLINK_SEND_FEE_BPS=10000
TRUSTLINK_SEND_FEE_MAX_UI_AMOUNT=0.01
TRUSTLINK_DEFAULT_EXPIRY_SECONDS=604800
TRUSTLINK_RECOVERY_WALLETS=[{"address":"your_recovery_wallet_1","label":"recovery-1","active":true},{"address":"your_recovery_wallet_2","label":"recovery-2","active":true}]
TRUSTLINK_CLAIM_BASE_URL=https://trustlink-pay.vercel.app/claim
TRUSTLINK_BUSINESS_NUMBER=+1234567890

# WhatsApp Configuration
WHATSAPP_API_KEY=your_whatsapp_api_token
WHATSAPP_PHONE_ID=your_whatsapp_phone_id
WHATSAPP_API_VERSION=v22.0
WHATSAPP_BASE_URL=https://graph.facebook.com
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
WHATSAPP_APP_SECRET=your_whatsapp_app_secret
WHATSAPP_USE_TEMPLATES=false
WHATSAPP_TEMPLATE_LANGUAGE_CODE=en_US
WHATSAPP_PAYMENT_TEMPLATE_NAME=
WHATSAPP_OTP_TEMPLATE_NAME=
WHATSAPP_MOCK_MODE=false

# OTP Configuration
OTP_MAX_ATTEMPTS=5
OTP_TTL_MINUTES=5
OTP_RATE_LIMIT_WINDOW_MINUTES=15
OTP_RATE_LIMIT_MAX_REQUESTS=3
```

## Vercel Deployment Steps

### 1. Deploy Backend

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set the root directory to `backend`
4. Configure all backend environment variables
5. Deploy

### 2. Deploy Frontend

1. Create a new Vercel project or use an existing one
2. Set the root directory to `frontend`
3. Configure frontend environment variables:
   - `NEXT_PUBLIC_BACKEND_URL=https://trustlink-pay.vercel.app`
   - `NEXT_PUBLIC_TRUSTLINK_BUSINESS_NUMBER=+1234567890`
4. Deploy

### 3. Configure WhatsApp Webhook

1. Get your backend URL from Vercel
2. Configure your WhatsApp Business API webhook:
   - Webhook URL: `https://trustlink-pay.vercel.app/api/webhooks/whatsapp`
   - Verify Token: Use the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

## CORS Configuration

The application automatically handles CORS for both development and production:

- **Development**: Allows `http://localhost:3001`
- **Production**: Allows `https://trustlink-pay.vercel.app`

## Session Code Format

Session codes are now formatted as `TLXXXXXX` (no hyphen) for easier mobile typing.

## Troubleshooting

### 508 Errors
- Ensure backend environment variables are set correctly
- Check that the backend URL is accessible
- Verify CORS configuration

### Authentication Issues
- Ensure WhatsApp Business API is configured
- Check webhook endpoint is receiving messages
- Verify session code format matches webhook regex

### Connection Issues
- Ensure both frontend and backend are deployed
- Check environment variables are correct
- Verify CORS headers are being sent
