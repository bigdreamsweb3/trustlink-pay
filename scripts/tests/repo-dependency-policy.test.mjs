import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const excluded = new Set(["node_modules", ".git", "target", "build", "dist", "vendor", ".venv", ".next", "__pycache__", ".cache", "protocol-test-runs"]);
const strictLocks = process.argv.includes("--strict-locks") || process.env.TRUSTLINK_REQUIRE_COMPLETE_NPM_LOCKS === "1";
const packageRoots = [];
const metadataGaps = [];
const missingLockfiles = [];
let registryResolutions = 0;
let localLinks = 0;
let lockfiles = 0;

function discover(directory) {
  if (existsSync(join(directory, "package.json"))) packageRoots.push(directory);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !excluded.has(entry.name)) discover(join(directory, entry.name));
  }
}

function projectPackageTarget(packageRoot, target, label) {
  const absolute = realpathSync(resolve(packageRoot, target));
  const fromRoot = relative(root, absolute);
  assert.ok(!isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`), `${label}: local dependency escapes this project`);
  assert.ok(existsSync(join(absolute, "package.json")), `${label}: local dependency must be a project package directory`);
}

function dependencySpec(spec, label, packageRoot) {
  assert.equal(typeof spec, "string", `${label}: dependency specification must be a string`);
  if (spec.startsWith("file:")) {
    if (packageRoot) projectPackageTarget(packageRoot, spec.slice(5), label);
    return;
  }
  // Registry versions/tags and npm aliases remain supported; remote URLs and Git shorthand do not.
  assert.doesNotMatch(spec, /^(?:git(?:\+|:)|github:|gitlab:|bitbucket:|https?:|ssh:|ftp:|[A-Za-z]:[\\/])/i, label);
  assert.ok(!spec.includes("://") && !spec.includes("\\"), `${label}: remote or filesystem dependency is not allowed`);
  if (!spec.startsWith("npm:")) assert.ok(!spec.includes("/"), `${label}: Git shorthand or a path is not allowed`);
}

function dependencies(record, label, packageRoot) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [name, spec] of Object.entries(record[field] || {})) dependencySpec(spec, `${label} ${field}.${name}`, packageRoot);
  }
}

function overrideSpecs(record, label, packageRoot) {
  for (const [name, spec] of Object.entries(record || {})) {
    if (typeof spec === "string") dependencySpec(spec, `${label}.${name}`, packageRoot);
    else overrideSpecs(spec, `${label}.${name}`, packageRoot);
  }
}

function integrity(spec, label) {
  assert.equal(typeof spec, "string", `${label}: registry resolution lacks integrity`);
  const digestLengths = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 };
  for (const token of spec.split(/\s+/)) {
    const match = /^(sha(?:1|256|384|512))-([A-Za-z0-9+/]+={0,2})$/.exec(token);
    assert.ok(match, `${label}: invalid Subresource Integrity format`);
    const digest = Buffer.from(match[2], "base64");
    assert.equal(digest.length, digestLengths[match[1]], `${label}: invalid integrity digest length`);
    assert.equal(digest.toString("base64"), match[2], `${label}: invalid integrity encoding`);
  }
}

discover(root);
packageRoots.sort();
test("Every discovered source package is covered by a local npm policy", () => {
  assert.ok(packageRoots.length > 0);
  for (const directory of packageRoots) assert.ok(existsSync(join(directory, ".npmrc")), `${relative(root, directory) || "."}: missing .npmrc`);
});

for (const directory of packageRoots) {
  const label = relative(root, directory).split(sep).join("/") || ".";
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  test(`${label} disables dependency lifecycle execution and requires the official HTTPS registry`, () => {
    const values = new Map();
    for (const line of readFileSync(join(directory, ".npmrc"), "utf8").split(/\r?\n/)) {
      if (!line.trim() || /^[#;]/.test(line.trim())) continue;
      const match = /^\s*([^=\s]+)\s*=\s*(.*?)\s*$/.exec(line);
      assert.ok(match, `${label}: unrecognized npm configuration`);
      assert.ok(!values.has(match[1]), `${label}: duplicate configuration key ${match[1]}`);
      values.set(match[1], match[2]);
    }
    assert.equal(values.get("ignore-scripts"), "true");
    assert.equal(values.get("registry"), "https://registry.npmjs.org/");
    assert.equal(values.get("strict-ssl"), "true");
    assert.notEqual(values.get("audit"), "false", "Useful audit controls must remain enabled");
    for (const [key, value] of values) {
      if (key.endsWith(":registry")) assert.equal(value, "https://registry.npmjs.org/", `${label}: scope registry bypass`);
    }
  });
  test(`${label} has no Git or remote-URL dependency specifications`, () => {
    dependencies(manifest, label, directory);
    overrideSpecs(manifest.overrides, `${label} overrides`, directory);
    overrideSpecs(manifest.resolutions, `${label} resolutions`, directory);
  });

  const lockPath = ["npm-shrinkwrap.json", "package-lock.json"].map(name => join(directory, name)).find(existsSync);
  if (!lockPath) {
    if (["dependencies", "devDependencies", "optionalDependencies"].some(field => Object.keys(manifest[field] || {}).length)) missingLockfiles.push(label);
    continue;
  }
  lockfiles++;
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const records = Object.entries(lock.packages || {});
  for (const [name, record] of records) {
    if (name.startsWith("node_modules/") && !record.link && (!record.resolved || !record.integrity)) metadataGaps.push({ package: label, record: name });
    if (record.link) localLinks++;
    else if (record.resolved) registryResolutions++;
  }
  test(`${label} recorded lock resolutions require official registry URLs and valid integrity`, t => {
    assert.ok(lock.lockfileVersion >= 2 && lock.packages, `${label}: unsupported lockfile layout`);
    for (const [name, record] of records) {
      const recordLabel = `${label} ${name || "root"}`;
      dependencies(record, recordLabel);
      if (!name) continue;
      if (record.link) {
        projectPackageTarget(directory, record.resolved, recordLabel);
        continue;
      }
      if (record.resolved) {
        const url = new URL(record.resolved);
        assert.equal(url.protocol, "https:", recordLabel);
        assert.equal(url.hostname, "registry.npmjs.org", recordLabel);
        assert.equal(url.port, "", recordLabel);
        assert.equal(url.username, "", recordLabel);
        assert.equal(url.password, "", recordLabel);
        integrity(record.integrity, recordLabel);
      } else if (name.startsWith("node_modules/")) {
        assert.match(record.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, `${recordLabel}: missing a fixed registry version`);
      } else {
        projectPackageTarget(directory, name, recordLabel);
      }
    }
    const gaps = metadataGaps.filter(gap => gap.package === label);
    if (gaps.length) t.diagnostic(`UNVERIFIED provenance: ${gaps.length} registry records omit resolved URL or integrity. Run the strict gate after reviewed lock repair.`);
  });
}

test("Complete lock provenance gate", {
  skip: strictLocks ? false : "Run this file with --strict-locks to require every dependency record to have provenance metadata.",
}, () => {
  const counts = new Map();
  for (const gap of metadataGaps) counts.set(gap.package, (counts.get(gap.package) || 0) + 1);
  assert.equal(metadataGaps.length + missingLockfiles.length, 0,
    `Incomplete dependency provenance: ${metadataGaps.length} registry records lack resolved URL/integrity (${JSON.stringify(Object.fromEntries(counts))}); package roots without a required lockfile: ${JSON.stringify(missingLockfiles)}. No installation or network resolution was performed.`);
});

test("Dependency policy audit reports its bounded coverage", t => {
  t.diagnostic(`${packageRoots.length} source package roots; ${lockfiles} lockfiles; ${registryResolutions} recorded registry resolutions; ${localLinks} local links; ${metadataGaps.length} incomplete registry records; ${missingLockfiles.length} dependency-bearing roots without a lockfile.`);
});
