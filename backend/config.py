from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union

class Settings(BaseSettings):
	# Pydantic-settings will scan the .env for these keys
	MONGO_URI: str
	MONGO_DB_NAME: str
	GEMINI_API_KEY: str

	JWT_SECRET: str = "racecontrolsecret2026!!!"
	JWT_ALGORITHM: str = "HS256"
	PASSWORD_SALT: str = "racecontrol_salt_2026"

	CORS_ORIGINS: Union[str, List[str]] = ["http://localhost:5173", "http://localhost:3000"]

	# This configuration maps Pydantic directly to our root directory environment
	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf8",
		extra="ignore"
	)

settings = Settings()
