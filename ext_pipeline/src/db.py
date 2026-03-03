import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

class DatabaseManager:
    def __init__(self):
        self.host = os.getenv("DB_HOST", "192.168.0.235")
        self.port = os.getenv("DB_PORT", "5433")
        self.user = os.getenv("DB_USER", "postgres")
        self.password = os.getenv("DB_PASSWORD", "aldmc6061")
        self.dbname = os.getenv("DB_NAME", "postgres")
        
    def get_connection(self):
        """Returns a psycopg2 connection object."""
        try:
            conn = psycopg2.connect(
                host=self.host,
                port=self.port,
                user=self.user,
                password=self.password,
                dbname=self.dbname,
                options="-c search_path=public"
            )
            return conn
        except Exception as e:
            print(f"[DB_ERROR] Failed to connect to database: {e}")
            raise
