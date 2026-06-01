from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union, Optional

class Settings(BaseSettings):
	# Pydantic-settings will scan the .env for these keys
	MONGO_URI: str
	MONGO_DB_NAME: str
	GEMINI_API_KEY: str

	JWT_SECRET: str
	PASSWORD_SALT: str
	JWT_ALGORITHM: str = "HS256"

	CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:5173", "http://localhost:3000"]

	GCP_PROJECT_ID: Optional[str] = None
	GCP_LOCATION: Optional[str] = "us-central1"
	GCP_AGENT_ID: Optional[str] = None
	GCP_AUDIENCE: Optional[str] = None

	# This configuration maps Pydantic directly to our root directory environment
	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf8",
		extra="ignore"
	)

settings = Settings()
