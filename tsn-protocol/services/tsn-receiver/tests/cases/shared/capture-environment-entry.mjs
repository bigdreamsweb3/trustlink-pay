/** Compatible fixture component; inputs are supplied by the enclosing test. */
export function captureEnvironmentEntry(name) { return [name, process.env[name]]; }
