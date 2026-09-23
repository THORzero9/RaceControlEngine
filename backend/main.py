import sys
from unittest.mock import MagicMock

# Inject a preemptive mock structure into sys.modules to satisfy the deep google.adk internal imports
if 'mcp' not in sys.modules:
    try:
        import mcp
    except ImportError:
        mock_mcp = MagicMock()
        mock_mcp.ClientSession = MagicMock
        mock_mcp.StdioServerParameters = MagicMock
        
        mock_stdio = MagicMock()
        mock_stdio.stdio_client = MagicMock
        
        sys.modules['mcp'] = mock_mcp
        sys.modules['mcp.client'] = MagicMock()
        sys.modules['mcp.client.stdio'] = mock_stdio

from contextlib import asynccontextmanager
import os
import shutil
import asyncio
import urllib.request
import tarfile
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from backend.database import db_manager
from backend.routes import router as incident_router, IncidentPayload, analyze_track_incident, store_final_adjudication, FinalAdjudicationPayload
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def download_portable_node() -> str:
    """
    Downloads and extracts a portable Node.js runtime for Linux x64
    into /tmp/node if npx is not available.
    """
    node_dir = "/tmp/node"
    node_bin_dir = os.path.join(node_dir, "node-v22.18.0-linux-x64", "bin")
    
    if not os.path.exists(node_bin_dir):
        print("Node.js not found in system. Bootstrapping portable Node.js v22.18.0...", file=sys.stderr)
        os.makedirs(node_dir, exist_ok=True)
        url = "https://nodejs.org/dist/v22.18.0/node-v22.18.0-linux-x64.tar.gz"
        tar_path = "/tmp/node.tar.gz"
        
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, urllib.request.urlretrieve, url, tar_path)
        print("Download complete. Extracting Node.js tarball...", file=sys.stderr)
        
        def extract():
            with tarfile.open(tar_path, "r:gz") as tar:
                tar.extractall(path=node_dir)
        await loop.run_in_executor(None, extract)
        
        if os.path.exists(tar_path):
            os.remove(tar_path)
        print("Node.js extracted successfully.", file=sys.stderr)
        
    return node_bin_dir

# The Lifespan context handles our startup and shutdown loops gracefully
@asynccontextmanager
async def lifespan(app: FastAPI):
    # This line triggers exactly as the Uvicorn server ignites
    await db_manager.connect_to_database()
    
    # Start the background official MongoDB MCP server subprocess
    env_copy = os.environ.copy()
    env_copy["MDB_MCP_CONNECTION_STRING"] = settings.MONGO_URI
    
    # Prepend local NVM path if it exists (for local WSL dev), otherwise fallback to standard system paths
    nvm_bin = "/home/bhaswat/.nvm/versions/node/v22.18.0/bin"
    if os.path.exists(nvm_bin):
        env_copy["PATH"] = f"{nvm_bin}:{env_copy.get('PATH', '')}"
        
    # Dynamically download Node.js in production if npx is missing
    if not shutil.which("npx", path=env_copy.get("PATH")) and sys.platform != "win32":
        try:
            portable_node_bin = await download_portable_node()
            env_copy["PATH"] = f"{portable_node_bin}:{env_copy.get('PATH', '')}"
        except Exception as ne:
            print(f"⚠️ WARNING: Dynamic Node.js bootstrap failed: {ne}", file=sys.stderr)
            
    # Add local node_modules/.bin to PATH if exists
    node_modules_bin = "/workspace/node_modules/.bin"
    if os.path.exists(node_modules_bin):
        env_copy["PATH"] = f"{node_modules_bin}:{env_copy.get('PATH', '')}"
    elif os.path.exists(os.path.join(os.getcwd(), "node_modules", ".bin")):
        env_copy["PATH"] = f"{os.path.join(os.getcwd(), 'node_modules', '.bin')}:{env_copy.get('PATH', '')}"
        
    # Try to resolve globally installed mongodb-mcp-server directly to prevent npx output pollution
    mcp_cmd = shutil.which("mongodb-mcp-server", path=env_copy.get("PATH"))
    if mcp_cmd:
        command = mcp_cmd
        args = []
    else:
        npx_cmd = shutil.which("npx", path=env_copy.get("PATH")) or "npx"
        command = npx_cmd
        args = ["--quiet", "-y", "mongodb-mcp-server@latest"]
        
    server_params = StdioServerParameters(
        command=command,
        args=args,
        env=env_copy
    )

    
    try:
        # Store client context and session on app state
        app.state.mcp_client_context = stdio_client(server_params)
        read, write = await app.state.mcp_client_context.__aenter__()
        app.state.mcp_session = ClientSession(read, write)
        await app.state.mcp_session.__aenter__()
        await app.state.mcp_session.initialize()
    except Exception as e:
        print(f"⚠️ WARNING: Failed to initialize official MongoDB Partner MCP Server: {e}", file=sys.stderr)
        app.state.mcp_client_context = None
        app.state.mcp_session = None
    
    yield
    
    # Shutdown the background MCP process gracefully
    if getattr(app.state, "mcp_session", None):
        try:
            await app.state.mcp_session.__aexit__(None, None, None)
        except Exception:
            pass
    if getattr(app.state, "mcp_client_context", None):
        try:
            await app.state.mcp_client_context.__aexit__(None, None, None)
        except Exception:
            pass
        
    # This line triggers when you stop the server using Ctrl+C
    await db_manager.close_database_connection()


# Initialize the main FastAPI instance
app = FastAPI(
    title="Cross-Series Race Control Engine",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incident_router)

@app.post("/")
async def mcp_root_bridge(request: Request):
    try:
        payload = await request.json()
        method = payload.get("method")
        params = payload.get("params", {})
        request_id = payload.get("id")
        
        if not getattr(request.app.state, "mcp_session", None):
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32603,
                    "message": "Official MongoDB Partner MCP Server is not running in this environment (missing Node.js/npx)."
                }
            }, status_code=500)
        
        # 0. Handle Protocol Lifecycle Initialization Handshake
        if method == "initialize":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": params.get("protocolVersion", "2024-11-05"),
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "Official MongoDB Partner MCP Server Proxy",
                        "version": "1.0.0"
                    }
                }
            })
        elif method == "notifications/initialized":
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {}
            })
            
        # 1. Handle Protocol Lifecycle Tools Discovery Request
        elif method == "tools/list":
            tools_response = await request.app.state.mcp_session.list_tools()
            tools = []
            for tool in tools_response.tools:
                tools.append({
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema
                })
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "tools": tools
                }
            })
            
        # 2. Handle Runtime Action Execution Requests
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            
            call_result = await request.app.state.mcp_session.call_tool(tool_name, arguments)
            
            content = []
            for block in call_result.content:
                if hasattr(block, 'text'):
                    content.append({
                        "type": "text",
                        "text": block.text
                    })
                elif hasattr(block, 'type') and getattr(block, 'type') == 'text':
                    content.append({
                        "type": "text",
                        "text": getattr(block, 'text', '')
                    })
                elif isinstance(block, dict) and block.get("type") == "text":
                    content.append(block)
                    
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "content": content,
                    "isError": call_result.isError
                }
            })
        
        # Standard Fallback for unmatched JSON-RPC calls
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"Method '{method}' not found"}
        }, status_code=400)
        
    except Exception as e:
        import traceback
        print("MCP Root Bridge Exception Captured:\n", traceback.format_exc())
        return JSONResponse({
            "jsonrpc": "2.0",
            "id": payload.get("id") if 'payload' in locals() else None,
            "error": {"code": -32603, "message": str(e)}
        }, status_code=500)


# A clean health-check route to verify live connectivity to your Atlas cluster
@app.get("/health")
async def health_check():
    try:
        if db_manager.client:
            # Send a micro-ping command directly to the database admin cluster
            await db_manager.client.admin.command('ping')
            return {"status": "healthy", "database": "connected"}
        return {"status": "unhealthy", "database": "not_initialized"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}