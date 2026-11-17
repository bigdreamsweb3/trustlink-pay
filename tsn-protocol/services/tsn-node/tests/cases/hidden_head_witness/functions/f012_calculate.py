import json
import subprocess

def calculate(build, circuit, self, /, witness, succeeds):
    filename = self.directory / 'mock-witness.json'
    filename.write_text(json.dumps({k: [str(v) for v in value] if isinstance(value, list) else str(value) for k, value in witness.items()}))
    output = self.directory / 'mock.wtns'
    result = subprocess.run(['node', str(build / 'main_js/generate_witness.js'), str(build / 'main_js/main.wasm'), str(filename), str(output)], capture_output=True, timeout=120)
    self.assertEqual(result.returncode == 0, succeeds, 'circuit witness acceptance differed from expectation')
    if succeeds:
        checked = subprocess.run(['node', str(circuit / 'node_modules/snarkjs/build/cli.cjs'), 'wtns', 'check', str(build / 'main.r1cs'), str(output)], capture_output=True, timeout=120)
        self.assertEqual(checked.returncode, 0, 'honest witness did not satisfy the compiled R1CS')
