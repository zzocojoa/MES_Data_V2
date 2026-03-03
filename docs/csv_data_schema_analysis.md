# Extrusion Data - CSV 추출 컬럼 및 데이터베이스 스키마 분석

기존 프로그램([core/transform.py](file:///c:/Users/user/Documents/GitHub/Extrusion_data/core/transform.py), [core/upload.py](file:///c:/Users/user/Documents/GitHub/Extrusion_data/core/upload.py))에서 원본 CSV 파일을 읽어들여 1차 가공(파싱)한 뒤 저장하고 있는 **데이터 구조(스키마)**입니다. 새로운 파이썬 프로그램을 제작하실 때 아래의 스펙을 기준으로 데이터베이스 테이블(PostgreSQL)을 설계하고 데이터를 매핑하시면 됩니다.

---

## 1. PLC 데이터 (압출 공정 데이터)
`tb_metrics` (또는 동일한 구조의 시계열 테이블)에 저장되는 압출기의 1초 단위 실시간 데이터입니다.

### [기본 추출 컬럼]
| DB 컬럼명 | 원본 CSV 예측 헤더 | 데이터 형식 (PostgreSQL) | 설명 |
| :--- | :--- | :--- | :--- |
| [timestamp](file:///c:/Users/user/Documents/GitHub/Extrusion_data/core/upload.py#108-130) | Time, 시간, 시각 (파일명 결합) | `TIMESTAMPTZ` | KST 기준으로 변환된 ISO 8601 시간 |
| `main_pressure` | 메인압력, 메인 압력 | `NUMERIC` 또는 `REAL` | 압출 메인 압력 |
| `billet_length` | 빌렛길이, 빌렛 길이 | `NUMERIC` 또는 `REAL` | 투입된 빌렛의 길이 |
| `container_temp_front` | 콘테이너온도 앞쪽 | `NUMERIC` 또는 `REAL` | 컨테이너 전면 온도 |
| `container_temp_rear` | 콘테이너온도 뒤쪽 | `NUMERIC` 또는 `REAL` | 컨테이너 후면 온도 |
| `production_counter` | 생산카운터, 생산카운트 | `INTEGER` | 생산 카운터 (사이클/빌렛 번호 형태) |
| `current_speed` | 현재속도, 현재 속도 | `NUMERIC` 또는 `REAL` | 현재 압출 속도 |
| `extrusion_end_position` | 압출종료 위치, 압출종료위치 | `NUMERIC` | 설정된 압출 종료 위치 |

### [확장 추출 컬럼 (통합 로그 CSV인 경우)]
만약 CSV에 아래와 같은 확장 컬럼이 있다면 함께 추출합니다.
| DB 컬럼명 | 원본 CSV 헤더 | 데이터 형식 | 설명 |
| :--- | :--- | :--- | :--- |
| `temperature` | Temperature | `NUMERIC` | 제품 온도 |
| `mold_1` ~ `mold_6` | Mold1 ~ Mold6 | `NUMERIC` | 금형 구역별 온도 (6개 컬럼) |
| `billet_temp` | Billet_Temp | `NUMERIC` | 빌렛 온도 |
| `at_pre` | At_Pre | `NUMERIC` | (AT 관련 압력 등) |
| `at_temp` | At_Temp | `NUMERIC` | (AT 관련 온도 등) |
| `die_id` | DIE_ID | `TEXT` (또는 `VARCHAR`) | 현재 장착된 금형 ID |
| `billet_cycle_id` | Billet_CycleID | `TEXT` | 빌렛 사이클 교유 ID |

---

## 2. 온도 데이터 (열화상 SPOT 데이터)
마찬가지로 `tb_metrics`에 함께 병합되거나 별도로 저장되는 제품 실시간 온도 데이터입니다.

| DB 컬럼명 | 원본 CSV 예측 헤더 | 데이터 형식 | 설명 |
| :--- | :--- | :--- | :--- |
| [timestamp](file:///c:/Users/user/Documents/GitHub/Extrusion_data/core/upload.py#108-130) | Date + Time, 날짜시간 등 | `TIMESTAMPTZ` | KST 시각 |
| `device_id` | *(고정값)* | `TEXT` | `spot_temperature_sensor` 고정 |
| `temperature` | temperature, 온도, temp | `NUMERIC` | 측정된 표면 온도 |

---

## 3. 작업 일지 데이터 (Work Log)
`tb_work_log` 테이블에 저장되며, 작업자 또는 시스템이 1회성(Billet/로트 단위)으로 남기는 실적 및 불량 데이터입니다.

| 범주 | DB 컬럼명 | 데이터 형식 |
| :--- | :--- | :--- |
| **기본 정보** | `start_time`, `end_time` | `TIMESTAMPTZ` |
| | `machine_id` | `TEXT` |
| | `die_number` | `NUMERIC` (또는 `TEXT`) |
| | `lot`, `temper_type`, `op_note` | `TEXT` |
| **생산 실적** | `production_qty`, `production_weight` | `NUMERIC` |
| | `productivity`, `total_weight` | `NUMERIC` |
| | `actual_unit_weight`, `product_length` | `NUMERIC` |
| **공정 조건** | `quenching_temp`, `stretching`, `ram` | `NUMERIC` |
| **절단 치수** | `start_cut`, `end_cut` | `NUMERIC` |
| **결함(불량)** | `defect_bubble`, `defect_tearing` | `NUMERIC` (수량/무게 등) |
| | `defect_white_black_line`, `defect_oxide` | `NUMERIC` |
| | `defect_scratch`, `defect_bend` | `NUMERIC` |
| | `defect_dimension`, `defect_line`| `NUMERIC` |
| | `defect_etc` | `NUMERIC` |

---

### 💡 새 프로그램 개발 시 추천 사항
기존 파이썬 코드는 Supabase의 API에 맞추느라 데이터를 한 번에 전송하지 못하고 복잡하게 500개씩 청크(Batch)로 잘라서 HTTP 통신을 했습니다.
새로운 프로그램을 작성하실 때는 **`psycopg2`나 `SQLAlchemy`를 사용하여 데이터베이스에 수만 건의 데이터를 1초 만에 직접 밀어 넣는 `COPY` (bulk insert) 방식**을 적용하시면 성능이 수십 배 이상 비약적으로 향상됩니다.
