from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://cam_user:cam_pass@localhost:5432/cam_platform"
    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "dev-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET: str = "cam-platform-docs"

    ANTHROPIC_API_KEY: str = ""

    # Slice API Configuration
    SLICE_API_BASE_URL: str = "https://api.uat-nebank.com"
    SLICE_ACCESS_TOKEN: str = ""
    SLICE_VKYC_BASE_URL: str = "https://api.nebank.com"

    ENVIRONMENT: str = "development"

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"


settings = Settings()
