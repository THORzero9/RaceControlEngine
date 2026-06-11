# Race Control Adjudication Engine

An agentic, multi-series motorsport incident reasoning co-pilot designed for championship stewards officiating Formula 1 (FIA), MotoGP (FIM), and World Endurance Championship (ACO) events.

The system combines a non-blocking FastAPI backend, a React/Tailwind visual cockpit, and a Gemini-powered agentic loop communicating over the Model Context Protocol (MCP) to analyze marshal notes, look up relevant regulations, retrieve precedents, and propose structured penalties.

---

## Key System Architecture

### 1. Agentic Adjudication Loop & Real-Time Event Streaming
* **Server-Sent Events (SSE) Streaming**: Supports real-time streaming of both the agent's internal thinking logs (MCP tool executions, keyword searches, precedent lookups) and raw Markdown ruling tokens sequentially.
* **RAG Precedents & Series Isolation**: Queries, scores, and injects relevant historical incident precedents from the database. Prevents cross-contamination by strictly isolating lookups to the governing series' boundaries (F1, MotoGP, WEC).
* **Mathematical Telemetry Delta Calculator**: Computes physical variances (deltas) between baseline track telemetry (braking points, apex speeds) and incident telemetry in real-time, injecting delta calculations into the LLM system prompt.
* **Custom MCP Session Interceptor**: Integrates custom tool intercepts to capture exact sporting article IDs and extract matching regulatory clauses.
* **Dynamic Scoping Boundaries**: Restricts the model's search spaces to on-track behavior, track limits, and driving standards, preventing paddock logistics or clothing regulations from polluting the UI.

### 2. Full-Page Control Plane (Settings)
* **Circuits Register**: Directory of active tracks with championship affinity mapping and total turn counts. Includes integer turn count validation forms.
* **Telemetry Streams Manager**: Interactive dashboard to connect/disconnect live MQTT, WebSocket, or REST telemetry feeds.
* **Diagnostics Health Matrix**: On-demand checks of MongoDB Atlas connections (with live collection counting and latency testing), active Vertex-enabled Gemini model configuration, and local MCP studio process states.

### 3. Stateless JWT Checkpoint & Steward Dossier
* **Secure Entry Gate**: State-intercepted LoginPage requiring authentication before viewport access is authorized.
* **Steward Dossier Profile**: Displays the steward's active role badge (`CHIEF_STEWARD`), ST ID, and series clearances (F1, MotoGP, WEC).
* **Signed Adjudication Journal**: Pulls logs from the Atlas database and isolates the adjudications officially approved by the logged-in steward.
* **Draggable Workspace Grid**: Fully responsive three-column grid featuring hover-reactive resizer handles, allowing stewards to dynamically adjust panel widths.
* **High-Fidelity Telemetry Loader**: Custom WebGL 3D floor grid paired with a vector telemetry tracer displaying glowing neon comets lapping Spa-Francorchamps at a steady, premium pace.
* **Low-Profile Copy Button**: Tactical `[⎘ Copy Report]` utility with a 2-second visual feedback timeout.

---

## Tech Stack
* **Backend**: Python 3.11+, FastAPI, MongoDB Atlas (via `motor` async driver), PyJWT, Google GenAI SDK.
* **Frontend**: React, Vite, TailwindCSS, Material Symbols.
* **Interprocess Protocol**: Model Context Protocol (MCP stdio).

---

## Configuration & Environment Setup

Create a `.env` file in the root directory:
```env
MONGO_URI=your_mongodb_atlas_connection_string
MONGO_DB_NAME=RaceControl_Core
GEMINI_API_KEY=your_gemini_api_key_here  # Optional if running on GCP with Vertex AI
GCP_PROJECT_ID=your_gcp_project_id_here  # Required if using Vertex AI routing
GCP_REGION=us-central1
# Optional configuration (defaults are provided but should be overridden in production)
JWT_SECRET=your_secure_jwt_secret_here
PASSWORD_SALT=your_secure_password_salt_here
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Backend Setup
1. Create and activate a virtual environment:
   ```bash
   python3 -m venv v_env
   source v_env/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Run the FastAPI development server:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Boot the Vite development server:
   ```bash
   npm run dev
   ```

---

## Out-of-the-Box Credentials
The database automatically seeds an administrative chief steward profile upon the first sign-on attempt:
* **Username**: `chief_steward`
* **Password**: `racecontrol2026`

---

## Code Verification & Validation
A unified verification script is available in the root folder to confirm backend routing syntax compiles cleanly and the Vite production asset bundle builds successfully:
```bash
python3 validate_sprint.py
```
To run backend unit tests:
```bash
PYTHONPATH=. pytest backend/tests
```
