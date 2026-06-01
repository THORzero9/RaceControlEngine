from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from backend.database import db_manager
from backend.routes import router as incident_router, IncidentPayload, analyze_track_incident, store_final_adjudication, FinalAdjudicationPayload
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
import json

# The Lifespan context handles our startup and shutdown loops gracefully
@asynccontextmanager
async def lifespan(app: FastAPI):
    # This line triggers exactly as the Uvicorn server ignites
    await db_manager.connect_to_database()
    yield
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
                        "name": "Cross-Series Race Control Engine Server",
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
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "tools": [
                        {
                            "name": "analyze_track_incident",
                            "description": "Trigger an automated engine review loop to parse track limit or collision telemetry variables and check against regulations.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "series_id": {"type": "string", "description": "Target championship series identifier (F1, MOTOGP, WEC)"},
                                    "track_layout": {"type": "string", "description": "Name of the circuit where the incident occurred"},
                                    "turn_number": {"type": "integer", "description": "Turn coordinate of the incident zone"},
                                    "marshal_notes": {"type": "string", "description": "Raw textual transcription or observation notes from track marshals"}
                                },
                                "required": ["series_id", "track_layout", "turn_number", "marshal_notes"]
                            }
                        },
                        {
                            "name": "store_final_adjudication",
                            "description": "Commit a confirmed judicial ruling directly into the remote MongoDB Atlas collection logs.",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "steward_draft_ruling": {"type": "string", "description": "Raw text explanation of the penalty ruling"},
                                    "final_status": {"type": "string", "description": "Status code string (APPROVED or AMENDED)"}
                                },
                                "required": ["steward_draft_ruling", "final_status"]
                            }
                        }
                    ]
                }
            })
            
        # 2. Handle Runtime Action Execution Requests
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            
            if tool_name == "analyze_track_incident":
                incident_payload = IncidentPayload(
                    series_id=arguments.get("series_id"),
                    track_layout=arguments.get("track_layout"),
                    turn_number=arguments.get("turn_number"),
                    marshal_notes=arguments.get("marshal_notes"),
                    track_conditions=arguments.get("track_conditions", "DRY"),
                    driver_class=arguments.get("driver_class"),
                    session_id=arguments.get("session_id")
                )
                result = await analyze_track_incident(incident_payload)
                return JSONResponse({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result, indent=2)
                            }
                        ],
                        "isError": False
                    }
                })
                
            elif tool_name == "store_final_adjudication":
                adjudication_payload = FinalAdjudicationPayload(
                    incident_details=arguments.get("incident_details", {}),
                    regulatory_framework=arguments.get("regulatory_framework", {}),
                    applicable_clauses=arguments.get("applicable_clauses", []),
                    steward_draft_ruling=arguments.get("steward_draft_ruling"),
                    final_status=arguments.get("final_status"),
                    steward_notes=arguments.get("steward_notes"),
                    penalty_type=arguments.get("penalty_type", "Time Penalty"),
                    penalty_value=arguments.get("penalty_value", 5)
                )
                result = await store_final_adjudication(adjudication_payload)
                return JSONResponse({
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result, indent=2)
                            }
                        ],
                        "isError": False
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