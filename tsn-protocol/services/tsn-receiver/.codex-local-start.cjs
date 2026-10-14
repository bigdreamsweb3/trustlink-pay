const fs = require('node:fs');
const dotenv = require('dotenv');
const envPath = 'C:/Users/codepara/Desktop/trust-link/tsn-protocol/services/tsn-receiver/.env.local';
dotenv.config({path:envPath, override:true});
process.env.TSN_RECEIVER_NODE_API_KEY = process.env.TSN_RECEIVER_NODE_API_KEY || '';
const port = process.env.PORT || '8010';
process.env.PORT = port;
const nextCli = 'C:/Users/codepara/Desktop/trust-link/tsn-protocol/services/tsn-receiver/node_modules/next/dist/bin/next';
require(nextCli);
