import os
import sys

# Ensure project root is in python path for absolute imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from typing import List, Dict
import uvicorn
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.requests import Request
from backend.config import settings

from mcp.server.fastmcp import FastMCP

# Define the FastMCP server instance
mcp = FastMCP("RaceControl")

db_connected = False

async def ensure_db():
    global db_connected
    from backend.database import db_manager
    if not db_connected:
        if db_manager.client is None:
            await db_manager.connect_to_database(seed=False, max_pool_size=1, min_pool_size=1)
        db_connected = True
    return db_manager

@mcp.tool()
async def query_sporting_regulations(series_id: str, query: str) -> str:
    """
    Performs a precise keyword and relevance search within the 'sporting_codes' collection,
    filtered strictly by 'series_id' (F1, MOTOGP, WEC).

    Args:
        series_id: Target championship series identifier (F1, MOTOGP, WEC).
        query: Search query text (e.g. 'collision', 'track limits', 'defending').
    """
    series_key = series_id.upper()
    if series_key not in ["F1", "MOTOGP", "WEC"]:
        return f"Error: Series '{series_id}' is unsupported. Must be F1, MOTOGP, or WEC."
        
    db_m = await ensure_db()
    
    # Extract keywords, filtering out common english stopwords
    words = re.sub(r'[^\w\s]', ' ', query.lower()).split()
    stopwords = {
        "the", "a", "an", "on", "at", "in", "of", "to", "and", "for", "with", 
        "by", "from", "is", "are", "that", "it", "this", "these", "those"
    }
    keywords = [w for w in words if w not in stopwords and len(w) >= 3]
    
    if not keywords:
        keywords = [query.strip().lower()]
        
    regex_pattern = "|".join([re.escape(k) for k in keywords if k])
    
    results = []
    if regex_pattern:
        cursor = db_m.sporting_codes.find({
            "series_id": series_key,
            "$or": [
                {"search_tags": {"$regex": regex_pattern, "$options": "i"}},
                {"title": {"$regex": regex_pattern, "$options": "i"}},
                {"raw_text": {"$regex": regex_pattern, "$options": "i"}},
            ]
        })
        
        async for doc in cursor:
            # Score matches based on where keyword was found
            score = 0
            title_lower = doc.get("title", "").lower()
            tags_lower = [t.lower() for t in doc.get("search_tags", [])]
            raw_text_lower = doc.get("raw_text", "").lower()
            
            for k in keywords:
                if k in title_lower:
                    score += 3
                for tag in tags_lower:
                    if k in tag:
                        score += 3
                if k in raw_text_lower:
                    score += 1
                    
            results.append({
                "rule_id": doc.get("_id"),
                "title": doc.get("title"),
                "raw_text": doc.get("raw_text"),
                "score": score
            })
            
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    
    if not results:
        return f"No matching regulations found for {series_key} matching query '{query}'."
        
    formatted = [f"Found {len(results)} matching rules for {series_key}:"]
    for r in results[:10]:
        formatted.append(f"\n[{r['rule_id']}] {r['title']}\n{r['raw_text']}")
        
    return "\n".join(formatted)

@mcp.tool()
async def get_incident_precedents(circuit: str, turn_number: int, series_id: str) -> str:
    """
    Queries the historical adjudicated incidents collection matching exact turn number, series_id,
    and circuit name (matched case-insensitively).

    Args:
        circuit: Track name (e.g. 'SPA-FRANCORCHAMPS', 'MUGELLO', 'SARTHE').
        turn_number: Turn coordinate integer.
        series_id: Target championship series identifier (F1, MOTOGP, WEC).
    """
    series_key = series_id.upper()
    if series_key not in ["F1", "MOTOGP", "WEC"]:
        return f"Error: Series '{series_id}' is unsupported. Must be F1, MOTOGP, or WEC."
        
    db_m = await ensure_db()
    
    search_query = {
        "incident_details.series_id": series_key,
        "incident_details.turn_number": int(turn_number),
        "incident_details.track_layout": {"$regex": re.escape(circuit), "$options": "i"}
    }
    
    cursor = db_m.adjudicated_incidents.find(search_query)
    results = await cursor.to_list(length=50)
    
    if not results:
        return f"No past incident precedents found for {series_key} at {circuit} Turn {turn_number}."
        
    formatted = [f"Found {len(results)} precedent(s) for {series_key} at {circuit} Turn {turn_number}:"]
    for idx, doc in enumerate(results, 1):
        details = doc.get("incident_details", {})
        final_status = doc.get("final_status", "UNKNOWN")
        steward_notes = doc.get("steward_notes", "None")
        draft = doc.get("steward_draft_ruling", "None")
        timestamp = doc.get("timestamp", "N/A")
        
        formatted.append(f"\n--- PRECEDENT #{idx} (Incident ID: {doc['_id']}) ---")
        formatted.append(f"Timestamp: {timestamp}")
        formatted.append(f"Conditions: {details.get('track_conditions', 'N/A')}")
        formatted.append(f"Marshal Notes: {details.get('marshal_notes', 'N/A')}")
        formatted.append(f"Final Status: {final_status}")
        formatted.append(f"Verdict / Steward Notes: {steward_notes}")
        formatted.append(f"Copilot Draft Ruling:\n{draft}")
        
    return "\n".join(formatted)

class GoogleCloudAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if settings.GCP_AUDIENCE:
            if request.url.path in ["/health", "/"]:
                return await call_next(request)
                
            auth_header = request.headers.get("authorization")
            if not auth_header or not auth_header.lower().startswith("bearer "):
                return JSONResponse({"detail": "Unauthorized: Missing Bearer Token"}, status_code=401)
            
            token = auth_header.split(" ")[1]
            try:
                id_token.verify_oauth2_token(token, google_requests.Request(), settings.GCP_AUDIENCE)
            except Exception as e:
                return JSONResponse({"detail": f"Unauthorized: {str(e)}"}, status_code=401)
                
        return await call_next(request)

if __name__ == "__main__":
    port_env = os.environ.get("PORT")
    if port_env:
        mcp.settings.port = int(port_env)
        mcp.settings.host = "0.0.0.0"
        mcp.settings.transport_security.allowed_hosts = ["*"]
        mcp.settings.transport_security.allowed_origins = ["*"]
        
        starlette_app = mcp.sse_app()
        starlette_app.add_middleware(GoogleCloudAuthMiddleware)
        
        uvicorn.run(starlette_app, host="0.0.0.0", port=int(port_env))
    else:
        mcp.run()
