
// ... (imports remain mostly the same, adding Edit/Trash icons)
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { WorkStudyTask, StationNode, StationStatus } from '../types';
import { Play, Pause, RotateCcw, Zap, Layers, Box, Activity, TrendingUp, AlertTriangle, ArrowRight, Settings, Target, BarChart2, Package, Signal, BrainCircuit, CheckCircle2, Edit3, Trash2, Plus, Save } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ReferenceLine } from 'recharts';

interface Props {
  tasks: WorkStudyTask[];
  taktTime: number;
}

// --- LOGIC ENGINE ---
const generateNoise = (mean: number, stdDev: number) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    const noise = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return Math.max(mean * 0.5, mean + (noise * stdDev)); // Clamp min to 50% of mean
};

// Helper to map tasks to station data (Moved outside component to ensure definition availability)
const mapTasksToStations = (sourceTasks: WorkStudyTask[]): StationNode[] => {
    return sourceTasks.map((t, idx) => {
        // Calculate stats from existing rounds
        const validRounds = t.rounds.filter(r => r);
        const mean = validRounds.length > 0 
            ? validRounds.reduce((acc, r) => acc + r!.total, 0) / validRounds.length
            : 10; 
        
        const variance = validRounds.length > 1
            ? Math.sqrt(validRounds.reduce((acc, r) => acc + Math.pow(r!.total - mean, 2), 0) / validRounds.length)
            : mean * 0.1;

        return {
            id: t.id,
            name: t.name,
            baseCycleTime: mean,
            variance: variance,
            operators: 1,
            bufferSize: 3, 
            currentWIP: idx === 0 ? 50 : 0, 
            status: 'IDLE',
            progress: 0,
            totalProcessed: 0,
            totalTimeState: { IDLE: 0, BUSY: 0, BLOCKED: 0, STARVED: 0, DOWN: 0 }
        };
    });
};

interface TransitItem {
    id: number;
    fromIdx: number;
    toIdx: number; // -1 for final exit
    progress: number; // 0 to 1
}

interface OptimizationProposal {
    stationId: string;
    stationName: string;
    action: 'ADD_OP' | 'REDUCE_CT' | 'ADD_BUFFER';
    details: string;
    predictedThroughput: number;
    roiScore: number; // Higher is better
}

const ProductionDigitalTwin: React.FC<Props> = ({ tasks, taktTime }) => {
  // --- STATE ---
  const [stations, setStations] = useState<StationNode[]>([]);
  const [transits, setTransits] = useState<TransitItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simTime, setSimTime] = useState(0); // In Seconds
  const [speed, setSpeed] = useState(5); // Default 5x speed
  
  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);

  // Dashboard Metrics
  const [throughput, setThroughput] = useState(0); // Units per Hour
  const [lineEfficiency, setLineEfficiency] = useState(0); // %
  const [bottleneckId, setBottleneckId] = useState<string | null>(null);
  
  // AI State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [proposal, setProposal] = useState<OptimizationProposal | null>(null);

  // Internal Engine State (Refs for performance)
  const engineState = useRef<{
      stations: StationNode[];
      transits: TransitItem[];
      nextFreeTime: number[]; // When each station becomes free
      inProcess: boolean[];   // Is currently processing?
      finishedCount: number;
  }>({ stations: [], transits: [], nextFreeTime: [], inProcess: [], finishedCount: 0 });
  
  const requestRef = useRef<number>();
  const lastTickRef = useRef<number>(0);

  // Defined updateLineEfficiency before usage
  const updateLineEfficiency = (st: StationNode[]) => {
      if (st.length === 0) return;
      const totalStdTime = st.reduce((acc, s) => acc + s.baseCycleTime, 0);
      const maxStationTime = Math.max(...st.map(s => s.baseCycleTime));
      const lbe = (totalStdTime / (st.length * maxStationTime)) * 100;
      setLineEfficiency(lbe);
  };

  // --- 1. INITIALIZATION (Cold Start) ---
  useEffect(() => {
      // Only initialize if engine is empty
      if (engineState.current.stations.length > 0) return;

      const initialStations = mapTasksToStations(tasks);
      setStations(initialStations);
      updateLineEfficiency(initialStations);

      // Init Engine State
      engineState.current = {
          stations: JSON.parse(JSON.stringify(initialStations)),
          transits: [],
          nextFreeTime: new Array(initialStations.length).fill(0),
          inProcess: new Array(initialStations.length).fill(false),
          finishedCount: 0
      };
  }, []); // Run once on mount

  // --- 2. LIVE PARAMETER INJECTION (Hot Update) ---
  useEffect(() => {
      // Block live updates if user is manually editing the model
      if (isEditMode) return;

      // This runs whenever 'tasks' props change (e.g., from VideoAnalyzer update)
      if (engineState.current.stations.length === 0) return;

      const updatedData = mapTasksToStations(tasks);
      
      // Update LIVE Engine State parameters WITHOUT resetting the simulation flow
      // Only update existing IDs to prevent layout shift during simulation
      engineState.current.stations.forEach((s, i) => {
          const match = updatedData.find(u => u.id === s.id);
          if (match) {
              // Inject new Real-world parameters
              s.baseCycleTime = match.baseCycleTime;
              s.variance = match.variance;
          }
      });

      // Update React State for UI to reflect new parameters
      setStations(prev => prev.map((s) => {
          const match = updatedData.find(u => u.id === s.id);
          return match ? {
              ...s,
              baseCycleTime: match.baseCycleTime,
              variance: match.variance
          } : s;
      }));
      
      updateLineEfficiency(updatedData);

  }, [tasks, isEditMode]); // Added isEditMode dependency

  // --- MANUAL EDITING FUNCTIONS ---
  const handleAddStation = () => {
      const newStation: StationNode = {
          id: crypto.randomUUID(),
          name: `Station ${stations.length + 1}`,
          baseCycleTime: 10,
          variance: 1,
          operators: 1,
          bufferSize: 3,
          currentWIP: 0,
          status: 'IDLE',
          progress: 0,
          totalProcessed: 0,
          totalTimeState: { IDLE: 0, BUSY: 0, BLOCKED: 0, STARVED: 0, DOWN: 0 }
      };
      setStations([...stations, newStation]);
  };

  const handleRemoveStation = (idx: number) => {
      const newStations = stations.filter((_, i) => i !== idx);
      setStations(newStations);
  };

  const handleUpdateStation = (idx: number, field: keyof StationNode, value: any) => {
      const newStations = [...stations];
      newStations[idx] = { ...newStations[idx], [field]: value };
      setStations(newStations);
  };

  const toggleEditMode = () => {
      if (isEditMode) {
          // Saving changes: Re-init engine with new station layout
          setIsPlaying(false);
          setSimTime(0);
          engineState.current = {
              stations: JSON.parse(JSON.stringify(stations)),
              transits: [],
              nextFreeTime: new Array(stations.length).fill(0),
              inProcess: new Array(stations.length).fill(false),
              finishedCount: 0
          };
          updateLineEfficiency(stations);
      }
      setIsEditMode(!isEditMode);
  };

  // --- DISCRETE EVENT SIMULATION LOOP ---
  const runSimulationStep = (deltaTime: number) => {
      const state = engineState.current;
      const numStations = state.stations.length;
      
      // 1. Update Transit Items (Animation & Logic)
      const TRANSIT_SPEED = 2.0; // Transit takes 0.5s (1/2.0)
      const completedTransits: number[] = [];
      
      state.transits.forEach((t, i) => {
          t.progress += deltaTime * TRANSIT_SPEED;
          if (t.progress >= 1) {
              completedTransits.push(i);
              // Arrival Logic
              if (t.toIdx === -1) {
                  state.finishedCount++;
              } else {
                  state.stations[t.toIdx].currentWIP++;
              }
          }
      });
      
      // Remove completed transits
      for (let i = completedTransits.length - 1; i >= 0; i--) {
          state.transits.splice(completedTransits[i], 1);
      }

      // 2. Station Logic
      state.stations.forEach(s => {
          // Time accounting
          s.totalTimeState[s.status] += deltaTime;
      });

      // Process Flow (Backwards to prevent index issues with pulling)
      // Logic: Pull System (Can I output? -> Can I process? -> Can I input?)
      for (let i = numStations - 1; i >= 0; i--) {
          const station = state.stations[i];
          const nextStation = i < numStations - 1 ? state.stations[i + 1] : null;
          
          // Check Output Buffer Availability
          // If next station buffer is full, we are BLOCKED
          const isOutputBlocked = nextStation ? nextStation.currentWIP >= nextStation.bufferSize : false;

          // State Machine
          if (state.inProcess[i]) {
              // PROCESSING
              station.status = 'BUSY';
              station.progress += (deltaTime / (station.baseCycleTime / station.operators)) * 100; 

              if (simTime >= state.nextFreeTime[i]) {
                  // FINISHED PROCESSING
                  if (!isOutputBlocked) {
                      // START TRANSIT
                      state.inProcess[i] = false;
                      station.progress = 0;
                      station.totalProcessed++;
                      
                      state.transits.push({
                          id: Math.random(),
                          fromIdx: i,
                          toIdx: i < numStations - 1 ? i + 1 : -1,
                          progress: 0
                      });
                  } else {
                      // BLOCKED
                      station.status = 'BLOCKED';
                      station.progress = 100; 
                  }
              }
          } else {
              // IDLE / STARVED
              if (station.currentWIP > 0) {
                  // START WORK
                  station.currentWIP--;
                  state.inProcess[i] = true;
                  station.status = 'BUSY';
                  
                  // Calculate dynamic cycle time with variance
                  const actualCT = generateNoise(station.baseCycleTime, station.variance) / station.operators;
                  state.nextFreeTime[i] = simTime + actualCT;
              } else {
                  // STARVED
                  station.status = i === 0 ? 'BUSY' : 'STARVED'; // Infinite source for S1
                  station.progress = 0;
                  
                  // Infinite Source Logic for Station 1
                  if (i === 0 && !state.inProcess[i]) {
                       // Auto-feed if infinite
                       state.inProcess[i] = true;
                       const actualCT = generateNoise(station.baseCycleTime, station.variance);
                       state.nextFreeTime[i] = simTime + actualCT;
                  }
              }
          }
      }

      // Sync React State
      setStations([...state.stations]);
      setTransits([...state.transits]);
      
      const hours = simTime / 3600;
      setThroughput(hours > 0 ? state.finishedCount / hours : 0);
  };

  const gameLoop = (timestamp: number) => {
      if (!isPlaying) return;
      
      const deltaRealTime = (timestamp - lastTickRef.current) / 1000;
      lastTickRef.current = timestamp;
      
      // Speed multiplier
      const deltaSimTime = deltaRealTime * speed;
      
      setSimTime(prev => prev + deltaSimTime);
      runSimulationStep(deltaSimTime);
      
      requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
      if (isPlaying) {
          lastTickRef.current = performance.now();
          requestRef.current = requestAnimationFrame(gameLoop);
      } else {
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      }
      return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, speed]);

  const resetSim = () => {
      setIsPlaying(false);
      setSimTime(0);
      engineState.current.finishedCount = 0;
      engineState.current.transits = [];
      
      // If we are in edit mode, reset to edited stations, else reset to initial props map
      // Actually, standard reset should just clear counters but keep current station config
      const currentConfig: StationNode[] = stations.map(s => ({
          ...s,
          currentWIP: s.id === stations[0].id ? 50 : 0,
          status: 'IDLE' as StationStatus,
          progress: 0,
          totalProcessed: 0,
          totalTimeState: { IDLE: 0, BUSY: 0, BLOCKED: 0, STARVED: 0, DOWN: 0 }
      }));
      
      engineState.current.stations = JSON.parse(JSON.stringify(currentConfig)); // Deep copy to detach
      setStations(currentConfig);
      setTransits([]);
      setProposal(null);
  };

  // --- AI PRESCRIPTIVE ANALYTICS ENGINE ---
  const runAiOptimization = () => {
      setIsOptimizing(true);
      setProposal(null);

      // Heuristic Search Algorithm (Simplified for Frontend)
      setTimeout(() => {
          // 1. Identify Bottleneck
          let maxCycleTime = 0;
          let bottleneckIdx = -1;
          stations.forEach((s, idx) => {
              const ct = s.baseCycleTime / s.operators;
              if (ct > maxCycleTime) {
                  maxCycleTime = ct;
                  bottleneckIdx = idx;
              }
          });

          if (bottleneckIdx === -1) { setIsOptimizing(false); return; }

          const bottleneck = stations[bottleneckIdx];
          const currentThroughput = 3600 / maxCycleTime;

          // 2. Generate Scenarios
          const scenarios: OptimizationProposal[] = [];

          // Scenario A: Add Operator at Bottleneck
          const improvedCT_Op = bottleneck.baseCycleTime / (bottleneck.operators + 1);
          const newMaxCT_Op = Math.max(...stations.map((s, i) => i === bottleneckIdx ? improvedCT_Op : (s.baseCycleTime / s.operators)));
          const throughput_Op = 3600 / newMaxCT_Op;
          const gain_Op = throughput_Op - currentThroughput;
          scenarios.push({
              stationId: bottleneck.id,
              stationName: bottleneck.name,
              action: 'ADD_OP',
              details: `Add 1 Operator (Total: ${bottleneck.operators + 1})`,
              predictedThroughput: throughput_Op,
              roiScore: gain_Op / 10 
          });

          // Scenario B: Reduce Cycle Time (Kaizen) by 10%
          const improvedCT_Kaizen = (bottleneck.baseCycleTime * 0.9) / bottleneck.operators;
          const newMaxCT_Kaizen = Math.max(...stations.map((s, i) => i === bottleneckIdx ? improvedCT_Kaizen : (s.baseCycleTime / s.operators)));
          const throughput_Kaizen = 3600 / newMaxCT_Kaizen;
          const gain_Kaizen = throughput_Kaizen - currentThroughput;
          scenarios.push({
              stationId: bottleneck.id,
              stationName: bottleneck.name,
              action: 'REDUCE_CT',
              details: `Kaizen: Reduce Cycle Time by 10%`,
              predictedThroughput: throughput_Kaizen,
              roiScore: gain_Kaizen / 2 // High ROI usually
          });

          // 3. Select Best Scenario
          scenarios.sort((a, b) => b.roiScore - a.roiScore);
          
          if (scenarios.length > 0 && scenarios[0].roiScore > 0) {
              setProposal(scenarios[0]);
          }

          setIsOptimizing(false);
      }, 800); 
  };

  const applyProposal = () => {
      if (!proposal) return;
      const newStations = [...stations];
      const targetStation = newStations.find(s => s.id === proposal.stationId);
      if (targetStation) {
          if (proposal.action === 'ADD_OP') targetStation.operators += 1;
          else if (proposal.action === 'REDUCE_CT') targetStation.baseCycleTime *= 0.9;
          setStations(newStations);
          setProposal(null);
          updateLineEfficiency(newStations);
      }
  };

  const recommendations = useMemo(() => {
      const recs: {id: string, type: 'critical'|'warning'|'info', msg: string, impact: string}[] = [];
      if (simTime < 30) return []; // Warm-up period

      let maxUtil = 0;
      let bottleneckNode: StationNode | null = null;
      
      stations.forEach(s => {
          const totalT = s.totalTimeState.BUSY + s.totalTimeState.IDLE + s.totalTimeState.BLOCKED + s.totalTimeState.STARVED;
          const util = (s.totalTimeState.BUSY / (totalT || 1)) * 100;
          if (util > maxUtil) {
              maxUtil = util;
              bottleneckNode = s;
          }
      });

      if (bottleneckNode) {
          setBottleneckId((bottleneckNode as StationNode).id);
          recs.push({
              id: 'bn',
              type: 'critical',
              msg: `Station "${(bottleneckNode as StationNode).name}" is the Constraint (${maxUtil.toFixed(1)}% Util).`,
              impact: 'Determines Line Output'
          });
      }

      const currentTakt = throughput > 0 ? 3600 / throughput : 0;
      if (throughput > 0 && currentTakt > taktTime * 1.1) {
           recs.push({
               id: 'takt',
               type: 'warning',
               msg: `Current Output (${throughput.toFixed(0)} uph) is below Target (${(3600/taktTime).toFixed(0)} uph).`,
               impact: `Missed: ${Math.floor((3600/taktTime) - throughput)} units/hr`
           });
      }
      return recs;
  }, [stations, simTime, throughput, taktTime, lineEfficiency]);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 overflow-hidden">
        {/* TOP BAR */}
        <div className="h-14 border-b border-gray-700 bg-gray-800 px-4 flex justify-between items-center shrink-0 shadow-md z-20">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Box className="text-blue-500" size={24} />
                    <div>
                        <h2 className="font-bold text-lg leading-none tracking-tight">Digital Twin <span className="text-blue-400">3D</span></h2>
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest">{isEditMode ? 'Builder Mode' : 'Live Simulation'}</span>
                    </div>
                </div>
                <div className="h-8 w-px bg-gray-600 mx-2"></div>
                <div className="flex gap-4">
                    <div>
                        <span className="text-[10px] text-gray-400 uppercase block">Sim Time</span>
                        <span className="font-mono font-bold text-xl text-white">{(simTime/60).toFixed(0)}:<span className="text-sm">{(simTime%60).toFixed(0).padStart(2,'0')}</span></span>
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 uppercase block">Throughput</span>
                        <span className="font-mono font-bold text-xl text-green-400">{throughput.toFixed(0)} <span className="text-[10px] text-gray-500">UPH</span></span>
                    </div>
                    <div>
                        <span className="text-[10px] text-gray-400 uppercase block">Efficiency (LBE)</span>
                        <span className={`font-mono font-bold text-xl ${lineEfficiency > 85 ? 'text-green-400' : 'text-yellow-400'}`}>{lineEfficiency.toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                {!isEditMode && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-gray-900 border border-gray-600 rounded mr-2">
                        <Signal size={14} className="text-green-500 animate-pulse" />
                        <span className="text-xs text-gray-300">Live Parameter Link Active</span>
                    </div>
                )}
                
                <button 
                    onClick={toggleEditMode}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded font-bold border transition-colors mr-2 ${isEditMode ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                >
                    {isEditMode ? <Save size={16}/> : <Edit3 size={16}/>}
                    {isEditMode ? 'SAVE MODEL' : 'DESIGN'}
                </button>

                {!isEditMode && (
                    <>
                        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-600 mr-2">
                            {[1, 5, 10, 50].map(s => (
                                <button 
                                    key={s} 
                                    onClick={() => setSpeed(s)}
                                    className={`px-3 py-1 text-xs font-bold rounded ${speed === s ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>
                        <button onClick={resetSim} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"><RotateCcw size={20}/></button>
                        <button 
                            onClick={() => setIsPlaying(!isPlaying)} 
                            className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-all ${isPlaying ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'}`}
                        >
                            {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
                            {isPlaying ? 'PAUSE' : 'SIMULATE'}
                        </button>
                    </>
                )}
            </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-grow flex min-h-0 bg-gray-950 relative overflow-hidden">
            
            {/* 3D/2.5D VISUALIZATION LAYER */}
            <div className="flex-grow relative overflow-auto custom-scrollbar p-10 flex items-center justify-center">
                
                {/* MODE SWITCH: 3D VIEW VS BUILDER GRID */}
                {isEditMode ? (
                    <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {stations.map((station, idx) => (
                            <div key={station.id} className="bg-gray-800 border border-gray-600 rounded-lg p-4 shadow-lg flex flex-col gap-3 relative group">
                                <div className="absolute top-2 right-2 flex gap-1">
                                    <span className="text-[10px] text-gray-500 font-mono">#{idx + 1}</span>
                                    <button onClick={() => handleRemoveStation(idx)} className="text-gray-500 hover:text-red-500"><Trash2 size={16}/></button>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Box size={20} className="text-blue-400"/>
                                    <input 
                                        value={station.name} 
                                        onChange={(e) => handleUpdateStation(idx, 'name', e.target.value)}
                                        className="bg-transparent border-b border-gray-600 text-white font-bold outline-none focus:border-blue-500 w-full"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <label className="text-gray-400 block mb-1">Cycle Time (s)</label>
                                        <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white" 
                                            value={station.baseCycleTime} onChange={(e) => handleUpdateStation(idx, 'baseCycleTime', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-gray-400 block mb-1">Variance (±s)</label>
                                        <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white" 
                                            value={station.variance} onChange={(e) => handleUpdateStation(idx, 'variance', parseFloat(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-gray-400 block mb-1">Operators</label>
                                        <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white" 
                                            value={station.operators} onChange={(e) => handleUpdateStation(idx, 'operators', parseInt(e.target.value))} />
                                    </div>
                                    <div>
                                        <label className="text-gray-400 block mb-1">Buffer Cap</label>
                                        <input type="number" className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white" 
                                            value={station.bufferSize} onChange={(e) => handleUpdateStation(idx, 'bufferSize', parseInt(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={handleAddStation} className="bg-gray-900/50 border-2 border-dashed border-gray-700 rounded-lg p-4 flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 transition-colors min-h-[200px]">
                            <Plus size={48} />
                            <span className="font-bold mt-2">Add Station</span>
                        </button>
                    </div>
                ) : (
                    <div className="relative flex gap-16 items-center perspective-1000">
                        {stations.map((station, idx) => {
                            const isBottleneck = station.id === bottleneckId;
                            const totalT = station.totalTimeState.BUSY + station.totalTimeState.IDLE + station.totalTimeState.BLOCKED + station.totalTimeState.STARVED + 0.1;
                            const util = (station.totalTimeState.BUSY / totalT);

                            return (
                                <div key={station.id} className="relative group">
                                    {/* Connection Arrow */}
                                    {idx < stations.length - 1 && (
                                        <div className="absolute top-1/2 -right-16 w-16 h-1 bg-gray-800 z-0 flex items-center justify-center -translate-y-1/2">
                                            <ArrowRight size={16} className="text-gray-600"/>
                                        </div>
                                    )}

                                    {/* Station Card (Isometric Effect) */}
                                    <div 
                                        className={`w-40 h-48 bg-gradient-to-b from-gray-700 to-gray-800 rounded-xl border-b-4 relative transition-all duration-300 shadow-2xl flex flex-col overflow-hidden
                                            ${isBottleneck ? 'border-red-600 ring-2 ring-red-500/50' : 'border-blue-900 ring-1 ring-white/10'}
                                        `}
                                        style={{ transform: 'rotateX(10deg) rotateY(0deg)' }}
                                    >
                                        {/* Machine Header */}
                                        <div className={`h-8 px-2 flex items-center justify-between font-bold text-[10px] text-white ${isBottleneck ? 'bg-red-700' : 'bg-gray-800 border-b border-gray-600'}`}>
                                            <span className="truncate w-24">{idx+1}. {station.name}</span>
                                            <div className={`w-2 h-2 rounded-full ${station.status === 'BUSY' ? 'bg-green-400 animate-pulse' : station.status === 'BLOCKED' ? 'bg-red-500' : 'bg-gray-500'}`}></div>
                                        </div>

                                        {/* 3D Workspace */}
                                        <div className="flex-grow relative bg-gray-900/80 p-2 flex flex-col justify-end items-center">
                                            {/* Operator */}
                                            <div className="flex gap-1 mb-2">
                                                {Array.from({length: station.operators}).map((_, i) => (
                                                    <div key={i} className="w-4 h-8 bg-blue-500 rounded-t-lg border border-blue-300 shadow-lg"></div>
                                                ))}
                                            </div>
                                            
                                            {/* Workpiece Progress */}
                                            <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
                                                <div className="h-full bg-green-500 transition-all duration-100" style={{width: `${station.progress}%`}}></div>
                                            </div>

                                            {/* Buffer Queue Stack */}
                                            <div className="absolute top-2 left-2 flex flex-col gap-0.5">
                                                {Array.from({length: Math.min(station.currentWIP, 5)}).map((_, i) => (
                                                    <div key={i} className="w-6 h-4 bg-amber-600 border border-amber-400 rounded-sm shadow-sm"></div>
                                                ))}
                                                {station.currentWIP > 5 && <span className="text-[9px] text-amber-500 font-bold">+{station.currentWIP - 5}</span>}
                                            </div>
                                        </div>

                                        {/* Stats Panel */}
                                        <div className="bg-gray-800 p-2 text-[9px] font-mono border-t border-gray-700">
                                            <div className="flex justify-between text-gray-400">
                                                <span>Util:</span>
                                                <span className={util > 0.85 ? 'text-red-400' : 'text-green-400'}>{(util*100).toFixed(0)}%</span>
                                            </div>
                                            <div className="flex justify-between text-gray-400">
                                                <span>CT:</span>
                                                <span className="text-white">{station.baseCycleTime.toFixed(1)}s</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Parameters (What-If) */}
                                    <div className="absolute -bottom-10 left-0 w-full flex gap-1 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            className="bg-gray-700 hover:bg-blue-600 text-white text-[9px] px-2 py-1 rounded"
                                            onClick={() => {
                                                const n = [...stations];
                                                n[idx].baseCycleTime = Math.max(1, n[idx].baseCycleTime - 0.5);
                                                setStations(n);
                                            }}
                                        >
                                            -0.5s
                                        </button>
                                        <button 
                                            className="bg-gray-700 hover:bg-green-600 text-white text-[9px] px-2 py-1 rounded"
                                            onClick={() => {
                                                const n = [...stations];
                                                n[idx].operators += 1;
                                                setStations(n);
                                            }}
                                        >
                                            +Op
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* ANIMATED PARTICLES LAYER */}
                        <div className="absolute inset-0 pointer-events-none">
                            {transits.map(t => {
                                // Calculate position based on fromIdx and progress
                                const PITCH = 224;
                                const startX = t.fromIdx * PITCH + 100;
                                const endX = t.fromIdx * PITCH + PITCH + 20; 
                                const currentX = startX + (endX - startX) * t.progress;
                                
                                return (
                                    <div 
                                        key={t.id}
                                        className="absolute top-1/2 w-6 h-6 bg-green-500 border-2 border-white shadow-[0_0_10px_#22c55e] rounded-sm flex items-center justify-center z-50 -translate-y-1/2 transition-transform"
                                        style={{ 
                                            left: 0,
                                            transform: `translate(${currentX}px, -50%) rotate(${t.progress * 360}deg)` 
                                        }}
                                    >
                                        <Package size={12} className="text-white"/>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* AI ASSISTANT PANEL */}
            <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0 z-10 shadow-xl">
                <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center justify-between">
                    <h3 className="font-bold text-white flex items-center gap-2"><Zap className="text-purple-500" size={18}/> IE Assistant</h3>
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                </div>
                
                {/* AI OPTIMIZATION CONTROLS */}
                {!isEditMode && (
                    <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                        <button 
                            onClick={runAiOptimization}
                            disabled={isOptimizing}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-lg shadow-lg hover:shadow-purple-900/50 transition-all flex items-center justify-center gap-2"
                        >
                            {isOptimizing ? <BrainCircuit className="animate-spin" size={18}/> : <BrainCircuit size={18}/>}
                            {isOptimizing ? 'Analyzing...' : 'AI Auto-Optimize'}
                        </button>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">Runs multi-scenario simulation to find optimal setup.</p>
                    </div>
                )}

                <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {isEditMode ? (
                        <div className="text-center text-gray-500 text-xs py-10 italic">
                            Builder Mode Active.<br/>Configure stations to see analysis.
                        </div>
                    ) : (
                        <>
                            {/* Proposal Card */}
                            {proposal && (
                                <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 border border-purple-500/50 rounded-lg p-3 animate-in fade-in slide-in-from-right-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target className="text-purple-400" size={16}/>
                                        <span className="font-bold text-xs text-purple-200">AI Recommendation</span>
                                    </div>
                                    <div className="text-sm font-bold text-white mb-1">{proposal.details}</div>
                                    <div className="text-xs text-gray-300 mb-2">at {proposal.stationName}</div>
                                    
                                    <div className="flex justify-between items-center bg-black/30 p-2 rounded mb-3">
                                        <div className="text-[10px] text-gray-400">Projected Gain</div>
                                        <div className="text-sm font-bold text-green-400">+{Math.floor(proposal.predictedThroughput - throughput)} uph</div>
                                    </div>
                                    
                                    <button 
                                        onClick={applyProposal}
                                        className="w-full bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1"
                                    >
                                        <CheckCircle2 size={12}/> Apply Change
                                    </button>
                                </div>
                            )}

                            {/* Standard Recommendations */}
                            {recommendations.length === 0 && !proposal ? (
                                <div className="text-center text-gray-500 text-xs py-10 italic">
                                    System Stable.<br/>No critical alerts.
                                </div>
                            ) : (
                                recommendations.map(rec => (
                                    <div key={rec.id} className={`p-3 rounded-lg border text-xs shadow-sm ${rec.type === 'critical' ? 'bg-red-900/20 border-red-500/50' : rec.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-blue-900/20 border-blue-500/50'}`}>
                                        <div className="flex items-center gap-2 font-bold mb-1">
                                            {rec.type === 'critical' ? <AlertTriangle size={14} className="text-red-500"/> : rec.type === 'warning' ? <Activity size={14} className="text-yellow-500"/> : <Target size={14} className="text-blue-500"/>}
                                            <span className={rec.type === 'critical' ? 'text-red-400' : rec.type === 'warning' ? 'text-yellow-400' : 'text-blue-400'}>{rec.type.toUpperCase()}</span>
                                        </div>
                                        <p className="text-gray-300 mb-2 leading-relaxed">{rec.msg}</p>
                                        <div className="bg-black/30 p-2 rounded text-gray-400 font-mono flex justify-between">
                                            <span>Impact:</span>
                                            <span className="text-white">{rec.impact}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-800">
                    <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase flex justify-between">
                        <span>Workload Balance</span>
                        <span>{(lineEfficiency).toFixed(0)}% Eff</span>
                    </h4>
                    <div className="h-32">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stations}>
                                <ReferenceLine y={taktTime} stroke="#ef4444" strokeDasharray="3 3"/>
                                <Bar dataKey="baseCycleTime" fill="#3b82f6" radius={[2,2,0,0]}>
                                    {stations.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.baseCycleTime > taktTime ? '#ef4444' : '#3b82f6'} />
                                    ))}
                                </Bar>
                                <Tooltip 
                                    cursor={{fill: 'transparent'}} 
                                    contentStyle={{backgroundColor: '#1f2937', borderColor: '#374151', fontSize: '10px', color: 'white'}}
                                    formatter={(value: number) => [`${value.toFixed(1)}s`, 'Cycle Time']}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ProductionDigitalTwin;
