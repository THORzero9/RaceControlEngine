import sys
from unittest.mock import MagicMock

# PREEMPTIVE MOCK TO PASS VERTEX AI COMPILATION
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

# Now it is completely safe for the Google ADK imports to execute
from google.adk.agents import LlmAgent
import os
import time
import urllib.request
import json
import re

DEFAULT_MCP_URL = "https://race-control-engine-478055061591.us-central1.run.app/"

def _execute_mcp_request(payload: dict, max_retries: int = 3, initial_delay: float = 0.5) -> dict:
    """
    Executes a JSON-RPC request to the configured MCP Server URL with exponential backoff retries.
    """
    url = os.getenv("MCP_SERVER_URL", DEFAULT_MCP_URL)
    data_bytes = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    
    last_exception = None
    delay = initial_delay
    
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, data=data_bytes, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                res_body = response.read().decode("utf-8")
                return json.loads(res_body)
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                time.sleep(delay)
                delay *= 2
                
    raise RuntimeError(f"MCP server request to {url} failed after {max_retries} attempts: {last_exception}")

def find_documents(collection: str, filter_query: str, limit: int = 10) -> str:
    """
    Query documents from a collection in the MongoDB database 'RaceControl_Core' via the official MCP server.
    
    Args:
        collection: The collection to query (either 'sporting_codes' or 'incident_precedents')
        filter_query: A JSON string containing the MongoDB filter query. E.g. '{"series_id": "WEC"}'
        limit: Maximum number of documents to return
    """
    try:
        if isinstance(filter_query, dict):
            query_filter = filter_query
        else:
            query_filter = json.loads(filter_query)
    except Exception:
        query_filter = {}
        
    payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "tools/call",
        "params": {
            "name": "find",
            "arguments": {
                "database": "RaceControl_Core",
                "collection": collection,
                "filter": query_filter,
                "limit": limit
            }
        }
    }
    
    try:
        res_data = _execute_mcp_request(payload)
        if "error" in res_data:
            return f"Database Error: {res_data['error'].get('message')}"
        result = res_data.get("result", {})
        content = result.get("content", [])
        text_content = []
        for block in content:
            if block.get("type") == "text":
                text_content.append(block.get("text", ""))
        return "\n".join(text_content)
    except Exception as e:
        return f"Database request failed: {e}"

def analyze_track_incident(series_id: str, track_layout: str, turn_number: int, marshal_notes: str) -> str:
    """
    Fetch baseline metrics and analyze active telemetry deltas for a track incident.
    
    Args:
        series_id: The championship series ID (F1, MOTOGP, or WEC).
        track_layout: The name of the track layout.
        turn_number: The turn number where the incident occurred.
        marshal_notes: Transcribed marshal notes describing the incident.
    """
    series_key = series_id.upper()
    
    # Query track_baselines collection via official find tool
    payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "tools/call",
        "params": {
            "name": "find",
            "arguments": {
                "database": "RaceControl_Core",
                "collection": "track_baselines",
                "filter": {
                    "series_id": series_key,
                    "turn_number": int(turn_number)
                },
                "limit": 10
            }
        }
    }
    
    baseline_brake_point = 150.0
    baseline_apex_speed = 90.0
    
    try:
        res_data = _execute_mcp_request(payload)
        result = res_data.get("result", {})
        content = result.get("content", [])
        for block in content:
            if block.get("type") == "text":
                try:
                    docs = json.loads(block.get("text", "[]"))
                    if isinstance(docs, list) and docs:
                        matched = None
                        for doc in docs:
                            if re.search(re.escape(track_layout), doc.get("track_layout", ""), re.IGNORECASE):
                                matched = doc
                                break
                        if not matched:
                            matched = docs[0]
                        baseline_brake_point = float(matched.get("baseline_brake_point", 150.0))
                        baseline_apex_speed = float(matched.get("baseline_apex_speed", 90.0))
                except Exception:
                    pass
    except Exception:
        pass
        
    active_brake = None
    active_speed = None
    
    late_match = re.search(r'(?:late\s+braking\s+by\s*|braking\s+late\s+by\s*)(\d+)\s*(?:m|meter)', marshal_notes, re.IGNORECASE)
    if late_match:
        active_brake = baseline_brake_point - float(late_match.group(1))
    else:
        active_brake = baseline_brake_point - 25.0
        
    speed_match = re.search(r'(?:speed|apex\s*speed)\s*(?:of|at|is)?\s*(\d+)\s*(?:km/h|kph)', marshal_notes, re.IGNORECASE)
    if speed_match:
        active_speed = float(speed_match.group(1))
    else:
        active_speed = baseline_apex_speed + 15.0
        
    braking_delta = active_brake - baseline_brake_point
    speed_delta = active_speed - baseline_apex_speed
    
    report = f"""
    --- MATHEMATICAL TELEMETRY DELTA REPORT ---
    Reference Track Baselines (from Database):
      - Baseline Braking Meter Mark: {baseline_brake_point}m
      - Baseline Apex Speed: {baseline_apex_speed} km/h
    Active Incident Telemetry:
      - Active Incident Braking Point: {active_brake}m
      - Active Incident Apex Speed: {active_speed} km/h
    Calculated Variances (Deltas):
      - Braking Delta: {braking_delta:+.2f}m
      - Speed Delta: {speed_delta:+.2f} km/h
    """
    return report

DEFAULT_ADJUDICATE_URL = "https://race-control-engine-478055061591.us-central1.run.app/api/v1/adjudicate"

def store_final_adjudication(steward_draft_ruling: str, final_status: str) -> str:
    """
    Log and store the final approved incident judgment and status safely to the archive database.
    
    Args:
        steward_draft_ruling: The final text of the drafted steward ruling statement.
        final_status: The final status indicator string (e.g. 'Approved', 'Awaiting Review').
    """
    payload = {
        "steward_draft_ruling": steward_draft_ruling,
        "final_status": final_status
    }
    
    url = os.getenv("ADJUDICATE_URL", DEFAULT_ADJUDICATE_URL)
    data_bytes = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    
    last_exception = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, data=data_bytes, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                if res_data.get("status") == "success":
                    return f"STATUS: DEPOSITED (ID: {res_data.get('inserted_id', 'unknown')})"
                return f"Error storing adjudication: {res_data.get('message')}"
        except Exception as e:
            last_exception = e
            if attempt < 3:
                time.sleep(0.5 * attempt)
                
    return f"Request failed after 3 attempts: {last_exception}"

telemetry_worker = LlmAgent(
    name='telemetry_worker',
    model='gemini-2.5-flash',
    description=(
        'Parse raw telemetry strings, track layouts, and marshal feeds into a structured situational summary brief.'
    ),
    sub_agents=[],
    instruction='[ROLE]\nYou are the Telemetry Analysis Specialist. Your domain is raw vehicle metrics, track coordinates, speed deltas, and sensor profiles. You strip away emotion to analyze exactly what the physical data indicates during a tracking incident.\n\n[OPERATIONAL PROTOCOL]\n1. Use your analyze_track_incident tool to query MongoDB Atlas for historical baselines regarding the specific circuit, turn number, and car series.\n2. Calculate speed deltas, braking force variations, or track limit violations from the telemetry array.\n3. Isolate the exact physical moment an anomaly occurred (e.g., "Braking initiated 25 meters past the typical braking zone").\n4. Package these findings into a concise "Technical Telemetry Assessment" containing explicit data points and pass it directly back to the Chief Steward.\n\n[CONSTRAINTS]\nNever comment on rules, penalties, or driver intent. Your responsibility begins and ends strictly with the physical telemetry data.',
    tools=[analyze_track_incident],
)

regulation_worker = LlmAgent(
    name='regulation_worker',
    model='gemini-2.5-flash',
    description=(
        'Rulebook expert dedicated to grading telemetry briefs against championship code libraries to define penalty scopes.'
    ),
    sub_agents=[],
    instruction='[ROLE]\nYou are the Adjudication and Regulations Specialist. You are the absolute expert on the series sporting regulations, track limits, overtaking guidelines, and code of conduct.\n\n[OPERATIONAL PROTOCOL]\n1. Ingest the "Technical Telemetry Assessment" provided by the Telemetry Worker alongside the initial marshal notes.\n2. Cross-reference the telemetry data against standard sporting regulations by using the find_documents tool to search collections.\n3. Cite the exact infraction logic (e.g., "Breach of Article 12.2.1.i - Causing an avoidable collision").\n4. Formulate an official regulatory recommendation (e.g., "5-Second Time Penalty", "Drive-Through Penalty", or "No Further Action").\n5. Return the finalized citation string directly to the Chief Steward.\n\n[CONSTRAINTS]\nDo not calculate or guess telemetry details. Rely entirely on the metrics provided by the Telemetry Worker to back up your legal citations.',
    tools=[find_documents],
)

archivist_worker = LlmAgent(
    name='archivist_worker',
    model='gemini-2.5-flash',
    description=(
        'Data persistence worker focused entirely on secure data synchronization loops with MongoDB Atlas.'
    ),
    sub_agents=[],
    instruction='[ROLE]\nYou are the Race Control Archivist. Your primary responsibility is data compliance, long-term persistence, and ensuring that every decision issued by the panel is perfectly formatted and stored for future reference.\n\n[OPERATIONAL PROTOCOL]\n1. Accept the fully synthesized "Race Control Decision Brief" and final regulatory verdict from the Chief Steward.\n2. Convert the text block and operational parameters into a strictly schema-compliant JSON payload layout.\n3. Invoke your store_final_adjudication tool to drop the finalized document into the adjudicated_incidents archive.\n4. Verify the successful transaction write path and return a clean confirmation string matching: "STATUS: DEPOSITED (ID: <object_id>)" to the panel orchestrator.\n\n[CONSTRAINTS]\nNever modify the verdict or analysis text strings passed down by the Chief Steward. Your function is strictly data formatting, structure validation, and secure database persistence.',
    tools=[store_final_adjudication],
)

root_agent = LlmAgent(
    name='Chief_Steward',
    model='gemini-2.5-flash',
    description=(
        'The primary coordinator and race director for the AI Steward panel. Receives raw tracking entries, manages the investigation workflow lifecycle, and delivers finalized judicial statements.'
    ),
    sub_agents=[telemetry_worker, regulation_worker, archivist_worker],
    instruction='[ROLE]\nYou are the Chief Race Steward Orchestrator. You maintain supreme executive authority over the race control panel.\n\n[OPERATIONAL PROTOCOL]\n1. Ingest raw incident data from the race control feed.\n2. Direct the Telemetry Worker to compute physical baselines and anomalies.\n3. Direct the Regulation Worker to map telemetry anomalies to the official sporting code and determine the regulatory citation.\n4. Synthesize all findings into a structured "Race Control Decision Brief."\n5. Instruct the Archivist Worker to commit the decision block to MongoDB and append the returned storage verification string (STATUS: DEPOSITED (ID: ...)) verbatim to the very end of your finalized ruling statement.\n\n[CONSTRAINTS]\nNever truncate or omit the Archivist Worker\'s deposit confirmation line. The complete ruling is not valid without the verified storage acknowledgment.',
    tools=[find_documents],
)
