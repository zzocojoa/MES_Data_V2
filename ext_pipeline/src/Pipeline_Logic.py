import os
import pandas as pd
from io import StringIO
from src.db import DatabaseManager
from src.Pipeline_Structure import (
    PLC_COLUMN_MAPPING_STRUCTURE,
    PLC_EXPECTED_COLS_STRUCTURE,
    SPOT_COLUMN_MAPPING_STRUCTURE,
    SPOT_AVAILABLE_COLS_STRUCTURE
)

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
        df.rename(columns=PLC_COLUMN_MAPPING_STRUCTURE, inplace=True)
        
        # 2. Add standard fields if not exists
        if "timestamp" in df.columns:
            df["timestamp"] = self._convert_to_kst(df["timestamp"])
        else:
            print("Warning: No timestamp column found. Skipping file.")
            return

        # Prepare for DB
        existing_cols = []
        
        for col in PLC_EXPECTED_COLS_STRUCTURE:
            if col in df.columns:
                existing_cols.append(col)
                
        df_to_insert = df[existing_cols].copy()
        df_to_insert["source_file"] = os.path.basename(csv_path)
        
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
        df.rename(columns=SPOT_COLUMN_MAPPING_STRUCTURE, inplace=True)
        
        if "timestamp" in df.columns:
            df["timestamp"] = self._convert_to_kst(df["timestamp"])
            
        df["device_id"] = "spot_temperature_sensor"
        
        # Select what exists
        available_cols = []
        for c in SPOT_AVAILABLE_COLS_STRUCTURE:
            if c in df.columns: available_cols.append(c)
            
        df_to_insert = df[available_cols].copy()
        df_to_insert["source_file"] = os.path.basename(csv_path)
        self._bulk_insert_df("tb_metrics", df_to_insert)

    def _bulk_insert_df(self, table_name, df):
        """Uses psycopg2 COPY_FROM method to insert thousands of rows instantly."""
        if df.empty:
            print(f"Skipping insert for {table_name}, DataFrame consists of no records")
            return
            
        # Coerce non-numeric values (empty strings, garbage) to NaN for numeric columns
        # Then convert integer-like columns to nullable Int64 so to_csv writes '3' not '3.0'
        INT_COLUMNS = {'production_counter', 'billet_length', 'mold_1', 'mold_2', 'mold_3', 
                       'mold_4', 'mold_5', 'mold_6', 'billet_temp', 'at_pre'}
        for col in df.columns:
            if col not in ['source_file', 'device_id', 'timestamp']:
                df[col] = pd.to_numeric(df[col], errors='coerce')
                if col in INT_COLUMNS:
                    df[col] = df[col].astype('Int64')
        
        # pandas to_csv writes NaN/NA as empty string by default
        # psycopg2 copy_from with null='' treats empty strings as SQL NULL
        buffer = StringIO()
        df.to_csv(buffer, index=False, header=False, sep='\t')
        buffer.seek(0)
        
        columns = df.columns.tolist()
        
        conn = self.db.get_connection()
        try:
            with conn.cursor() as cur:
                cur.copy_from(buffer, table_name, sep='\t', columns=columns, null='')
            conn.commit()
            print(f"Successfully inserted {len(df)} records into {table_name}.")
        except Exception as e:
            conn.rollback()
            print(f"Failed to bulk insert into {table_name}: {e}")
        finally:
            conn.close()
