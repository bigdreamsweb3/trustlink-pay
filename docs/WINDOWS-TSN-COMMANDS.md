# Windows TSN commands

The PM2-managed services use their normal runtime memory behavior. TrustLink does not force a separate Node.js heap allocation for the frontend.

Use these commands from Windows PowerShell in the TrustLink project folder.

```powershell
cd C:\Users\codepara\Desktop\trust-link
```

## First-time setup

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r tsn-protocol\tsn-mempool-backend\requirements.txt
npm run tsn:doctor
```

## Start the normal development stack

The normal stack starts frontend, backend, and the TSN RPC gateway. It does not start the mempool, mempool UI, or Cranker.

```powershell
npm run tsn:start
```

## Start the WhatsApp webhook tunnel

Start the backend before opening the tunnel:

```powershell
npm run tsn:start:backend
npm run whatsapp:tunnel
```

The tunnel exposes the local backend on port `3000` through the configured ngrok development domain. Its Meta callback URL is:

```text
https://unimpressionable-overambitious-jessie.ngrok-free.dev/api/webhooks/whatsapp
```

The ngrok authentication token stays in the user's ngrok configuration and is never stored in the TrustLink repository. Press `Ctrl+C` to close the tunnel without stopping the backend.

## Start optional services

```powershell
npm run tsn:start:mempool
npm run tsn:start:mempool-ui
npm run tsn:start:cranker
```

## Check running services and logs

```powershell
npm run tsn:status
npm run tsn:logs
.\scripts\tsn.ps1 logs frontend
.\scripts\tsn.ps1 logs backend
.\scripts\tsn.ps1 logs rpc-gateway
.\scripts\tsn.ps1 logs mempool
.\scripts\tsn.ps1 logs mempool-ui
.\scripts\tsn.ps1 logs cranker
```

Press `Ctrl+C` to stop viewing a live log. It does not stop the service.

## Stop services

```powershell
npm run tsn:stop:frontend
npm run tsn:stop:backend
npm run tsn:stop:rpc
npm run tsn:stop:mempool
npm run tsn:stop:mempool-ui
npm run tsn:stop:cranker
```

Stop every managed TrustLink service:

```powershell
npm run tsn:stop
```

## Restart or remove a service

```powershell
.\scripts\tsn.ps1 restart frontend
.\scripts\tsn.ps1 restart backend
.\scripts\tsn.ps1 restart rpc-gateway
.\scripts\tsn.ps1 restart mempool
.\scripts\tsn.ps1 restart mempool-ui
.\scripts\tsn.ps1 restart cranker
```

Remove a stopped or unwanted PM2 registration:

```powershell
.\scripts\tsn.ps1 delete frontend
.\scripts\tsn.ps1 delete rpc-gateway
npm run tsn:delete
```

`npm run tsn:delete` removes only TrustLink PM2 registrations. It does not delete source code, logs, or data.
