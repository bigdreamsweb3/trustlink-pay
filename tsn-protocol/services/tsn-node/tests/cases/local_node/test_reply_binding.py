import base64
import hashlib
from nacl.exceptions import BadSignatureError
from core.relay.reply_signature import reply_signature


async def test_reply_binding(self):
    node = self.node
    reply = {"status": 200, "body": '{"private":"synthetic"}', "contentType": "application/json"}
    signature = base64.b64decode(reply_signature(node, node.job, reply))
    body = hashlib.sha256(reply["body"].encode()).hexdigest()
    content_type = hashlib.sha256(reply["contentType"].encode()).hexdigest()
    message = f"TSN_NODE_RELAY_REPLY_V1|{node.job['id']}|{node.job['requestHash']}|2|local-node|200|{body}|{content_type}"
    key = node._node_verification_signing_key().verify_key
    key.verify(message.encode(), signature)
    for changed in [message.replace("|2|", "|3|"), message.replace("local-node", "other-node"), message.replace("|200|", "|201|")]:
        with self.assertRaises(BadSignatureError):
            key.verify(changed.encode(), signature)
