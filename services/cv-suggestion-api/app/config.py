from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    cv_relay_token: str = Field(min_length=16)
    ollama_base_url: str = 'http://host.containers.internal:11434'
    ollama_model: str = Field(min_length=1)
    rate_limit_requests: int = 30
    rate_limit_window_seconds: int = 600
    max_client_keys: int = 10_000
    ollama_concurrency: int = 2
    concurrency_wait_seconds: float = 2
