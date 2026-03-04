// src/Dashboard_Logic.ts
import axios from 'axios';
import type { MetricsData, WorkLogData, UploadedFileMeta } from './Dashboard_Structure';

const API_BASE_URL = '/api';

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

export const fetchStatsData = async (): Promise<any> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/stats`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return null;
  }
};

export const checkUploadedFiles = async (): Promise<UploadedFileMeta[]> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/uploaded_files`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch uploaded files list:", error);
    return [];
  }
};

export const fetchFileLog = async (filename: string): Promise<{status: string, log: string}> => {
  try {
    const response = await axios.get(`${API_BASE_URL}/log/${encodeURIComponent(filename)}`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch file log:", error);
    return { status: "error", log: "Failed to connect to log server." };
  }
};

export const uploadFile = async (file: File, onProgress: (progress: number) => void): Promise<boolean> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
    return response.data.status === 'success';
  } catch (error) {
    console.error("File upload failed:", error);
    return false;
  }
};

export const deleteUploadedFile = async (filename: string): Promise<boolean> => {
  try {
    const response = await axios.delete(`${API_BASE_URL}/uploaded_files/${encodeURIComponent(filename)}`);
    return response.data.status === 'success';
  } catch (error) {
    console.error("Failed to delete uploaded file:", error);
    return false;
  }
};

export const formatKST = (dateString: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
};

export const filterDuplicateFiles = (selectedFiles: File[], uploadedFiles: UploadedFileMeta[]): File[] => {
  const uploadedSet = new Set(uploadedFiles.map(f => f.filename));
  return selectedFiles.filter(f => !uploadedSet.has(f.name));
};

export const processUploadHistoryPaging = (
  uploadedList: UploadedFileMeta[],
  searchTerm: string,
  currentPage: number,
  itemsPerPage: number
) => {
  const filteredHistory = uploadedList.filter(f => f.filename.toLowerCase().includes(searchTerm.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / itemsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safePage - 1) * itemsPerPage;
  const paginated = filteredHistory.slice(startIdx, startIdx + itemsPerPage);
  
  return {
    filteredTotal: filteredHistory.length,
    totalPages,
    safePage,
    paginatedHistory: paginated
  };
};
