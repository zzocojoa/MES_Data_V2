import os
from src.database import engine
from sqlalchemy import text

if __name__ == "__main__":
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE tb_metrics ADD COLUMN IF NOT EXISTS source_file VARCHAR(255);'))
        conn.execute(text('ALTER TABLE tb_work_log ADD COLUMN IF NOT EXISTS source_file VARCHAR(255);'))
        conn.commit()
        print('DB Altered successfully!')
