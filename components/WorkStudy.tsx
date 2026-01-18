
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Play, Pause, Footprints, Clock, Plus, Trash2, Download, FolderOpen, Truck, Activity, PackageCheck, Coffee, AlertOctagon, Edit3, X, ChevronRight, ChevronLeft, Settings2, Edit, Calculator, ScanEye, Camera, Layers, ZoomIn, ZoomOut, Move, SkipBack, SkipForward, FileSpreadsheet, FileUp } from 'lucide-react';
import { WorkStudyTask, WorkStudyRound, LogisticsEvent, ActivityType } from '../types';
import ExcelJS from 'exceljs';

interface Props {
  videoSrc: string | null;
  tasks: WorkStudyTask[];
  setTasks: React.Dispatch<React.SetStateAction<WorkStudyTask[]>>;
}

// --- PMTS / MODAPTS DATA ---
const MODAPTS_CODES = [
    { code: 'M1', val: 0.129, desc: 'Movement (Finger)' },
    { code: 'M2', val: 0.129 * 2, desc: 'Movement (Hand)' },
    { code: 'M3', val: 0.129 * 3, desc: 'Movement (Forearm)' },
    { code: 'M4', val: 0.129 * 4, desc: 'Movement (Arm)' },
    { code: 'M5', val: 0.129 * 5, desc: 'Movement (Shoulder)' },
    { code: 'G1', val: 0.129, desc: 'Grasp (Touch)' },
    { code: 'G3', val: 0.129 * 3, desc: 'Grasp (Complex)' },
    { code: 'P2', val: 0.129 * 2, desc: 'Put (Easy)' },
    { code: 'P5', val: 0.129 * 5, desc: 'Put (Exact)' },
    { code: 'L1', val: 0.129, desc: 'Load (Light)' },
];

const LOGISTICS_ACTIONS = [
    { name: 'Travel (Empty)', category: 'NNVA', color: 'bg-blue-600', icon: <Truck size={16}/> },
    { name: 'Travel (Load)', category: 'VA', color: 'bg-indigo-600', icon: <Truck size={16}/> },
    { name: 'Load / Unload', category: 'VA', color: 'bg-orange-600', icon: <PackageCheck size={16}/> },
    { name: 'Inspection / QC', category: 'VA', color: 'bg-green-600', icon: <Activity size={16}/> },
    { name: 'Documentation', category: 'NNVA', color: 'bg-gray-600', icon: <Edit3 size={16}/> },
    { name: 'Idle / Wait', category: 'NVA', color: 'bg-red-600', icon: <Coffee size={16}/> },
    { name: 'Maintenance', category: 'NVA', color: 'bg-red-800', icon: <AlertOctagon size={16}/> },
];

const FLOW_SYMBOLS: { type: ActivityType, label: string, thaiLabel: string, path: React.ReactElement }[] = [
    { type: 'Operation', label: 'O', thaiLabel: 'ผลิต', path: <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /> },
    { type: 'Transport', label: '->', thaiLabel: 'ย้าย', path: <path d="M3 10 H13 V5 L21 12 L13 19 V14 H3 Z" stroke="currentColor" strokeWidth="2" /> },
    { type: 'Inspection', label: '[]', thaiLabel: 'ตรวจ', path: <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="2" /> },
    { type: 'Delay', label: 'D', thaiLabel: 'รอ', path: <path d="M6 3 H14 A9 9 0 0 1 14 21 H6 Z" stroke="currentColor" strokeWidth="2" /> },
    { type: 'Hold', label: 'V', thaiLabel: 'เก็บ', path: <polygon points="4,4 20,4 12,20" stroke="currentColor" strokeWidth="2" /> }
];

const WorkStudy: React.FC<Props> = ({ videoSrc, tasks, setTasks }) => {
  const [mode, setMode] = useState<'standard' | 'logistics'>('standard');
  const [currentRound, setCurrentRound] = useState(0); 
  const [activeTaskIndex, setActiveTaskIndex] = useState<number>(-1); 
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(null);
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number | null>(null);
  
  const [logisticsEvents, setLogisticsEvents] = useState<LogisticsEvent[]>([]);
  const [currentLogisticsEvent, setCurrentLogisticsEvent] = useState<Partial<LogisticsEvent> | null>(null);

  const [isTiming, setIsTiming] = useState(false);
  const [isWalking, setIsWalking] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [walkStart, setWalkStart] = useState(0);
  const [accumulatedWalk, setAccumulatedWalk] = useState(0);
  
  const [editingResult, setEditingResult] = useState<{taskIdx: number, roundIdx: number, ht: number, wt: number, mt: number} | null>(null);

  // Video State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  // Ghost Overlay State
  const [ghostImage, setGhostImage] = useState<string | null>(null);
  const [showGhost, setShowGhost] = useState(false);
  const [ghostOpacity, setGhostOpacity] = useState(0.4);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [overlayPath, setOverlayPath] = useState("");

  const calculatePath = useCallback(() => {
    if (!tableContainerRef.current || mode !== 'standard') {
        setOverlayPath("");
        return;
    }
    const container = tableContainerRef.current;
    const activeCells = Array.from(container.querySelectorAll('td[data-active="true"]')) as HTMLElement[];
    if (activeCells.length === 0) {
        setOverlayPath("");
        return;
    }
    const containerRect = container.getBoundingClientRect();
    const points = activeCells.map(cell => {
        const rect = cell.getBoundingClientRect();
        const x = rect.left - containerRect.left + container.scrollLeft + (rect.width / 2);
        const y = rect.top - containerRect.top + container.scrollTop + (rect.height / 2);
        return { x, y };
    });
    const d = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
    setOverlayPath(d);
  }, [tasks, mode]);

  useLayoutEffect(() => {
    calculatePath();
    window.addEventListener('resize', calculatePath);
    return () => window.removeEventListener('resize', calculatePath);
  }, [calculatePath]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; 
        switch(e.key.toLowerCase()) {
            case ' ': e.preventDefault(); toggleVideoPlay(); break;
            case 'arrowright': stepFrame(1); break;
            case 'arrowleft': stepFrame(-1); break;
            case 's': if(mode==='standard') handleStartTask(); break;
            case 'e': if(mode==='standard') handleEndTask(); break;
            case 'w': if(mode==='standard') toggleWalk(); break;
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTiming, isWalking, activeTaskIndex, tasks, currentRound, editingResult, mode]);

  // --- Video Controls ---
  const toggleVideoPlay = () => {
      if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play();
          else videoRef.current.pause();
      }
  };

  const changeSpeed = (rate: number) => {
      if (videoRef.current) {
          videoRef.current.playbackRate = rate;
          setPlaybackRate(rate);
      }
  };

  const stepFrame = (frames: number) => {
      if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime += (frames * 0.033); // Assume 30fps
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      if (videoRef.current) videoRef.current.currentTime = time;
  };

  const formatTime = (seconds: number) => {
      if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00.00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // --- Ghost Overlay Logic ---
  const captureGhost = () => {
      if (videoRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(videoRef.current, 0, 0);
          setGhostImage(canvas.toDataURL());
          setShowGhost(true);
      }
  };
  
  // Helper to capture current frame
  const captureFrame = (): string | undefined => {
      if (!videoRef.current) return undefined;
      try {
          const canvas = document.createElement('canvas');
          // Downscale slightly for performance/storage
          const w = 320; 
          const h = (videoRef.current.videoHeight / videoRef.current.videoWidth) * w;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(videoRef.current, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', 0.7);
      } catch(e) { console.error("Snapshot failed", e); return undefined; }
  };

  // --- Pan/Zoom Logic ---
  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey) {
          e.preventDefault();
          const newZoom = Math.max(1, Math.min(5, zoomLevel - e.deltaY * 0.005));
          setZoomLevel(newZoom);
      }
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
      if (zoomLevel > 1) setIsPanning(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
      if (isPanning && zoomLevel > 1) {
          setPanPosition(prev => ({
              x: prev.x + e.movementX,
              y: prev.y + e.movementY
          }));
      }
  };
  const handleMouseUp = () => setIsPanning(false);

  // --- Standard Work Logic ---
  const toggleWalk = () => {
      if (!isTiming || !videoRef.current) return;
      const now = videoRef.current.currentTime;
      if (!isWalking) {
          setIsWalking(true);
          setWalkStart(now);
      } else {
          setIsWalking(false);
          setAccumulatedWalk(prev => prev + (now - walkStart));
      }
  };

  const handleStartTask = () => {
      if (!videoSrc) return;
      if (isTiming) {
          handleEndTask();
          let nextIndex = activeTaskIndex + 1;
          if (nextIndex < tasks.length) setTimeout(() => startTaskLogic(nextIndex), 50);
          return;
      }
      let targetIndex = tasks.findIndex(t => !t.rounds[currentRound]);
      if (targetIndex === -1) targetIndex = 0; 
      startTaskLogic(targetIndex);
  };

  const startTaskLogic = (index: number) => {
      if (!videoRef.current) return;
      setActiveTaskIndex(index);
      setSelectedTaskIndex(index); 
      setSelectedRoundIndex(currentRound);
      setStartTime(videoRef.current.currentTime);
      setAccumulatedWalk(0);
      setIsWalking(false);
      setIsTiming(true);
      videoRef.current.play();
  };

  const handleEndTask = () => {
      if (!isTiming || activeTaskIndex === -1 || !videoRef.current) return;
      const endTime = videoRef.current.currentTime;
      let finalWalk = accumulatedWalk;
      if (isWalking) finalWalk += (endTime - walkStart);

      const totalDuration = endTime - startTime;
      const wt = finalWalk;
      const mt = 0; 
      const ht = Math.max(0, totalDuration - wt - mt);
      
      // CAPTURE THUMBNAIL HERE
      const thumbnail = captureFrame();

      const newTasks = tasks.map((t, i) => {
        if (i === activeTaskIndex) {
            const newRounds = [...t.rounds];
            newRounds[currentRound] = { ht, wt, mt, total: totalDuration, startTime, endTime };
            return { ...t, rounds: newRounds, thumbnail: thumbnail || t.thumbnail };
        }
        return t;
      });
      setTasks(newTasks);
      setEditingResult({ taskIdx: activeTaskIndex, roundIdx: currentRound, ht, wt, mt });
      setIsTiming(false);
      setIsWalking(false);
      setActiveTaskIndex(-1);
      videoRef.current.pause();
  };

  const updateRoundData = (val: string, field: keyof WorkStudyRound) => {
      if (selectedTaskIndex === null || selectedRoundIndex === null) return;
      const numVal = parseFloat(val) || 0;
      setTasks(prev => {
          const newTasks = [...prev];
          const task = { ...newTasks[selectedTaskIndex] };
          const rounds = [...task.rounds];
          let round = rounds[selectedRoundIndex] || { ht: 0, wt: 0, mt: 0, total: 0 };
          const newRound = { ...round, [field]: numVal };
          newRound.total = newRound.ht + newRound.wt + newRound.mt;
          rounds[selectedRoundIndex] = newRound;
          task.rounds = rounds;
          newTasks[selectedTaskIndex] = task;
          return newTasks;
      });
  };

  const applyPMTS = (val: number) => {
      if (selectedTaskIndex !== null && selectedRoundIndex !== null) {
          updateRoundData(val.toString(), 'ht');
      }
  };

  // --- Task Management & Export ---
  const addTask = () => {
      setTasks([...tasks, { id: crypto.randomUUID(), name: `Element ${tasks.length + 1}`, rounds: [], activity: 'Operation', rating: 100, allowance: 10 }]);
      setSelectedTaskIndex(tasks.length); setSelectedRoundIndex(currentRound);
  };
  const removeTask = (idx: number) => {
      if (confirm("ลบรายการนี้?")) setTasks(tasks.filter((_, i) => i !== idx));
      setSelectedTaskIndex(null);
  };

  // --- TEMPLATE IMPORT & FILL LOGIC (ExcelJS for 100% Preservation) ---
  const handleTemplateImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
          const buffer = await file.arrayBuffer();
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer);

          const worksheet = workbook.worksheets[0];

          // --- SMART AUTO-DETECT MAPPING LOGIC (Scanning Rows) ---
          let headerRow = -1;
          let nameCol = -1; // 1-based index
          let cycleStartCol = -1; // 1-based index

          worksheet.eachRow((row, rowNumber) => {
              if (headerRow !== -1) return; // Stop if found
              row.eachCell((cell, colNumber) => {
                  const val = cell.text ? cell.text.toString().toLowerCase().trim() : '';
                  // Detect Header Row by keywords
                  if (['element work', 'element name', 'job element', 'description'].some(k => val.includes(k))) {
                      headerRow = rowNumber;
                      nameCol = colNumber;
                  }
                  // Detect Cycle 1
                  if ((val === '1' || val === '1.' || val.includes('cycle')) && cycleStartCol === -1) {
                      // Heuristic: Cycle headers are usually on same row or near header
                      if (headerRow !== -1 || (nameCol !== -1)) { 
                          cycleStartCol = colNumber;
                      }
                  }
              });
          });

          // Fallbacks
          if (headerRow === -1) headerRow = 6;
          if (nameCol === -1) nameCol = 2; // Column B
          if (cycleStartCol === -1) cycleStartCol = 4; // Column D

          console.log(`Mapping: Header@${headerRow}, Name@${nameCol}, Cycle@${cycleStartCol}`);

          const dataStartRow = headerRow + 1;
          const STRIDE = 4; // Assume 4 rows per task (HT, WT, MT, Total)

          // --- INJECT DATA ---
          tasks.forEach((task, tIdx) => {
              const baseRow = dataStartRow + (tIdx * STRIDE);
              
              // 1. Task Name (Only if not formula)
              const nameCell = worksheet.getCell(baseRow, nameCol);
              if (!nameCell.formula) nameCell.value = task.name;

              // 2. Cycle Data
              // Ensure we write at least 10 cols or clear them if they exist
              const roundsToWrite = Math.max(10, task.rounds.length); 
              
              for (let i = 0; i < roundsToWrite; i++) {
                  const round = task.rounds[i];
                  const col = cycleStartCol + i;
                  
                  const htCell = worksheet.getCell(baseRow, col);
                  const wtCell = worksheet.getCell(baseRow + 1, col);
                  const mtCell = worksheet.getCell(baseRow + 2, col);
                  const totalCell = worksheet.getCell(baseRow + 3, col);

                  if (round) {
                      // FORMULA GUARD: Only write if NOT a formula
                      if (!htCell.formula) htCell.value = round.ht;
                      if (!wtCell.formula) wtCell.value = round.wt;
                      if (!mtCell.formula) mtCell.value = round.mt;
                      
                      // NOTE: 'Total' often has a formula in templates (=SUM(...))
                      // We only overwrite if it looks like a static value container
                      if (!totalCell.formula) totalCell.value = round.total;
                  } else {
                      // Clear values if no data (using null effectively clears value but keeps style)
                      if (!htCell.formula) htCell.value = null;
                      if (!wtCell.formula) wtCell.value = null;
                      if (!mtCell.formula) mtCell.value = null;
                      if (!totalCell.formula) totalCell.value = null;
                  }
              }
          });

          // --- DOWNLOAD MODIFIED FILE ---
          const outBuffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `TMS_Filled_${new Date().toISOString().slice(0,10)}.xlsx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

      } catch (err) {
          console.error(err);
          alert("Error processing template: " + (err as Error).message);
      }
      
      e.target.value = ''; // Reset input
  };

  return (
    <div className="flex h-full gap-2 text-gray-800">
      {/* HIDDEN INPUT FOR TEMPLATE IMPORT */}
      <input 
        type="file" 
        accept=".xlsx, .xls" 
        ref={templateInputRef} 
        onChange={handleTemplateImport} 
        className="hidden" 
      />

      {/* LEFT: Video & Engineering Controls */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
         {/* ... (Video Container and Controls remain same) ... */}
         {/* VIDEO CONTAINER */}
         <div className="bg-black border-2 border-gray-600 border-inset relative flex-grow flex items-center justify-center group overflow-hidden shadow-2xl rounded-sm">
            <div 
                className="w-full h-full relative overflow-hidden cursor-crosshair"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {videoSrc ? (
                    <video 
                        ref={videoRef}
                        src={videoSrc}
                        className="absolute top-0 left-0 w-full h-full object-contain"
                        style={{
                            transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                            transition: isPanning ? 'none' : 'transform 0.1s'
                        }}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        controls={false}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">ไม่ได้โหลดวิดีโอ</div>
                )}
                
                {/* GHOST OVERLAY */}
                {showGhost && ghostImage && (
                    <img 
                        src={ghostImage} 
                        className="absolute top-0 left-0 w-full h-full object-contain pointer-events-none"
                        style={{ opacity: ghostOpacity, transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)` }}
                    />
                )}
            </div>
            
            {/* OVERLAYS */}
            {mode === 'standard' && isTiming && (
                <div className="absolute top-4 right-4 bg-white/90 px-4 py-1 border border-red-500 flex items-center gap-3 shadow-md rounded">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="text-red-600 font-mono text-xl font-bold">{(currentTime - startTime).toFixed(2)}s</div>
                </div>
            )}
            {/* ZOOM INDICATOR */}
            {zoomLevel > 1 && (
                <div className="absolute top-4 left-4 bg-black/60 text-white px-2 py-1 rounded text-xs font-bold border border-gray-500">
                    ZOOM: {zoomLevel.toFixed(1)}x
                </div>
            )}
         </div>

         {/* MICRO-MOTION & CONTROL TOOLBAR */}
         <div className="bg-gray-100 p-1 border border-gray-400 flex flex-col gap-1 rounded-sm shadow-sm">
             {/* Slider & Time */}
             <div className="flex items-center gap-2 px-1">
                 <input
                    type="range" min={0} max={duration || 100} step={0.01} value={currentTime} onChange={handleSeek} disabled={!videoSrc}
                    className="custom-range w-full h-4 cursor-pointer"
                 />
                 <span className="font-mono text-sm font-bold text-blue-700 min-w-[80px] text-right">
                    {formatTime(currentTime)}
                </span>
             </div>
             
             {/* Controls Row */}
             <div className="flex justify-between items-center px-1">
                {/* Frame Step Controls */}
                <div className="flex items-center gap-1">
                    <button onClick={() => stepFrame(-5)} className="win-btn px-2 py-1" title="-5 Frames"><SkipBack size={14}/></button>
                    <button onClick={() => stepFrame(-1)} className="win-btn px-2 py-1" title="-1 Frame"><ChevronLeft size={14}/></button>
                    
                    <button onClick={toggleVideoPlay} className="win-btn px-6 py-1 mx-2 flex items-center gap-1 text-sm font-bold bg-white">
                        {videoRef.current?.paused ? <Play fill="#333" size={14} /> : <Pause fill="#333" size={14} />}
                    </button>

                    <button onClick={() => stepFrame(1)} className="win-btn px-2 py-1" title="+1 Frame"><ChevronRight size={14}/></button>
                    <button onClick={() => stepFrame(5)} className="win-btn px-2 py-1" title="+5 Frames"><SkipForward size={14}/></button>
                </div>
                
                <div className="h-6 w-px bg-gray-300 mx-2"></div>

                {/* Ghost & Zoom Controls */}
                <div className="flex items-center gap-2">
                    <button onClick={captureGhost} className="win-btn px-2 py-1 flex items-center gap-1 text-[10px] font-bold text-purple-700" title="Capture Standard Posture">
                        <Camera size={14}/> SNAP GHOST
                    </button>
                    {ghostImage && (
                        <div className="flex items-center gap-1 bg-purple-50 px-1 border border-purple-200 rounded">
                            <Layers size={14} className="text-purple-400"/>
                            <input 
                                type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} 
                                className="w-3 h-3" title="Toggle Overlay"
                            />
                            <input 
                                type="range" min="0" max="1" step="0.1" value={ghostOpacity} onChange={(e) => setGhostOpacity(parseFloat(e.target.value))}
                                className="w-12 h-1 accent-purple-600" title="Opacity"
                            />
                        </div>
                    )}
                    <div className="flex items-center bg-gray-200 rounded px-1">
                         <button onClick={() => setZoomLevel(1)} className="p-1 hover:text-blue-600"><Move size={14}/></button>
                         <button onClick={() => setZoomLevel(z => Math.max(1, z-0.5))} className="p-1 hover:text-blue-600"><ZoomOut size={14}/></button>
                         <button onClick={() => setZoomLevel(z => Math.min(5, z+0.5))} className="p-1 hover:text-blue-600"><ZoomIn size={14}/></button>
                    </div>
                </div>
             </div>
         </div>

         {/* ACTION BUTTONS (Standard/Logistics) */}
         {mode === 'standard' ? (
             <div className="bg-gray-100 p-1 border border-gray-400 flex items-center gap-2 rounded-sm">
                 {!isTiming ? (
                     <button onClick={handleStartTask} disabled={!videoSrc} className="win-btn bg-[#0078d7] hover:bg-[#005a9e] text-white border-[#005a9e] px-4 py-2 flex-1 text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
                        <Play size={16} fill="white"/> เริ่มจับเวลา
                     </button>
                 ) : (
                     <button onClick={handleEndTask} className="win-btn bg-red-100 border-red-400 hover:bg-red-200 text-red-700 px-4 py-2 flex-1 text-sm font-bold flex items-center justify-center gap-2 animate-pulse">
                        <Clock size={16} /> หยุด ({(currentTime - startTime).toFixed(1)}s)
                     </button>
                 )}
                 <button onClick={toggleWalk} disabled={!isTiming} className={`win-btn px-4 py-2 flex-1 text-sm font-bold flex items-center justify-center gap-2 ${isWalking ? 'bg-yellow-100 border-yellow-400 text-yellow-800' : ''}`}>
                    <Footprints size={16} /> {isWalking ? "กำลังเดิน..." : "เดิน (Walk)"}
                 </button>
             </div>
         ) : (
            <div className="bg-[#f0f0f0] p-1 border border-gray-400">
             {/* Logistics Buttons (Same as before) */}
              <div className="flex justify-between items-center mb-1 px-1">
                 <h3 className="font-bold text-gray-700 text-xs">Logistics Actions</h3>
                 {currentLogisticsEvent && <button onClick={() => {}} className="win-btn px-2 py-0.5 text-[10px] text-red-600 font-bold border-red-300 bg-red-50">STOP</button>}
             </div>
             <div className="grid grid-cols-4 gap-1">
                 {LOGISTICS_ACTIONS.map((action, idx) => (
                     <button key={idx} className="win-btn py-1.5 px-1 text-[10px] font-bold text-gray-700 flex flex-col items-center gap-1">
                         {action.icon}<span className="truncate w-full text-center">{action.name}</span>
                     </button>
                 ))}
             </div>
          </div>
         )}
      </div>

      {/* CENTER: Data Table */}
      <div className="flex-1 flex flex-col bg-white border border-gray-400 shadow-sm min-w-[400px]">
          {/* Header */}
          <div className="p-1 bg-[#e1e1e1] border-b border-gray-400 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                  <ScanEye className="text-green-700" size={16} />
                  <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="bg-white text-xs border border-gray-400 px-1 py-0.5 outline-none font-bold text-gray-700">
                      <option value="standard">จับเวลามาตรฐาน (Time Study)</option>
                      <option value="logistics">โลจิสติกส์ (Flow Analysis)</option>
                  </select>
              </div>
              <div className="flex gap-1 items-center">
                  {mode === 'standard' && (
                    <>
                        <button 
                            onClick={() => templateInputRef.current?.click()} 
                            className="win-btn px-2 py-0.5 text-blue-800 font-bold flex items-center gap-1 bg-blue-50 border-blue-300 hover:bg-blue-100" 
                            title="Import Excel Template & Fill Data"
                        >
                            <FileUp size={14}/> Import & Fill
                        </button>
                        <div className="h-4 w-px bg-gray-400 mx-1"></div>
                        <button onClick={addTask} className="win-btn px-2 py-0.5 text-blue-700 font-bold" title="เพิ่มรายการ"><Plus size={14} /></button>
                        <div className="h-full w-px bg-gray-400 mx-1"></div>
                        <button onClick={() => currentRound > 0 && setCurrentRound(r => r-1)} className="win-btn px-1"><ChevronLeft size={14} /></button>
                        <span className="text-xs font-bold self-center bg-white border border-gray-300 px-2 py-0.5 min-w-[30px] text-center">รอบที่ {currentRound + 1}</span>
                        <button onClick={() => setCurrentRound(r => r+1)} className="win-btn px-1"><ChevronRight size={14} /></button>
                    </>
                  )}
              </div>
          </div>

          <div className="flex-1 overflow-auto bg-white relative relative-container" ref={tableContainerRef}>
             {/* RED OVERLAY LINE */}
             {mode === 'standard' && (
                 <svg className="absolute inset-0 pointer-events-none z-10 w-full h-full" style={{minWidth: '100%', minHeight: '100%'}}>
                     <path d={overlayPath} fill="none" stroke="#dc2626" strokeWidth="2.5" />
                 </svg>
             )}

             {mode === 'standard' ? (
                  <table className="w-full text-xs text-left border-collapse relative z-20 bg-transparent">
                      {/* ... (Existing table code remains the same) ... */}
                      <thead className="bg-[#f0f0f0] text-gray-700 sticky top-0 z-30 shadow-sm border-b border-gray-300">
                          <tr>
                              <th rowSpan={2} className="p-1 border-r border-gray-300 w-8 text-center font-normal bg-[#e1e1e1] border-b border-gray-300 align-middle">#</th>
                              <th rowSpan={2} className="p-1 border-r border-gray-300 font-normal bg-[#e1e1e1] border-b border-gray-300 align-middle">ชื่องาน (Element Name)</th>
                              <th colSpan={5} className="p-1 border-r border-gray-300 text-center font-bold bg-[#e1e1e1] border-b border-gray-300 h-8 align-middle">ประเภท</th>
                              <th colSpan={Math.max(3, currentRound + 1)} className="p-1 border-r border-gray-300 text-center font-normal bg-[#e1e1e1] border-b border-gray-300 align-middle">เวลาที่จับได้ (Observed Time)</th>
                              <th rowSpan={2} className="p-1 text-center w-12 font-bold bg-[#e1e1e1] border-b border-gray-300 align-middle">เฉลี่ย</th>
                          </tr>
                          <tr>
                              {FLOW_SYMBOLS.map((sym) => (
                                  <th key={sym.type} className="p-1 border-r border-gray-300 w-9 text-center bg-[#f9f9f9] border-b border-gray-300 align-middle" title={sym.thaiLabel}>
                                      <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                                          <div className="w-6 h-6 text-gray-600"><svg viewBox="0 0 24 24" className="w-full h-full" fill="none">{sym.path}</svg></div>
                                          <span className="text-[9px]">{sym.thaiLabel}</span>
                                      </div>
                                  </th>
                              ))}
                              {Array.from({length: Math.max(3, currentRound + 1)}).map((_, rIdx) => (
                                  <th key={rIdx} className={`p-1 border-r border-gray-300 text-center min-w-[80px] font-normal border-b border-gray-300 align-middle ${rIdx === currentRound ? 'bg-blue-100 font-bold' : 'bg-[#f9f9f9]'}`}>รอบ {rIdx + 1}</th>
                              ))}
                          </tr>
                      </thead>
                      <tbody className="text-gray-800">
                          {tasks.map((task, idx) => {
                              const isActive = idx === activeTaskIndex;
                              const isSelected = idx === selectedTaskIndex;
                              const validRounds = task.rounds.filter(r => r);
                              const avg = validRounds.length ? (validRounds.reduce((acc, r) => acc + r!.total, 0) / validRounds.length) : 0;
                              return (
                                  <tr 
                                    key={task.id} 
                                    className={`cursor-pointer border-b border-gray-200 ${isActive ? 'bg-blue-100' : isSelected ? 'bg-gray-100' : 'hover:bg-[#f5f9ff]'}`}
                                    onClick={() => { setSelectedTaskIndex(idx); setSelectedRoundIndex(null); }}
                                  >
                                      <td className="p-1 text-center border-r border-gray-200 bg-[#f9f9f9] align-middle">{idx + 1}</td>
                                      <td className="p-1 truncate max-w-[120px] border-r border-gray-200 align-middle px-2">
                                          <div className="flex items-center gap-2">
                                              {task.thumbnail && <img src={task.thumbnail} className="w-6 h-4 object-cover border border-gray-300"/>}
                                              {task.name}
                                          </div>
                                      </td>
                                      {FLOW_SYMBOLS.map((sym) => {
                                          const isActiveType = (task.activity || 'Operation') === sym.type;
                                          return (
                                              <td key={sym.type} data-active={isActiveType} onClick={(e) => {e.stopPropagation(); setTasks(prev => { const n = [...prev]; n[idx].activity = sym.type; return n; })}} className="p-1 text-center border-r border-gray-200 align-middle hover:bg-gray-200">
                                                  <div className={`w-6 h-6 mx-auto ${isActiveType ? 'text-blue-900 scale-110' : 'text-gray-300'}`}><svg viewBox="0 0 24 24" className="w-full h-full fill-none stroke-current stroke-2">{sym.path}</svg></div>
                                              </td>
                                          );
                                      })}
                                      {Array.from({length: Math.max(3, currentRound + 1)}).map((_, rIdx) => {
                                          const isRoundSelected = isSelected && selectedRoundIndex === rIdx;
                                          return (
                                              <td key={rIdx} className={`p-0 border-r border-gray-200 align-top relative ${isRoundSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 z-10' : ''}`} onClick={(e) => {e.stopPropagation(); setSelectedTaskIndex(idx); setSelectedRoundIndex(rIdx);}}>
                                                  {task.rounds[rIdx] ? (
                                                      <div className="text-[10px] w-full flex flex-col gap-px py-1">
                                                          {/* Hand Time */}
                                                          <div className="flex justify-between px-1">
                                                              <span className="text-gray-400 text-[9px]">มือ</span>
                                                              <span className="font-mono font-medium text-gray-700">{task.rounds[rIdx]!.ht.toFixed(2)}</span>
                                                          </div>
                                                          
                                                          {/* Walk Time (Conditional) */}
                                                          {task.rounds[rIdx]!.wt > 0 && (
                                                              <div className="flex justify-between px-1 bg-yellow-50/50">
                                                                  <span className="text-amber-600 text-[9px]">เดิน</span>
                                                                  <span className="font-mono font-medium text-amber-700">{task.rounds[rIdx]!.wt.toFixed(2)}</span>
                                                              </div>
                                                          )}

                                                          {/* Machine Time (Conditional) */}
                                                          {task.rounds[rIdx]!.mt > 0 && (
                                                              <div className="flex justify-between px-1 bg-red-50/50">
                                                                  <span className="text-red-500 text-[9px]">เครื่อง</span>
                                                                  <span className="font-mono font-medium text-red-600">{task.rounds[rIdx]!.mt.toFixed(2)}</span>
                                                              </div>
                                                          )}

                                                          {/* Total Time */}
                                                          <div className="flex justify-between px-1 bg-gray-100 border-t border-gray-200 mt-0.5">
                                                              <span className="text-gray-900 font-bold text-[9px]">รวม</span>
                                                              <span className="font-mono font-bold text-black">{task.rounds[rIdx]!.total.toFixed(2)}</span>
                                                          </div>
                                                      </div>
                                                  ) : <div className="h-full min-h-[48px] text-center text-gray-300 flex items-center justify-center">-</div>}
                                              </td>
                                          );
                                      })}
                                      <td className="p-1 text-center font-bold bg-[#f5f5f5] text-blue-700 align-middle">{avg > 0 ? avg.toFixed(1) : ''}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
             ) : (
                 <div className="p-2 text-center text-gray-500">Logistics Data View</div>
             )}
          </div>
      </div>

      {/* RIGHT: Engineering Panel (Properties & PMTS) */}
      {/* ... (Right Panel code remains same) ... */}
      {mode === 'standard' && selectedTaskIndex !== null && tasks[selectedTaskIndex] && (
          <div className="w-[300px] flex flex-col bg-[#f0f0f0] border border-gray-400 shadow-xl z-20">
               <div className="p-2 bg-[#007acc] text-white text-xs font-bold flex justify-between items-center">
                   <span className="flex items-center gap-2"><Settings2 size={14}/> คุณสมบัติ (Properties)</span>
                   <button onClick={() => { setSelectedTaskIndex(null); setSelectedRoundIndex(null); }} className="hover:bg-blue-600 p-1 rounded"><X size={14}/></button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-2 space-y-3">
                   {/* ... (Same Right Panel Content) ... */}
                   {selectedRoundIndex !== null && (
                       <div className="border border-blue-400 p-2 bg-blue-50 rounded-sm shadow-sm relative">
                           <div className="absolute -top-2 left-2 px-1 bg-blue-50 text-[10px] text-blue-700 font-bold flex items-center gap-1">
                               <Edit size={10}/> แก้ไขรอบที่ {selectedRoundIndex + 1}
                           </div>
                           <div className="grid grid-cols-3 gap-2 mt-2">
                               <div>
                                   <label className="text-[10px] font-bold text-green-700 block">มือ (Hand)</label>
                                   <input type="number" className="w-full win-inset px-1 text-right text-xs font-mono" value={tasks[selectedTaskIndex].rounds[selectedRoundIndex]?.ht || 0} onChange={(e) => updateRoundData(e.target.value, 'ht')}/>
                               </div>
                               <div>
                                   <label className="text-[10px] font-bold text-yellow-700 block">เดิน (Walk)</label>
                                   <input type="number" className="w-full win-inset px-1 text-right text-xs font-mono" value={tasks[selectedTaskIndex].rounds[selectedRoundIndex]?.wt || 0} onChange={(e) => updateRoundData(e.target.value, 'wt')}/>
                               </div>
                               <div>
                                   <label className="text-[10px] font-bold text-red-700 block">เครื่อง (Mach)</label>
                                   <input type="number" className="w-full win-inset px-1 text-right text-xs font-mono" value={tasks[selectedTaskIndex].rounds[selectedRoundIndex]?.mt || 0} onChange={(e) => updateRoundData(e.target.value, 'mt')}/>
                               </div>
                           </div>
                           <div className="mt-2 pt-2 border-t border-blue-200 flex justify-between items-center">
                               <span className="text-xs font-bold text-gray-700">เวลารวม (Total)</span>
                               <span className="text-sm font-bold font-mono text-black bg-white px-2 border border-gray-300 rounded">{(tasks[selectedTaskIndex].rounds[selectedRoundIndex]?.total || 0).toFixed(2)}s</span>
                           </div>
                       </div>
                   )}

                   {/* PMTS CALCULATOR */}
                   <div className="border border-purple-400 p-2 bg-purple-50 rounded-sm shadow-sm relative mt-2">
                       <div className="absolute -top-2 left-2 px-1 bg-purple-50 text-[10px] text-purple-700 font-bold flex items-center gap-1">
                           <Calculator size={10}/> คำนวณเวลามาตรฐาน (MODAPTS)
                       </div>
                       <p className="text-[9px] text-gray-500 mt-1 mb-2">เลือกโค้ดเพื่อคำนวณเวลามาตรฐานอัตโนมัติ</p>
                       <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                           {MODAPTS_CODES.map((m) => (
                               <button 
                                    key={m.code}
                                    onClick={() => applyPMTS(m.val)}
                                    className="flex items-center justify-between px-2 py-1 bg-white border border-purple-200 hover:bg-purple-100 hover:border-purple-400 text-xs rounded transition-colors"
                                    title={m.desc}
                               >
                                   <span className="font-bold text-purple-800">{m.code}</span>
                                   <span className="font-mono text-gray-600">{m.val.toFixed(3)}s</span>
                               </button>
                           ))}
                       </div>
                       {selectedRoundIndex === null && <div className="text-[9px] text-red-500 mt-1">* กรุณาเลือกช่องรอบเวลาก่อน</div>}
                   </div>

                   {/* GENERAL INFO */}
                   <fieldset className="border border-gray-300 p-2 bg-white rounded-sm">
                       <legend className="text-[10px] text-gray-500 font-bold px-1">รายละเอียดงาน</legend>
                       <input className="w-full win-inset px-1 py-1 text-xs mb-2 font-bold" value={tasks[selectedTaskIndex].name} onChange={(e) => {const n=[...tasks]; n[selectedTaskIndex].name=e.target.value; setTasks(n)}} placeholder="Task Name"/>
                       <textarea className="w-full win-inset px-1 py-1 text-xs h-16 resize-none" value={tasks[selectedTaskIndex].description || ''} onChange={(e) => {const n=[...tasks]; n[selectedTaskIndex].description=e.target.value; setTasks(n)}} placeholder="Description..."/>
                   </fieldset>

                   {/* CALCULATIONS */}
                   <fieldset className="border border-gray-300 p-2 bg-white rounded-sm">
                       <legend className="text-[10px] text-gray-500 font-bold px-1">ปรับแก้เวลา</legend>
                       <div className="flex items-center justify-between mb-1">
                           <label className="text-xs">Rating %</label>
                           <input type="number" className="w-12 win-inset px-1 text-right text-xs" value={tasks[selectedTaskIndex].rating || 100} onChange={(e) => {const n=[...tasks]; n[selectedTaskIndex].rating=parseInt(e.target.value); setTasks(n)}}/>
                       </div>
                       <div className="flex items-center justify-between">
                           <label className="text-xs">Allowance %</label>
                           <input type="number" className="w-12 win-inset px-1 text-right text-xs" value={tasks[selectedTaskIndex].allowance || 0} onChange={(e) => {const n=[...tasks]; n[selectedTaskIndex].allowance=parseInt(e.target.value); setTasks(n)}}/>
                       </div>
                   </fieldset>

                   <button onClick={() => removeTask(selectedTaskIndex!)} className="win-btn w-full py-1 text-xs text-red-600 border-red-300 hover:bg-red-50 flex items-center justify-center gap-1 mt-2">
                       <Trash2 size={12} /> ลบรายการนี้
                   </button>
               </div>
          </div>
      )}
      <style>{`
        /* High Contrast Custom Slider (Cross-Browser) */
        input[type=range].custom-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          background: transparent;
        }
        /* ... existing styles ... */
        /* Webkit (Chrome/Edge/Safari) */
        input[type=range].custom-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3B82F6;
          cursor: pointer;
          margin-top: -6px;
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
          border: 2px solid white;
          transition: transform 0.1s;
        }
        
        input[type=range].custom-range::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        
        input[type=range].custom-range::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: #4B5563;
          border-radius: 2px;
        }
        
        /* Firefox */
        input[type=range].custom-range::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3B82F6;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 0 2px rgba(0,0,0,0.5);
        }

        input[type=range].custom-range::-moz-range-track {
          width: 100%;
          height: 4px;
          cursor: pointer;
          background: #4B5563;
          border-radius: 2px;
        }
        
        input[type=range].custom-range:focus {
          outline: none;
        }
      `}</style>
    </div>
  );
};

export default WorkStudy;
