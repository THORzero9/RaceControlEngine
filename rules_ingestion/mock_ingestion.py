import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load variables from the root .env file
load_dotenv(dotenv_path="../.env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "RaceControl_Core")

async def seed_regulatory_data():
    print(f"Connecting to MongoDB Client at: {MONGO_URI}")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    
    # 1. Clear out collections to ensure a completely fresh data start
    print("Clearing old mock data collections...")
    await db["series_configs"].delete_many({})
    await db["sporting_codes"].delete_many({})

    # 2. Add structural penalty configurations for F1, MotoGP, WEC, etc
    print("Injecting championship series frameworks...")
    configs = [
        {
            "_id": "F1_CONFIG",
            "series_name": "Formula 1",
            "governing_body": "FIA",
            "sanctioned_penalties": [
                {"type": "TIME_PENALTY", "increments_seconds": [5, 10]},
                {"type": "STOP_GO", "increments_seconds": [10]}
            ]
        },
        {
            "_id": "MOTOGP_CONFIG",
            "series_name": "MotoGP",
            "governing_body": "FIM",
            "sanctioned_penalties": [
                {"type": "LONG_LAP", "increments_loops": [1, 2]},
                {"type": "POSITION_DROP", "increments_positions": [1, 2]}
            ]
        },
        {
            "_id": "WEC_CONFIG",
            "series_name": "World Endurance Championship",
            "governing_body": "FIA / ACO",
            "sanctioned_penalties": [
                {"type": "DRIVE_THROUGH", "increments_seconds": []},
                {"type": "STOP_GO_HOLD", "increments_seconds": [10, 30, 60]},
                {"type": "FINE_SECONDS", "increments_seconds": [5, 10]}
            ]
        }
    ]
    await db["series_configs"].insert_many(configs)
    
    # 3. Add sample clauses directly from real-world rulebooks
    print("Injecting core sporting code paragraphs...")
    rules = [
        {
            "_id": "FIA_APP_L_CH4_ART2B",
            "series_id": "F1",
            "chapter": "IV",
            "article": "2b",
            "title": "Defending a Position",
            "raw_text": "More than one change of direction to defend a position is not permitted. Any driver moving back towards the racing line, having earlier defended his position off-line, should leave at least one car width between his own car and the edge of the track on the approach to the corner.",
            "search_tags": ["blocking", "weaving", "defending"]
        },
        {
            "_id": "FIM_ART_1_21_2",
            "series_id": "MOTOGP",
            "chapter": "1",
            "article": "1.21.2",
            "title": "Rider Conduct",
            "raw_text": "Riders must ride in a responsible manner which does not cause danger to other competitors or participants, either on the track or in the pit-lane.",
            "search_tags": ["reckless", "collision", "danger"]
        },
        {
            "_id": "WEC_SPORT_ART_10_1_1",
            "series_id": "WEC",
            "chapter": "10",
            "article": "10.1.1",
            "title": "Multi-Class Overtaking Etiquette",
            "raw_text": "It is the responsibility of higher-class cars (Hypercars) to execute overtakes cleanly on lower-class cars (LMGT3) safely. Slower cars must maintain their predictable racing line trajectory and are strictly prohibited from sudden defensive maneuvering when being lapped.",
            "search_tags": ["multiclass", "overtaking", "lapping", "traffic"]
        }
    ]
    await db["sporting_codes"].insert_many(rules)
    
    client.close()
    print("✅ Phase 1: Standalone rule ingestion script executed successfully with WEC integrated!")

if __name__ == "__main__":
    asyncio.run(seed_regulatory_data())