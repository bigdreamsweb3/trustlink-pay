<!-- NODE RUN -->

PS C:\Users\codepara\Desktop\trust-link> python tsn-protocol/tsn-node/server.py --test-crosschain --receipt --network creditcoin-testnet --verbose
INFO:     Started server process [9968]
INFO:     Waiting for application startup.
2026-09-12 19:50:44,347 INFO tsn-mempool TSN Node durable state is delegated to Receiver: https://tsn-receiver-kappa.vercel.app
2026-09-12 19:50:45,105 INFO httpx HTTP Request: POST https://tsn-receiver-kappa.vercel.app/api/internal/node/state "HTTP/1.1 200 OK"
2026-09-12 19:50:45,105 INFO tsn-mempool TSN Node started on port 8000 (epoch every 7h)
2026-09-12 19:50:45,733 INFO tsn-mempool TSN Receiver verifier sleeping; waiting for wake
2026-09-12 19:50:45,733 INFO tsn-mempool TSN Receiver verifier woke; draining authenticated work
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
2026-09-12 19:50:46,588 INFO httpx HTTP Request: POST https://tsn-receiver-kappa.vercel.app/api/internal/node/work "HTTP/1.1 200 OK"
2026-09-12 19:50:46,591 INFO tsn-mempool TSN Receiver verifier drained queue; sleeping
2026-09-12 19:50:46,592 INFO tsn-mempool TSN Receiver verifier sleeping; waiting for wake
2026-09-12 19:50:53,139 INFO httpx HTTP Request: POST https://rpc.cc3-testnet.creditcoin.network "HTTP/1.1 200 OK"
2026-09-12 19:50:53,387 INFO httpx HTTP Request: POST https://rpc.cc3-testnet.creditcoin.network "HTTP/1.1 200 OK"
2026-09-12 19:50:53,631 INFO httpx HTTP Request: POST https://rpc.cc3-testnet.creditcoin.network "HTTP/1.1 200 OK"
INFO:     127.0.0.1:65104 - "GET /settlement-networks HTTP/1.1" 200 OK


<!-- WHAT WAS CEHCKED HERE? -->

PS C:\Users\codepara\Desktop\trust-link> Invoke-RestMethod http://127.0.0.1:8000/settlement-networks |>>   ConvertTo-Json -Depth 8
{
    "value":  [
                  {
                      "name":  "creditcoin-testnet",
                      "routeId":  "0xd1c8fb4fdaa90f4b4cf7f385e0f426c0cc6130ecff6ac078f0c95b91125e3943",
                      "chainId":  102031,
                      "executor":  "0xeb040d046fa4a39bb51203129bc82f2cb5084a5f",
                      "supportedAssets":  [
                                              "0xa6a0e01dbaf91ae8fa46ff7b832c23e735a269a9"
                                          ],
                      "status":  "ready; live liquidity verified"
                  }
              ],
    "Count":  1
}
PS C:\Users\codepara\Desktop\trust-link>

<!--  -->