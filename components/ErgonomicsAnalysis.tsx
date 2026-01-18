
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Pause, Activity, User, AlertTriangle, Info, TrendingUp, ShieldAlert, CheckCircle } from 'lucide-react';
import { ErgoFrame } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Props {
  videoSrc: string | null;
  onDataUpdate?: (data: ErgoFrame[]) => void;
}

// MediaPipe Pose Landmark Indices
const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_EAR: 7, RIGHT_EAR: 8,
};

const ErgonomicsAnalysis: React.FC<Props> = ({ videoSrc, onDataUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPoseReady, setIsPoseReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Analysis State
  const [ergoData, setErgoData] = useState<ErgoFrame[]>([]);
  const [currentFrameData, setCurrentFrameData] = useState<ErgoFrame | null>(null);
  
  const poseRef = useRef<any>(null);
  const requestRef = useRef<number>(0);
  const lastProcessTime = useRef<number>(0);

  // Propagate data up when it changes (throttled)
  useEffect(() => {
      if(onDataUpdate && ergoData.length > 0) {
          const timeout = setTimeout(() => onDataUpdate(ergoData), 1000);
          return () => clearTimeout(timeout);
      }
  }, [ergoData, onDataUpdate]);

  // Initialize MediaPipe Pose
  useEffect(() => {
    const loadPose = async () => {
      if ((window as any).Pose) {
        const pose = new (window as any).Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        pose.onResults(onResults);
        poseRef.current = pose;
        setIsPoseReady(true);
      }
    };
    loadPose();
    return () => { if (poseRef.current) poseRef.current.close(); };
  }, []);

  // Geometry Helpers
  const calcAngle = (a: {x:number, y:number}, b: {x:number, y:number}, c: {x:number, y:number}) => {
    // Calculate angle at point b
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
  };

  const calcVerticalAngle = (top: {x:number, y:number}, bottom: {x:number, y:number}) => {
      // Angle deviation from vertical axis (0 degrees is perfectly upright)
      // Vector vertical is (0, -1)
      const dx = top.x - bottom.x;
      const dy = top.y - bottom.y; // Y increases downwards
      // Angle with -Y axis
      let angle = Math.atan2(Math.abs(dx), Math.abs(dy)) * (180 / Math.PI);
      return angle;
  };

  const calculateRiskScore = (neck: number, trunk: number, upperArm: number) => {
      // Simplified RULA-like Logic
      // 1. Neck Score
      let neckScore = 1;
      if (neck > 10 && neck <= 20) neckScore = 2;
      else if (neck > 20) neckScore = 3;

      // 2. Trunk Score
      let trunkScore = 1;
      if (trunk > 0 && trunk <= 20) trunkScore = 2;
      else if (trunk > 20 && trunk <= 60) trunkScore = 3;
      else if (trunk > 60) trunkScore = 4;

      // 3. Upper Arm Score
      let armScore = 1;
      if (upperArm > 20 && upperArm <= 45) armScore = 2;
      else if (upperArm > 45 && upperArm <= 90) armScore = 3;
      else if (upperArm > 90) armScore = 4;

      // Grand Score (Weighted approximation)
      const total = Math.min(7, Math.round((neckScore * 1.5) + trunkScore + (armScore * 1.2)));
      
      let level: ErgoFrame['riskLevel'] = 'Low';
      if (total >= 3 && total <= 4) level = 'Medium';
      if (total >= 5 && total <= 6) level = 'High';
      if (total >= 7) level = 'Very High';

      return { score: total, level };
  };

  const onResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    ctx.clearRect(0, 0, width, height);
    
    if (results.poseLandmarks) {
      // 1. Draw Skeleton (Standard)
      (window as any).drawConnectors(ctx, results.poseLandmarks, (window as any).POSE_CONNECTIONS, { color: '#ffffff55', lineWidth: 2 });
      (window as any).drawLandmarks(ctx, results.poseLandmarks, { color: '#3b82f6', lineWidth: 1, radius: 3 });

      // 2. Extract Key Points (Averaging Left/Right for side view mostly, or pick visible side)
      // Logic: detect which shoulder is more visible? Or just use Right side default for demo
      const lm = results.poseLandmarks;
      const nose = lm[LM.NOSE];
      const ear = lm[LM.RIGHT_EAR].visibility > lm[LM.LEFT_EAR].visibility ? lm[LM.RIGHT_EAR] : lm[LM.LEFT_EAR];
      const shoulder = lm[LM.RIGHT_SHOULDER].visibility > lm[LM.LEFT_SHOULDER].visibility ? lm[LM.RIGHT_SHOULDER] : lm[LM.LEFT_SHOULDER];
      const hip = lm[LM.RIGHT_HIP].visibility > lm[LM.LEFT_HIP].visibility ? lm[LM.RIGHT_HIP] : lm[LM.LEFT_HIP];
      const elbow = lm[LM.RIGHT_ELBOW].visibility > lm[LM.LEFT_ELBOW].visibility ? lm[LM.RIGHT_ELBOW] : lm[LM.LEFT_ELBOW];
      
      // 3. Calculate Angles
      // Trunk: Vertical vs Hip-Shoulder line
      const trunkAngle = calcVerticalAngle(shoulder, hip);
      
      // Neck: Trunk line vs Shoulder-Ear line
      // Actually RULA defines neck based on Trunk.
      // Simplification: Neck angle deviation from vertical trunk extension
      // Vector trunk: Hip -> Shoulder. Vector Neck: Shoulder -> Ear.
      const neckAngleRaw = calcAngle(hip, shoulder, ear);
      const neckAngle = Math.abs(180 - neckAngleRaw);

      // Upper Arm: Trunk line vs Shoulder-Elbow
      const armAngleRaw = calcAngle(hip, shoulder, elbow);
      // If arm is down along body, angle is near 0 (or 180 depending on calc).
      // Ideally upper arm flexion is angle from vertical torso line
      // This simple 3-point angle gives angle *between* torso and arm.
      // If arm is down, angle is small (~0-20). If arm raised forward, angle increases.
      const upperArmAngle = armAngleRaw;

      // 4. Calculate Risk
      const { score, level } = calculateRiskScore(neckAngle, trunkAngle, upperArmAngle);

      // 5. Store Data
      const frameData: ErgoFrame = {
          timestamp: videoRef.current.currentTime,
          neckAngle,
          trunkAngle,
          upperArmAngle,
          score,
          riskLevel: level
      };
      
      setCurrentFrameData(frameData);
      
      // Only record to history if playing and new second (sample rate)
      if (!videoRef.current.paused) {
          // crude sampling to avoid too much data
          setErgoData(prev => {
              if (prev.length > 0 && Math.abs(prev[prev.length - 1].timestamp - frameData.timestamp) < 0.2) return prev;
              return [...prev, frameData];
          });
      }

      // 6. Draw Visual Feedback (Augmented Reality)
      ctx.lineWidth = 4;
      
      // Trunk Line
      ctx.strokeStyle = trunkAngle > 20 ? (trunkAngle > 60 ? '#EF4444' : '#EAB308') : '#22C55E';
      ctx.beginPath(); ctx.moveTo(hip.x * width, hip.y * height); ctx.lineTo(shoulder.x * width, shoulder.y * height); ctx.stroke();
      
      // Neck Line
      ctx.strokeStyle = neckAngle > 20 ? '#EF4444' : (neckAngle > 10 ? '#EAB308' : '#22C55E');
      ctx.beginPath(); ctx.moveTo(shoulder.x * width, shoulder.y * height); ctx.lineTo(ear.x * width, ear.y * height); ctx.stroke();

      // Arm Line
      ctx.strokeStyle = upperArmAngle > 45 ? (upperArmAngle > 90 ? '#EF4444' : '#EAB308') : '#22C55E';
      ctx.beginPath(); ctx.moveTo(shoulder.x * width, shoulder.y * height); ctx.lineTo(elbow.x * width, elbow.y * height); ctx.stroke();

      // Draw Angles Text
      ctx.fillStyle = 'white'; ctx.font = 'bold 14px font-mono'; ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
      
      const drawText = (txt: string, x: number, y: number) => {
          ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
      };

      drawText(`${trunkAngle.toFixed(0)}°`, (hip.x + shoulder.x)/2 * width + 10, (hip.y + shoulder.y)/2 * height);
      drawText(`${neckAngle.toFixed(0)}°`, shoulder.x * width, shoulder.y * height - 20);
      drawText(`${upperArmAngle.toFixed(0)}°`, elbow.x * width + 10, elbow.y * height);
    }
  };

  const processFrame = () => {
      if (videoRef.current && poseRef.current && isPoseReady) {
          const now = performance.now();
          if (now - lastProcessTime.current > 100) { // Limit AI FPS to ~10 for performance
             poseRef.current.send({ image: videoRef.current });
             lastProcessTime.current = now;
          }
      }
      requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
      requestRef.current = requestAnimationFrame(processFrame);
      return () => cancelAnimationFrame(requestRef.current);
  }, [isPoseReady]);

  const togglePlay = () => {
      if (videoRef.current) {
          if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); }
          else { videoRef.current.pause(); setIsPlaying(false); }
      }
  };

  const riskColor = (level?: string) => {
      switch(level) {
          case 'Low': return 'bg-green-500';
          case 'Medium': return 'bg-yellow-500';
          case 'High': return 'bg-orange-500';
          case 'Very High': return 'bg-red-600';
          default: return 'bg-gray-500';
      }
  };

  return (
    <div className="flex h-full gap-2 bg-gray-950 p-2">
       {/* Left: Video & AR */}
       <div className="flex-grow flex flex-col gap-2 relative">
           <div className="flex-grow bg-black rounded-lg border border-gray-800 relative overflow-hidden flex items-center justify-center">
               {videoSrc ? (
                   <>
                     <video 
                        ref={videoRef} 
                        src={videoSrc} 
                        className="absolute inset-0 w-full h-full object-contain opacity-60"
                        onLoadedMetadata={(e) => {
                            setDuration(e.currentTarget.duration);
                            if (canvasRef.current) {
                                canvasRef.current.width = e.currentTarget.videoWidth;
                                canvasRef.current.height = e.currentTarget.videoHeight;
                            }
                        }}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        muted loop
                     />
                     <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
                   </>
               ) : (
                   <div className="text-gray-500 flex flex-col items-center"><Activity size={48} className="mb-2"/> Load Video in 'Capture' Tab first</div>
               )}
               
               {/* Overlay HUD */}
               <div className="absolute top-4 left-4 bg-black/70 backdrop-blur border border-gray-700 p-3 rounded-lg w-64">
                   <h3 className="text-gray-300 text-xs font-bold uppercase mb-2 flex items-center gap-2"><User size={14}/> Real-time Angles</h3>
                   <div className="grid grid-cols-2 gap-y-2 text-xs">
                       <div className="text-gray-400">Neck Flexion</div>
                       <div className={`font-mono font-bold text-right ${(currentFrameData?.neckAngle || 0) > 20 ? 'text-red-400' : 'text-green-400'}`}>{currentFrameData?.neckAngle.toFixed(1)}°</div>
                       
                       <div className="text-gray-400">Trunk Flexion</div>
                       <div className={`font-mono font-bold text-right ${(currentFrameData?.trunkAngle || 0) > 20 ? 'text-red-400' : 'text-green-400'}`}>{currentFrameData?.trunkAngle.toFixed(1)}°</div>

                       <div className="text-gray-400">Arm Raise</div>
                       <div className={`font-mono font-bold text-right ${(currentFrameData?.upperArmAngle || 0) > 45 ? 'text-red-400' : 'text-green-400'}`}>{currentFrameData?.upperArmAngle.toFixed(1)}°</div>
                   </div>
               </div>
           </div>

           {/* Controls */}
           <div className="h-12 bg-gray-900 border border-gray-800 rounded-lg flex items-center px-4 gap-4">
               <button onClick={togglePlay} className="text-white hover:text-blue-400">
                   {isPlaying ? <Pause size={24}/> : <Play size={24}/>}
               </button>
               <input 
                  type="range" min="0" max={duration} step="0.1" value={currentTime} 
                  onChange={(e) => { if(videoRef.current) videoRef.current.currentTime = parseFloat(e.target.value); }}
                  className="flex-grow h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
               />
               <span className="font-mono text-xs text-gray-400">{currentTime.toFixed(1)}s</span>
           </div>
       </div>

       {/* Right: Dashboard */}
       <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
           <div className="p-3 border-b border-gray-800 bg-gray-900">
               <h2 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="text-blue-500"/> Ergonomics AI</h2>
               <div className="text-[10px] text-gray-500">Rapid Entire Body Assessment (Auto)</div>
           </div>

           <div className="p-4 flex flex-col items-center border-b border-gray-800 bg-gray-800/30">
               <div className="text-xs text-gray-400 uppercase font-bold mb-2">Current Risk Score</div>
               <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${currentFrameData?.score && currentFrameData.score >= 5 ? 'border-red-500 bg-red-900/20' : (currentFrameData?.score && currentFrameData.score >= 3 ? 'border-yellow-500 bg-yellow-900/20' : 'border-green-500 bg-green-900/20')}`}>
                   <span className="text-4xl font-bold text-white">{currentFrameData?.score || 1}</span>
               </div>
               <div className={`mt-2 px-3 py-1 rounded-full text-xs font-bold text-white ${riskColor(currentFrameData?.riskLevel)}`}>
                   {currentFrameData?.riskLevel || 'Low'} Risk
               </div>
           </div>

           <div className="flex-grow p-2 flex flex-col min-h-0">
               <h3 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-2"><TrendingUp size={12}/> Risk Over Time</h3>
               <div className="flex-grow bg-black/50 rounded border border-gray-800 p-1">
                   <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={ergoData}>
                           <defs>
                               <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                                   <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                               </linearGradient>
                           </defs>
                           <XAxis dataKey="timestamp" hide />
                           <YAxis domain={[1, 7]} hide />
                           <Tooltip 
                               contentStyle={{backgroundColor: '#111', border: '1px solid #333', fontSize: '10px'}}
                               itemStyle={{color: '#fff'}}
                               labelFormatter={(l) => `${l.toFixed(1)}s`}
                           />
                           <ReferenceLine y={3} stroke="#EAB308" strokeDasharray="3 3" />
                           <ReferenceLine y={5} stroke="#EF4444" strokeDasharray="3 3" />
                           <Area type="monotone" dataKey="score" stroke="#EF4444" fillOpacity={1} fill="url(#colorScore)" isAnimationActive={false} />
                       </AreaChart>
                   </ResponsiveContainer>
               </div>
           </div>

           <div className="p-3 border-t border-gray-800 bg-gray-900 text-[10px] text-gray-500">
               <div className="flex items-center gap-2 mb-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> 1-2: Acceptable</div>
               <div className="flex items-center gap-2 mb-1"><div className="w-2 h-2 bg-yellow-500 rounded-full"></div> 3-4: Further Investigation</div>
               <div className="flex items-center gap-2 mb-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div> 5-7: Investigate & Change</div>
           </div>
       </div>
    </div>
  );
};

export default ErgonomicsAnalysis;
