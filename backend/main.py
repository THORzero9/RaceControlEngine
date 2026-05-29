from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.database import db_manager
from backend.routes import router as incident_router
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(incident_router)

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