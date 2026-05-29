from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
	# Pydantic-settings will scan the .env for these keys
	MONGO_URI: str
	MONGO_DB_NAME: str
	GEMINI_API_KEY: str

	# This configuration maps Pydantic directly to our root directory environment
	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf8",
		extra="ignore"
	)

settings = Settings()