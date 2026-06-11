import sys
from motor.motor_asyncio import AsyncIOMotorClient
from backend.config import settings

class DatabaseManager:
    def __init__(self):
        self.client: AsyncIOMotorClient = None
        self.db = None

    async def connect_to_database(self, seed: bool = True, max_pool_size: int = 50, min_pool_size: int = 10):
        print(f"Opening connection pool to MongoDB Atlas...", file=sys.stderr)
        # Initialize our non-blocking Motor client using our validated URI with pool optimizations
        self.client = AsyncIOMotorClient(
            settings.MONGO_URI,
            maxPoolSize=max_pool_size,
            minPoolSize=min_pool_size,
            retryWrites=True
        )
        self.db = self.client[settings.MONGO_DB_NAME]
        print(" MongoDB connection pool safely established.", file=sys.stderr)
        if seed:
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

            # 3. Check if incident_precedents is empty
            precedents_count = await self.db["incident_precedents"].count_documents({})
            if precedents_count == 0:
                print("Seeding baseline incident_precedents...", file=sys.stderr)
                precedents = [
                    {
                        "incident_category": "WEC",
                        "situation_keywords": ["multiclass", "hypercar", "lmgt3", "contact", "braking", "collision", "mulsanne"],
                        "summary": "Toyota Hypercar lapping a Porsche LMGT3 at Turn 6 (Mulsanne Corner) initiated a late-braking dive on the inside. Contact was made, spinning the LMGT3 car into the barriers.",
                        "official_verdict": "Drive-Through Penalty for the Hypercar driver (predominantly at fault for avoidable contact during multiclass overtaking).",
                        "sporting_rule_cited": "WEC_ARTICLE_9_1_11"
                    },
                    {
                        "incident_category": "WEC",
                        "situation_keywords": ["blueflag", "ignore", "lapped", "lmgt3", "hypercar", "standards"],
                        "summary": "LMGT3 entry failed to yield to leading Hypercar class vehicle after receiving three consecutive blue flag light panels. Held racing line for three corners, causing the Hypercar to check up.",
                        "official_verdict": "Drive-Through Penalty for ignoring blue flags.",
                        "sporting_rule_cited": "WEC_ARTICLE_10_1_2"
                    },
                    {
                        "incident_category": "WEC",
                        "situation_keywords": ["speeding", "pitlane", "fcy", "fullcourseyellow", "limit"],
                        "summary": "Car exceeded the mandatory 60 km/h pit lane entry speed limit during a Full Course Yellow (FCY) period, registering 78 km/h at the speed trap.",
                        "official_verdict": "Stop-and-Go Penalty (10 seconds hold) for pit lane speeding under FCY.",
                        "sporting_rule_cited": "WEC_ARTICLE_12_3_9"
                    },
                    {
                        "incident_category": "F1",
                        "situation_keywords": ["weaving", "defending", "position", "collision", "contact"],
                        "summary": "Defending car made two consecutive changes of direction on the straight to protect position, forcing the overtaking car to brake and take avoiding action.",
                        "official_verdict": "5-second time penalty applied to defending driver for weaving under defense.",
                        "sporting_rule_cited": "FIA_APP_L_CH4_ART2B"
                    },
                    {
                        "incident_category": "F1",
                        "situation_keywords": ["tracklimits", "whitelist", "exceeded", "warned", "advantage"],
                        "summary": "Driver exceeded track limits for the fourth time during the Grand Prix at Turn 4, crossing the white boundary line with all four wheels after receiving a black-and-white warning flag.",
                        "official_verdict": "5-second time penalty applied to driver for persistent track limits violations.",
                        "sporting_rule_cited": "FIA_SPORTING_ART_33_3"
                    },
                    {
                        "incident_category": "F1",
                        "situation_keywords": ["unsaferelease", "pitlane", "mechanics", "contact", "danger"],
                        "summary": "Team released driver from the pit box directly into the path of an oncoming competitor in the fast lane, forcing the competitor to apply heavy braking to avoid a collision.",
                        "official_verdict": "5-second time penalty applied for unsafe release in pit lane.",
                        "sporting_rule_cited": "FIA_SPORTING_ART_34_14"
                    },
                    {
                        "incident_category": "MOTOGP",
                        "situation_keywords": ["dive-bomb", "dangerous", "collision", "overtaking"],
                        "summary": "Rider attempted an aggressive inside overtake at Turn 1, lost control of the front end, and fell, taking down another rider on the outside.",
                        "official_verdict": "Double Long Lap Penalty applied for reckless riding causing an avoidable collision.",
                        "sporting_rule_cited": "FIM_ART_1_21_2"
                    },
                    {
                        "incident_category": "MOTOGP",
                        "situation_keywords": ["tracklimits", "shortcut", "advantage", "chicane", "timeout"],
                        "summary": "Rider ran off-track at the Turn 4/5 chicane, cutting the corner. Telemetry showed they failed to lose the mandatory 1-second delta on that sector compared to their average time.",
                        "official_verdict": "Long Lap Penalty applied for gaining an advantage by cutting the track.",
                        "sporting_rule_cited": "FIM_ART_1_21_3"
                    },
                    {
                        "incident_category": "MOTOGP",
                        "situation_keywords": ["yellowflag", "ignore", "safety", "practice", "speed"],
                        "summary": "Rider failed to reduce speed or abort their flying lap under double yellow flags displayed at Turn 9 during Qualifying 2, registering a personal best sector time.",
                        "official_verdict": "Q2 lap cancelled and 3-position grid penalty applied for next race.",
                        "sporting_rule_cited": "FIM_ART_1_22_1"
                    }
                ]
                await self.db["incident_precedents"].insert_many(precedents)


            # 4. Check if track_baselines is empty
            baselines_count = await self.db["track_baselines"].count_documents({})
            if baselines_count == 0:
                print("Seeding baseline track_baselines...", file=sys.stderr)
                baselines = [
                    {
                        "series_id": "F1",
                        "track_layout": "Spa-Francorchamps",
                        "turn_number": 1,
                        "baseline_brake_point": 100.0,
                        "baseline_apex_speed": 120.0
                    },
                    {
                        "series_id": "WEC",
                        "track_layout": "Circuit de la Sarthe",
                        "turn_number": 6,
                        "baseline_brake_point": 150.0,
                        "baseline_apex_speed": 85.0
                    },
                    {
                        "series_id": "MOTOGP",
                        "track_layout": "Mugello Circuit",
                        "turn_number": 1,
                        "baseline_brake_point": 200.0,
                        "baseline_apex_speed": 110.0
                    }
                ]
                await self.db["track_baselines"].insert_many(baselines)
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

    @property
    def incident_precedents(self):
        return self.db["incident_precedents"]

    @property
    def track_baselines(self):
        return self.db["track_baselines"]

# Instantiate a single global instance to manage the connection state across the app
db_manager = DatabaseManager()