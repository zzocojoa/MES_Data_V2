-- =========================================================================
-- 스마트팩토리 데이터 파이프라인 (MES_Data_V2) DB 스키마 초기화 스크립트
-- =========================================================================
-- 목적: Synology NAS에 구동될 순정 PostgreSQL 15 용 초기 테이블 생성
-- 작성일: 2026-03-03
-- =========================================================================

-- 1. tb_metrics (시계열 데이터 테이블)
-- 압출 공정(PLC) 데이터 및 열화상(SPOT) 온도 데이터를 통합 저장
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_metrics (
    id SERIAL PRIMARY KEY,
    "timestamp" TIMESTAMPTZ NOT NULL,            -- KST 기준 ISO 8601 시간
    
    -- 기본 압출 데이터 (PLC)
    main_pressure REAL,                         -- 메인 압력
    billet_length REAL,                         -- 빌렛 길이
    container_temp_front REAL,                  -- 콘테이너전면 온도
    container_temp_rear REAL,                   -- 콘테이너후면 온도
    production_counter INTEGER,                 -- 생산 카운터
    current_speed REAL,                         -- 현재 압출 속도
    extrusion_end_position REAL,                -- 압출종료 위치
    
    -- 확장 데이터 (PLC 통합 로그 시)
    temperature REAL,                           -- 제품 온도 통합시 사용
    mold_1 REAL,                                -- Mold1 온도
    mold_2 REAL,                                -- Mold2 온도
    mold_3 REAL,                                -- Mold3 온도
    mold_4 REAL,                                -- Mold4 온도
    mold_5 REAL,                                -- Mold5 온도
    mold_6 REAL,                                -- Mold6 온도
    billet_temp REAL,                           -- 빌렛 온도
    at_pre REAL,                                -- AT 압력
    at_temp REAL,                               -- AT 온도
    die_id VARCHAR(50),                         -- 금형 ID
    billet_cycle_id VARCHAR(100),               -- 빌렛 사이클 ID
    
    -- 열화상 온도 데이터 전용 (SPOT)
    device_id VARCHAR(50)                       -- 측정 장비 식별 (예: 'spot_temperature_sensor')
);

-- 타임스탬프 기반 조회가 잦으므로 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_tb_metrics_timestamp ON tb_metrics ("timestamp" DESC);


-- -------------------------------------------------------------------------
-- 2. tb_work_log (작업 일지 테이블)
-- 작업자 또는 시스템이 Billet/로트 단위로 기록하는 실적 및 불량 정보
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tb_work_log (
    id SERIAL PRIMARY KEY,
    
    -- 기본 정보
    start_time TIMESTAMPTZ,                     -- 작업 시작 시간
    end_time TIMESTAMPTZ,                       -- 작업 종료 시간
    machine_id VARCHAR(50),                     -- 설비 ID
    die_number VARCHAR(50),                     -- 금형 번호 (숫자/문자 혼용 고려 TEXT)
    lot VARCHAR(100),                           -- 로트 번호
    temper_type VARCHAR(50),                    -- 템퍼/재질 종류
    op_note TEXT,                               -- 작업자 비고란
    
    -- 생산 실적
    production_qty REAL,                        -- 생산 수량
    production_weight REAL,                     -- 생산 중량
    productivity REAL,                          -- 생산성 지표
    total_weight REAL,                          -- 총 중량
    actual_unit_weight REAL,                    -- 실 단위 중량
    product_length REAL,                        -- 제품 길이
    
    -- 공정 조건
    quenching_temp REAL,                        -- 퀜칭 온도
    stretching REAL,                            -- 스트레칭 조건
    "ram" REAL,                                 -- 램 조건
    
    -- 절단 치수
    start_cut REAL,                             -- 시작 절단 치수
    end_cut REAL,                               -- 종료 절단 치수
    
    -- 결함 (불량 데이터)
    defect_bubble REAL DEFAULT 0,               -- 기포 불량
    defect_tearing REAL DEFAULT 0,              -- 찢김 불량
    defect_white_black_line REAL DEFAULT 0,     -- 흑백선 불량
    defect_oxide REAL DEFAULT 0,                -- 산화물 불량
    defect_scratch REAL DEFAULT 0,              -- 스크래치 불량
    defect_bend REAL DEFAULT 0,                 -- 휨 불량
    defect_dimension REAL DEFAULT 0,            -- 치수 불량
    defect_line REAL DEFAULT 0,                 -- 라인 마크 불량
    defect_etc REAL DEFAULT 0,                  -- 기타 불량
    
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP -- 레코드 생성 시간
);

-- 시작 시간을 기준으로 정렬/조회를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_tb_work_log_start_time ON tb_work_log (start_time DESC);
