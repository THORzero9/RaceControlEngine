import subprocess, sys, os

# 1. Check backend syntax
os.chdir("/app")
result = subprocess.run([sys.executable, "-m", "py_compile", "backend/routes.py"], capture_output=True, text=True)
if result.returncode == 0:
    print("✅ backend/routes.py compiles clean")
else:
    print("❌ backend/routes.py FAILED:", result.stderr)
    sys.exit(1)

# 2. Check frontend build
os.chdir("/app/frontend")
result = subprocess.run(
    ["node",
     "node_modules/.bin/vite",
     "build"],
    capture_output=True, text=True, timeout=120
)
if result.returncode == 0:
    # Print last few lines of success output
    lines = result.stdout.strip().split('\n')
    for line in lines[-5:]:
        print(line)
    print("✅ Frontend build clean")
else:
    print("❌ Frontend build FAILED")
    print(result.stdout[-2000:] if result.stdout else "")
    print(result.stderr[-2000:] if result.stderr else "")
    sys.exit(1)

print("\n🟢 ALL VALIDATION CHECKS PASSED")
