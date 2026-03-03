import os
from src.processor import CsvProcessor

def main():
    print("=== 스마트팩토리 Data Collector 시작 ===")
    
    processor = CsvProcessor()
    
    # 임시 테스트 더미 데이터 생성 및 테스트
    import pandas as pd
    from datetime import datetime
    
    # PLC 데이터 더미 파일 생성
    plc_dummy = pd.DataFrame({
        "Time": [datetime.now()],
        "메인압력": [215.4],
        "빌렛길이": [650.0],
        "콘테이너온도 앞쪽": [420.5],
        "콘테이너온도 뒤쪽": [418.2],
        "생산카운터": [1001],
        "현재속도": [12.5],
        "압출종료 위치": [15.2]
    })
    
    if not os.path.exists("test_data"):
        os.makedirs("test_data")
        
    plc_dummy.to_csv("test_data/dummy_plc.csv", index=False)
    
    # 1. 처리 실행 (파싱 및 벌크 인서트)
    processor.process_plc_data("test_data/dummy_plc.csv")
    
    print("=== 수집기 구동 테스트 완료 ===")

if __name__ == "__main__":
    main()
