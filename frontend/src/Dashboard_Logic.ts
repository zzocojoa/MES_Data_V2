// src/Dashboard_Logic.ts
import axios from 'axios';
import type { MetricsData, WorkLogData } from './Dashboard_Structure';

const API_BASE_URL = 'http://localhost:8000/api';

export const fetchMetricsData = async (): Promise<MetricsData[]> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/metrics?limit=50`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch metrics data:", error);
    return [];
  }
};

export const fetchWorkLogsData = async (): Promise<WorkLogData[]> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/work_logs?limit=20`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch work logs:", error);
    return [];
  }
};

export const formatKST = (dateString: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
};
