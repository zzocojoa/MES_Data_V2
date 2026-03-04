from sqlalchemy import Column, Integer, String, Float, DateTime, Text, text
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from src.database import Base

# ==========================================
# 1. DB Table Structures (SQLAlchemy Models)
# ==========================================
class Metrics_Structure(Base):
    __tablename__ = "tb_metrics"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    main_pressure = Column(Float)
    billet_length = Column(Float)
    container_temp_front = Column(Float)
    container_temp_rear = Column(Float)
    production_counter = Column(Integer)
    current_speed = Column(Float)
    extrusion_end_position = Column(Float)
    temperature = Column(Float)
    mold_1 = Column(Float)
    mold_2 = Column(Float)
    mold_3 = Column(Float)
    mold_4 = Column(Float)
    mold_5 = Column(Float)
    mold_6 = Column(Float)
    billet_temp = Column(Float)
    at_pre = Column(Float)
    at_temp = Column(Float)
    die_id = Column(String(50))
    billet_cycle_id = Column(String(100))
    device_id = Column(String(50))
    source_file = Column(String(255))

class WorkLog_Structure(Base):
    __tablename__ = "tb_work_log"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime(timezone=True), index=True)
    end_time = Column(DateTime(timezone=True))
    machine_id = Column(String(50))
    die_number = Column(String(50))
    lot = Column(String(100))
    temper_type = Column(String(50))
    source_file = Column(String(255))
    op_note = Column(Text)
    production_qty = Column(Float)
    production_weight = Column(Float)
    productivity = Column(Float)
    total_weight = Column(Float)
    actual_unit_weight = Column(Float)
    product_length = Column(Float)
    quenching_temp = Column(Float)
    stretching = Column(Float)
    ram = Column(Float, name='ram')
    start_cut = Column(Float)
    end_cut = Column(Float)
    defect_bubble = Column(Float, server_default=text('0'))
    defect_tearing = Column(Float, server_default=text('0'))
    defect_white_black_line = Column(Float, server_default=text('0'))
    defect_oxide = Column(Float, server_default=text('0'))
    defect_scratch = Column(Float, server_default=text('0'))
    defect_bend = Column(Float, server_default=text('0'))
    defect_dimension = Column(Float, server_default=text('0'))
    defect_line = Column(Float, server_default=text('0'))
    defect_etc = Column(Float, server_default=text('0'))
    created_at = Column(DateTime(timezone=True))

# ==========================================
# 2. API Request/Response Structures (Pydantic)
# ==========================================
class WorkLogCreate_Structure(BaseModel):
    start_time: datetime
    end_time: datetime
    machine_id: str
    die_number: Optional[str] = None
    lot: Optional[str] = None
    temper_type: Optional[str] = None
    op_note: Optional[str] = None
    production_qty: float = 0
    production_weight: float = 0
    defect_bubble: float = 0
    defect_tearing: float = 0
    defect_etc: float = 0
