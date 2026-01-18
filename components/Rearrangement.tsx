
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { WorkStudyTask } from '../types';
import { Users, RotateCcw, Zap, BarChart4, LayoutTemplate, Clock, Network, ArrowRight, DollarSign, AlertTriangle, CheckCircle2, X, Move } from 'lucide-react';

interface Props {
  sourceTasks: WorkStudyTask[];
  defaultTaktTime: number;
  dependencies: Record<string, string[]>;
  setDependencies: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

interface RearrangedTask {
    id: string;
    originalId: string;
    name: string;
    ht: number; // Hand/Manual Time
    wt: number; // Walk Time
    mt: number; // Machine Time
    total: number;
}

// Extension to handle Precedence
interface TaskNode extends RearrangedTask {
    weight?: number; // For RPW
}

const Rearrangement: React.FC<Props> = ({ sourceTasks, defaultTaktTime, dependencies, setDependencies }) => {
  const [taktTime, setTaktTime] = useState(defaultTaktTime);
  const [stations, setStations] = useState<TaskNode[][]>([[], [], []]);
  const [originalPool, setOriginalPool] = useState<TaskNode[]>([]);
  
  // Cost Parameters
  const [laborRate, setLaborRate] = useState(15); // $/hr
  const [targetEfficiency, setTargetEfficiency] = useState(85); // %

  const [viewMode, setViewMode] = useState<'yamazumi' | 'swct' | 'network'>('yamazumi');
  const [activeStationIdx, setActiveStationIdx] = useState(0);
  
  // Drag State
  const [dragItem, setDragItem] = useState<{ stationIdx: number, taskIdx: number } | null>(null);
  
  // Mobile Click-to-Move State
  const [selectedTask, setSelectedTask] = useState<{ stationIdx: number, taskIdx: number } | null>(null);
  
  // Network Editing State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Initialize Data
  useEffect(() => {
    const pool = sourceTasks.map(t => {
        const validRounds = t.rounds.filter(r => r);
        if (validRounds.length === 0) return null;
        
        const ht = validRounds.reduce((acc, r) => acc + r!.ht, 0) / validRounds.length;
        const wt = validRounds.reduce((acc, r) => acc + r!.wt, 0) / validRounds.length;
        const mt = validRounds.reduce((acc, r) => acc + r!.mt, 0) / validRounds.length;
        
        return {
            id: t.id, // Use original ID for consistency
            originalId: t.id,
            name: t.name,
            ht, wt, mt,
            total: ht + wt + mt
        };
    }).filter(t => t !== null) as TaskNode[];

    // Initialize with all tasks in "Unassigned" or Station 1 if fresh
    if (stations[0].length === 0 && stations[1].length === 0) {
        setStations([pool, [], []]);
    }
    setOriginalPool(pool);
  }, [sourceTasks]);

  // --- ALGORITHMS ---

  // 1. Helgeson-Birnie (Rank Positional Weight - RPW)
  const autoBalanceRPW = () => {
    // A. Calculate RPW Weights
    // Weight = Task Time + Sum of all successors' times
    const getWeight = (taskId: string, memo: Record<string, number> = {}): number => {
        if (memo[taskId] !== undefined) return memo[taskId];
        
        const task = originalPool.find(t => t.id === taskId);
        if (!task) return 0;

        // Find immediate successors (Tasks that depend on current taskId)
        const immediateSuccessors = originalPool.filter(t => dependencies[t.id]?.includes(taskId));
        
        // Find ALL unique downstream tasks
        const downstreamIds = new Set<string>();
        const queue = [...immediateSuccessors];
        
        while(queue.length > 0) {
            const curr = queue.shift()!;
            if (!downstreamIds.has(curr.id)) {
                downstreamIds.add(curr.id);
                // Add children of curr
                const children = originalPool.filter(t => dependencies[t.id]?.includes(curr.id));
                queue.push(...children);
            }
        }

        const downstreamTime = Array.from(downstreamIds).reduce((sum, id) => {
            const t = originalPool.find(x => x.id === id);
            return sum + (t ? t.total : 0);
        }, 0);

        const w = task.total + downstreamTime;
        memo[taskId] = w;
        return w;
    };

    const memoWeights: Record<string, number> = {};
    const tasksWithWeight = originalPool.map(t => ({
        ...t,
        weight: getWeight(t.id, memoWeights)
    })).sort((a, b) => b.weight - a.weight); // Sort Descending RPW

    // B. Assign to Stations
    const newStations: TaskNode[][] = [];
    const assignedIds = new Set<string>();
    let remainingTasks = [...tasksWithWeight];

    // Helper: Check if all predecessors are already assigned
    const arePredecessorsMet = (taskId: string) => {
        const preds = dependencies[taskId] || [];
        return preds.every(p => assignedIds.has(p));
    };

    while (remainingTasks.length > 0) {
        const currentStation: TaskNode[] = [];
        let currentStationTime = 0;

        while (true) {
            // Find the highest RPW task that:
            // 1. Fits in remaining Takt time
            // 2. Has Predecessors satisfied
            const candidateIdx = remainingTasks.findIndex(t => 
                (currentStationTime + t.total <= taktTime) && 
                arePredecessorsMet(t.id)
            );

            if (candidateIdx === -1) break; // No task fits

            const task = remainingTasks[candidateIdx];
            currentStation.push(task);
            currentStationTime += task.total;
            assignedIds.add(task.id);
            remainingTasks.splice(candidateIdx, 1);
        }

        newStations.push(currentStation);
        // Safety break for infinite loops
        if (newStations.length > 50) break;
    }

    // Ensure at least 3 stations for UI
    while(newStations.length < 3) newStations.push([]);
    setStations(newStations);
    setViewMode('yamazumi');
  };

  const reset = () => {
      setStations([originalPool, [], []]);
      setDependencies({});
  };

  const addStation = () => setStations([...stations, []]);
  
  const removeStation = (idx: number) => {
      if (stations[idx].length > 0) {
          alert("กรุณาย้ายงานออกจากสถานีนี้ก่อนลบ");
          return;
      }
      setStations(stations.filter((_, i) => i !== idx));
      if (activeStationIdx >= idx) setActiveStationIdx(Math.max(0, activeStationIdx - 1));
  };

  // --- KPI Calculation ---
  const kpis = useMemo(() => {
      const activeStations = stations.filter(s => s.length > 0);
      const numOperators = activeStations.length;
      const totalWorkContent = originalPool.reduce((a, b) => a + b.total, 0);
      
      const lineEfficiency = numOperators > 0 && taktTime > 0
          ? (totalWorkContent / (numOperators * taktTime)) * 100 
          : 0;
      
      const outputPerHour = taktTime > 0 ? 3600 / taktTime : 0;
      const laborCostPerHour = numOperators * laborRate;
      const costPerUnit = outputPerHour > 0 ? laborCostPerHour / outputPerHour : 0;

      return { numOperators, totalWorkContent, lineEfficiency, costPerUnit, outputPerHour };
  }, [stations, originalPool, taktTime, laborRate]);

  // --- Network Logic ---
  const toggleDependency = (targetId: string) => {
      if (!selectedNodeId || selectedNodeId === targetId) return;

      setDependencies(prev => {
          const prevDeps = prev[targetId] || [];
          // Check for cycle (BFS check needed in robust app, simplistic here)
          if (prev[selectedNodeId]?.includes(targetId)) {
              alert("Cycle detected! ไม่สามารถโยงกลับได้");
              return prev;
          }

          if (prevDeps.includes(selectedNodeId)) {
              // Remove
              return { ...prev, [targetId]: prevDeps.filter(id => id !== selectedNodeId) };
          } else {
              // Add
              return { ...prev, [targetId]: [...prevDeps, selectedNodeId] };
          }
      });
  };

  const calculateNetworkLayout = () => {
      // Simple Leveling: Level = max(Level of predecessors) + 1
      const levels: Record<string, number> = {};
      const processed = new Set<string>();
      
      let changed = true;
      while(changed) {
          changed = false;
          originalPool.forEach(task => {
              const preds = dependencies[task.id] || [];
              if (preds.length === 0) {
                  if (levels[task.id] !== 0) { levels[task.id] = 0; changed = true; }
              } else {
                  const maxPredLevel = Math.max(...preds.map(p => levels[p] ?? -1));
                  if (maxPredLevel !== -1) {
                      const newLevel = maxPredLevel + 1;
                      if (levels[task.id] !== newLevel) { levels[task.id] = newLevel; changed = true; }
                  }
              }
          });
      }

      // Group by level
      const layout: TaskNode[][] = [];
      originalPool.forEach(task => {
          const lvl = levels[task.id] || 0;
          if (!layout[lvl]) layout[lvl] = [];
          layout[lvl].push(task);
      });
      return layout;
  };

  const networkLayout = useMemo(calculateNetworkLayout, [originalPool, dependencies]);


  // --- DnD Logic ---
  const handleDragStart = (e: React.DragEvent, stationIdx: number, taskIdx: number) => {
      setDragItem({ stationIdx, taskIdx });
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, targetStationIdx: number) => {
      e.preventDefault();
      if (!dragItem) return;
      const { stationIdx: srcIdx, taskIdx: srcTaskIdx } = dragItem;
      performMove(srcIdx, srcTaskIdx, targetStationIdx);
      setDragItem(null);
  };

  // --- Click-to-Move Logic (Mobile) ---
  const handleTaskClick = (stationIdx: number, taskIdx: number) => {
      if (selectedTask && selectedTask.stationIdx === stationIdx && selectedTask.taskIdx === taskIdx) {
          setSelectedTask(null); // Deselect
      } else {
          setSelectedTask({ stationIdx, taskIdx }); // Select
      }
  };

  const handleStationClick = (targetStationIdx: number) => {
      if (selectedTask) {
          performMove(selectedTask.stationIdx, selectedTask.taskIdx, targetStationIdx);
          setSelectedTask(null);
      }
  };

  const performMove = (srcIdx: number, srcTaskIdx: number, targetIdx: number) => {
      if (srcIdx === targetIdx && srcTaskIdx === -1) return;
      const newStations = [...stations];
      const task = newStations[srcIdx][srcTaskIdx];
      newStations[srcIdx].splice(srcTaskIdx, 1);
      newStations[targetIdx].push(task);
      setStations(newStations);
  };

  // --- Renderers ---

  const renderNetwork = () => (
      <div className="flex-grow bg-gray-900 overflow-auto p-4 relative custom-scrollbar">
          <div className="absolute top-4 left-4 z-10 bg-gray-800/80 backdrop-blur p-3 rounded-lg border border-gray-600 shadow-xl max-w-sm">
              <h4 className="text-white font-bold text-sm flex items-center gap-2"><Network size={16}/> แก้ไขความสัมพันธ์ (Precedence)</h4>
              <p className="text-xs text-gray-400 mt-1">
                  1. คลิกที่งานต้นทาง (สีเขียว) <br/>
                  2. คลิกงานปลายทาง เพื่อสร้าง/ลบเส้นเชื่อมโยง <br/>
                  (งานทางขวา ต้องทำหลังงานทางซ้าย)
              </p>
          </div>

          <svg className="min-w-full min-h-full" style={{ width: Math.max(1000, networkLayout.length * 200), height: 600 }}>
             <defs>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="28" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="#60a5fa" />
                </marker>
             </defs>
             {/* Draw Links */}
             {originalPool.map(task => {
                 const preds = dependencies[task.id] || [];
                 return preds.map(predId => {
                     // Find positions
                     let startPos = {x:0, y:0}, endPos = {x:0, y:0};
                     
                     networkLayout.forEach((col, colIdx) => {
                         const idx = col.findIndex(t => t.id === predId);
                         if (idx !== -1) startPos = { x: colIdx * 220 + 80, y: idx * 100 + 100 };
                         
                         const currIdx = col.findIndex(t => t.id === task.id);
                         if (currIdx !== -1) endPos = { x: colIdx * 220 + 80, y: currIdx * 100 + 100 };
                     });
                     
                     if (startPos.x === 0 || endPos.x === 0) return null;

                     return (
                         <line 
                            key={`${predId}-${task.id}`}
                            x1={startPos.x + 60} y1={startPos.y}
                            x2={endPos.x - 60} y2={endPos.y}
                            stroke="#4b5563" strokeWidth="2"
                            markerEnd="url(#arrow)"
                         />
                     );
                 })
             })}

             {/* Draw Nodes */}
             {networkLayout.map((col, colIdx) => 
                 col.map((task, rowIdx) => {
                     const isSelected = selectedNodeId === task.id;
                     const isPredecessor = selectedNodeId && dependencies[selectedNodeId]?.includes(task.id);
                     const isSuccessor = selectedNodeId && dependencies[task.id]?.includes(selectedNodeId);

                     return (
                        <g 
                            key={task.id} 
                            transform={`translate(${colIdx * 220 + 80}, ${rowIdx * 100 + 100})`}
                            onClick={() => selectedNodeId ? toggleDependency(task.id) : setSelectedNodeId(task.id)}
                            className="cursor-pointer transition-all duration-300"
                        >
                            <rect 
                                x="-60" y="-30" width="120" height="60" rx="8" 
                                fill={isSelected ? '#1d4ed8' : '#1f2937'}
                                stroke={isSelected ? '#60a5fa' : (isPredecessor ? '#34d399' : isSuccessor ? '#facc15' : '#4b5563')}
                                strokeWidth={isSelected ? 3 : 2}
                                className="hover:fill-gray-700"
                            />
                            <text x="0" y="-5" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" pointerEvents="none" style={{textShadow: '0 1px 2px black'}}>
                                {task.name.substring(0, 15)}
                            </text>
                            <text x="0" y="15" textAnchor="middle" fill="#9ca3af" fontSize="10" pointerEvents="none">
                                {task.total.toFixed(1)}s
                            </text>
                        </g>
                     )
                 })
             )}
          </svg>
      </div>
  );

  const renderYamazumi = () => (
      <div className="flex-grow flex gap-4 min-h-0 overflow-x-auto pb-4 custom-scrollbar">
          {stations.map((station, sIdx) => {
              const totalTime = station.reduce((acc, t) => acc + t.total, 0);
              const utilization = taktTime > 0 ? (totalTime / taktTime) * 100 : 0;
              const isOver = totalTime > taktTime;
              
              // Mobile interaction: Is this station a valid drop target?
              const isDropTarget = selectedTask !== null && selectedTask.stationIdx !== sIdx;

              return (
                  <div 
                    key={sIdx}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, sIdx)}
                    onClick={() => isDropTarget && handleStationClick(sIdx)}
                    className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 transition-all 
                        ${isOver ? 'bg-red-900/10 border-red-500/50' : 'bg-gray-800 border-gray-700'}
                        ${isDropTarget ? 'ring-2 ring-blue-400 bg-blue-900/20 cursor-pointer animate-pulse' : ''}
                    `}
                  >
                      {/* Station Header */}
                      <div className="p-3 border-b border-gray-700 bg-gray-800/80 rounded-t-xl sticky top-0 z-10">
                          <div className="flex justify-between items-center mb-2">
                              <h3 className="font-bold text-gray-200 flex items-center gap-2"><Users size={16}/> สถานี {sIdx + 1}</h3>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${isOver ? 'bg-red-600 text-white' : (utilization > 90 ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white')}`}>
                                  {utilization.toFixed(0)}%
                              </span>
                          </div>
                          <div className="h-4 w-full bg-gray-900 rounded-full overflow-hidden mb-2 border border-gray-700 relative">
                              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{left: `${Math.min(100, (taktTime / (Math.max(taktTime, totalTime))) * 100)}%`}}></div>
                              <div className={`h-full transition-all duration-500 ${isOver ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${Math.min(100, (totalTime / Math.max(taktTime, totalTime)) * 100)}%`}}></div>
                          </div>
                          <div className="flex justify-between text-xs font-mono">
                              <span className={isOver ? 'text-red-400 font-bold' : 'text-gray-300'}>{totalTime.toFixed(1)}s</span>
                              <span className="text-gray-500">Takt: {taktTime}s</span>
                          </div>
                      </div>

                      {/* Drop Zone */}
                      <div className="flex-1 p-2 space-y-1 overflow-y-auto min-h-[200px] custom-scrollbar">
                          {station.map((task, tIdx) => {
                              // Check Precedence Violation in visual
                              let hasViolation = false;
                              const preds = dependencies[task.id] || [];
                              preds.forEach(pId => {
                                  let pStation = -1;
                                  let pIndex = -1;
                                  stations.forEach((s, si) => {
                                      const idx = s.findIndex(x => x.id === pId);
                                      if(idx !== -1) { pStation = si; pIndex = idx; }
                                  });
                                  if (pStation === -1 || pStation > sIdx || (pStation === sIdx && pIndex > tIdx)) {
                                      hasViolation = true;
                                  }
                              });

                              const isSelected = selectedTask?.stationIdx === sIdx && selectedTask?.taskIdx === tIdx;

                              return (
                                <div 
                                    key={task.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, sIdx, tIdx)}
                                    onClick={(e) => { e.stopPropagation(); handleTaskClick(sIdx, tIdx); }}
                                    className={`grid grid-cols-12 gap-1 p-2 rounded border cursor-move shadow-sm group items-center relative transition-all
                                        ${isSelected ? 'bg-blue-600 border-blue-400 scale-105 z-10 shadow-lg' : 'bg-gray-700 hover:bg-gray-600 border-gray-600'}
                                        ${hasViolation && !isSelected ? 'bg-red-900/40 border-red-500' : ''}
                                    `}
                                    title={hasViolation ? "ผิดลำดับขั้นตอน: งานก่อนหน้ายังไม่เสร็จ" : "คลิกเพื่อเลือก / ลากเพื่อย้าย"}
                                >
                                    <div className="col-span-8 text-xs font-bold text-gray-200 truncate flex items-center gap-1">
                                        {hasViolation && <AlertTriangle size={12} className="text-red-500 animate-pulse"/>}
                                        {isSelected && <Move size={12} className="text-white animate-pulse"/>}
                                        {tIdx+1}. {task.name}
                                    </div>
                                    <div className="col-span-4 text-xs font-mono text-gray-300 text-right">{task.total.toFixed(1)}s</div>
                                </div>
                              );
                          })}
                          {station.length === 0 && (
                              <div className="text-center text-gray-600 text-xs py-4 italic">สถานีว่าง</div>
                          )}
                      </div>
                      <div className="p-2 border-t border-gray-700 text-center">
                          {stations.length > 1 && (
                              <button onClick={() => removeStation(sIdx)} className="text-[10px] text-gray-500 hover:text-red-400 uppercase font-bold">ปิดสถานีนี้</button>
                          )}
                      </div>
                  </div>
              );
          })}
          <button onClick={addStation} className="flex-shrink-0 w-24 flex flex-col items-center justify-center bg-gray-800/50 hover:bg-gray-800 border-2 border-dashed border-gray-700 rounded-xl transition-all text-gray-500 hover:text-white">
              <Users size={24} />
              <span className="text-[10px] font-bold mt-2">เพิ่มสถานี</span>
          </button>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-900 p-4 gap-4">
      {/* 1. Header & KPI Dashboard */}
      <div className="bg-gray-800 p-2 rounded-xl border border-gray-700 shadow-lg flex flex-col gap-2">
         {/* Top Row: Title & Controls */}
         <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-2 py-1 gap-2">
            <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-600 rounded-lg shadow-purple-900/50 shadow-md"><Zap size={20} className="text-white"/></div>
                <div>
                    <h2 className="text-lg font-bold text-white leading-tight">จัดสมดุลสายการผลิต <span className="text-purple-400">(Line Balancing)</span></h2>
                    <div className="flex gap-4 text-[10px] text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1"><Clock size={10}/> Takt: <input type="number" value={taktTime} onChange={(e) => setTaktTime(Number(e.target.value))} className="bg-gray-900 border border-gray-600 rounded px-1 w-10 text-white text-right"/>s</span>
                        <span className="flex items-center gap-1"><DollarSign size={10}/> ค่าแรง: <input type="number" value={laborRate} onChange={(e) => setLaborRate(Number(e.target.value))} className="bg-gray-900 border border-gray-600 rounded px-1 w-10 text-white text-right"/>/ชม.</span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                 <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                     <button onClick={() => setViewMode('network')} className={`px-3 py-1.5 rounded text-xs font-bold flex gap-2 ${viewMode === 'network' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}><Network size={14}/><span className="hidden sm:inline">ความสัมพันธ์</span></button>
                     <button onClick={() => setViewMode('yamazumi')} className={`px-3 py-1.5 rounded text-xs font-bold flex gap-2 ${viewMode === 'yamazumi' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}><BarChart4 size={14}/><span className="hidden sm:inline">กราฟสมดุล</span></button>
                 </div>
                 <div className="h-8 w-px bg-gray-700 hidden sm:block"></div>
                 <button onClick={reset} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors" title="รีเซ็ตทั้งหมด"><RotateCcw size={18} /></button>
                 <button onClick={autoBalanceRPW} className="flex items-center gap-2 text-sm font-bold text-white bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg shadow-lg hover:shadow-green-900/40 transition-all">
                    <Zap size={16} fill="white" /> <span className="hidden sm:inline">คำนวณอัตโนมัติ</span>
                 </button>
            </div>
         </div>
         
         {/* Bottom Row: KPI Cards */}
         <div className="grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-gray-700 pt-2">
             <div className="bg-gray-900/50 p-2 rounded border border-gray-700 flex justify-between items-center">
                 <span className="text-xs text-gray-400">จำนวนคน</span>
                 <span className="text-lg font-mono font-bold text-white">{kpis.numOperators} <span className="text-[10px] text-gray-500">คน</span></span>
             </div>
             <div className="bg-gray-900/50 p-2 rounded border border-gray-700 flex justify-between items-center">
                 <span className="text-xs text-gray-400">ประสิทธิภาพไลน์</span>
                 <span className={`text-lg font-mono font-bold ${kpis.lineEfficiency >= targetEfficiency ? 'text-green-400' : 'text-yellow-400'}`}>{kpis.lineEfficiency.toFixed(1)}<span className="text-[10px] text-gray-500">%</span></span>
             </div>
             <div className="bg-gray-900/50 p-2 rounded border border-gray-700 flex justify-between items-center">
                 <span className="text-xs text-gray-400">กำลังการผลิต</span>
                 <span className="text-lg font-mono font-bold text-blue-400">{kpis.outputPerHour.toFixed(0)} <span className="text-[10px] text-gray-500">ชิ้น/ชม.</span></span>
             </div>
             <div className="bg-gray-900/50 p-2 rounded border border-gray-700 flex justify-between items-center">
                 <span className="text-xs text-gray-400">ต้นทุนแรงงาน</span>
                 <span className="text-lg font-mono font-bold text-white">${kpis.costPerUnit.toFixed(2)} <span className="text-[10px] text-gray-500">/ชิ้น</span></span>
             </div>
         </div>
      </div>

      {/* 2. Main Workspace */}
      <div className="flex-grow bg-black rounded-xl border border-gray-700 p-4 flex flex-col min-h-0 relative overflow-hidden shadow-inner">
          {viewMode === 'network' ? renderNetwork() : 
           viewMode === 'yamazumi' ? renderYamazumi() : 
           <div className="text-center text-gray-500 mt-20">View mode not implemented</div>}
      </div>
      
      {/* Mobile Hint & Selection Footer */}
      {viewMode === 'yamazumi' && (
          <div className="bg-gray-800 border-t border-gray-700 p-2 text-center text-xs text-gray-400">
              {selectedTask ? (
                  <span className="text-blue-300 font-bold animate-pulse">แตะที่สถานีปลายทางเพื่อย้ายงาน...</span>
              ) : (
                  <span>คำแนะนำ: ลากงานเพื่อย้าย หรือ แตะเพื่อเลือกแล้วย้าย</span>
              )}
          </div>
      )}
      
      {/* Selection Info Footer (Network Mode) */}
      {viewMode === 'network' && selectedNodeId && (
          <div className="bg-gray-800 border-t border-gray-700 p-2 flex justify-between items-center text-xs">
              <span className="text-gray-300">เลือก: <b className="text-white">{originalPool.find(t=>t.id===selectedNodeId)?.name}</b></span>
              <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-white flex items-center gap-1"><X size={12}/> ยกเลิกการเลือก</button>
          </div>
      )}
    </div>
  );
};

export default Rearrangement;
