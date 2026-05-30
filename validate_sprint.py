import subprocess, sys, os, shutil

# 1. Check backend syntax
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)
result = subprocess.run([sys.executable, "-m", "py_compile", "backend/routes.py"], capture_output=True, text=True)
if result.returncode == 0:
    print("✅ backend/routes.py compiles clean")
else:
    print("❌ backend/routes.py FAILED:", result.stderr)
    sys.exit(1)

# 2. Check frontend build
os.chdir(os.path.join(script_dir, "frontend"))

node_executable = "node"
if not shutil.which("node"):
    fallback_node = "/home/bhaswat/.nvm/versions/node/v22.18.0/bin/node"
    if os.path.exists(fallback_node):
        node_executable = fallback_node

result = subprocess.run(
    [node_executable,
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
