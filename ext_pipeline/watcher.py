import os
import time
import shutil
import pandas as pd
from datetime import datetime
from src.processor import CsvProcessor

# 감시할 폴더 경로 설정 (실제 수집 환경에 맞게 수정 가능)
WATCH_DIR = "./data_in"
PROCESSED_DIR = "./data_processed"
ERROR_DIR = "./data_error"

def setup_directories():
    for d in [WATCH_DIR, PROCESSED_DIR, ERROR_DIR]:
        if not os.path.exists(d):
            os.makedirs(d)

def process_work_log(processor, file_path):
    """작업 일지 CSV 파싱 및 bulk insert"""
    print(f"Processing Work Log: {file_path}")
    try:
        df = pd.read_csv(file_path, encoding="utf-8")
    except UnicodeDecodeError:
        df = pd.read_csv(file_path, encoding="cp949")
        
    if df.empty: return
    
    # 시간 변환
    if "start_time" in df.columns:
        df["start_time"] = processor._convert_to_kst(df["start_time"])
    if "end_time" in df.columns:
        df["end_time"] = processor._convert_to_kst(df["end_time"])

    # 필수 컬럼 검사 및 인서트
    processor._bulk_insert_df("tb_work_log", df)

def process_file(processor, file_path):
    """파일명을 기반으로 어떤 파서로 넘길지 결정"""
    filename = os.path.basename(file_path).lower()
    
    try:
        if "spot" in filename or "temperature" in filename:
            processor.process_spot_data(file_path)
        elif "log" in filename or "work" in filename:
            process_work_log(processor, file_path)
        else:
            # 기본적으로 PLC 압출 데이터로 취급
            processor.process_plc_data(file_path)
            
        # 성공 시 이동
        shutil.move(file_path, os.path.join(PROCESSED_DIR, os.path.basename(file_path)))
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        # 실패 시 에러 폴더로 이동
        shutil.move(file_path, os.path.join(ERROR_DIR, os.path.basename(file_path)))

def run_watcher():
    """주기적으로 폴더를 감시하며 새로 들어온 CSV 처리"""
    print(f"[{datetime.now()}] Data Collector 감시 시작... (종료: Ctrl+C)")
    setup_directories()
    processor = CsvProcessor()
    
    while True:
        try:
            for filename in os.listdir(WATCH_DIR):
                if filename.endswith(".csv"):
                    file_path = os.path.join(WATCH_DIR, filename)
                    process_file(processor, file_path)
                    
            time.sleep(5)  # 5초 간격으로 폴더 확인
        except KeyboardInterrupt:
            print("감시 종료")
            break
        except Exception as e:
            print(f"Watcher loop error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    run_watcher()
