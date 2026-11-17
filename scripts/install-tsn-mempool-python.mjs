// This helper must not run pip against unpinned dependency ranges. Re-enable
// installation only after a complete, reviewed lock with artifact hashes exists
// and the installer enforces it. Installed environments remain unchanged.
console.error(
  "Automatic Python dependency installation is disabled: no reviewed, fully " +
  "pinned lock with artifact hashes is available. Preserve the existing " +
  "environment until a verified lock and enforcing installer are reviewed. " +
  "Manual pip installs and Docker builds are outside this guard.",
);
process.exitCode = 1;
