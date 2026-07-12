# Install And Build

## Local Monorepo Install

The TrustLink frontend uses the SDK as a local package:

    {
      "dependencies": {
        "trustlink-whatsapp-sdk": "file:../packages/trustlink-whatsapp-sdk"
      }
    }

## Install SDK Dependencies

    npm --prefix packages/trustlink-whatsapp-sdk install

## Build SDK

    npm --prefix packages/trustlink-whatsapp-sdk run build

The build should create:

    packages/trustlink-whatsapp-sdk/dist/

## Sync Into Frontend

After changing SDK code, run:

    npm run sdk:sync:frontend

Then start frontend:

    npm run frontend:dev:synced

## Common Build Rule

Do not import app files from the SDK.

SDK files must not import paths like:

    "@/app/lib/env"
    "@/app/lib/logger"
    "@/app/db/users"

The host app must inject those through SDK ports.
