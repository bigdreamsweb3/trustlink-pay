"""Read only explicitly supplied synthetic mint/entry accounts."""
import base64


async def asset_rpc(accounts, method, params):
    if method != "getAccountInfo" or params[0] not in accounts:
        raise AssertionError("Unexpected offline RPC")
    owner,data=accounts[params[0]]
    return {"result":{"value":{"owner":owner,"data":[base64.b64encode(data).decode(),"base64"]}}}
