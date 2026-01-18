
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Monitor, Wifi, Disc, Save, StopCircle, Clock, Video, CalendarClock, AlertTriangle, Plus, Trash2, ChevronDown, FolderOpen, FileVideo, X, Info, FileQuestion, Signal, Smartphone, Eye, EyeOff, Server } from 'lucide-react';

// Helper to verify permission with better error handling
async function verifyPermission(fileHandle: FileSystemHandle, readWrite: boolean) {
  const options = { mode: readWrite ? 'readwrite' as const : 'read' as const };
  
  try {
      // Check if permission was already granted
      // @ts-ignore - queryPermission is experimental
      if ((await fileHandle.queryPermission(options)) === 'granted') {
        return true;
      }
      
      // Request permission (requires user gesture if not already granted)
      // @ts-ignore - requestPermission is experimental
      if ((await fileHandle.requestPermission(options)) === 'granted') {
        return true;
      }
  } catch (err) {
      console.error("Permission check failed:", err);
  }
  
  return false;
}

const VideoRecorder: React.FC = () => {
  // Source State
  const [sourceType, setSourceType] = useState<'webcam' | 'screen' | 'ip'>('webcam');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  // IP Camera State
  const [ipUrl, setIpUrl] = useState<string>('');
  const [useProxy, setUseProxy] = useState<boolean>(false); // New: Proxy Toggle
  const [savedIps, setSavedIps] = useState<string[]>([]);
  const [showIpDropdown, setShowIpDropdown] = useState(false);
  const [showIpHelp, setShowIpHelp] = useState(false);
  const [networkMode, setNetworkMode] = useState<'wifi' | 'mobile'>('wifi'); // 'wifi' = Low Latency, 'mobile' = High Stability
  const [isViewOnly, setIsViewOnly] = useState(false); // Fallback mode for non-CORS streams

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("พร้อมใช้งาน");
  const [currentFileName, setCurrentFileName] = useState<string>("");
  
  // File System State
  const [saveDirHandle, setSaveDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [forceSaveAs, setForceSaveAs] = useState<boolean>(false); 

  // Scheduler State
  const [scheduleStart, setScheduleStart] = useState<string>('');
  const [scheduleEnd, setScheduleEnd] = useState<string>('');
  const [systemTime, setSystemTime] = useState<string>('');
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const writableStreamRef = useRef<FileSystemWritableFileStream | null>(null);
  const chunksRef = useRef<Blob[]>([]); // Fallback storage
  const timerRef = useRef<number>(0);
  const hlsRef = useRef<any>(null);

  // Load available cameras & Saved IPs
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === 'videoinput');
        setDevices(videoDevs);
        if (videoDevs.length > 0) setSelectedDeviceId(videoDevs[0].deviceId);
      } catch (e) {
        console.error("Error listing devices", e);
      }
    };
    getDevices();

    // Load saved IPs
    const saved = localStorage.getItem('yamazumi_saved_ips');
    if (saved) {
        try {
            setSavedIps(JSON.parse(saved));
        } catch(e) {}
    }
  }, []);

  // System Clock
  useEffect(() => {
    const updateClock = () => {
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        setSystemTime(`${h}:${m}:${s}`);
    };
    const interval = setInterval(updateClock, 1000);
    updateClock();

    return () => {
      clearInterval(interval);
      stopStream();
      if (hlsRef.current) hlsRef.current.destroy();
      if (timerRef.current) clearInterval(interval);
    };
  }, []);

  const stopStream = () => {
    if (videoRef.current) {
        // Stop MediaStream (Webcam/Screen)
        if (videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        // Stop Direct Source (IP Cam)
        if (videoRef.current.hasAttribute('src')) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
        }
        // Clear attributes
        videoRef.current.removeAttribute('crossorigin');
    }
    setIsViewOnly(false);
  };

  // Start Stream Logic
  const startStream = async () => {
    stopStream();
    setIsViewOnly(false);

    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    try {
      if (sourceType === 'webcam') {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined, width: 1280, height: 720 },
          audio: true 
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatusMsg("เว็บแคมกำลังทำงาน");
        await videoRef.current?.play();
      } else if (sourceType === 'screen') {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatusMsg("กำลังจับภาพหน้าจอ");
        await videoRef.current?.play();
      } else if (sourceType === 'ip') {
        if (!videoRef.current) return;
        
        if (!ipUrl || !ipUrl.trim()) {
            setStatusMsg("❌ กรุณาระบุ URL");
            return;
        }

        // PROXY LOGIC: If enabled, route via a CORS proxy (demo: cors-anywhere or local proxy)
        // In production, you would point this to your own proxy server
        const finalUrl = useProxy ? `https://cors-proxy.htm.io/?url=${encodeURIComponent(ipUrl)}` : ipUrl;
        
        // Auto-detect HLS
        const isHls = finalUrl.includes('.m3u8');
        // @ts-ignore
        const Hls = window.Hls;

        if (isHls && Hls && Hls.isSupported()) {
           // Configure HLS based on Network Mode
           const hlsConfig = networkMode === 'mobile' ? {
               // High Stability Config (Sim Net / 5G)
               maxBufferLength: 30,
               maxMaxBufferLength: 60,
               liveSyncDurationCount: 3,
               enableWorker: true,
           } : {
               // Low Latency Config (WiFi / LAN)
               maxBufferLength: 10,
               maxMaxBufferLength: 20,
               liveSyncDurationCount: 1, 
               enableWorker: true,
           };

           const hls = new Hls(hlsConfig);
           hls.loadSource(finalUrl);
           hls.attachMedia(videoRef.current);
           
           hls.on(Hls.Events.ERROR, function (event: any, data: any) {
                if (data.fatal) {
                    setStatusMsg(`⚠️ HLS Error: ${data.type}`);
                    switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        break;
                    }
                }
            });

           hlsRef.current = hls;
           setStatusMsg(`IP Stream (HLS - ${networkMode === 'mobile' ? 'เสถียร' : 'เร็ว'}) เชื่อมต่อแล้ว`);
           try {
               await videoRef.current.play();
           } catch(e) {
               console.error("HLS Play Error", e);
               setStatusMsg("❌ HLS Play Error");
           }

        } else {
           // Direct MJPEG or native support
           setStatusMsg("กำลังเชื่อมต่อ...");
           
           // Attempt 1: With CORS (Anonymous) - Essential for AI
           videoRef.current.crossOrigin = "anonymous";
           videoRef.current.src = finalUrl;

           try {
               await videoRef.current.play();
               setStatusMsg("✅ IP Stream เชื่อมต่อแล้ว (AI Ready)");
           } catch (e) {
               console.error("Play failed with CORS:", e);
               
               // Attempt 2: Without CORS (View Only)
               // Only try this if NOT using proxy (Proxy should fix CORS)
               if (!useProxy && videoRef.current) {
                   setStatusMsg("⚠️ CORS บล็อก. เปลี่ยนเป็นโหมดดูอย่างเดียว...");
                   videoRef.current.removeAttribute('crossorigin');
                   videoRef.current.src = ''; // Force reset
                   videoRef.current.src = finalUrl;
                   
                   try {
                       await videoRef.current.play();
                       setIsViewOnly(true);
                       setStatusMsg("👁️ ดูอย่างเดียว (บันทึก/AI ไม่ได้)");
                   } catch (err2) {
                       console.error("Play failed without CORS:", err2);
                       setStatusMsg("❌ เชื่อมต่อล้มเหลว ตรวจสอบ URL");
                   }
               } else {
                   setStatusMsg("❌ เชื่อมต่อล้มเหลว (Check Proxy/CORS)");
               }
           }
        }
      }
    } catch (err) {
      console.error(err);
      setStatusMsg("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // Toggle Source Type
  const handleSourceToggle = (type: 'webcam' | 'screen' | 'ip') => {
      if (sourceType === type) {
          if (type !== 'webcam') {
              setSourceType('webcam');
              stopStream();
              setStatusMsg("พร้อมใช้งาน");
          }
      } else {
          setSourceType(type);
          stopStream(); 
          setStatusMsg("พร้อมใช้งาน");
      }
  };

  // IP Management
  const saveIp = () => {
      if (ipUrl && !savedIps.includes(ipUrl)) {
          const newIps = [...savedIps, ipUrl];
          setSavedIps(newIps);
          localStorage.setItem('yamazumi_saved_ips', JSON.stringify(newIps));
      }
  };

  const removeIp = (ip: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newIps = savedIps.filter(i => i !== ip);
      setSavedIps(newIps);
      localStorage.setItem('yamazumi_saved_ips', JSON.stringify(newIps));
  };

  // Directory Selection
  const handleSelectDir = async () => {
      // 1. Secure Context Check
      if (!window.isSecureContext) {
          alert("ต้องใช้ HTTPS หรือ localhost เพื่อเข้าถึงโฟลเดอร์");
          return;
      }

      // 2. Browser Support Check
      // @ts-ignore
      const showDirectoryPicker = window.showDirectoryPicker;
      if (!showDirectoryPicker) {
          alert("เบราว์เซอร์ของคุณไม่รองรับการเลือกโฟลเดอร์ กรุณาใช้ Chrome หรือ Edge");
          return;
      }

      try {
          // 3. Request ReadWrite access immediately
          const handle = await showDirectoryPicker({ 
              mode: 'readwrite',
              startIn: 'videos' // Suggest starting in Videos folder if supported
          });
          
          // Verify permissions right away
          const hasPerm = await verifyPermission(handle, true);
          if (!hasPerm) {
              setStatusMsg("⚠️ ไม่ได้รับอนุญาตให้เข้าถึงโฟลเดอร์");
              return;
          }

          setSaveDirHandle(handle);
          setForceSaveAs(false); // If they pick a folder, they likely want to use it
          setStatusMsg(`📂 ปลายทาง: ${handle.name}/`);
      } catch (e: any) {
          // Handle User Cancellation gracefully
          if (e.name === 'AbortError') return;

          // Handle Cross-Origin / Iframe restrictions (common in preview environments)
          if (e.name === 'SecurityError' || e.message?.includes('Cross origin sub frames')) {
              console.warn("File System Access blocked by iframe/security context.");
              alert("การเข้าถึงโฟลเดอร์ถูกบล็อกโดยความปลอดภัยของเบราว์เซอร์");
              setSaveDirHandle(null);
              return;
          }

          console.error("Folder selection failed", e);
          setStatusMsg("❌ เลือกโฟลเดอร์ล้มเหลว");
      }
  };

  const clearDir = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSaveDirHandle(null);
      setStatusMsg("พร้อมใช้งาน (บันทึกแบบถาม)");
  };

  const performLegacyDownload = (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
      }, 100);
  };

  const stopRecording = useCallback(async (isAuto: boolean = false) => {
    if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        
        // Finalize Logic
        setIsRecording(false);
        
        // Wait briefly for last chunk
        await new Promise(resolve => setTimeout(resolve, 500));

        // SCENARIO A: Streamed directly to disk
        if (writableStreamRef.current) {
            try {
                await writableStreamRef.current.close();
                writableStreamRef.current = null;
                const dest = saveDirHandle && !forceSaveAs ? `${saveDirHandle.name}/${currentFileName}` : currentFileName;
                setStatusMsg(isAuto ? `✅ หยุดอัตโนมัติ: บันทึกลง ${dest}` : `✅ บันทึกลง ${dest} แล้ว`);
            } catch (e) {
                console.error("Error closing stream", e);
                setStatusMsg("⚠️ เกิดข้อผิดพลาดในการปิดไฟล์");
            }
            return;
        }

        // SCENARIO B: Recorded to Memory (RAM) -> NOW WE SAVE
        if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            const finalName = currentFileName || `Recording_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
            
            // Try "Save As" Dialog if supported
            // @ts-ignore
            if (window.showSaveFilePicker) {
                try {
                    // @ts-ignore
                    const handle = await window.showSaveFilePicker({
                        suggestedName: finalName,
                        types: [{
                            description: 'WebM Video',
                            accept: { 'video/webm': ['.webm'] },
                        }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    
                    setStatusMsg(`✅ บันทึกลง ${handle.name}`);
                    chunksRef.current = []; // Clear RAM
                    return;
                } catch (err: any) {
                    if (err.name === 'AbortError') {
                        setStatusMsg("⚠️ ยกเลิกการบันทึก (กำลังดาวน์โหลดสำรอง...)");
                        // Fallback to legacy download to ensure no data loss
                    } else {
                        console.error("Save As failed", err);
                    }
                }
            }

            // Fallback: Standard Download
            performLegacyDownload(blob, finalName);
            chunksRef.current = [];
            setStatusMsg(isAuto ? "✅ หยุดอัตโนมัติ: ดาวน์โหลดแล้ว" : "✅ ดาวน์โหลดไฟล์แล้ว");
        }
    }
  }, [isRecording, currentFileName, saveDirHandle, forceSaveAs]);

  // Recording Logic
  const startRecording = useCallback(async (isAuto: boolean = false) => {
    if (!videoRef.current) return;

    if (isViewOnly) {
        alert("ไม่สามารถบันทึกในโหมดดูอย่างเดียวได้ (ติดปัญหา CORS)\nวิธีแก้: ใช้ Proxy หรือแปลงเป็น HLS ที่มี CORS Header");
        return;
    }

    let streamToRecord: MediaStream | null = null;

    if (sourceType === 'ip') {
        try {
            // @ts-ignore
            streamToRecord = videoRef.current.captureStream ? videoRef.current.captureStream(30) : videoRef.current.mozCaptureStream(30);
        } catch(e) {
            console.error("CORS Error on IP capture");
            setStatusMsg("❌ ข้อผิดพลาด: IP CORS (ต้องใช้ Proxy)");
            return;
        }
    } else {
        streamToRecord = videoRef.current.srcObject as MediaStream;
    }

    if (!streamToRecord) {
        setStatusMsg("❌ ไม่มีสัญญาณภาพ!");
        return;
    }

    // Reset storage
    chunksRef.current = [];
    writableStreamRef.current = null;
    
    // GENERATE SAFE FILENAME (Sanitize for Windows/Mac)
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    let fileName = `Recording_${dateStr}_${timeStr}.webm`;
    setCurrentFileName(fileName); // Ensure we have a name for fallback

    // --- STORAGE STRATEGY ---
    let readyToRecord = false;
    let usingFallback = false;

    // Determine if we should force "Save As" (Manual) or use Folder (Auto)
    const useSaveAs = forceSaveAs || !saveDirHandle;
    // @ts-ignore
    const showSaveFilePicker = window.showSaveFilePicker;

    // 1. Try "Save As" Dialog AT START (Only if enforced)
    if (forceSaveAs && showSaveFilePicker && !isAuto) {
        try {
            const handle = await showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'WebM Video',
                    accept: { 'video/webm': ['.webm'] },
                }],
            });
            writableStreamRef.current = await handle.createWritable();
            fileName = handle.name;
            setCurrentFileName(handle.name);
            readyToRecord = true;
        } catch (err: any) {
            if (err.name === 'AbortError') {
                setStatusMsg("❌ ยกเลิก");
                return; // User cancelled explicitly
            }
        }
    }

    // 2. Try Selected Folder (If not using Save As and folder is valid)
    if (!readyToRecord && saveDirHandle && !forceSaveAs) {
        try {
            // Check permission immediately before creating
            const hasPermission = await verifyPermission(saveDirHandle, true);
            if (hasPermission) {
                // Get handle to specific file inside folder
                const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                // Create writable stream
                writableStreamRef.current = await fileHandle.createWritable();
                
                setCurrentFileName(fileName);
                readyToRecord = true;
                setStatusMsg(`📂 กำลังบันทึกลง ${saveDirHandle.name}...`);
            } else {
                setStatusMsg("⚠️ สิทธิ์เข้าถึงโฟลเดอร์หายไป ใช้ RAM สำรอง");
                usingFallback = true;
            }
        } catch (e) {
            console.error("Folder write failed", e);
            setStatusMsg("⚠️ เขียนไฟล์ไม่สำเร็จ ใช้ RAM สำรอง");
            usingFallback = true;
        }
    }

    // 3. Fallback (Memory Blob)
    // If we didn't open a file handle yet, we record to RAM.
    // We will ask for a location when STOP is clicked.
    if (!readyToRecord) {
        if (!usingFallback && !forceSaveAs) {
             console.log("Starting memory recording (Save prompt at end).");
        }
        // Name already set above
    }

    try {
        const mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (e) => {
            if (e.data.size > 0) {
                // WRITE TO FILE DIRECTLY IF AVAILABLE
                if (writableStreamRef.current) {
                    try {
                        await writableStreamRef.current.write(e.data);
                    } catch (writeErr) {
                        console.error("Write error:", writeErr);
                        // Fallback to memory if write fails mid-stream
                        chunksRef.current.push(e.data);
                    }
                } else {
                    // MEMORY STORAGE
                    chunksRef.current.push(e.data);
                }
            }
        };

        mediaRecorder.start(1000); // Collect 1s chunks
        setIsRecording(true);
        setElapsedTime(0);
        
        let msg = "";
        if (writableStreamRef.current) {
             const dest = saveDirHandle && !forceSaveAs ? `โฟลเดอร์: ${saveDirHandle.name}` : `ไฟล์`;
             msg = isAuto ? `🔴 อัดอัตโนมัติลง ${dest}...` : `🔴 กำลังอัดลง ${dest}...`;
        } else {
             msg = isAuto ? `🔴 อัดอัตโนมัติ (RAM)...` : `🔴 กำลังอัด (RAM)...`;
        }
        setStatusMsg(msg);

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);

    } catch (err) {
        console.error(err);
        setStatusMsg("❌ เริ่มต้นการบันทึกล้มเหลว");
    }
  }, [sourceType, saveDirHandle, forceSaveAs, ipUrl, selectedDeviceId, networkMode, isViewOnly, useProxy]);

  // Scheduler Effect
  useEffect(() => {
    if (!isRecording && scheduleStart && scheduleEnd && !statusMsg.startsWith("✅") && !statusMsg.startsWith("❌")) {
       setStatusMsg(`⏳ รอเวลา: เริ่ม ${scheduleStart}...`);
    }

    const checkSchedule = () => {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        const seconds = now.getSeconds();

        // Check Start (only at :00 seconds to trigger once)
        if (scheduleStart && currentTime === scheduleStart && !isRecording && seconds < 2) {
            if (videoRef.current && (videoRef.current.srcObject || videoRef.current.src)) {
                console.log("Scheduled Start Triggered");
                startRecording(true);
            }
        }

        // Check Stop
        if (scheduleEnd && currentTime === scheduleEnd && isRecording && seconds < 2) {
             console.log("Scheduled Stop Triggered");
             stopRecording(true);
        }
    };

    const interval = setInterval(checkSchedule, 1000);
    return () => clearInterval(interval);
  }, [scheduleStart, scheduleEnd, isRecording, startRecording, stopRecording, statusMsg]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-4 gap-4">
      
      {/* Top Bar */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex gap-4 items-end flex-wrap">
            <div>
                <label className="block text-xs text-gray-400 mb-1">ประเภทแหล่งภาพ (Source)</label>
                <div className="flex bg-gray-900 rounded border border-gray-700 p-1">
                    <button 
                        onClick={() => handleSourceToggle('webcam')}
                        className={`p-2 rounded flex items-center gap-2 text-sm ${sourceType === 'webcam' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                    >
                        <Camera size={16} /> Webcam
                    </button>
                    <button 
                        onClick={() => handleSourceToggle('screen')}
                        className={`p-2 rounded flex items-center gap-2 text-sm ${sourceType === 'screen' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                    >
                        <Monitor size={16} /> หน้าจอ
                    </button>
                    <button 
                        onClick={() => handleSourceToggle('ip')}
                        className={`p-2 rounded flex items-center gap-2 text-sm ${sourceType === 'ip' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                    >
                        <Wifi size={16} /> IP Cam
                    </button>
                </div>
            </div>

            {sourceType === 'webcam' && (
                <div>
                    <label className="block text-xs text-gray-400 mb-1">เลือกอุปกรณ์</label>
                    <select 
                        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm min-w-[200px]"
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                    >
                        {devices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}...`}</option>
                        ))}
                    </select>
                </div>
            )}

            {sourceType === 'ip' && (
                <div className="relative group z-20 flex gap-2">
                    <div className="flex-1">
                        <label className="block text-xs text-gray-400 mb-1 flex justify-between items-center w-[320px]">
                            Stream URL (HTTP/HLS/MJPEG)
                            <div 
                            className="relative cursor-pointer text-blue-400 hover:text-white flex items-center gap-1"
                            onMouseEnter={() => setShowIpHelp(true)}
                            onMouseLeave={() => setShowIpHelp(false)}
                            >
                                <Info size={14} /> คู่มือ
                                {showIpHelp && (
                                    <div className="absolute top-full left-0 mt-2 w-80 bg-gray-900 border border-gray-600 p-4 rounded shadow-xl z-[100] text-xs leading-relaxed text-gray-300">
                                        <strong className="block text-white mb-2 text-sm border-b border-gray-700 pb-1">การเชื่อมต่อ IP Camera</strong>
                                        
                                        <p className="mb-2"><span className="text-blue-400 font-bold">Protocol ที่รองรับ:</span> .m3u8 (HLS), MJPEG</p>
                                        <p className="mb-2 text-red-400 font-bold">RTSP ไม่สามารถเล่นบน Browser โดยตรงได้</p>
                                        
                                        <div className="bg-black/50 p-2 rounded mb-2 border border-gray-700">
                                            <span className="text-white font-bold block mb-1">ทางแก้สำหรับ RTSP (Hikvision/Dahua):</span>
                                            1. ติดตั้ง <span className="text-green-400">MediaMTX</span> (Open Source) บน PC<br/>
                                            2. โปรแกรมจะแปลง RTSP เป็น HLS<br/>
                                            3. ใช้ URL: <code className="text-yellow-400">http://localhost:8888/cam/index.m3u8</code>
                                        </div>

                                        <p className="mt-2 text-yellow-500 italic">หาก AI ไม่ทำงาน ให้เปิดโหมด "Proxy Bypass"</p>
                                    </div>
                                )}
                            </div>
                        </label>
                        
                        {/* Input Group */}
                        <div className="flex w-[320px] relative">
                            <div className="relative flex-grow">
                                <input 
                                    type="text" 
                                    placeholder="http://192.168.1.x:8080/video"
                                    className="bg-gray-900 border border-gray-700 rounded-l px-3 py-2 text-sm w-full pr-8 focus:outline-none focus:border-blue-500 transition-colors"
                                    value={ipUrl}
                                    onChange={(e) => setIpUrl(e.target.value)}
                                    onFocus={() => setShowIpDropdown(true)}
                                />
                                {ipUrl && (
                                    <button 
                                        onClick={() => setIpUrl('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-0.5 rounded-full hover:bg-gray-800 transition-colors"
                                        title="ล้างค่า"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            
                            <button 
                                onClick={saveIp} 
                                className="bg-gray-800 hover:bg-gray-700 border border-l-0 border-gray-700 px-3 text-gray-400 hover:text-green-400 transition-colors"
                                title="บันทึก IP นี้"
                            >
                                <Plus size={16} />
                            </button>
                            <button 
                                onClick={() => setShowIpDropdown(!showIpDropdown)}
                                className="bg-gray-800 hover:bg-gray-700 border border-l-0 border-gray-700 rounded-r px-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <ChevronDown size={16} className={`transition-transform duration-200 ${showIpDropdown ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {/* Saved IPs Dropdown */}
                        {showIpDropdown && savedIps.length > 0 && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowIpDropdown(false)}></div>
                                <div className="absolute top-full left-0 w-full bg-gray-800 border border-gray-600 rounded-md mt-1 z-20 max-h-56 overflow-y-auto shadow-2xl">
                                    {savedIps.map((ip, idx) => (
                                        <div key={idx} className="flex justify-between items-center px-3 py-2.5 hover:bg-gray-700 cursor-pointer group border-b border-gray-700/50 last:border-0 transition-colors">
                                            <div 
                                                onClick={() => { setIpUrl(ip); setShowIpDropdown(false); }}
                                                className="flex items-center gap-2 overflow-hidden flex-grow"
                                            >
                                                <Wifi size={14} className="text-gray-500 flex-shrink-0" />
                                                <span className="text-sm truncate text-gray-200">{ip}</span>
                                            </div>
                                            <button 
                                                onClick={(e) => removeIp(ip, e)}
                                                className="text-gray-500 hover:text-red-400 p-1.5 rounded hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                                                title="ลบ"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    
                    {/* Controls Column */}
                    <div className="flex flex-col gap-1">
                        {/* Network Mode */}
                        <div>
                            <label className="block text-[10px] text-gray-400 mb-0.5">Buffer Mode</label>
                            <div className="flex bg-gray-900 rounded border border-gray-700 p-0.5 h-[28px]">
                                <button onClick={() => setNetworkMode('wifi')} title="Low Latency" className={`flex-1 px-2 rounded text-[10px] flex items-center justify-center gap-1 ${networkMode === 'wifi' ? 'bg-green-600 text-white' : 'text-gray-400'}`}><Signal size={10} /> Fast</button>
                                <button onClick={() => setNetworkMode('mobile')} title="Stability" className={`flex-1 px-2 rounded text-[10px] flex items-center justify-center gap-1 ${networkMode === 'mobile' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}><Smartphone size={10} /> Stable</button>
                            </div>
                        </div>
                        {/* Proxy Toggle */}
                        <div className="flex items-center gap-2 mt-1" title="Use Public CORS Proxy (Demo)">
                            <label className="text-[10px] text-gray-400 cursor-pointer flex items-center gap-1">
                                <input type="checkbox" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-0 w-3 h-3"/>
                                <span>Proxy Bypass</span>
                            </label>
                        </div>
                    </div>

                </div>
            )}

            <button 
                onClick={startStream}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm font-bold border border-gray-600 h-[38px]"
            >
                เชื่อมต่อ
            </button>
        </div>

        {/* Storage Controls */}
        <div className="flex gap-4 items-end">
            <div>
                 <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1">
                    ตำแหน่งที่บันทึกไฟล์
                 </label>
                 <div className="flex items-center gap-2">
                     <div className="relative inline-block">
                         <button 
                            onClick={handleSelectDir}
                            className={`flex items-center gap-2 px-3 py-2 rounded text-sm border transition-colors
                                ${saveDirHandle 
                                        ? 'border-green-500 text-green-300 bg-green-900/30 hover:bg-green-900/50 pr-8' 
                                        : 'border-gray-600 bg-gray-900 hover:bg-gray-800 text-gray-300'
                                }`}
                            title={saveDirHandle ? `บันทึกลง: ${saveDirHandle.name}` : "เลือกโฟลเดอร์เพื่อบันทึกอัตโนมัติ"}
                         >
                            {saveDirHandle ? <FolderOpen size={16} className="text-green-400" /> : <FolderOpen size={16} />}
                            <span className="max-w-[150px] truncate">
                                {saveDirHandle ? saveDirHandle.name : "เลือกโฟลเดอร์"}
                            </span>
                         </button>
                         
                         {saveDirHandle && (
                            <button
                                onClick={clearDir}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-green-700 hover:text-green-200 p-1 rounded-full hover:bg-green-900"
                                title="ล้างการเลือกโฟลเดอร์"
                            >
                                <X size={12} />
                            </button>
                         )}
                     </div>
                     
                     {/* "Force Save As" Checkbox */}
                     <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer bg-gray-900/50 px-2 py-2 rounded border border-gray-700 hover:bg-gray-800 transition-colors select-none" title="เปิดหน้าต่าง Save As ทุกครั้งก่อนบันทึก">
                         <input 
                            type="checkbox" 
                            checked={forceSaveAs} 
                            onChange={(e) => setForceSaveAs(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900 bg-gray-800"
                         />
                         <span className="text-xs">ถามทุกครั้ง</span>
                     </label>
                 </div>
            </div>
        </div>
      </div>

      {/* Main Video Area */}
      <div className="flex-grow bg-black rounded-lg border border-gray-700 relative overflow-hidden flex items-center justify-center">
         <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="max-w-full max-h-full object-contain"
         ></video>
         
         {/* Recording Overlay */}
         {isRecording && (
            <div className="absolute top-4 right-4 flex items-center gap-3 bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-red-900">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                <span className="font-mono text-xl font-bold text-red-500">{formatTime(elapsedTime)}</span>
            </div>
         )}
         
         {/* View Only Overlay */}
         {isViewOnly && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-yellow-900/80 backdrop-blur px-4 py-2 rounded border border-yellow-500 text-yellow-100 z-10">
                <Eye size={20} />
                <span className="font-bold text-sm">ดูอย่างเดียว (ไม่บันทึก/No AI)</span>
            </div>
         )}
         
         {/* Status Message Overlay */}
         <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-md border border-gray-700 backdrop-blur-sm flex items-center gap-2 text-sm text-gray-200 pointer-events-none shadow-lg z-10">
            <span className={`w-2 h-2 rounded-full animate-pulse ${isRecording ? 'bg-red-500' : 'bg-blue-500'}`}></span>
            {statusMsg}
         </div>
      </div>

      {/* Footer Controls */}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex items-center justify-between">
         
         {/* Scheduler */}
         <div className="flex items-center gap-6 bg-gray-900/50 px-4 py-2 rounded-lg border border-gray-700">
             <div className="flex items-center gap-2 text-gray-400 border-r border-gray-700 pr-4 mr-2">
                <Clock size={16} className="text-blue-400" />
                <span className="font-mono text-lg font-bold text-blue-100">{systemTime}</span>
             </div>

             <div className="flex items-center gap-2 text-gray-400">
                <CalendarClock size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">ตั้งเวลาบันทึก</span>
             </div>
             
             <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">เริ่ม:</span>
                <input 
                    type="time" 
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                    className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
             </div>
             
             <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">หยุด:</span>
                <input 
                    type="time" 
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                    className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
             </div>
         </div>

         <div className="flex items-center gap-4">
            {!isRecording ? (
                <button 
                    onClick={() => startRecording(false)}
                    className={`flex items-center gap-2 px-8 py-3 rounded-full font-bold shadow-lg transition-all ${
                        isViewOnly 
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-red-600 hover:bg-red-700 text-white hover:scale-105 shadow-red-900/50'
                    }`}
                    disabled={isViewOnly}
                    title={isViewOnly ? "ไม่สามารถบันทึกได้ (ติดปัญหา CORS)" : "เริ่มบันทึก"}
                >
                    <Disc size={20} /> บันทึก (Record)
                </button>
            ) : (
                <button 
                    onClick={() => stopRecording(false)}
                    className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-full font-bold border border-gray-500"
                >
                    <StopCircle size={20} /> หยุด (Stop)
                </button>
            )}
         </div>
         
         {/* Spacer */}
         <div className="w-[50px]"></div>
      </div>

    </div>
  );
};

export default VideoRecorder;
