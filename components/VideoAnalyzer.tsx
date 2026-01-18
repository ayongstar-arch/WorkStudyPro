
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Square, Video, Zap, Camera, Activity, Info, Anchor, Lock, BoxSelect, Brain } from 'lucide-react';
import { Rect, Point, Cycle, TriggerStep, AIActionType } from '../types';
import { mapScreenToVideo, isPointInRect } from '../utils/geometry';

interface VideoAnalyzerProps {
  videoSrc: string | null;
  taktTime: number;
  sensitivity: number;
  refRect: Rect | null;
  triggerSteps: TriggerStep[];
  onRefRectChange: (rect: Rect | null) => void;
  onTriggerStepsChange: (steps: TriggerStep[]) => void;
  onCycleComplete: (cycle: Cycle) => void;
  onFPSUpdate: (fps: number) => void;
  onStatusUpdate: (status: string) => void;
  seekRequest?: { time: number, id: number } | null;
}

// --- CONFIGURATION ---
const CV_CONFIG = {
    BLUR_SIZE: 5,      
    DIFF_THRESHOLD: 25, 
    EMA_ALPHA: 0.2,    
    MIN_CYCLE_TIME: 1.0, 
};

// MediaPipe Landmark Indices
const POSE_LM = {
    NOSE: 0,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
};

type LogicState = 'IDLE' | 'TRIGGERED' | 'COOLDOWN';

const safeDelete = (mat: any) => {
    if (mat && typeof mat.delete === 'function' && !mat.isDeleted()) {
        try { mat.delete(); } catch (e) { console.warn("Failed to delete mat", e); }
    }
};

const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ 
  videoSrc, 
  taktTime,
  sensitivity,
  triggerSteps,
  onTriggerStepsChange,
  onCycleComplete, 
  onFPSUpdate, 
  onStatusUpdate,
  seekRequest
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  const [isCvReady, setIsCvReady] = useState(false);
  const [isAiReady, setIsAiReady] = useState(false); // Pose Model Ready
  const [mode, setMode] = useState<'setup' | 'running'>('setup');
  const [setupSubMode, setSetupSubMode] = useState<'start_roi' | 'end_roi' | 'anchor' | 'none'>('none');
  const [isPlaying, setIsPlaying] = useState(false); 
  
  const [refImages, setRefImages] = useState<{start: string | null, end: string | null, anchor: string | null}>({ start: null, end: null, anchor: null });
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [drawingRect, setDrawingRect] = useState<Partial<Rect> | null>(null);
  const dragStart = useRef<Point | null>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);
  const dragOffset = useRef<Point>({ x: 0, y: 0 });

  // --- CV ENGINE STATE ---
  const processingCanvas = useRef<HTMLCanvasElement | null>(null);
  const srcMat = useRef<any>(null);      
  const grayMat = useRef<any>(null);     
  const startRefMat = useRef<any>(null); 
  const endRefMat = useRef<any>(null);
  const anchorMat = useRef<any>(null);   
  
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const trackingOffset = useRef<{x: number, y: number}>({x: 0, y: 0});
  const isTrackingLost = useRef<boolean>(false);
  
  const signalState = useRef({ raw: 0, smooth: 0, prevSmooth: 0 });
  const logicState = useRef<LogicState>('IDLE');
  const cycleStartTime = useRef<number>(0); 
  const cooldownTimer = useRef<number>(0);
  const lastProcessTime = useRef<number>(0);
  const visualState = useRef<string>("Ready");

  // --- AI ACTION RECOGNITION STATE ---
  const poseRef = useRef<any>(null);
  const aiState = useRef<{
      currentAction: AIActionType;
      confidence: number;
      landmarks: any[];
      leftHandVel: number;
      rightHandVel: number;
      lastPos: { lx: number, ly: number, rx: number, ry: number } | null;
  }>({
      currentAction: 'IDLE',
      confidence: 0,
      landmarks: [],
      leftHandVel: 0,
      rightHandVel: 0,
      lastPos: null
  });

  const highThreshold = Math.max(0.01, 0.35 - (sensitivity * 0.02)); 
  const lowThreshold = highThreshold * 0.6; 

  // Seek Request Handler
  useEffect(() => {
    if (seekRequest && videoRef.current) {
        if (!isNaN(seekRequest.time) && isFinite(seekRequest.time)) {
             videoRef.current.currentTime = seekRequest.time;
        }
    }
  }, [seekRequest]);

  // Reset State
  useEffect(() => {
    setMode('setup');
    setSetupSubMode('none');
    setRefImages({ start: null, end: null, anchor: null });
    setAnchorRect(null);
    trackingOffset.current = {x: 0, y: 0};
    
    logicState.current = 'IDLE';
    signalState.current = { raw: 0, smooth: 0, prevSmooth: 0 };
    visualState.current = "พร้อมทำงาน";
    cycleStartTime.current = 0;
    
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    
    safeDelete(startRefMat.current);
    safeDelete(endRefMat.current);
    safeDelete(anchorMat.current);
    startRefMat.current = null;
    endRefMat.current = null;
    anchorMat.current = null;

    if (videoSrc) onStatusUpdate("System Reset. Please configure zones.");
  }, [videoSrc]);

  // Initialize OpenCV & MediaPipe
  useEffect(() => {
    // 1. OpenCV
    const checkCv = setInterval(() => {
      if ((window as any).cv && (window as any).cv.Mat) {
        setIsCvReady(true);
        clearInterval(checkCv);
      }
    }, 500);

    // 2. MediaPipe Pose (With Retry Logic for Robustness)
    let poseRetryCount = 0;
    const checkPose = setInterval(() => {
        if ((window as any).Pose) {
            clearInterval(checkPose);
            try {
                const pose = new (window as any).Pose({
                    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
                });
                pose.setOptions({
                    modelComplexity: 0, // 0 for speed, 1 for accuracy
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5,
                });
                pose.onResults(onPoseResults);
                poseRef.current = pose;
                setIsAiReady(true);
                console.log("AI Pose Model Loaded Successfully");
            } catch (err) {
                console.error("Failed to init Pose", err);
            }
        } else {
            poseRetryCount++;
            if (poseRetryCount > 20) { // Timeout after 10s
                clearInterval(checkPose);
                console.warn("MediaPipe Pose failed to load");
            }
        }
    }, 500);

    return () => {
        clearInterval(checkCv);
        clearInterval(checkPose);
        if (poseRef.current) poseRef.current.close();
    };
  }, []);

  const syncDimensions = () => {
    if (videoRef.current && canvasRef.current) {
        const v = videoRef.current;
        const c = canvasRef.current;
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        
        if (v.duration && !isNaN(v.duration)) setDuration(v.duration);
        
        if (!processingCanvas.current) {
            processingCanvas.current = document.createElement('canvas');
        }
        processingCanvas.current.width = v.videoWidth;
        processingCanvas.current.height = v.videoHeight;
    }
  };

  const togglePlay = () => {
      if (videoRef.current) {
          if (videoRef.current.paused) videoRef.current.play();
          else videoRef.current.pause();
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      if (videoRef.current) {
          videoRef.current.currentTime = time;
          setCurrentTime(time);
      }
  };

  const formatTime = (seconds: number) => {
      if (!seconds || isNaN(seconds)) return "0:00";
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 100);
      return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // --- AI ACTION LOGIC ---
  const onPoseResults = (results: any) => {
      if (!results.poseLandmarks) return;
      
      const lm = results.poseLandmarks;
      aiState.current.landmarks = lm;

      // 1. Calculate Hands Velocity
      const leftWrist = lm[POSE_LM.LEFT_WRIST];
      const rightWrist = lm[POSE_LM.RIGHT_WRIST];
      
      let lVel = 0;
      let rVel = 0;

      if (aiState.current.lastPos) {
          const lp = aiState.current.lastPos;
          lVel = Math.hypot(leftWrist.x - lp.lx, leftWrist.y - lp.ly);
          rVel = Math.hypot(rightWrist.x - lp.rx, rightWrist.y - lp.ry);
      }

      aiState.current.lastPos = { lx: leftWrist.x, ly: leftWrist.y, rx: rightWrist.x, ry: rightWrist.y };
      
      // Smoothing velocity
      aiState.current.leftHandVel = (aiState.current.leftHandVel * 0.7) + (lVel * 0.3);
      aiState.current.rightHandVel = (aiState.current.rightHandVel * 0.7) + (rVel * 0.3);

      // 2. Determine Action State (Heuristic)
      const avgVel = (aiState.current.leftHandVel + aiState.current.rightHandVel) / 2;
      const moveThreshold = 0.005; // Tunable
      const reachThreshold = 0.02; // Tunable
      
      // Calculate extension (distance from nose/center)
      const nose = lm[POSE_LM.NOSE];
      const leftDist = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y);
      const rightDist = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y);
      const avgDist = (leftDist + rightDist) / 2;

      let action: AIActionType = 'IDLE';
      
      if (avgVel < moveThreshold) {
          action = 'IDLE';
      } else {
          // If moving fast and far from body -> Transport (Reach/Move)
          // If moving but close to body -> Operation (Manipulation)
          if (avgDist > 0.4 && avgVel > reachThreshold) {
              action = 'TRANSPORT';
          } else {
              action = 'OPERATION';
          }
      }

      aiState.current.currentAction = action;
      aiState.current.confidence = Math.min(1.0, avgVel * 50); // Just a mock confidence based on intensity
  };

  // --- CV & UTILS ---
  const extractRoiMat = (rect: Rect, sourceMat: any) => {
      const cv = (window as any).cv;
      let x = Math.floor(rect.x); let y = Math.floor(rect.y);
      let w = Math.floor(rect.width); let h = Math.floor(rect.height);
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > sourceMat.cols) w = sourceMat.cols - x;
      if (y + h > sourceMat.rows) h = sourceMat.rows - y;
      if (w <= 1 || h <= 1) return null;
      const cvRect = new cv.Rect(x, y, w, h);
      const roi = sourceMat.roi(cvRect);
      const clone = roi.clone();
      roi.delete();
      return clone;
  };

  const matToDataUrl = (mat: any, width: number, height: number): string => {
      try {
          const cv = (window as any).cv;
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width; tempCanvas.height = height;
          cv.imshow(tempCanvas, mat);
          return tempCanvas.toDataURL();
      } catch (e) { return ""; }
  };

  const captureReference = (target: 'start' | 'end' | 'anchor') => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    try {
        const cv = (window as any).cv;
        if (!processingCanvas.current) processingCanvas.current = document.createElement('canvas');
        if (processingCanvas.current.width !== video.videoWidth) {
             processingCanvas.current.width = video.videoWidth;
             processingCanvas.current.height = video.videoHeight;
        }

        const ctx = processingCanvas.current.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error("No Context");
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        let fullFrameMat = null;
        try {
             const imgData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
             fullFrameMat = cv.matFromImageData(imgData);
        } catch (e) { throw new Error("Frame read failed"); }

        if (target === 'anchor') {
            if (!anchorRect) { alert("Draw anchor box first"); return; }
            const roi = extractRoiMat(anchorRect, fullFrameMat);
            if (roi) {
                const thumbUrl = matToDataUrl(roi, roi.cols, roi.rows);
                safeDelete(anchorMat.current);
                anchorMat.current = roi; 
                setRefImages(prev => ({ ...prev, anchor: thumbUrl }));
                onStatusUpdate("Anchor Captured. Tracking Active.");
            }
        } else {
            const stepIndex = target === 'start' ? 0 : 1;
            if (!triggerSteps[stepIndex]) { alert(`Draw ${target} zone first`); return; }
            
            const roi = extractRoiMat(triggerSteps[stepIndex].rect, fullFrameMat);
            if (roi) {
                const thumbUrl = matToDataUrl(roi, roi.cols, roi.rows);
                
                const gray = new cv.Mat();
                cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
                const blurred = new cv.Mat();
                const ksize = new cv.Size(CV_CONFIG.BLUR_SIZE, CV_CONFIG.BLUR_SIZE);
                cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
                
                if (target === 'start') {
                    safeDelete(startRefMat.current);
                    startRefMat.current = blurred; 
                    setRefImages(prev => ({ ...prev, start: thumbUrl }));
                }
                
                safeDelete(gray);
                safeDelete(roi);
                onStatusUpdate(`Reference ${target.toUpperCase()} Captured (Background Model Set)`);
            }
        }
        safeDelete(fullFrameMat);

    } catch (e: any) {
        console.error("Capture Error:", e);
        alert(`Capture failed: ${e.message}`);
    }
  };

  const calculateChangeScore = (currentFrameGray: any, refMat: any, rect: Rect, offset: {x:number, y:number}): number => {
    try {
        if (!refMat || refMat.isDeleted()) return 0;
        const cv = (window as any).cv;
        
        const adjustedRect = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
        const roi = extractRoiMat(adjustedRect, currentFrameGray);
        if (!roi) return 0;
        
        const blurred = new cv.Mat();
        const ksize = new cv.Size(CV_CONFIG.BLUR_SIZE, CV_CONFIG.BLUR_SIZE);
        cv.GaussianBlur(roi, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
        
        const diff = new cv.Mat();
        cv.absdiff(blurred, refMat, diff);
        
        const thresholded = new cv.Mat();
        cv.threshold(diff, thresholded, CV_CONFIG.DIFF_THRESHOLD, 255, cv.THRESH_BINARY);
        
        const nonZero = cv.countNonZero(thresholded);
        const totalPixels = rect.width * rect.height;
        const score = totalPixels > 0 ? nonZero / totalPixels : 0;
        
        safeDelete(roi); safeDelete(blurred); safeDelete(diff); safeDelete(thresholded);
        return score;
    } catch (e) { return 0; }
  };

  const trackAnchor = (fullFrameMat: any) => {
      if (!anchorMat.current || !anchorRect) return;
      try {
          const cv = (window as any).cv;
          const margin = 50; 
          const lastX = anchorRect.x + trackingOffset.current.x;
          const lastY = anchorRect.y + trackingOffset.current.y;
          
          let searchX = Math.max(0, lastX - margin);
          let searchY = Math.max(0, lastY - margin);
          let searchW = Math.min(fullFrameMat.cols - searchX, anchorRect.width + (margin * 2));
          let searchH = Math.min(fullFrameMat.rows - searchY, anchorRect.height + (margin * 2));
          
          const searchRect = new cv.Rect(searchX, searchY, searchW, searchH);
          const searchRoi = fullFrameMat.roi(searchRect);
          
          const result = new cv.Mat();
          const mask = new cv.Mat();
          
          cv.matchTemplate(searchRoi, anchorMat.current, result, cv.TM_CCOEFF_NORMED, mask);
          const minMax = cv.minMaxLoc(result, mask);
          
          safeDelete(result); safeDelete(mask); safeDelete(searchRoi);

          if (minMax.maxVal > 0.6) {
              const foundX = searchX + minMax.maxLoc.x;
              const foundY = searchY + minMax.maxLoc.y;
              trackingOffset.current = { x: foundX - anchorRect.x, y: foundY - anchorRect.y };
              isTrackingLost.current = false;
          } else {
              isTrackingLost.current = true;
          }
      } catch (e) { console.error("Tracking failed", e); }
  };

  // --- MAIN LOOP ---
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
       requestRef.current = requestAnimationFrame(processFrame);
       return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const now = performance.now();
    const videoTime = video.currentTime;
    setCurrentTime(videoTime);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Feed AI Pose if ready and running
        // Using decoupled throttle check to prevent main loop stutter
        if (isAiReady && poseRef.current && mode === 'running' && !video.paused) {
             if (now - lastProcessTime.current > 66) { 
                 poseRef.current.send({ image: video });
             }
        }
    }

    if (!isCvReady || video.paused || (now - lastProcessTime.current < 50)) { 
        drawUI(ctx);
        requestRef.current = requestAnimationFrame(processFrame);
        return;
    }

    lastProcessTime.current = now;

    try {
        const cv = (window as any).cv;
        const pCtx = processingCanvas.current?.getContext('2d', { willReadFrequently: true });
        
        if (pCtx) {
            pCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const imgData = pCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            
            safeDelete(srcMat.current);
            safeDelete(grayMat.current);
            
            srcMat.current = cv.matFromImageData(imgData);
            grayMat.current = new cv.Mat();
            cv.cvtColor(srcMat.current, grayMat.current, cv.COLOR_RGBA2GRAY);
            
            if (anchorMat.current) trackAnchor(srcMat.current);

            if (!isTrackingLost.current && startRefMat.current && triggerSteps[0]) {
                const rawScore = calculateChangeScore(
                    grayMat.current, 
                    startRefMat.current, 
                    triggerSteps[0].rect, 
                    trackingOffset.current
                );

                const alpha = CV_CONFIG.EMA_ALPHA;
                const smoothScore = (alpha * rawScore) + ((1 - alpha) * signalState.current.prevSmooth);
                
                signalState.current = { raw: rawScore, smooth: smoothScore, prevSmooth: smoothScore };
                processLogic(smoothScore, videoTime);
            }
        }
    } catch (e) { console.error("Process Frame Error", e); }

    drawUI(ctx);
    onFPSUpdate(Math.round(1000 / (now - lastProcessTime.current + 0.1)));
    requestRef.current = requestAnimationFrame(processFrame);
  }, [isCvReady, isAiReady, mode, triggerSteps, sensitivity, taktTime]);

  // --- LOGIC CONTROLLER ---
  const processLogic = (score: number, timestamp: number) => {
      if (logicState.current === 'COOLDOWN') {
          if (timestamp > cooldownTimer.current) {
              logicState.current = 'IDLE';
              visualState.current = "Ready";
          }
          return;
      }

      if (logicState.current === 'IDLE') {
          if (score > highThreshold) {
              logicState.current = 'TRIGGERED';
              cycleStartTime.current = timestamp;
              visualState.current = "WORK STARTED";
              onStatusUpdate("Cycle Started");
          }
      } else if (logicState.current === 'TRIGGERED') {
          if (score < lowThreshold) {
              const duration = timestamp - cycleStartTime.current;
              if (duration > CV_CONFIG.MIN_CYCLE_TIME) {
                  let status: 'ok' | 'over' | 'abnormal' = 'ok';
                  if (duration > taktTime) status = 'over';
                  
                  // Use AI Classification as Label
                  const aiLabel = aiState.current.currentAction;

                  onCycleComplete({
                      id: Date.now(),
                      startTime: cycleStartTime.current,
                      endTime: timestamp,
                      duration: duration,
                      status: status,
                      aiLabel: aiLabel === 'IDLE' ? 'Operation' : (aiLabel === 'TRANSPORT' ? 'Transport' : 'Operation')
                  });
                  
                  visualState.current = `Cycle Finished (${duration.toFixed(1)}s)`;
                  onStatusUpdate(`Cycle Logged: ${duration.toFixed(2)}s`);
                  logicState.current = 'COOLDOWN';
                  cooldownTimer.current = timestamp + 1.5; 
              } else {
                  logicState.current = 'IDLE';
                  visualState.current = "False Trigger (Too Short)";
              }
          } else {
              visualState.current = `Working... ${(timestamp - cycleStartTime.current).toFixed(1)}s`;
          }
      }
  };

  // --- UI RENDERER ---
  const drawUI = (ctx: CanvasRenderingContext2D) => {
      const offset = trackingOffset.current;
      
      const drawHighContrastBox = (x: number, y: number, w: number, h: number, color: string, label: string, isDashed: boolean = false, isFilled: boolean = true) => {
          ctx.save();
          if (isFilled) {
              ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba'); 
              if (color.startsWith('#')) ctx.fillStyle = color === '#F59E0B' ? 'rgba(245, 158, 11, 0.15)' : color === '#EF4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)';
              ctx.fillRect(x, y, w, h);
          }
          ctx.beginPath(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(x, y, w, h);
          ctx.beginPath(); ctx.lineWidth = 4; ctx.strokeStyle = 'white'; 
          if (isDashed) ctx.setLineDash([5, 5]); ctx.strokeRect(x, y, w, h);
          ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = color;
          if (isDashed) ctx.setLineDash([5, 5]); else ctx.setLineDash([]); ctx.strokeRect(x, y, w, h);

          const handleSize = 6; ctx.fillStyle = color; ctx.setLineDash([]);
          ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
          ctx.fillRect(x + w - handleSize/2, y - handleSize/2, handleSize, handleSize);
          ctx.fillRect(x - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
          ctx.fillRect(x + w - handleSize/2, y + h - handleSize/2, handleSize, handleSize);

          ctx.font = "bold 12px Arial";
          const metrics = ctx.measureText(label);
          ctx.fillStyle = color; ctx.fillRect(x, y - 20, metrics.width + 12, 20);
          ctx.fillStyle = 'white'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 6, y - 10);
          ctx.restore();
      };

      // Draw AI Skeleton Overlay
      if (mode === 'running' && aiState.current.landmarks.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.fillStyle = '#60a5fa';
          const w = ctx.canvas.width;
          const h = ctx.canvas.height;
          
          const hands = [POSE_LM.LEFT_WRIST, POSE_LM.RIGHT_WRIST];
          hands.forEach(idx => {
             const pt = aiState.current.landmarks[idx];
             if (pt && pt.visibility > 0.5) {
                 ctx.beginPath();
                 ctx.arc(pt.x * w, pt.y * h, 6, 0, 2 * Math.PI);
                 ctx.fill();
                 ctx.stroke();
             }
          });
          ctx.restore();
      }

      if (anchorRect) {
          const ax = anchorRect.x + offset.x; const ay = anchorRect.y + offset.y;
          const color = isTrackingLost.current ? '#EF4444' : '#F59E0B';
          const label = isTrackingLost.current ? "⚠️ LOST" : "⚓ ANCHOR";
          drawHighContrastBox(ax, ay, anchorRect.width, anchorRect.height, color, label, true, true);
      }

      triggerSteps.forEach((step, idx) => {
          if (idx > 0) return; 
          const x = step.rect.x + offset.x; const y = step.rect.y + offset.y;
          const isTriggered = logicState.current === 'TRIGGERED';
          let color = isTriggered ? '#EF4444' : (signalState.current.smooth > lowThreshold ? '#F59E0B' : '#10B981');
          
          // Enhanced Label with AI State
          let label = isTriggered ? "⚡ DETECTED" : "🎯 ZONE";
          if (isTriggered && aiState.current.currentAction !== 'IDLE') {
              label += ` (${aiState.current.currentAction})`;
          }
          
          drawHighContrastBox(x, y, step.rect.width, step.rect.height, color, label, false, true);
          
          // Threshold Viz
          ctx.save();
          const barX = x + step.rect.width + 8;
          const barH = step.rect.height;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.strokeStyle = 'white'; ctx.lineWidth = 1;
          ctx.strokeRect(barX, y, 8, barH); ctx.fillRect(barX, y, 8, barH);
          const signalH = Math.min(barH, signalState.current.smooth * barH * 2); 
          ctx.fillStyle = isTriggered ? '#EF4444' : '#10B981';
          ctx.fillRect(barX + 1, y + barH - signalH, 6, signalH);
          ctx.restore();
      });

      if (drawingRect && drawingRect.width) {
          const color = setupSubMode === 'anchor' ? '#F59E0B' : '#3B82F6';
          const label = setupSubMode === 'anchor' ? "Drawing Anchor..." : "Drawing Zone...";
          drawHighContrastBox(drawingRect.x || 0, drawingRect.y || 0, drawingRect.width, drawingRect.height || 0, color, label, true, false);
      }

      if (mode === 'running') {
          ctx.save();
          ctx.font = "bold 20px Arial";
          ctx.fillStyle = "#FFFFFF";
          ctx.shadowColor = "black"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
          ctx.fillText(`STATUS: ${visualState.current}`, 20, 40);
          
          // AI HUD
          ctx.font = "bold 14px monospace";
          ctx.fillStyle = "#A3E635";
          ctx.fillText(`AI ACTION: ${aiState.current.currentAction}`, 20, 65);
          ctx.font = "12px monospace";
          ctx.fillStyle = "#D1D5DB";
          ctx.fillText(`CONFIDENCE: ${(aiState.current.confidence * 100).toFixed(0)}%`, 20, 80);
          ctx.restore();
      }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(requestRef.current);
  }, [processFrame]);

  // --- EVENT HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!videoRef.current) return;
    const pt = mapScreenToVideo(e.clientX, e.clientY, videoRef.current);

    if (setupSubMode !== 'none') {
        dragStart.current = pt;
        setDrawingRect({ x: pt.x, y: pt.y, width: 0, height: 0 });
    } else if (mode === 'setup') {
        const clickedStep = triggerSteps.find(s => isPointInRect(pt, s.rect));
        if (clickedStep) {
            setDraggingStepId(clickedStep.id);
            dragOffset.current = { x: pt.x - clickedStep.rect.x, y: pt.y - clickedStep.rect.y };
            setRefImages(prev => ({...prev, start: null})); 
        }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!videoRef.current) return;
    const pt = mapScreenToVideo(e.clientX, e.clientY, videoRef.current);

    if (draggingStepId) {
        const newSteps = triggerSteps.map(s => {
            if (s.id === draggingStepId) {
                return { ...s, rect: { ...s.rect, x: pt.x - dragOffset.current.x, y: pt.y - dragOffset.current.y } };
            }
            return s;
        });
        onTriggerStepsChange(newSteps);
    } else if (dragStart.current) {
        setDrawingRect({
            x: Math.min(pt.x, dragStart.current.x),
            y: Math.min(pt.y, dragStart.current.y),
            width: Math.abs(pt.x - dragStart.current.x),
            height: Math.abs(pt.y - dragStart.current.y)
        });
    }
  };

  const handleMouseUp = () => {
    if (draggingStepId) {
        setDraggingStepId(null);
    } else if (dragStart.current && drawingRect && drawingRect.width! > 10) {
        const rect = drawingRect as Rect;
        if (setupSubMode === 'start_roi') {
            const newSteps = [{ id: 'start', name: "Work Zone", rect: rect, isActive: false, hitCount: 0 }];
            onTriggerStepsChange(newSteps);
            setRefImages(prev => ({...prev, start: null}));
        } else if (setupSubMode === 'anchor') {
            setAnchorRect(rect);
            safeDelete(anchorMat.current);
            anchorMat.current = null;
        }
    }
    dragStart.current = null;
    setDrawingRect(null);
    setSetupSubMode('none');
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="bg-gray-800 p-2 rounded flex items-center justify-between shrink-0 shadow-lg border border-gray-700">
          <div className="flex items-center gap-2">
            <button 
                onClick={() => {
                   if (mode === 'setup') {
                       if (triggerSteps.length === 0) { alert("Please draw a Work Zone"); return; }
                       if (!refImages.start) { alert("Please capture Empty State Reference"); return; }
                       setMode('running');
                       if (videoRef.current) videoRef.current.play();
                   } else {
                       setMode('setup');
                       if (videoRef.current) videoRef.current.pause();
                       logicState.current = 'IDLE';
                   }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded font-bold transition-all ${mode === 'running' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
                {mode === 'setup' ? <Zap size={16}/> : <Square size={16}/>}
                {mode === 'setup' ? 'ARM SYSTEM' : 'STOP & EDIT'}
            </button>
            
            {mode === 'setup' && (
                <div className="flex gap-4 ml-4 items-center">
                    <div className="flex items-center gap-1 bg-gray-900 p-1 rounded border border-yellow-700/50">
                         <button onClick={() => setSetupSubMode('anchor')} className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${setupSubMode === 'anchor' ? 'bg-yellow-600 border-yellow-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}>
                            <Anchor size={14} /> 1. Anchor
                        </button>
                        <button onClick={() => captureReference('anchor')} className={`p-1.5 rounded border ${anchorMat.current ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400'}`}><Lock size={14}/></button>
                    </div>

                    <div className="flex items-center gap-1 bg-gray-900 p-1 rounded border border-gray-600">
                         <button onClick={() => setSetupSubMode('start_roi')} className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${setupSubMode === 'start_roi' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-300'}`}>
                            <BoxSelect size={14} /> 2. Zone
                        </button>
                        <button onClick={() => captureReference('start')} className={`p-1.5 rounded border ${refImages.start ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}><Camera size={14}/></button>
                    </div>
                </div>
            )}
          </div>
          
          <div className="flex gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded flex items-center gap-1 ${isAiReady ? 'bg-purple-900/30 text-purple-400' : 'bg-gray-800 text-gray-500'}`}>
                <Brain size={12}/> {isAiReady ? "AI: Active" : "AI: Loading..."}
              </span>
              <span className={`px-2 py-0.5 rounded ${isCvReady ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {isCvReady ? "CV: Ready" : "CV: Loading..."}
              </span>
          </div>
      </div>

      <div className="flex-grow flex flex-col bg-black rounded border border-gray-700 overflow-hidden relative">
        <div className="flex-grow relative overflow-hidden group bg-black cursor-crosshair">
            <video 
                ref={videoRef} 
                src={videoSrc || undefined}
                onLoadedMetadata={syncDimensions}
                className="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none" 
                muted loop
            />
            <canvas 
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="absolute inset-0 w-full h-full object-contain z-10"
            />
        </div>
            
        <div className="h-12 bg-gray-900 border-t border-gray-700 flex items-center px-4 gap-4 z-30 shrink-0">
            <button onClick={togglePlay} className="text-white hover:text-blue-400 shrink-0">
                {isPlaying ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}
            </button>
            
            <div className="flex-grow flex items-center gap-2">
                <span className="font-mono text-xs text-gray-400 w-10 text-right">{formatTime(currentTime)}</span>
                <input 
                    type="range" min="0" max={duration || 100} step="0.05" 
                    value={currentTime} onChange={handleSeek}
                    className="flex-grow h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="font-mono text-xs text-gray-400 w-10">{formatTime(duration)}</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default VideoAnalyzer;
