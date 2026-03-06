import os
import time
import shutil
import pandas as pd
from datetime import datetime
from src.Pipeline_Logic import CsvProcessor

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
    df["source_file"] = os.path.basename(file_path)
    processor._bulk_insert_df("tb_work_log", df)

def process_file(processor, file_path):
    """파일명을 기반으로 어떤 파서로 넘길지 결정하고 처리결과를 로그 파일로 남김"""
    filename = os.path.basename(file_path)
    filename_lower = filename.lower()
    
    log_messages = []
    log_messages.append(f"[{datetime.now().isoformat()}] INFO: Started processing {filename}")
    
    try:
        t0 = time.time()
        if "spot" in filename_lower or "temperature" in filename_lower:
            log_messages.append("INFO: Routing to process_spot_data (tb_metrics)...")
            processor.process_spot_data(file_path)
        elif "work" in filename_lower or ("log" in filename_lower and "factory_integrated" not in filename_lower):
            log_messages.append("INFO: Routing to process_work_log (tb_work_log)...")
            process_work_log(processor, file_path)
        else:
            # 기본적으로 PLC 압출 데이터로 취급 (Factory_Integrated_Log 등)
            log_messages.append("INFO: Routing to process_plc_data (tb_metrics)...")
            processor.process_plc_data(file_path)
            
        elapsed = time.time() - t0
        log_messages.append(f"[{datetime.now().isoformat()}] SUCCESS: Bulk insert completed in {elapsed:.2f} seconds.")
        
        # 성공 시 원본 CSV 영구 삭제 (DB-Only 보관 정책)
        dest_log_path = os.path.join(PROCESSED_DIR, f"{filename}.log")
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # 처리 로그 저장
        with open(dest_log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(log_messages))
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error processing {file_path}: {e}")
        log_messages.append(f"[{datetime.now().isoformat()}] ERROR: Exception occurred during parsing or DB insertion:")
        log_messages.append(error_trace)
        
        # 실패 시 에러 폴더로 복사 후 원본 삭제 (cross-device link 에러 방지)
        dest_path = os.path.join(ERROR_DIR, filename)
        if os.path.exists(file_path):
            try:
                shutil.copy2(file_path, dest_path)
                os.remove(file_path)
            except Exception as move_err:
                print(f"Failed to copy/remove file to error directory: {move_err}")
                log_messages.append(f"[{datetime.now().isoformat()}] ERROR: Failed to move file: {move_err}")
        
        # 에러 로그 저장
        with open(dest_path + ".log", "w", encoding="utf-8") as f:
            f.write("\n".join(log_messages))

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
