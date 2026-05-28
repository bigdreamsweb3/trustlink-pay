const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to copy directory recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('--- Syncing tsn-sdk ---');
  
  // 1. Build the tsn-sdk
  const sdkPath = path.resolve(__dirname, 'tsn-sdk');
  console.log(`Installing tsn-sdk dependencies in ${sdkPath}...`);
  execSync('npm install', { cwd: sdkPath, stdio: 'inherit' });
  
  // Clean TypeScript incremental build cache to ensure all files are rebuilt
  const tsBuildInfo = path.join(sdkPath, 'tsconfig.tsbuildinfo');
  const oldDist = path.join(sdkPath, 'dist');
  if (fs.existsSync(tsBuildInfo)) {
    console.log('Cleaning TypeScript incremental build cache...');
    fs.unlinkSync(tsBuildInfo);
  }
  if (fs.existsSync(oldDist)) {
    console.log('Cleaning old dist folder...');
    fs.rmSync(oldDist, { recursive: true, force: true });
  }
  
  console.log('Building tsn-sdk...');
  execSync('npm run build', { cwd: sdkPath, stdio: 'inherit' });

  // 2. Synchronize to node_modules of the calling package
  const callingPkgDir = process.cwd();
  console.log(`Syncing tsn-sdk to local node_modules in ${callingPkgDir}...`);
  
  const targetDir = path.join(callingPkgDir, 'node_modules', '@trustlink', 'tsn-sdk');
  
  // Clean target directory
  if (fs.existsSync(targetDir)) {
    console.log(`Cleaning old tsn-sdk from ${targetDir}...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  
  // Copy built dist
  const srcDist = path.join(sdkPath, 'dist');
  const destDist = path.join(targetDir, 'dist');
  console.log(`Copying ${srcDist} -> ${destDist}...`);
  copyDir(srcDist, destDist);
  
  // Copy package.json
  const srcPkg = path.join(sdkPath, 'package.json');
  const destPkg = path.join(targetDir, 'package.json');
  console.log(`Copying package.json -> ${destPkg}...`);
  fs.copyFileSync(srcPkg, destPkg);
  
  // 3. Clear Next.js cache
  const nextCache = path.join(callingPkgDir, '.next');
  if (fs.existsSync(nextCache)) {
    console.log(`Clearing Next.js cache in ${nextCache}...`);
    fs.rmSync(nextCache, { recursive: true, force: true });
  }
  
  console.log('--- tsn-sdk Sync Complete ---');
} catch (error) {
  console.error('Error during tsn-sdk sync:', error);
  process.exit(1);
}
