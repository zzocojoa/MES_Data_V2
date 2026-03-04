# src/Pipeline_Structure.py

PLC_COLUMN_MAPPING_STRUCTURE = {
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

PLC_EXPECTED_COLS_STRUCTURE = [
    "timestamp", "main_pressure", "billet_length", 
    "container_temp_front", "container_temp_rear", 
    "production_counter", "current_speed", "extrusion_end_position"
]

SPOT_COLUMN_MAPPING_STRUCTURE = {
    "Time": "timestamp",
    "Date": "timestamp",
    "Temperature": "temperature",
    "온도": "temperature",
    "temp": "temperature"
}

SPOT_AVAILABLE_COLS_STRUCTURE = ["timestamp", "temperature", "device_id"]
