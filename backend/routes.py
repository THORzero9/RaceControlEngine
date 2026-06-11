import os
import re
import json
import asyncio
import io
import jwt
import hashlib
import httpx
import google.auth
import google.auth.transport.requests
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, File, UploadFile, Form, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from google import genai
from google.genai import types
from backend.config import settings
from backend.database import db_manager
from backend.ingest_pdf import parse_pdf_text, sync_rules_to_db, extract_pdf_text_with_filters
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

class SpyingMcpSession(ClientSession):
    def __init__(self, *args, event_queue: Optional[asyncio.Queue] = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.called_tools = []
        self.matched_rule_ids = set()
        self.event_queue = event_queue

    async def call_tool(self, name: str, arguments: Dict[str, Any]):
        if self.event_queue:
            await self.event_queue.put({
                "type": "thinking",
                "content": f"Running tool: {name}({json.dumps(arguments)})"
            })
        result = await super().call_tool(name, arguments)
        self.called_tools.append({"name": name, "args": arguments})
        if result and result.content:
            for block in result.content:
                if hasattr(block, 'text') and block.text:
                    found_ids = re.findall(r'\[([A-Z0-9_.-]+)\]', block.text)
                    self.matched_rule_ids.update(found_ids)
        if self.event_queue:
            await self.event_queue.put({
                "type": "thinking",
                "content": f"Tool {name} completed. Found regulations: {list(self.matched_rule_ids)}"
            })
        return result

router = APIRouter(prefix="/api/v1", tags=["Race Control Adjudication"])

# Initialize the official GenAI client conditionally based on configuration
if settings.GEMINI_API_KEY:
    # Direct Developer API-key sandbox routing (for local development/testing)
    ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
else:
    # Enterprise Vertex AI routing utilizing GCP Default Credentials (for production)
    ai_client = genai.Client(
        vertexai=True,
        project=os.getenv("GCP_PROJECT_ID", "race-control-engine-2026"),
        location=os.getenv("GCP_REGION", "us-central1")
    )

PHRASING_ALIASES = {
    "contact": ["contact", "collision", "hit", "collide", "struck", "impact"],
    "track limits": ["track limits", "off track", "left the track", "run wide", "track edge"],
    "overtake": ["overtake", "overtaking", "pass", "passing", "inside pass", "outside pass"],
    "unsafe": ["unsafe", "dangerous", "reckless", "aggressive", "irresponsible"],
    "penalty": ["penalty", "penalize", "sanction", "infraction", "violation"],
    "speed": ["speed", "braking", "late braking", "acceleration", "deceleration"],
    "position": ["position", "forced off", "squeezed", "pushed", "blocked", "impeded"],
}

# --- 1. PYDANTIC INPUT VALIDATION SCHEMAS ---
class IncidentPayload(BaseModel):
    series_id: str = Field(..., description="Target championship series identifier (F1, MOTOGP, WEC)")
    track_layout: str = Field(..., description="Name of the circuit where the incident occurred")
    turn_number: int = Field(..., description="Turn coordinate of the incident zone")
    track_conditions: str = Field("DRY", description="Climatic state of the surface (DRY, WET, MIXED)")
    marshal_notes: str = Field(..., description="Raw textual transcription or observation notes from track marshals")
    driver_class: Optional[str] = Field(None, description="Mandatory configuration for WEC multiclass routing (Hypercar, LMGT3)")
    session_id: Optional[str] = Field(None, description="Conversational session persistence identifier")
    active_incident_brake_point: Optional[float] = Field(None, description="Active braking point in meters")
    active_incident_apex_speed: Optional[float] = Field(None, description="Active apex speed in km/h")

class FinalAdjudicationPayload(BaseModel):
    incident_details: Dict = Field(..., description="Details of the incident payload")
    regulatory_framework: Dict = Field(..., description="Governing body and allowed penalties details")
    applicable_clauses: List[Dict] = Field(..., description="Matched regulation clauses list")
    steward_draft_ruling: str = Field(..., description="Raw textual draft ruling from the copilot engine")
    final_status: str = Field(..., description="Status (APPROVED or AMENDED)")
    steward_notes: Optional[str] = Field(None, description="Optional notes written by human stewards")
    penalty_type: Optional[str] = Field("Time Penalty", description="The type of penalty applied")
    penalty_value: Optional[int] = Field(5, description="The numerical value or weight of the penalty")

class CircuitConfigPayload(BaseModel):
    name: str = Field(..., description="Circuit Name")
    turn_count: int = Field(..., description="Total Turn Count")
    championship: str = Field(..., description="Championship Affinity (F1, MotoGP, WEC)")
    micro_sectors: Optional[str] = Field("", description="Micro-Sector Coordinates mapping")

class StreamConfigPayload(BaseModel):
    target: str = Field(..., description="Stream Target identifier")
    protocol: str = Field(..., description="Protocol Selector (WebSockets, MQTT, REST)")
    active: bool = Field(..., description="Active State Toggle")

class ToggleStreamPayload(BaseModel):
    id: str
    active: bool

class LoginPayload(BaseModel):
    username: str
    password: str

JWT_SECRET = settings.JWT_SECRET
JWT_ALGORITHM = settings.JWT_ALGORITHM

def hash_password(password: str) -> str:
    salt = settings.PASSWORD_SALT
    return hashlib.sha256((password + salt).encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: timedelta = timedelta(hours=8)):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None

async def call_dialogflow_cx_agent(
    project_id: str,
    location: str,
    agent_id: str,
    session_id: str,
    text: str,
    parameters: dict
) -> str:
    try:
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        access_token = credentials.token
    except Exception as e:
        raise ValueError(f"Failed to retrieve Google credentials: {str(e)}")
        
    url = f"https://{location}-dialogflow.googleapis.com/v3/projects/{project_id}/locations/{location}/agents/{agent_id}/sessions/{session_id}:detectIntent"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "queryInput": {"text": {"text": text}, "languageCode": "en"},
        "queryParams": {"payload": parameters}
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, timeout=30.0)
        if response.status_code != 200:
            raise ValueError(f"Dialogflow CX API error ({response.status_code}): {response.text}")
        data = response.json()
        response_messages = data.get("queryResult", {}).get("responseMessages", [])
        text_responses = []
        for msg in response_messages:
            if "text" in msg and "text" in msg["text"]:
                text_responses.extend(msg["text"]["text"])
        return "\n".join(text_responses)

def extract_search_keywords(marshal_notes: str) -> List[str]:
    notes_lower = marshal_notes.lower()
    
    # Build a deduplicated set of search terms from the raw notes
    # Strip punctuation so that words like "limits." are matched cleanly
    raw_words = set(re.sub(r'[^\w\s]', ' ', notes_lower).split())
    expanded_terms = set()
    
    for canonical, aliases in PHRASING_ALIASES.items():
        for alias in aliases:
            if alias in notes_lower:
                expanded_terms.add(canonical)
                for a in aliases:
                    expanded_terms.update(a.split())
                break
    
    # Static set of standard English grammatical stopwords
    STOPWORDS = {
        "the", "a", "an", "on", "at", "in", "of", "to", "and", "for", "with", 
        "by", "from", "is", "are", "that", "it", "this", "these", "those",
        "under", "over", "above", "below", "between", "into", "through", "during"
    }
    
    # Merge raw meaningful words (4+ chars to skip noise) with expanded alias terms, and filter out stopwords
    meaningful_words = {w for w in raw_words if len(w) >= 4}
    return list((expanded_terms | meaningful_words) - STOPWORDS)


# --- 2. CORE SYSTEM LOGIC ROUTE ---
@router.post("/investigate", status_code=status.HTTP_200_OK)
async def analyze_track_incident(payload: IncidentPayload):
    series_key = payload.series_id.upper()
    
    # 1. Pull valid regulatory boundaries from MongoDB to validate series
    config_id = f"{series_key}_CONFIG"
    series_config = await db_manager.series_configs.find_one({"_id": config_id})
    if not series_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported or unrecognized racing series profile: '{payload.series_id}'"
        )

    async def generate_investigation_stream():
        queue = asyncio.Queue()

        # 1. RAG query: Pull top 2 matching historical precedents strictly within the active series
        keywords = extract_search_keywords(payload.marshal_notes)
        precedents_cursor = db_manager.incident_precedents.find({
            "incident_category": series_key
        })
        
        matched_precedents = []
        async for doc in precedents_cursor:
            keyword_match_count = len(set(doc.get("situation_keywords", [])) & set(keywords))
            score = keyword_match_count
            matched_precedents.append((score, doc))
            
        matched_precedents.sort(key=lambda x: x[0], reverse=True)
        top_precedents = [doc for _, doc in matched_precedents[:2]]
        cited_precedent_ids = [str(doc["_id"]) for doc in top_precedents]

        precedents_layout = ""
        if top_precedents:
            precedents_layout += "\n--- HISTORICAL INCIDENT PRECEDENTS (RAG) ---\n"
            for idx, prec in enumerate(top_precedents, 1):
                precedents_layout += f"Precedent Case #{idx}:\n"
                precedents_layout += f"  - ID: {str(prec.get('_id'))}\n"
                precedents_layout += f"  - Category: {prec.get('incident_category')}\n"
                precedents_layout += f"  - Summary: {prec.get('summary')}\n"
                precedents_layout += f"  - Official Verdict: {prec.get('official_verdict')}\n"
                precedents_layout += f"  - Sporting Rule Cited: {prec.get('sporting_rule_cited')}\n\n"
        else:
            precedents_layout += "\nNo historical precedents found matching current incident characteristics.\n"

        # 2. Local Telemetry Delta Calculator
        baseline_doc = await db_manager.track_baselines.find_one({
            "series_id": series_key,
            "track_layout": {"$regex": re.escape(payload.track_layout), "$options": "i"},
            "turn_number": payload.turn_number
        })

        if not baseline_doc:
            if series_key == "F1":
                baseline_doc = {"baseline_brake_point": 100.0, "baseline_apex_speed": 120.0}
            elif series_key == "MOTOGP":
                baseline_doc = {"baseline_brake_point": 200.0, "baseline_apex_speed": 110.0}
            else:
                baseline_doc = {"baseline_brake_point": 150.0, "baseline_apex_speed": 85.0}

        baseline_brake_point = float(baseline_doc.get("baseline_brake_point", 150.0))
        baseline_apex_speed = float(baseline_doc.get("baseline_apex_speed", 90.0))

        active_incident_brake_point = payload.active_incident_brake_point
        active_incident_apex_speed = payload.active_incident_apex_speed

        if active_incident_brake_point is None:
            late_match = re.search(r'(?:late\s+braking\s+by\s*|braking\s+late\s+by\s*)(\d+)\s*(?:m|meter)', payload.marshal_notes, re.IGNORECASE)
            if late_match:
                active_incident_brake_point = baseline_brake_point - float(late_match.group(1))
            else:
                active_incident_brake_point = baseline_brake_point - 25.0

        if active_incident_apex_speed is None:
            speed_match = re.search(r'(?:speed|apex\s*speed)\s*(?:of|at|is)?\s*(\d+)\s*(?:km/h|kph)', payload.marshal_notes, re.IGNORECASE)
            if speed_match:
                active_incident_apex_speed = float(speed_match.group(1))
            else:
                active_incident_apex_speed = baseline_apex_speed + 15.0

        braking_delta = active_incident_brake_point - baseline_brake_point
        speed_delta = active_incident_apex_speed - baseline_apex_speed

        telemetry_delta_report = f"""
        --- MATHEMATICAL TELEMETRY DELTA REPORT ---
        Reference Track Baselines (from Database):
          - Baseline Braking Meter Mark: {baseline_brake_point}m
          - Baseline Apex Speed: {baseline_apex_speed} km/h
        Active Incident Telemetry:
          - Active Incident Braking Point: {active_incident_brake_point}m
          - Active Incident Apex Speed: {active_incident_apex_speed} km/h
        Calculated Variances (Deltas):
          - Braking Delta: {braking_delta:+.2f}m
          - Speed Delta: {speed_delta:+.2f} km/h
        """

        async def run_generation():
            try:
                # 4. Trigger the live reasoning loop via Gemini using Stdio MCP server Parameters
                import sys
                current_dir = os.path.dirname(os.path.abspath(__file__))
                mcp_server_path = os.path.join(current_dir, "mcp_server.py")

                env_copy = os.environ.copy()
                env_copy.pop("PORT", None)

                server_params = StdioServerParameters(
                    command=sys.executable,
                    args=[mcp_server_path],
                    env=env_copy
                )

                matched_rules = []
                
                async with stdio_client(server_params) as (read, write):
                    async with SpyingMcpSession(read, write, event_queue=queue) as session:
                        await session.initialize()
                        
                        config = types.GenerateContentConfig(
                            tools=[session],
                            temperature=0.2
                        )
                        
                        await queue.put({
                            "type": "thinking",
                            "content": "Running multi-agent coordination mesh..."
                        })
                        
                        # Stream content generation asynchronously
                        response_stream = await ai_client.aio.models.generate_content_stream(
                            model='gemini-2.5-flash',
                            contents=steward_prompt,
                            config=config
                        )
                        
                        async for chunk in response_stream:
                            if chunk.text:
                                await queue.put({"type": "token", "content": chunk.text})
                        
                        await queue.put({
                            "type": "thinking",
                            "content": "Resolving regulations and compiling final draft..."
                        })
                        
                        # Fetch full rule documents from MongoDB for precisely matched rule IDs
                        if session.matched_rule_ids:
                            for rule_id in session.matched_rule_ids:
                                rule_doc = await db_manager.sporting_codes.find_one({"_id": rule_id})
                                if rule_doc:
                                    matched_rules.append({
                                        "rule_id": rule_doc["_id"],
                                        "title": rule_doc["title"],
                                        "raw_text": rule_doc["raw_text"]
                                    })
                        
                        # Fallback to keyword matching if the agent didn't successfully query any rules
                        # or if the matched set is empty, to keep the React UI stable.
                        if not matched_rules:
                            all_search_terms = extract_search_keywords(payload.marshal_notes)
                            regex_pattern = "|".join([f"(?:{re.escape(term)})" for term in all_search_terms if term])
                            if regex_pattern:
                                cursor = db_manager.sporting_codes.find({
                                    "series_id": series_key,
                                    "$or": [
                                        {"search_tags": {"$regex": regex_pattern, "$options": "i"}},
                                        {"title": {"$regex": regex_pattern, "$options": "i"}},
                                        {"raw_text": {"$regex": regex_pattern, "$options": "i"}},
                                    ]
                                })
                                async for doc in cursor:
                                    matched_rules.append({
                                        "rule_id": doc["_id"],
                                        "title": doc["title"],
                                        "raw_text": doc["raw_text"]
                                    })
                                    if len(matched_rules) >= 3:
                                        break
                                        
                        await queue.put({
                            "type": "metadata",
                            "applicable_clauses": matched_rules,
                            "regulatory_framework": {
                                "governing_body": series_config["governing_body"],
                                "allowable_penalties": series_config["sanctioned_penalties"]
                            },
                            "cited_precedent_ids": cited_precedent_ids,
                            "cited_precedents": [
                                {
                                    "id": str(doc["_id"]),
                                    "incident_category": doc.get("incident_category"),
                                    "situation_keywords": doc.get("situation_keywords"),
                                    "summary": doc.get("summary"),
                                    "official_verdict": doc.get("official_verdict"),
                                    "sporting_rule_cited": doc.get("sporting_rule_cited")
                                } for doc in top_precedents
                            ],
                            "telemetry_analysis": {
                                "baseline_brake_point": baseline_brake_point,
                                "baseline_apex_speed": baseline_apex_speed,
                                "active_incident_brake_point": active_incident_brake_point,
                                "active_incident_apex_speed": active_incident_apex_speed,
                                "braking_delta": braking_delta,
                                "speed_delta": speed_delta
                            },
                            "status": "Awaiting Human-in-the-Loop Confirmation"
                        })
            except Exception as ge:
                import traceback
                traceback.print_exc()
                await queue.put({"type": "error", "content": str(ge)})
            finally:
                await queue.put({"type": "done"})

        # 2. Build the dynamic, series-aware penalty grading matrix
        if series_key == "F1":
            penalty_grading_matrix = """
        --- PENALTY GRADING MATRIX (FORMULA 1) ---
        BASELINE: 5S TIME PENALTY for standard single-incident infractions (forcing another car off track, gaining a lasting advantage, minor avoidable contact without significant damage).
        ESCALATION RULES:
          - If telemetry indicates a lateral/longitudinal impact exceeding 3.0G OR the marshal notes describe severe damage (front wing loss, puncture, retirement): escalate to 10S TIME PENALTY.
          - If the incident involves deliberate or reckless driving (e.g., weaving under braking, intentionally crowding a rival into a wall): escalate to DRIVE THROUGH or 10S STOP/GO PENALTY.
          - For minor procedural infractions (e.g., pit lane speeding, unsafe release) with no on-track contact: apply 5S TIME PENALTY or REPRIMAND.
        PROHIBITED: Do NOT issue Long Lap Penalty, Double Long Lap, or Rider-specific sanctions. These do not exist in Formula 1."""
        elif series_key == "MOTOGP":
            penalty_grading_matrix = """
        --- PENALTY GRADING MATRIX (MOTOGP) ---
        BASELINE: LONG LAP PENALTY for standard racing infractions (forcing a rival wide, gaining position via track limits abuse, minor contact during overtaking).
        ESCALATION RULES:
          - If the incident involves dangerous multi-rider corner entry (dive-bombing into a group, causing a crash affecting 2+ riders): escalate to DOUBLE LONG LAP PENALTY.
          - If a rider causes a high-side or crash due to reckless aggression, or a rider's actions endanger marshals or medical staff: escalate to RIDE-THROUGH PENALTY or RIDER DROP POSITION.
          - For repeat offenders within the same race weekend: escalate one tier above the standard penalty.
          - For minor infractions with no contact (e.g., exceeding track limits for advantage): apply WARNING.
        PROHIBITED: Do NOT issue Time Penalties (5S, 10S, etc.) or Stop-and-Go sanctions. These do not exist in MotoGP. The baseline must ALWAYS be Long Lap Penalty, never a time-based penalty."""
        elif series_key == "WEC":
            penalty_grading_matrix = f"""
        --- PENALTY GRADING MATRIX (WEC / ENDURANCE) ---
        INCIDENT CLASS CONTEXT: {f"Offending car class: {payload.driver_class}" if payload.driver_class else "Class not specified."}
        BASELINE: DRIVE-THROUGH PENALTY for standard inter-class incidents where a faster-class car causes avoidable contact with a slower-class vehicle.
        ESCALATION RULES:
          - If the contact results in significant damage, barrier impact, or retirement of the victim car: escalate to STOP-AND-GO 10S or STOP-AND-GO 30S depending on severity.
          - If a HYPERCAR-class driver makes dangerous contact with an LMGT3-class vehicle, the Hypercar bears PRIMARY responsibility. Apply at minimum DRIVE-THROUGH PENALTY.
          - If both cars are in the SAME class: apply standard racing incident protocols with DRIVE-THROUGH PENALTY as baseline, escalating to STOP-AND-GO 10S for reckless maneuvers.
          - For intra-class minor positional infractions with no contact: apply WARNING or TIME PENALTY.
          - For pit-lane infractions (unsafe release, speed violations): apply STOP-AND-GO 10S.
        PROHIBITED: Do NOT issue Long Lap Penalty, Double Long Lap, or single-seater sanctions. These do not exist in WEC."""
        else:
            penalty_grading_matrix = """
        --- PENALTY GRADING MATRIX ---
        No series-specific grading matrix available. Use the Legally Sanctioned Penalties list below as the only source of valid penalty types."""

        # 3. Construct the strictly grounded agentic prompt
        steward_prompt = f"""
        You are the Senior AI Legal Reasoning Copilot for a motorsport Race Control room.
        Your job is to analyze track incidents for human stewards and draft an official ruling statement.

        --- INCIDENT CONTEXT ---
        Championship Series: {payload.series_id}
        Track Location: {payload.track_layout} (Turn {payload.turn_number})
        Track Conditions: {payload.track_conditions}
        Marshal Notes: "{payload.marshal_notes}"
        Additional Context: {f"Driver Class: {payload.driver_class}" if payload.driver_class else "N/A"}
        {precedents_layout}
        {telemetry_delta_report}

        --- GROUNDING REGULATORY BOUNDARIES ---
        Governing Body: {series_config['governing_body']}
        Legally Sanctioned Penalties for this Series: {series_config['sanctioned_penalties']}
        {penalty_grading_matrix}

        --- DYNAMIC EVIDENCE GATHERING DIRECTIVES & SEARCH SPACE SCOPING ---
        You have access to two tools:
        1. `query_sporting_regulations(series_id, query)`: Search for rule articles.
        2. `get_incident_precedents(circuit, turn_number, series_id)`: Search past rulings.

        Before writing your final ruling, you MUST execute these tool calls to gather the necessary governing articles and historical precedents. Do not guess or assume rulebook text.

        Strict Search Space Scoping Controls:
        - If the incident is a track collision, overtaking violation, track limits breach, or driving standards infraction, you MUST restrict your `query_sporting_regulations` keywords to on-track behavior, driving standards, and sporting penalties.
        - You are STRICTLY FORBIDDEN from querying keywords related to paddock logistics, pit lane mechanics' safety equipment, fueling gear, or administrative dress codes unless the Marshal Notes explicitly describe a pit lane or garage violation.
        - Enforce Targeted Queries: Prioritize querying or searching for the exact Article IDs (e.g., "ARTICLE 2.4.1", "WEC_ARTICLE_9_1_11") you uncover during your initial reasoning loop rather than generating broad, loose semantic search phrases.

        --- CRITICAL DIRECTIVES ---
        1. Mandatory Grounding: You must ONLY select a penalty type explicitly listed in the 'Legally Sanctioned Penalties' array above AND consistent with the Penalty Grading Matrix for this series.
        2. Strict Cross-Contamination Guardrail: Never cross-apply penalty frameworks across series. Respect the PROHIBITED constraints in the grading matrix.
        3. Autonomous Grading: Use the BASELINE and ESCALATION RULES from the grading matrix to determine the correct penalty severity. Factor in telemetry G-force values, damage descriptions, and multi-vehicle involvement from the marshal notes.
        4. Historical Precedent Citation: Review the provided 'HISTORICAL INCIDENT PRECEDENTS' above. If relevant precedents are listed, you MUST cite the matching historical case (including its details/verdict) in your analysis text to ensure judicial consistency. Compare its details to the current incident.
        5. No Tool Leakage: STRICTLY FORBIDDEN from referencing developer-facing tool names, database names, or API functions (such as `get_incident_precedents`, `query_sporting_regulations`, `mongodb`, `sql`, etc.) in your final response. Refer to searches using professional human terminology (e.g., "A search of historical precedents was conducted").
        6. Telemetry Delta Integration: You MUST explicitly reference and analyze the baseline values, active values, and calculated variances (deltas) provided in the `MATHEMATICAL TELEMETRY DELTA REPORT` (e.g., braking meter points and apex speed differences) inside your `ANALYSIS` text to justify the ruling.
        7. Structural Output: You must always begin your streamed response with a concise, single-line Markdown blockquote header summarizing the core ruling and specific penalty matrix match. 
        Format it exactly like this:
        > **EXECUTIVE SUMMARY:** [1-sentence definitive breakdown of the incident driver fault, physical variance anomaly, and final sporting penalty sanction]
        
        Follow this immediately with a double newline before moving into the core analysis sections.

        Format the rest of the ruling statement as clean Markdown with these exact headings:

           ### ANALYSIS
           A logical description of the infraction based on the marshal notes and matching regulation clauses. Reference specific rule IDs that you found via the tool query.

           ### CITATION
           List each applicable rule ID and a one-line summary of the relevant clause text.

           ### PROPOSED ADJUDICATION
           State the ruling using this exact two-line format:
           **PENALTY_TYPE:** [The exact penalty name, e.g. "TIME_PENALTY", "LONG_LAP_PENALTY", "DRIVE_THROUGH", "STOP_AND_GO"]
           **INCREMENT:** [The specific value or modifier, e.g. "5 seconds", "10 seconds", "1x Long Lap", "2x Long Lap", "30s hold"]

           After the two-line penalty declaration, provide a brief one-paragraph justification explaining why this specific penalty tier was selected from the grading matrix (baseline vs. escalation) and what factors from the marshal notes drove the decision.
        """

        # --- 4. OPTIONAL PROXY INTEGRATION TO GCP AGENT BUILDER ---
        if settings.GCP_PROJECT_ID and settings.GCP_AGENT_ID:
            session_id = payload.session_id or f"session_{payload.series_id}_{payload.turn_number}"
            parameters = {
                "series_id": payload.series_id,
                "track_layout": payload.track_layout,
                "turn_number": payload.turn_number,
                "track_conditions": payload.track_conditions,
                "marshal_notes": payload.marshal_notes,
                "driver_class": payload.driver_class
            }
            try:
                yield f"data: {json.dumps({'type': 'thinking', 'content': 'Contacting Google Dialogflow CX Agent...'})}\n\n"
                agent_response_text = await call_dialogflow_cx_agent(
                    project_id=settings.GCP_PROJECT_ID,
                    location=settings.GCP_LOCATION or "us-central1",
                    agent_id=settings.GCP_AGENT_ID,
                    session_id=session_id,
                    text=steward_prompt,
                    parameters=parameters
                )
                yield f"data: {json.dumps({'type': 'thinking', 'content': 'Querying matching sporting codes...'})}\n\n"
                matched_rules = []
                found_ids = re.findall(r'\[([A-Z0-9_.-]+)\]', agent_response_text)
                if found_ids:
                    for rule_id in found_ids:
                        rule_doc = await db_manager.sporting_codes.find_one({"_id": rule_id})
                        if rule_doc:
                            matched_rules.append({
                                "rule_id": rule_doc["_id"],
                                "title": rule_doc["title"],
                                "raw_text": rule_doc["raw_text"]
                            })
                if not matched_rules:
                    all_search_terms = extract_search_keywords(payload.marshal_notes)
                    regex_pattern = "|".join([f"(?:{re.escape(term)})" for term in all_search_terms if term])
                    if regex_pattern:
                        cursor = db_manager.sporting_codes.find({
                            "series_id": series_key,
                            "$or": [
                                {"search_tags": {"$regex": regex_pattern, "$options": "i"}},
                                {"title": {"$regex": regex_pattern, "$options": "i"}},
                                {"raw_text": {"$regex": regex_pattern, "$options": "i"}},
                            ]
                        })
                        async for doc in cursor:
                            matched_rules.append({
                                "rule_id": doc["_id"],
                                "title": doc["title"],
                                "raw_text": doc["raw_text"]
                            })
                            if len(matched_rules) >= 3:
                                break
                
                # Stream Dialogflow CX response text chunk by chunk to simulate streaming
                chunk_size = 12
                for i in range(0, len(agent_response_text), chunk_size):
                    chunk = agent_response_text[i:i+chunk_size]
                    yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
                    await asyncio.sleep(0.01)
                
                metadata = {
                    "type": "metadata",
                    "applicable_clauses": matched_rules,
                    "regulatory_framework": {
                        "governing_body": series_config["governing_body"],
                        "allowable_penalties": series_config["sanctioned_penalties"]
                    },
                    "cited_precedent_ids": cited_precedent_ids,
                    "cited_precedents": [
                        {
                            "id": str(doc["_id"]),
                            "incident_category": doc.get("incident_category"),
                            "situation_keywords": doc.get("situation_keywords"),
                            "summary": doc.get("summary"),
                            "official_verdict": doc.get("official_verdict"),
                            "sporting_rule_cited": doc.get("sporting_rule_cited")
                        } for doc in top_precedents
                    ],
                    "telemetry_analysis": {
                        "baseline_brake_point": baseline_brake_point,
                        "baseline_apex_speed": baseline_apex_speed,
                        "active_incident_brake_point": active_incident_brake_point,
                        "active_incident_apex_speed": active_incident_apex_speed,
                        "braking_delta": braking_delta,
                        "speed_delta": speed_delta
                    },
                    "steward_draft_ruling": agent_response_text,
                    "status": "Awaiting Human-in-the-Loop Confirmation"
                }
                yield f"data: {json.dumps(metadata)}\n\n"
                return
            except Exception as e:
                # Graceful local developer fallback
                print(f"GCP Agent Builder proxy failed ({str(e)}). Falling back to local Gemini client loop...")

        # Start background task execution
        generation_task = asyncio.create_task(run_generation())
        full_draft_text = ""
        metadata_received = None

        while True:
            event = await queue.get()
            if event["type"] == "done":
                break
            elif event["type"] == "error":
                yield f"data: {json.dumps({'type': 'error', 'detail': event['content']})}\n\n"
                generation_task.cancel()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"GenAI Loop Interrupted: {event['content']}"
                )
            elif event["type"] == "token":
                full_draft_text += event["content"]
                yield f"data: {json.dumps({'type': 'token', 'content': event['content']})}\n\n"
            elif event["type"] == "thinking":
                yield f"data: {json.dumps({'type': 'thinking', 'content': event['content']})}\n\n"
            elif event["type"] == "metadata":
                metadata_received = event

        if metadata_received:
            metadata_received["steward_draft_ruling"] = full_draft_text
            yield f"data: {json.dumps(metadata_received)}\n\n"

    return StreamingResponse(
        generate_investigation_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.post("/adjudicate", status_code=status.HTTP_201_CREATED)
async def store_final_adjudication(payload: FinalAdjudicationPayload):
    try:
        document = payload.model_dump()
        document["timestamp"] = datetime.now(timezone.utc).isoformat()
        
        result = await db_manager.adjudicated_incidents.insert_one(document)
        
        return {
            "status": "success",
            "message": "Incident judgment logged safely to archive cluster.",
            "inserted_id": str(result.inserted_id)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Storage Interrupted: {str(e)}"
        )

@router.get("/adjudicate", status_code=status.HTTP_200_OK)
async def get_adjudicated_incidents():
    try:
        cursor = db_manager.adjudicated_incidents.find().sort("timestamp", -1)
        incidents = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            incidents.append(doc)
        return incidents
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database Retrieval Interrupted: {str(e)}"
        )

@router.get("/archive", status_code=status.HTTP_200_OK)
async def get_archive_incidents():
    try:
        cursor = db_manager.adjudicated_incidents.find().sort("timestamp", -1)
        incidents = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            incidents.append(doc)
        return incidents
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Archive Retrieval Interrupted: {str(e)}"
        )

@router.get("/regulations", status_code=status.HTTP_200_OK)
async def get_all_regulations():
    try:
        cursor = db_manager.sporting_codes.find()
        rules = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            rules.append(doc)
        return rules
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regulations Retrieval Interrupted: {str(e)}"
        )

@router.post("/ingest/pdf", status_code=status.HTTP_201_CREATED)
async def ingest_regulations_pdf(file: UploadFile = File(...), series: str = Form(...)):
    try:
        series_key = series.upper()
        if series_key not in ["F1", "MOTOGP", "WEC"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported championship series: '{series}'"
            )
            
        file_bytes = await file.read()
        
        extracted_text = extract_pdf_text_with_filters(io.BytesIO(file_bytes), series_key)
                    
        if not extracted_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract any text from the uploaded PDF."
            )
            
        rules = parse_pdf_text(extracted_text, series_key)
        
        if not rules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No sporting regulations were parsed from the PDF using standard Article/Appendix coordinates."
            )
            
        await sync_rules_to_db(rules, series_key)
        
        return {
            "status": "success",
            "message": f"Successfully ingested {len(rules)} regulations from PDF.",
            "rules_count": len(rules),
            "series": series_key
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF Ingestion Pipeline failed: {str(e)}"
        )

# --- 3. SETTINGS CONTROL PLANE VIEWS ---
@router.get("/settings/circuits", status_code=status.HTTP_200_OK)
async def get_circuits():
    try:
        collection = db_manager.db["circuits"]
        count = await collection.count_documents({})
        if count == 0:
            default_circuits = [
                {"name": "Spa-Francorchamps", "turn_count": 20, "championship": "F1", "micro_sectors": "Sector 1: T1-T6; Sector 2: T7-T15; Sector 3: T16-T20"},
                {"name": "Mugello Circuit", "turn_count": 15, "championship": "MotoGP", "micro_sectors": "Sector 1: T1-T5; Sector 2: T6-T9; Sector 3: T10-T15"},
                {"name": "Circuit de la Sarthe", "turn_count": 38, "championship": "WEC", "micro_sectors": "Sector 1: T1-T13; Sector 2: T14-T28; Sector 3: T29-T38"}
            ]
            await collection.insert_many(default_circuits)
        
        cursor = collection.find()
        circuits = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            circuits.append(doc)
        return circuits
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch circuit directory: {str(e)}"
        )

@router.post("/settings/circuits", status_code=status.HTTP_201_CREATED)
async def add_circuit(payload: CircuitConfigPayload):
    try:
        collection = db_manager.db["circuits"]
        doc = payload.model_dump()
        result = await collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return {
            "status": "success",
            "message": "Circuit configuration added successfully.",
            "circuit": doc
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save circuit configuration: {str(e)}"
        )

@router.get("/settings/streams", status_code=status.HTTP_200_OK)
async def get_streams():
    try:
        collection = db_manager.db["telemetry_streams"]
        count = await collection.count_documents({})
        if count == 0:
            default_streams = [
                {"target": "Car #7 Hypercar Live Feed", "protocol": "WebSockets (ws://)", "active": True},
                {"target": "Rider #93 MotoGP Live Feed", "protocol": "MQTT (mqtt://)", "active": False},
                {"target": "Car #44 F1 Live Feed", "protocol": "REST (HTTP Polling)", "active": True}
            ]
            await collection.insert_many(default_streams)
        
        cursor = collection.find()
        streams = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            streams.append(doc)
        return streams
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch telemetry streams: {str(e)}"
        )

@router.post("/settings/streams", status_code=status.HTTP_201_CREATED)
async def add_stream(payload: StreamConfigPayload):
    try:
        collection = db_manager.db["telemetry_streams"]
        doc = payload.model_dump()
        result = await collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return {
            "status": "success",
            "message": "Telemetry stream added successfully.",
            "stream": doc
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save telemetry stream: {str(e)}"
        )

@router.post("/settings/streams/toggle", status_code=status.HTTP_200_OK)
async def toggle_stream(payload: ToggleStreamPayload):
    try:
        from bson import ObjectId
        collection = db_manager.db["telemetry_streams"]
        await collection.update_one(
            {"_id": ObjectId(payload.id)},
            {"$set": {"active": payload.active}}
        )
        return {"status": "success", "message": "Stream toggle updated successfully."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle telemetry stream: {str(e)}"
        )

@router.get("/settings/diagnostics", status_code=status.HTTP_200_OK)
async def get_diagnostics():
    try:
        import time
        import sys

        # 1. MongoDB Connection Latency & Stats
        mongodb_status = "DISCONNECTED"
        mongodb_latency_ms = None
        sporting_codes_count = 0
        circuits_count = 0
        archive_count = 0

        try:
            if db_manager.client is not None:
                start_time = time.time()
                await db_manager.db.command("ping")
                end_time = time.time()
                mongodb_latency_ms = round((end_time - start_time) * 1000, 1)
                mongodb_status = "CONNECTED"

                sporting_codes_count = await db_manager.db["sporting_codes"].count_documents({})
                circuits_count = await db_manager.db["circuits"].count_documents({})
                archive_count = await db_manager.db["adjudicated_incidents"].count_documents({})
        except Exception:
            pass

        # 2. Dynamic Gemini API Connectivity Test
        gemini_status = "DISCONNECTED"
        gemini_latency_ms = None
        gemini_error = None

        try:
            start_time = time.time()
            # Lightweight token generation ping request to check credentials & latency on Vertex AI
            await ai_client.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents='ping'
            )
            end_time = time.time()
            gemini_latency_ms = round((end_time - start_time) * 1000, 1)
            gemini_status = "CONNECTED"
        except Exception as ge:
            gemini_status = "ERROR"
            gemini_error = str(ge)

        # 3. Local MCP Server Script Check
        mcp_status = "DISCONNECTED"
        mcp_error = None
        try:
            mcp_server_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_server.py")
            if os.path.exists(mcp_server_path):
                with open(mcp_server_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                if len(content) > 0:
                    mcp_status = "CONNECTED"
                else:
                    mcp_status = "EMPTY_FILE"
            else:
                mcp_status = "MISSING_FILE"
        except Exception as me:
            mcp_status = "ERROR"
            mcp_error = str(me)

        # 4. Telemetry Stream Pipe Statistics
        active_streams_count = 0
        total_streams_count = 0
        try:
            if db_manager.client is not None:
                active_streams_count = await db_manager.db["streams"].count_documents({"active": True})
                total_streams_count = await db_manager.db["streams"].count_documents({})
        except Exception:
            pass

        return {
            # Flat Legacy Keys for Backwards Compatibility
            "mongodb": mongodb_status,
            "gemini_model": "gemini-2.5-flash",
            "gemini_limit": "Pay-as-you-go / Billing Tier",
            "mcp_server": f"RUNNING ({mcp_status})",
            
            # Rich Nested Telemetry for New Frontend UI
            "mongodb_details": {
                "status": mongodb_status,
                "latency_ms": mongodb_latency_ms,
                "counts": {
                    "sporting_codes": sporting_codes_count,
                    "circuits": circuits_count,
                    "archive": archive_count
                }
            },
            "gemini_details": {
                "status": gemini_status,
                "model": "gemini-2.5-flash",
                "limit": "Pay-as-you-go / Billing Tier",
                "latency_ms": gemini_latency_ms,
                "error": gemini_error
            },
            "mcp_details": {
                "status": mcp_status,
                "error": mcp_error,
                "transport": "STDIO SUBPROCESS",
                "registered_tools": [
                    "analyze_track_incident",
                    "store_final_adjudication"
                ]
            },
            "streams_details": {
                "active_count": active_streams_count,
                "total_count": total_streams_count
            },
            "system_env": {
                "python_version": sys.version.split(" ")[0],
                "server_runtime": "FastAPI (Uvicorn)"
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Diagnostics check failed: {str(e)}"
        )

# --- 4. AUTHENTICATION & STEWARD PROFILE ---
@router.post("/auth/login")
async def login(payload: LoginPayload):
    try:
        collection = db_manager.db["users"]
        # Seed default user if not exists
        default_user = await collection.find_one({"username": "chief_steward"})
        if not default_user:
            seeded_user = {
                "username": "chief_steward",
                "name": "Chief Steward",
                "role": "CHIEF_STEWARD",
                "clearances": ["F1", "MotoGP", "WEC"],
                "password_hash": hash_password("racecontrol2026"),
                "steward_id": "ST-001"
            }
            await collection.insert_one(seeded_user)
            default_user = seeded_user

        user = await collection.find_one({"username": payload.username})
        if not user or not verify_password(payload.password, user.get("password_hash", "")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )

        token_data = {
            "sub": user["username"],
            "role": user["role"],
            "name": user["name"],
            "clearances": user["clearances"]
        }
        token = create_access_token(token_data)
        return {
            "token": token,
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "clearances": user["clearances"],
            "steward_id": user.get("steward_id", "ST-001")
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed: {str(e)}"
        )

@router.get("/auth/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization scheme"
        )
    
    token = parts[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired"
        )
        
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject invalid"
        )
        
    collection = db_manager.db["users"]
    user = await collection.find_one({"username": username})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
        
    return {
        "username": user["username"],
        "name": user["name"],
        "role": user["role"],
        "clearances": user["clearances"],
        "steward_id": user.get("steward_id", "ST-001")
    }