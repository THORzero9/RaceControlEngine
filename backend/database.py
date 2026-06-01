import sys
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

class DatabaseManager:
    def __init__(self):
        self.client: AsyncIOMotorClient = None
        self.db = None

    async def connect_to_database(self):
        print(f"Opening connection pool to MongoDB Atlas...", file=sys.stderr)
        # Initialize our non-blocking Motor client using our validated URI
        self.client = AsyncIOMotorClient(settings.MONGO_URI)
        self.db = self.client[settings.MONGO_DB_NAME]
        print(" MongoDB connection pool safely established.", file=sys.stderr)
        await self.seed_baseline_if_empty()

    async def seed_baseline_if_empty(self):
        try:
            # 1. Check if series_configs is empty
            config_count = await self.db["series_configs"].count_documents({})
            if config_count == 0:
                print("Seeding baseline series_configs...", file=sys.stderr)
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
                await self.db["series_configs"].insert_many(configs)

            # 2. Check if sporting_codes is empty
            rules_count = await self.db["sporting_codes"].count_documents({})
            if rules_count == 0:
                print("Seeding baseline sporting_codes...", file=sys.stderr)
                rules = [
                    {
                        "_id": "FIA_APP_L_CH4_ART2B",
                        "series_id": "F1",
                        "chapter": "IV",
                        "article": "2b",
                        "title": "Defending a Position",
                        "raw_text": "More than one change of direction to defend a position is not permitted. Any driver moving back towards the racing line, having earlier defended his position off-line, should leave at least one car width between his own car and the edge of the track on the approach to the corner.",
                        "search_tags": ["blocking", "weaving", "defending", "position", "contact"]
                    },
                    {
                        "_id": "FIA_SPORT_ART_2_4_1",
                        "series_id": "F1",
                        "chapter": "II",
                        "article": "2.4.1",
                        "title": "Avoidable Collision",
                        "raw_text": "Any driver who is predominantly responsible for a collision or causing avoidable contact on track will be penalized. In determining responsibility, stewards shall consider telemetry data.",
                        "search_tags": ["contact", "collision", "hit", "avoidable"]
                    },
                    {
                        "_id": "FIM_ART_1_21_2",
                        "series_id": "MOTOGP",
                        "chapter": "1",
                        "article": "1.21.2",
                        "title": "Rider Conduct",
                        "raw_text": "Riders must ride in a responsible manner which does not cause danger to other competitors or participants, either on the track or in the pit-lane.",
                        "search_tags": ["reckless", "collision", "danger", "contact"]
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
                await self.db["sporting_codes"].insert_many(rules)
        except Exception as e:
            print(f"Error during baseline seeding check: {str(e)}", file=sys.stderr)

    async def close_database_connection(self):
        if self.client:
            self.client.close()
            print("MongoDB connection pool closed cleanly.", file=sys.stderr)

    # Explicit properties to access our seeded collections cleanly
    @property
    def series_configs(self):
        return self.db["series_configs"]

    @property
    def sporting_codes(self):
        return self.db["sporting_codes"]

    @property
    def adjudicated_incidents(self):
        return self.db["adjudicated_incidents"]

# Instantiate a single global instance to manage the connection state across the app
db_manager = DatabaseManager()