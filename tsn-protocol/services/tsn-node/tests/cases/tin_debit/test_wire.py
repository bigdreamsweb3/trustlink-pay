"""Cross-language Cranker bytes are accepted by exact Mother-message inspection."""
import base64
import copy
import json
import shutil
import subprocess
from pathlib import Path
from fastapi import HTTPException
from transactions.native.serialization.parse_solana_v1_message import _parse_solana_v1_message
from settlement.debit.wire import debit_instructions
from settlement.debit.verify_message import verify_debit_message
from .fixture import fixture


def test_wire(self):
    node, transition = fixture()
    node._parse_solana_v1_message = _parse_solana_v1_message
    operator = "11111111111111111111111111111111"
    request = {"transition":transition,"authority":transition["authority"],"motherEscrow":transition["motherEscrow"],
        "operator":operator,"blockhash":transition["assetEntry"]}
    directory = Path(__file__).resolve().parents[5] / "services/tsn-cranker-op-daemon"
    # A regular stdin file is required by Node readFileSync on this Windows host.
    import tempfile
    with tempfile.TemporaryFile() as stream:
        stream.write(json.dumps(request).encode()); stream.seek(0)
        result = subprocess.run([shutil.which("node"),"--import","tsx","tests/tin-debit-v1-fixture.ts"],
            cwd=directory,stdin=stream,capture_output=True,check=True)
    compiled = json.loads(result.stdout)
    self.assertEqual(compiled["wireBytes"],2977)
    message = base64.b64decode(compiled["messageBase64"])
    self.assertEqual(verify_debit_message(node,message,operator,transition["authority"],transition),message[8:40])
    self.assertEqual([len(v[2]) for v in debit_instructions(node,transition)],[1128,582,582])
    for field in ("senderTin","amountBaseUnits","balance","privatePath"):
        with self.subTest(field=field), self.assertRaises(ValueError): debit_instructions(node,{**transition,field:"1"})
    for index in range(26):
        altered=copy.deepcopy(transition); altered["proof"]["publicInputs"][index]=format(int(altered["proof"]["publicInputs"][index],16)+1,"064x")
        with self.subTest(index=index),self.assertRaises(ValueError): debit_instructions(node,altered)
    for index in (2,3,4,40,len(message)-1):
        changed=bytearray(message);changed[index]^=1
        with self.subTest(byte=index),self.assertRaises((ValueError, HTTPException)): verify_debit_message(node,bytes(changed),operator,transition["authority"],transition)
