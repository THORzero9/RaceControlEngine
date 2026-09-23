"""
deploy_agent.py — Programmatic Vertex AI Reasoning Engine Registration

Bypasses Agent Studio's visual packager by using the Vertex AI Python SDK
directly. This allows us to explicitly pass 'requirements' into the cloud
container during build time, ensuring 'mcp' is installed before the static
import sweep evaluates our main.py module.
"""

import sys
import os

# Guarantee clean relative module discovery from the project root
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import the root agent specification instance from our mock-guarded main.py
from main import root_agent

import vertexai
from vertexai.preview import reasoning_engines

# --- Deployment Configuration ---
PROJECT_ID = "race-control-engine-2026"
LOCATION = "us-west1"
DISPLAY_NAME = "Chief Steward"
DESCRIPTION = (
    "The primary coordinator and race director for the AI Steward panel. "
    "Receives raw tracking entries, manages the investigation workflow "
    "lifecycle across telemetry analysis, regulation lookup, and judicial "
    "archival workers, and delivers finalized judicial statements."
)

STAGING_BUCKET = "gs://race-control-engine-2026-staging"

# Explicit requirements to force-install inside the managed virtual environment
# before the platform evaluates the agent module imports
REQUIREMENTS = [
    "mcp>=0.1.0",
    "google-adk",
    "google-cloud-aiplatform[agent_engines]",
    "fastapi",
    "uvicorn",
]

# --- Deployment Execution ---
def deploy():
    print("=" * 60)
    print("  VERTEX AI REASONING ENGINE — PROGRAMMATIC DEPLOYMENT")
    print("=" * 60)
    print()
    print(f"  Project ID      : {PROJECT_ID}")
    print(f"  Location        : {LOCATION}")
    print(f"  Agent Name      : {DISPLAY_NAME}")
    print(f"  Staging Bucket  : {STAGING_BUCKET}")
    print(f"  Requirements    : {REQUIREMENTS}")
    print()

    print("[1/3] Initializing Vertex AI SDK...")
    vertexai.init(
        project=PROJECT_ID,
        location=LOCATION,
        staging_bucket=STAGING_BUCKET,
    )
    print("      ✅ SDK initialized.\n")

    print("[2/3] Registering agent with Reasoning Engine...")
    print("      Wrapping root_agent in AdkApp...")
    print("      Packaging source files and injecting requirements...")
    print("      This may take several minutes.\n")

    app = reasoning_engines.AdkApp(agent=root_agent)

    reasoning_engine = reasoning_engines.ReasoningEngine.create(
        app,
        requirements=REQUIREMENTS,
        extra_packages=["main.py"],
        display_name=DISPLAY_NAME,
        description=DESCRIPTION,
    )

    print()
    print("[3/3] ✅ Agent successfully registered!")
    print()
    print("=" * 60)
    print(f"  Resource Name: {reasoning_engine.resource_name}")
    print("=" * 60)
    print()
    print("You can now query this agent at:")
    print(f"  https://{LOCATION}-aiplatform.googleapis.com/v1/{reasoning_engine.resource_name}:streamQuery")


if __name__ == "__main__":
    deploy()
