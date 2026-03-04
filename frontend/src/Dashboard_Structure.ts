// src/Dashboard_Structure.ts
export interface MetricsData {
  id: number;
  timestamp: string;
  main_pressure: number;
  billet_length: number;
  container_temp_front: number;
  container_temp_rear: number;
  production_counter: number;
  current_speed: number;
  extrusion_end_position: number;
  temperature?: number;
  mold_1?: number;
  device_id?: string;
  die_id?: string;
  displayTime?: string;
}

export interface WorkLogData {
  id: number;
  start_time: string;
  end_time: string;
  machine_id: string;
  die_number: string;
  lot: string;
  production_qty: number;
  defect_bubble: number;
  defect_tearing: number;
  defect_etc: number;
}

export interface DBStatsData {
  total_records: number;
  last_sync: string | null;
  todays_files: number;
  storage_size: string;
}

export interface UploadedFileMeta {
  filename: string;
  target_db: string;
  timestamp: string;
  size: number;
}

