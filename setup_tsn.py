import os
import subprocess
import sys

INSTALL_SCRIPT = "install-tsn.sh"

def run(cmd, sudo=False):
    try:
        if sudo:
            subprocess.run(["sudo"] + cmd, check=True)
        else:
            subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running: {' '.join(cmd)}")
        sys.exit(1)

def main():
    print("🚀 TSN One-Click Setup Starting...\n")

    # 1. Check installer exists
    if not os.path.exists(INSTALL_SCRIPT):
        print(f"❌ {INSTALL_SCRIPT} not found in this directory")
        sys.exit(1)

    # 2. Make executable
    print("🔧 Making installer executable...")
    run(["chmod", "+x", INSTALL_SCRIPT])

    # 3. Run installer
    print("📦 Running install script (may ask for sudo password)...")
    run(["./" + INSTALL_SCRIPT])

    # 4. Verify installation
    print("🔍 Verifying TSN installation...")
    result = subprocess.run(["which", "tsn"], capture_output=True, text=True)

    if result.returncode != 0:
        print("❌ TSN not found after install")
        sys.exit(1)

    print(f"✅ TSN installed at: {result.stdout.strip()}")

    # 5. Optional: auto-start
    print("\n⚡ Starting TSN (core)...")
    run(["tsn", "up", "core"])

    print("\n🎉 TSN is ready!")
    print("👉 Use another terminal to run: tsn logs frontend")

if __name__ == "__main__":
    main()
