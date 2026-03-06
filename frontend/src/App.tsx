import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DBStatsData, UploadedFileMeta } from './Dashboard_Structure';
import { fetchStatsData, formatKST, checkUploadedFiles, uploadFile, fetchFileLog, deleteUploadedFile, filterDuplicateFiles, processUploadHistoryPaging } from './Dashboard_Logic';

function App() {
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<DBStatsData | null>(null);
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  
  // View / Delete File
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [currentViewLogName, setCurrentViewLogName] = useState("");
  const [currentLogContent, setCurrentLogContent] = useState("");
  const [isLogLoading, setIsLogLoading] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isDuplicateFilterActive, setIsDuplicateFilterActive] = useState(true);
  const [uploadedList, setUploadedList] = useState<UploadedFileMeta[]>([]);

  // Search/Filter state
  const [isSearching, setIsSearching] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(30);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);

  // Upload progress states
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isStoppedRef = useRef(false); // Use ref to immediately break the async loop
  const isPausedRef = useRef(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [isFailedModalOpen, setIsFailedModalOpen] = useState<boolean>(false);

  // Upload Result State
  const [uploadResult, setUploadResult] = useState<{success: number; failed: number; total: number; failedNames: string[]} | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  // Notification History State
  type Notification = { id: number; success: number; failed: number; total: number; time: Date; read: boolean };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifIdCounter = useRef(0);
  
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);

  // History Selection State
  const [selectedHistoryFiles, setSelectedHistoryFiles] = useState<string[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]); // Changed to array

  const loadData = async () => {
    try {
      const [statsData, uploaded] = await Promise.all([
        fetchStatsData(),
        checkUploadedFiles()
      ]);
      setStats(statsData);
      setUploadedList(uploaded);
      
      // Auto-clear pending files that have appeared in DB
      const uploadedNames = new Set(uploaded.map((f: UploadedFileMeta) => f.filename));
      setPendingFiles(prev => prev.filter(name => !uploadedNames.has(name)));
    } catch (e) {
      console.error(e);
    }
  };

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotifOpen]);

  const handleSearchPreview = async () => {
    if (selectedFiles.length === 0) return;
    console.log("Search Preview clicked. Starting Data Filter...");
    setIsSearching(true);
    
    try {
      if (isDuplicateFilterActive) {
        console.log("Fetching uploaded files from backend...");
        
        // Add a manual timeout to the fetch in case the backend is deadlocking
        const fetchPromise = checkUploadedFiles();
        const timeoutPromise = new Promise<UploadedFileMeta[]>((_, reject) => {
          setTimeout(() => reject(new Error("API Timeout after 5 seconds")), 5000);
        });
        
        const alreadyUploaded = await Promise.race([fetchPromise, timeoutPromise]);
        console.log(`Backend returned ${alreadyUploaded.length} files.`);
        
        const filtered = filterDuplicateFiles(selectedFiles, alreadyUploaded);
        const dupeCount = selectedFiles.length - filtered.length;
        setDuplicateCount(dupeCount);
        
        // Track which specific files are duplicates
        const uploadedSet = new Set(alreadyUploaded.map((f: UploadedFileMeta) => f.filename));
        setDuplicateFileNames(selectedFiles.filter(f => uploadedSet.has(f.name)).map(f => f.name));
        
        console.log(`Filtering complete. Results: ${filtered.length} new files, ${dupeCount} duplicates skipped.`);
        setPreviewFiles(filtered);
      } else {
        console.log("Duplicate filter off. Passing all files directly.");
        setDuplicateCount(0);
        setDuplicateFileNames([]);
        setPreviewFiles([...selectedFiles]);
      }
    } catch (e) {
      console.error("Filter Error! Something crashed or timed out during Search Preview:", e);
      // Fallback safely so the user isn't stuck forever
      setPreviewFiles([...selectedFiles]); 
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartUpload = async () => {
    if (previewFiles.length === 0) return;
    setIsUploading(true);
    setIsPaused(false);
    isStoppedRef.current = false;
    isPausedRef.current = false;
    
    setTotalProgress(0);
    setCurrentFileIndex(0);
    setCurrentFileProgress(0);
    setUploadResult(null);

    let successCount = 0;
    let failedCount = 0;
    const failedNames: string[] = [];

    for (let i = 0; i < previewFiles.length; i++) {
        // Handle stop
        if (isStoppedRef.current) {
            console.log("Upload stopped by user.");
            break;
        }

        // Handle pause sequence by awaiting an interval checker
        while (isPausedRef.current) {
            if (isStoppedRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (isStoppedRef.current) break;

        setCurrentFileIndex(i);
        setCurrentFileProgress(0);
      
        const file = previewFiles[i];
        const success = await uploadFile(file, (progress) => {
            setCurrentFileProgress(progress);
            const totalP = ((i * 100) + progress) / previewFiles.length;
            setTotalProgress(Math.floor(totalP));
        });
        
        if (success) {
            successCount++;
            // Add to pending queue immediately after upload API returns
            setPendingFiles(prev => [...prev, file.name]);
        } else {
            failedCount++;
            failedNames.push(file.name);
        }
        
        // Small artificially induced delay to ensure smooth UI transition since local uploads are instant
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (isStoppedRef.current) {
        setIsUploading(false);
        setIsPaused(false);
        setTotalProgress(0);
        setCurrentFileProgress(0);
        loadData();
        return;
    }

    // Delay reset slightly to let user see 100% completion
    setTimeout(() => {
        setIsUploading(false);
        setIsPaused(false);
        setPreviewFiles([]);
        setSelectedFiles([]);
        setTotalProgress(0);
        setCurrentFileProgress(0);

        // Set upload result summary
        const result = { success: successCount, failed: failedCount, total: successCount + failedCount, failedNames };
        setUploadResult(result);

        // Push to notification history
        notifIdCounter.current += 1;
        setNotifications(prev => [{
          id: notifIdCounter.current,
          success: successCount,
          failed: failedCount,
          total: successCount + failedCount,
          time: new Date(),
          read: false,
        }, ...prev].slice(0, 20)); // Keep max 20 notifications

        // Show toast notification
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 6000);

        loadData(); // Resync UI with fresh data
    }, 1500);
  };
  
  const handlePause = () => {
      isPausedRef.current = !isPausedRef.current;
      setIsPaused(isPausedRef.current);
  };

  const handleStop = () => {
      isStoppedRef.current = true;
      setIsPaused(false);
      isPausedRef.current = false;
  };

  const handleViewLog = async (filename: string) => {
      setCurrentViewLogName(filename);
      setCurrentLogContent("");
      setIsLogLoading(true);
      setIsLogModalOpen(true);
      
      const result = await fetchFileLog(filename);
      setCurrentLogContent(result.log);
      setIsLogLoading(false);
  };

  const confirmDelete = async () => {
    if (filesToDelete.length === 0) return;
    setIsDeleting(true);
    
    // Process deletions sequentially (could be parallelized if backend supports bulk)
    let anySuccess = false;
    for (const file of filesToDelete) {
      const success = await deleteUploadedFile(file);
      if (success) anySuccess = true;
    }
    
    setIsDeleting(false);
    if (anySuccess) {
      loadData();
      setSelectedHistoryFiles(prev => prev.filter(f => !filesToDelete.includes(f))); // remove from selection
    }
    setIsDeleteModalOpen(false);
    setFilesToDelete([]);
  };

  const handleSelectAllHistory = (checked: boolean) => {
    if (checked) {
      setSelectedHistoryFiles(paginatedHistory.map(h => h.filename));
    } else {
      setSelectedHistoryFiles([]);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Derived state for Upload History
  const { filteredTotal, totalPages: totalHistoryPages, safePage: safeHistoryPage, paginatedHistory } = processUploadHistoryPaging(
    uploadedList, historySearchTerm, historyCurrentPage, historyItemsPerPage
  );
  const historyStartIdx = (safeHistoryPage - 1) * historyItemsPerPage;

  return (
    <div className="layout-container flex h-full grow flex-col">
      {/* Header */}
      <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-primary/10 bg-white dark:bg-background-dark px-6 md:px-10 py-4 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4 text-primary">
          <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
            <span className="material-symbols-outlined">factory</span>
          </div>
          <h2 className="text-slate-900 dark:text-slate-100 text-xl font-bold leading-tight tracking-tight">{t('header.title')}</h2>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'ko' : 'en')}
            className="flex items-center justify-center rounded-lg h-10 px-3 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-bold text-sm select-none"
            title="Toggle Language EN/KR"
          >
            {i18n.language === 'en' ? 'EN' : 'KR'}
          </button>
          <button className="flex items-center justify-center rounded-lg h-10 w-10 bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => {
                setIsNotifOpen(prev => !prev);
                // Mark all as read when opening
                if (!isNotifOpen) {
                  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                }
              }}
              className="flex items-center justify-center rounded-lg h-10 w-10 bg-primary/10 text-primary hover:bg-primary/20 transition-colors relative"
            >
              <span className="material-symbols-outlined">notifications</span>
              {(notifications.some(n => !n.read) || pendingFiles.length > 0) && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-white"></span>
              )}
            </button>

            {/* Notification Dropdown */}
            {isNotifOpen && (
              <div className="absolute right-0 top-12 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[101] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
                  {notifications.length > 0 && (
                    <button 
                      onClick={() => setNotifications([])}
                      className="text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      {t('notifications.clearAll')}
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600">notifications_off</span>
                      <p className="text-xs text-slate-400 mt-2">{t('notifications.empty')}</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div key={notif.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${!notif.read ? 'bg-primary/5' : ''}`}>
                        <span className={`material-symbols-outlined text-xl mt-0.5 ${notif.failed > 0 ? 'text-amber-500' : 'text-accent'}`}>
                          {notif.failed > 0 ? 'warning' : 'check_circle'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {t('upload.result.title')}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('upload.result.success', { count: notif.success })}
                            {notif.failed > 0 && ` · ${t('upload.result.failed', { count: notif.failed })}`}
                            {' · '}{t('upload.result.total', { count: notif.total })}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {notif.time.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden border border-slate-300">
            <img className="w-full h-full object-cover" data-alt="User profile avatar operator" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxmvg6qNudBGdurupx40IQrTk3CgJktYcjmiOIVSrbMQFHjt2w4jdwmiDGNN2eSegtzJClwNSLy2b6F-eeomTTit6Gu3lu0_eDu8aljryAyDtrODu8tYEDYJ0_YsjdnRO4lMu-YDuGO8IlEYPdAtnaOs0oeXIgFle3FOwgzNPafYX6J5z5puFbT_49QRf7pwuEJ1WD5eAcSlu4pDJyJ3sG5DgdghSf10KC-8CJmXR6bco-TyUNHivWZ3eXTwqccwmvmhNK_ChPIyA" alt="Profile" />
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center py-8 px-4 md:px-10">
        <div className="layout-content-container flex flex-col max-w-[1200px] flex-1 gap-6">
          {/* Dashboard Introduction */}
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 dark:text-slate-100 text-3xl font-black leading-tight tracking-tight">
              {t('dashboard.title')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">{t('dashboard.subtitle')}</p>
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Step 1: Source Selection */}
            <div className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white dark:bg-slate-900/50 p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
                <p className="text-slate-900 dark:text-slate-100 text-lg font-bold">{t('upload.stage1.title')}</p>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{t('upload.stage1.subtitle')}</p>
              <div className="mt-auto grid grid-cols-2 gap-3 relative">
                {/* Select Individual Files */}
                <div className="relative group">
                  <input 
                    type="file" 
                    multiple 
                    accept=".csv,.txt,.json,.log"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="Select Files"
                    onChange={(e) => {
                      if (e.target.files) setSelectedFiles(Array.from(e.target.files));
                    }}
                  />
                  <button className="flex w-full items-center justify-center rounded-lg h-11 px-4 bg-primary text-white font-semibold group-hover:bg-primary/90 transition-all gap-2 text-sm pointer-events-none shadow-sm group-hover:shadow group-hover:-translate-y-0.5">
                    <span className="material-symbols-outlined text-xl">description</span>
                    <span>{t('upload.stage1.btnFiles')}</span>
                  </button>
                </div>
                {/* Select Entire Folder */}
                <div className="relative group">
                  <input 
                    type="file" 
                    {...{webkitdirectory: "true", directory: "true"} as any}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title="Select Folder"
                    onChange={(e) => {
                      if (e.target.files) {
                        const files = Array.from(e.target.files).filter(f => 
                          f.name.endsWith('.csv') || f.name.endsWith('.txt') || f.name.endsWith('.json') || f.name.endsWith('.log')
                        );
                        setSelectedFiles(files);
                      }
                    }}
                  />
                  <button className="flex w-full items-center justify-center rounded-lg h-11 px-4 bg-primary/20 text-primary border border-primary/20 font-semibold group-hover:bg-primary/30 group-hover:border-primary/40 transition-all gap-2 text-sm pointer-events-none group-hover:-translate-y-0.5">
                    <span className="material-symbols-outlined text-xl">folder_open</span>
                    <span>{t('upload.stage1.btnFolder')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Preview & Validation */}
            <div className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white dark:bg-slate-900/50 p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
                  <p className="text-slate-900 dark:text-slate-100 text-lg font-bold">{t('upload.stage2.title')}</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-sm text-slate-600 dark:text-slate-400 font-semibold px-2">{t('upload.stage2.filterDuplicates')}</span>
                  <button 
                    onClick={() => setIsDuplicateFilterActive(!isDuplicateFilterActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDuplicateFilterActive ? 'bg-accent' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDuplicateFilterActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1 w-full mt-2">
                <div className="flex-1 w-full bg-background-light dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-h-[160px]">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-accent">
                        {isUploading ? 'cloud_sync' : 'inventory_2'}
                      </span>
                      <div>
                        {isUploading ? (
                          <>
                            <p className="text-slate-900 dark:text-slate-100 font-bold text-accent">Uploading to TB_METRICS...</p>
                            <p className="text-slate-500 text-xs">Processing file {currentFileIndex + 1} of {previewFiles.length}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-900 dark:text-slate-100 font-bold">
                              {previewFiles.length > 0 
                                ? t('upload.stage2.filesPrepared', { count: previewFiles.length })
                                : (selectedFiles.length > 0 && duplicateCount > 0)
                                  ? t('upload.stage2.allDuplicates')
                                  : t('upload.stage2.filesPrepared', { count: 0 })}
                            </p>
                            <p className="text-slate-500 text-xs">
                              {previewFiles.length > 0 
                                ? `${t('upload.stage2.totalSize')}: ${(previewFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024)).toFixed(2)} MB`
                                : selectedFiles.length === 0
                                  ? t('upload.stage2.clickPreview')
                                  : t('upload.stage2.clickPreview')}
                            </p>
                            {isDuplicateFilterActive && duplicateCount > 0 && (
                              <p className="text-amber-500 text-xs font-semibold flex items-center gap-1 mt-0.5">
                                <span className="material-symbols-outlined text-sm">filter_alt</span>
                                {t('upload.stage2.duplicatesSkipped', { count: duplicateCount })}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${isUploading && !isPaused ? 'bg-accent text-white animate-pulse' : isPaused ? 'bg-yellow-500 text-white' : previewFiles.length > 0 ? 'bg-accent/10 text-accent' : 'bg-slate-200 text-slate-500'}`}>
                      {isUploading && !isPaused ? 'Processing' : isPaused ? 'Paused' : previewFiles.length > 0 ? 'Ready' : 'Idle'}
                    </span>
                  </div>

                  {uploadResult && !isUploading ? (
                    <div className={`flex flex-col gap-3 p-4 rounded-lg border ${uploadResult.failed > 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-accent/5 border-accent/20'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-2xl ${uploadResult.failed > 0 ? 'text-amber-500' : 'text-accent'}`}>
                          {uploadResult.failed > 0 ? 'warning' : 'check_circle'}
                        </span>
                        <p className="text-slate-900 dark:text-slate-100 font-bold">{t('upload.result.title')}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-accent font-semibold">
                          <span className="material-symbols-outlined text-sm">check</span>
                          {t('upload.result.success', { count: uploadResult.success })}
                        </span>
                        {uploadResult.failed > 0 && (
                          <span className="flex items-center gap-1 text-red-500 font-semibold">
                            <span className="material-symbols-outlined text-sm">close</span>
                            {t('upload.result.failed', { count: uploadResult.failed })}
                          </span>
                        )}
                        <span className="text-slate-400">|</span>
                        <span className="text-slate-500">{t('upload.result.total', { count: uploadResult.total })}</span>
                      </div>
                      {uploadResult.failed > 0 && uploadResult.failedNames.length > 0 && (
                        <div className="text-xs text-red-400 font-mono space-y-0.5 mt-1">
                          {uploadResult.failedNames.slice(0, 5).map((name, i) => (
                            <p key={i} className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">error</span>
                              {name}
                            </p>
                          ))}
                          {uploadResult.failedNames.length > 5 && (
                            <button 
                              onClick={() => setIsFailedModalOpen(true)}
                              className="text-xs text-primary hover:text-accent font-semibold flex items-center gap-1 mt-1 transition-colors text-left"
                            >
                              <span className="material-symbols-outlined text-sm">open_in_new</span>
                              ... and {uploadResult.failedNames.length - 5} more files (View All)
                            </button>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => setUploadResult(null)}
                        className="self-start mt-1 text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                        {t('upload.result.dismiss')}
                      </button>
                    </div>
                  ) : isUploading ? (
                    <div className="flex flex-col gap-4 pt-2">
                      {/* Overall Progress */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>Overall Progress</span>
                          <span className="text-primary">{totalProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300 ease-out" 
                            style={{ width: `${totalProgress}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Current File Progress */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                          <span className="truncate max-w-[70%] font-mono">{previewFiles[currentFileIndex]?.name || 'Initializing...'}</span>
                          <span className="text-accent">{currentFileProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-accent h-1.5 rounded-full transition-all duration-200 ease-out" 
                            style={{ width: `${currentFileProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                      {/* New (non-duplicate) files */}
                      {previewFiles.slice(0, 5).map((file, i) => (
                        <p key={`new-${i}`} className="text-xs text-slate-600 dark:text-slate-400 font-mono flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-accent text-sm">check_circle</span>
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </p>
                      ))}
                      {previewFiles.length > 5 && (
                        <button 
                          onClick={() => setIsPreviewModalOpen(true)}
                          className="text-xs text-primary hover:text-accent font-semibold flex items-center gap-1 mt-1 transition-colors text-left"
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          ... and {previewFiles.length - 5} more files (View All)
                        </button>
                      )}
                      {/* Duplicate files (shown with strikethrough) */}
                      {isDuplicateFilterActive && duplicateFileNames.length > 0 && (
                        <>
                          <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1"></div>
                          {duplicateFileNames.slice(0, 3).map((name, i) => (
                            <p key={`dupe-${i}`} className="text-xs text-red-400 font-mono flex items-center gap-1.5 line-through opacity-70">
                              <span className="material-symbols-outlined text-red-400 text-sm">block</span>
                              {name}
                            </p>
                          ))}
                          {duplicateFileNames.length > 3 && (
                            <p className="text-xs text-red-400 font-mono opacity-70 pl-5">
                              ... {t('upload.stage2.moreduplicates', { count: duplicateFileNames.length - 3 })}
                            </p>
                          )}
                        </>
                      )}
                      {previewFiles.length === 0 && duplicateFileNames.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1 font-medium">
                          {selectedFiles.length > 0 
                            ? t('upload.stage1.statusReady', { count: selectedFiles.length })
                            : t('upload.stage1.statusEmpty')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col gap-3 self-stretch md:self-center w-full md:w-auto">
                  <button 
                    onClick={handleSearchPreview}
                    className={`flex h-11 px-6 items-center justify-center rounded-lg text-white font-semibold transition-all gap-2 shadow-sm whitespace-nowrap ${selectedFiles.length > 0 && !isUploading && !isSearching ? 'bg-primary hover:bg-primary/90' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500'}`}
                    disabled={selectedFiles.length === 0 || isUploading || isSearching}
                  >
                    <span className={isSearching ? "material-symbols-outlined text-xl animate-spin" : "material-symbols-outlined text-xl"}>
                      {isSearching ? 'sync' : 'manage_search'}
                    </span>
                    <span>{isSearching ? t('upload.stage2.btnSearching') : t('upload.stage2.btnSearch')}</span>
                  </button>
                  {/* Dynamic Action Buttons */}
                  {!isUploading ? (
                    <button 
                      onClick={handleStartUpload}
                      className={`flex h-11 px-6 items-center justify-center rounded-lg text-white font-semibold transition-all gap-2 shadow-sm whitespace-nowrap ${previewFiles.length > 0 ? 'bg-accent hover:bg-accent/90 focus:ring-4 focus:ring-accent/30' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed text-slate-500'}`}
                      disabled={previewFiles.length === 0}
                    >
                      <span className="material-symbols-outlined text-xl">upload_file</span>
                      <span>{t('upload.stage2.btnStart')}</span>
                    </button>
                  ) : (
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 items-center justify-center shadow-inner h-11 gap-1">
                      {isPaused ? (
                        <button 
                          onClick={handlePause}
                          className="flex h-9 px-4 items-center justify-center rounded bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm gap-2"
                        >
                          <i className="bi bi-play-fill text-lg"></i>
                          <span className="font-bold text-sm">{t('upload.stage2.btnResume')}</span>
                        </button>
                      ) : (
                        <button 
                          onClick={handlePause}
                          className="flex h-9 px-4 items-center justify-center rounded bg-yellow-500 text-white hover:bg-yellow-600 transition-colors shadow-sm gap-2"
                        >
                          <i className="bi bi-pause-fill text-lg"></i>
                          <span className="font-bold text-sm">{t('upload.stage2.btnPause')}</span>
                        </button>
                      )}
                      
                      <button 
                        onClick={handleStop}
                        className="flex h-9 w-10 items-center justify-center rounded bg-slate-300 text-slate-700 hover:bg-red-500 hover:text-white transition-colors dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-red-500 dark:hover:text-white"
                        title="Stop Upload"
                      >
                        <i className="bi bi-stop-fill text-xl"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Upload History Table */}
          <div className="flex flex-col gap-4 rounded-xl border border-primary/10 bg-white dark:bg-slate-900/50 p-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-slate-900 dark:text-slate-100 text-xl font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">history</span>
                {t('history.title')}
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <select 
                    className="appearance-none bg-background-light dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                    value={historyItemsPerPage}
                    onChange={(e) => {
                      setHistoryItemsPerPage(Number(e.target.value));
                      setHistoryCurrentPage(1);
                    }}
                  >
                    <option value={10}>{t('history.itemsPerPage', { count: 10 })}</option>
                    <option value={30}>{t('history.itemsPerPage', { count: 30 })}</option>
                    <option value={50}>{t('history.itemsPerPage', { count: 50 })}</option>
                    <option value={100}>{t('history.itemsPerPage', { count: 100 })}</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-sm">expand_more</span>
                </div>
                <div className="flex items-center bg-background-light dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                  <span className="material-symbols-outlined text-slate-400 mr-2 text-xl">search</span>
                  <input 
                    type="text" 
                    placeholder={t('history.searchPlaceholder')}
                    value={historySearchTerm}
                    onChange={(e) => {
                      setHistorySearchTerm(e.target.value);
                      setHistoryCurrentPage(1);
                    }}
                    className="bg-transparent border-none outline-none text-sm w-full md:w-64 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                  {historySearchTerm && (
                    <button onClick={() => setHistorySearchTerm("")} className="text-slate-400 hover:text-slate-600 ml-1">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  )}
                </div>
                {selectedHistoryFiles.length > 0 && (
                  <button 
                    onClick={() => {
                      setFilesToDelete(selectedHistoryFiles);
                      setIsDeleteModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm font-bold border border-red-200 dark:border-red-800/30 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    Delete Selected ({selectedHistoryFiles.length})
                  </button>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-4 px-4 w-12 text-center text-slate-500">
                      <label className="relative cursor-pointer flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          className="peer sr-only"
                          checked={paginatedHistory.length > 0 && selectedHistoryFiles.length === paginatedHistory.length}
                          onChange={(e) => handleSelectAllHistory(e.target.checked)}
                        />
                        <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-[16px] opacity-0 peer-checked:opacity-100 font-bold transition-opacity">check</span>
                        </div>
                      </label>
                    </th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('history.columns.filename')}</th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('history.columns.deviceId')}</th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('history.columns.timestamp')}</th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('history.columns.status')}</th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm">{t('history.columns.targetDb')}</th>
                    <th className="py-4 px-4 text-slate-500 dark:text-slate-400 font-semibold text-sm text-right">{t('history.columns.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {/* Pending files: shown at top with processing spinner */}
                  {pendingFiles.map((name, i) => (
                    <tr key={`pending-${i}`} className="bg-amber-50/50 dark:bg-amber-900/10 animate-pulse">
                      <td className="py-4 px-4"></td>
                      <td className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {name}
                      </td>
                      <td className="py-4 px-4 text-slate-400">—</td>
                      <td className="py-4 px-4 text-slate-400 text-sm">{t('history.statusJustNow')}</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs font-bold px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                          {t('history.statusProcessing')}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-400 text-sm italic">—</td>
                      <td className="py-4 px-4 text-right text-slate-300 text-sm">—</td>
                    </tr>
                  ))}
                  {/* Existing completed files */}
                  {paginatedHistory.map((meta, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-4 px-4 text-center">
                        <label className="relative cursor-pointer flex items-center justify-center">
                          <input 
                            type="checkbox" 
                            className="peer sr-only"
                            checked={selectedHistoryFiles.includes(meta.filename)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedHistoryFiles(prev => [...prev, meta.filename]);
                              } else {
                                setSelectedHistoryFiles(prev => prev.filter(f => f !== meta.filename));
                              }
                            }}
                          />
                          <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-[16px] opacity-0 peer-checked:opacity-100 font-bold transition-opacity">check</span>
                          </div>
                        </label>
                      </td>
                      <td 
                        className="py-4 px-4 font-medium text-slate-900 dark:text-slate-100 cursor-pointer hover:text-primary dark:hover:text-primary transition-colors"
                        onClick={() => {
                          if (selectedHistoryFiles.includes(meta.filename)) {
                            setSelectedHistoryFiles(prev => prev.filter(f => f !== meta.filename));
                          } else {
                            setSelectedHistoryFiles(prev => [...prev, meta.filename]);
                          }
                        }}
                      >
                        {meta.filename}
                      </td>
                      <td className="py-4 px-4 text-slate-600 dark:text-slate-300">
                        {meta.filename.toLowerCase().includes('spot') ? t('history.targetSpot') : t('history.targetPlc')}
                      </td>
                      <td className="py-4 px-4 text-slate-500 text-sm">
                        {formatKST(meta.timestamp)}
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 bg-accent/10 text-accent text-xs font-bold px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          {t('history.statusSuccess')}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-[14px]">database</span>
                          tb_{meta.filename.toLowerCase().includes('spot') ? 'metrics' : 'metrics'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            title="View log details"
                            onClick={() => handleViewLog(meta.filename)}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                          </button>
                          <button 
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            onClick={() => {
                              setFilesToDelete([meta.filename]);
                              setIsDeleteModalOpen(true);
                            }}
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedHistory.length === 0 && (
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td colSpan={7} className="py-8 text-center text-slate-500 dark:text-slate-400 italic">{t('history.emptyState')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700 mt-2">
              <p className="text-sm text-slate-500">
                Showing {filteredTotal > 0 ? historyStartIdx + 1 : 0} to {Math.min(historyStartIdx + historyItemsPerPage, filteredTotal)} of {filteredTotal} recent uploads
              </p>
              <div className="flex gap-1">
                <button 
                  className="h-8 w-8 rounded flex items-center justify-center border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors" 
                  disabled={safeHistoryPage === 1}
                  onClick={() => setHistoryCurrentPage(prev => Math.max(1, prev - 1))}
                >
                  <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                
                {(() => {
                  const maxButtons = 5;
                  let startPage = Math.max(1, safeHistoryPage - Math.floor(maxButtons / 2));
                  let endPage = startPage + maxButtons - 1;
                  
                  if (endPage > totalHistoryPages) {
                    endPage = totalHistoryPages;
                    startPage = Math.max(1, endPage - maxButtons + 1);
                  }
                  
                  const pages = [];
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button 
                        key={i}
                        onClick={() => setHistoryCurrentPage(i)}
                        className={`h-8 min-w-8 px-2 rounded flex items-center justify-center text-sm font-bold shadow-sm transition-colors ${
                          i === safeHistoryPage 
                            ? 'bg-primary text-white' 
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {i}
                      </button>
                    );
                  }
                  return pages;
                })()}

                <button 
                  className="h-8 w-8 rounded flex items-center justify-center border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  disabled={safeHistoryPage === totalHistoryPages}
                  onClick={() => setHistoryCurrentPage(prev => Math.min(totalHistoryPages, prev + 1))}
                >
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          {/* DB Stats Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-primary p-4 rounded-xl text-white flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <span className="material-symbols-outlined">database</span>
              </div>
              <div>
                <p className="text-xs opacity-80 uppercase tracking-widest font-bold">{t('stats.totalRecords')}</p>
                <p className="text-xl font-bold">{stats === null ? '—' : stats.total_records.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-accent p-4 rounded-xl text-white flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <span className="material-symbols-outlined">sync</span>
              </div>
              <div>
                <p className="text-xs opacity-80 uppercase tracking-widest font-bold">{t('stats.lastSync')}</p>
                <p className="text-xl font-bold">{stats === null ? '—' : (stats.last_sync ? formatKST(stats.last_sync) : t('stats.noSync'))}</p>
              </div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl text-white flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-lg">
                <span className="material-symbols-outlined">cloud_upload</span>
              </div>
              <div>
                <p className="text-xs opacity-80 uppercase tracking-widest font-bold">{t('stats.todaysFiles')}</p>
                <p className="text-xl font-bold">{stats === null ? '—' : stats.todays_files}</p>
              </div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-4">
              <div className="bg-primary/10 p-2 rounded-lg text-primary text-white">
                <span className="material-symbols-outlined">storage</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">{t('stats.storage')}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{stats === null ? '—' : stats.storage_size}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Section */}
      <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 px-10 py-6 bg-white dark:bg-background-dark">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">analytics</span>
            <span className="text-slate-500 text-sm font-medium">PLC Integrated Data Management System v2.4.0</span>
          </div>
          <div className="flex gap-6 text-sm text-slate-500">
            <a className="hover:text-primary transition-colors cursor-pointer">System Status</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Documentation</a>
            <a className="hover:text-primary transition-colors cursor-pointer">Database Console</a>
          </div>
        </div>
      </footer>

      {/* Preview All Files Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">format_list_bulleted</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">All Selected Files</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{previewFiles.length} files • {(previewFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024)).toFixed(2)} MB total</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPreviewModalOpen(false)}
                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {/* Modal Body (Scrollable List) */}
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/50 custom-scrollbar">
              <div className="flex flex-col gap-1 px-4 py-2">
                {previewFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 hover:bg-white dark:hover:bg-slate-800 rounded-lg group transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="material-symbols-outlined text-slate-400 text-sm shrink-0">description</span>
                      <span className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate" title={file.webkitRelativePath || file.name}>
                        {file.webkitRelativePath || file.name}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-medium shrink-0 ml-4 font-mono">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-end">
              <button 
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-6 py-2 bg-primary text-white rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-xl flex flex-col border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-2">
                <div className="size-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">delete_forever</span>
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {filesToDelete.length > 1 ? 'Delete Multiple Files' : 'Delete Uploaded File'}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {filesToDelete.length > 1 
                      ? `Are you sure you want to delete ${filesToDelete.length} items from the database? This action cannot be undone.`
                      : 'Are you sure you want to delete this file and all its data points from the database? This action cannot be undone.'}
                  </p>
                </div>
              </div>

              {filesToDelete.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg mt-4 border border-slate-200 dark:border-slate-700">
                  <p className="font-mono text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 break-all max-h-32 overflow-y-auto custom-scrollbar">
                    {filesToDelete.join(', ')}
                  </p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setFilesToDelete([]);
                }}
                disabled={isDeleting}
                className="px-6 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className={`flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg font-semibold shadow-sm hover:bg-red-700 transition-colors ${isDeleting ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isDeleting && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                {filesToDelete.length > 1 ? `Delete ${filesToDelete.length}` : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Failed Files Modal */}
      {isFailedModalOpen && uploadResult && uploadResult.failedNames.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3 text-slate-900 dark:text-white">
                <span className="material-symbols-outlined text-amber-500 text-2xl">warning</span>
                <h3 className="text-lg font-bold">Failed Uploads</h3>
              </div>
              <button 
                onClick={() => setIsFailedModalOpen(false)}
                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/50 custom-scrollbar">
              <div className="flex flex-col gap-1 px-4 py-2">
                {uploadResult.failedNames.map((file, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 hover:bg-white dark:hover:bg-slate-800 rounded-lg group transition-colors">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="material-symbols-outlined text-slate-400 text-sm shrink-0">description</span>
                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300 truncate">{file}</p>
                    </div>
                    <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">Failed</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-end">
              <button 
                onClick={() => setIsFailedModalOpen(false)}
                className="px-6 py-2 bg-primary text-white rounded-lg font-semibold shadow-sm hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Log Text Modal */}
      {isLogModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-2xl">receipt_long</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t('modals.log.title')}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium truncate max-w-lg">{currentViewLogName}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsLogModalOpen(false)}
                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            {/* Modal Body (Preformatted Log Text) */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 text-emerald-400 custom-scrollbar relative">
              {isLogLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-emerald-600 animate-pulse">
                  <span className="material-symbols-outlined text-4xl animate-spin">sync</span>
                  <p className="font-mono text-sm">Fetching telemetry log from server...</p>
                </div>
              ) : (
                <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
                  {currentLogContent || "No log content retrieved."}
                </pre>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-end gap-3">
              {!isLogLoading && currentLogContent && (
                <button 
                  onClick={() => {
                    const blob = new Blob([currentLogContent], { type: 'text/plain' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${currentViewLogName}.log`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                  className="px-6 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  Export
                </button>
              )}
              <button 
                onClick={() => setIsLogModalOpen(false)}
                className="px-6 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg font-semibold shadow-sm hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastVisible && uploadResult && (
        <div className="fixed top-20 right-6 z-[100] animate-in slide-in-from-right">
          <div className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-sm min-w-[280px] ${
            uploadResult.failed > 0 
              ? 'bg-amber-50/95 dark:bg-amber-900/90 border-amber-200 dark:border-amber-700' 
              : 'bg-white/95 dark:bg-slate-800/95 border-accent/30'
          }`}>
            <span className={`material-symbols-outlined text-2xl ${uploadResult.failed > 0 ? 'text-amber-500' : 'text-accent'}`}>
              {uploadResult.failed > 0 ? 'warning' : 'check_circle'}
            </span>
            <div className="flex flex-col">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{t('upload.result.title')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('upload.result.success', { count: uploadResult.success })}
                {uploadResult.failed > 0 && ` · ${t('upload.result.failed', { count: uploadResult.failed })}`}
              </p>
            </div>
            <button onClick={() => setToastVisible(false)} className="ml-2 text-slate-400 hover:text-slate-600 transition-colors">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
