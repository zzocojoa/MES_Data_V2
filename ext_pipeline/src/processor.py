import os
import pandas as pd
from io import StringIO
from src.db import DatabaseManager

class CsvProcessor:
    def __init__(self):
        self.db = DatabaseManager()

    def _convert_to_kst(self, dt_series):
        """Converts datetime series to timezone-aware KST (Asia/Seoul)."""
        dt_series = pd.to_datetime(dt_series, errors="coerce")
        if dt_series.dt.tz is None:
            dt_series = dt_series.dt.tz_localize("Asia/Seoul")
        else:
            dt_series = dt_series.dt.tz_convert("Asia/Seoul")
        return dt_series

    def process_plc_data(self, csv_path):
        """
        Parses PLC extrusion data logs and bulk inserts into tb_metrics.
        Extracts metrics matching the schema from docs/csv_data_schema_analysis.md.
        """
        print(f"Processing PLC CSV: {csv_path}")
        
        try:
            # Read CSV
            df = pd.read_csv(csv_path, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding="cp949")
            
        if df.empty:
            print("CSV is empty.")
            return

        # 1. Map Columns based on schema
        # (Assuming standard column names exist, adjust based on actual CSV contents)
        col_mapping = {
            "Time": "timestamp",
            "시간": "timestamp",
            "시각": "timestamp",
            
            "메인압력": "main_pressure",
            "메인 압력": "main_pressure",
            
            "빌렛길이": "billet_length",
            "빌렛 길이": "billet_length",
            
            "콘테이너온도 앞쪽": "container_temp_front",
            "콘테이너온도 뒤쪽": "container_temp_rear",
            
            "생산카운터": "production_counter",
            "생산카운트": "production_counter",
            
            "현재속도": "current_speed",
            "현재 속도": "current_speed",
            
            "압출종료위치": "extrusion_end_position",
            "압출종료 위치": "extrusion_end_position"
        }
        
        df.rename(columns=col_mapping, inplace=True)
        
        # 2. Add standard fields if not exists
        if "timestamp" in df.columns:
            df["timestamp"] = self._convert_to_kst(df["timestamp"])
        else:
            print("Warning: No timestamp column found. Skipping file.")
            return

        # Prepare for DB
        existing_cols = []
        expected_cols = [
            "timestamp", "main_pressure", "billet_length", 
            "container_temp_front", "container_temp_rear", 
            "production_counter", "current_speed", "extrusion_end_position"
        ]
        
        for col in expected_cols:
            if col in df.columns:
                existing_cols.append(col)
                
        df_to_insert = df[existing_cols].copy()
        
        # 3. Bulk Insert (Ultra-fast COPY method via StringIO)
        self._bulk_insert_df("tb_metrics", df_to_insert)

    def process_spot_data(self, csv_path):
        """Parses SPOT temperature CSV and bulk inserts into tb_metrics."""
        print(f"Processing SPOT Check CSV: {csv_path}")
        
        try:
            df = pd.read_csv(csv_path, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding="cp949")

        if df.empty: return

        # Spot typical mapping
        col_mapping = {
            "Time": "timestamp",
            "Date": "timestamp",
            "Temperature": "temperature",
            "온도": "temperature",
            "temp": "temperature"
        }
        df.rename(columns=col_mapping, inplace=True)
        
        if "timestamp" in df.columns:
            df["timestamp"] = self._convert_to_kst(df["timestamp"])
            
        df["device_id"] = "spot_temperature_sensor"
        
        # Select what exists
        available_cols = []
        for c in ["timestamp", "temperature", "device_id"]:
            if c in df.columns: available_cols.append(c)
            
        df_to_insert = df[available_cols].copy()
        self._bulk_insert_df("tb_metrics", df_to_insert)

    def _bulk_insert_df(self, table_name, df):
        """Uses psycopg2 COPY_FROM method to insert thousands of rows instantly."""
        if df.empty:
            print(f"Skipping insert for {table_name}, DataFrame consists of no records")
            return
            
        # Clean null values
        df.fillna('', inplace=True)

        buffer = StringIO()
        df.to_csv(buffer, index=False, header=False, sep='\t')
        buffer.seek(0)
        
        columns = df.columns.tolist()
        
        conn = self.db.get_connection()
        try:
            with conn.cursor() as cur:
                # Direct load from string memory buffer
                cur.copy_from(buffer, table_name, sep='\t', columns=columns, null='')
            conn.commit()
            print(f"Successfully inserted {len(df)} records into {table_name}.")
        except Exception as e:
            conn.rollback()
            print(f"Failed to bulk insert into {table_name}: {e}")
        finally:
            conn.close()
