import os
import sys
from src.Pipeline_Logic import CsvProcessor
import watcher

def main():
    print("=== 스마트팩토리 Data Collector 시작 ===")
    
    if len(sys.argv) < 2:
        print("Usage: python main.py <path_to_csv>")
        sys.exit(1)
        
    csv_path = sys.argv[1]
    
    if not os.path.exists(csv_path):
        print(f"Error: 파일이 존재하지 않습니다 - {csv_path}")
        sys.exit(1)
        
    processor = CsvProcessor()
    
    print(f"Processing CSV via pipeline watcher: {csv_path}")
    watcher.process_file(processor, csv_path)
    
    print("=== 수집기 구동 완료 ===")

if __name__ == "__main__":
    main()
