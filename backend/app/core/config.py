from dotenv import load_dotenv
import os

load_dotenv()


class Settings:

    SECRET_KEY = os.getenv("SECRET_KEY", "prod_fallback_secret_7788")

    ALGORITHM = os.getenv("ALGORITHM", "HS256")

    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 10080))


settings = Settings()
