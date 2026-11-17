import json
import subprocess

def calculate(build, directory, self, /, w, success):
    input = directory / 'witness.json'
    input.write_text(json.dumps({k: [str(v) for v in value] if isinstance(value, list) else str(value) for k, value in w.items()}))
    result = subprocess.run(['node', str(build / 'main_js/generate_witness.js'), str(build / 'main_js/main.wasm'), str(input), str(directory / 'main.wtns')], capture_output=True, timeout=120)
    self.assertEqual(result.returncode == 0, success, 'aggregate witness acceptance differed')
