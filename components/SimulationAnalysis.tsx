
import React, { useState, useEffect, useMemo } from 'react';
import { WorkStudyTask, SimulationStats } from '../types';
import { Calculator, Play, RefreshCw, TrendingUp, AlertTriangle, BarChart2, Target, Settings, BrainCircuit } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

interface Props {
  tasks: WorkStudyTask[];
  defaultTaktTime: number;
  onResults?: (stats: SimulationStats) => void;
}

interface TaskStats {
    id: string;
    name: string;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    distribution: 'Normal' | 'LogNormal'; // Placeholder for future expansion
}

interface SimulationResult {
    iteration: number;
    totalTime: number;
    isOverTakt: boolean;
}

const SimulationAnalysis: React.FC<Props> = ({ tasks, defaultTaktTime, onResults }) => {
  // --- STATE ---
  const [taskStats, setTaskStats] = useState<TaskStats[]>([]);
  const [iterations, setIterations] = useState(1000);
  const [taktTime, setTaktTime] = useState(defaultTaktTime);
  const [simResults, setSimResults] = useState<SimulationResult[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Calculate Initial Stats from collected data
  useEffect(() => {
      const stats = tasks.map(t => {
          const validRounds = t.rounds.filter(r => r);
          if (validRounds.length < 2) {
              // Not enough data, assume simple estimates
              const val = validRounds.length === 1 ? validRounds[0]!.total : 0;
              return {
                  id: t.id,
                  name: t.name,
                  mean: val,
                  stdDev: val * 0.1, // Assume 10% variation if no data
                  min: val * 0.9,
                  max: val * 1.1,
                  distribution: 'Normal'
              } as TaskStats;
          }

          const values = validRounds.map(r => r!.total);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance);

          return {
              id: t.id,
              name: t.name,
              mean,
              stdDev,
              min: Math.min(...values),
              max: Math.max(...values),
              distribution: 'Normal'
          } as TaskStats;
      });
      setTaskStats(stats);
  }, [tasks]);

  // --- MONTE CARLO ENGINE ---
  // Box-Muller Transform for Normal Distribution
  const randn_bm = () => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  };

  const runSimulation = () => {
      setIsSimulating(true);
      
      // Use setTimeout to allow UI to update (show loading)
      setTimeout(() => {
          const results: SimulationResult[] = [];
          
          for (let i = 0; i < iterations; i++) {
              let runTotal = 0;
              
              taskStats.forEach(task => {
                  // Simulate value based on Mean & SD
                  let noise = randn_bm() * task.stdDev;
                  let val = task.mean + noise;
                  
                  // Clamp value (cannot be negative, let's say min is mean - 3SD or absolute min)
                  val = Math.max(val, task.mean * 0.5); 
                  
                  runTotal += val;
              });

              results.push({
                  iteration: i,
                  totalTime: runTotal,
                  isOverTakt: runTotal > taktTime
              });
          }

          setSimResults(results);
          setIsSimulating(false);
      }, 100);
  };

  // --- ANALYTICS ---
  const analysis = useMemo(() => {
      if (simResults.length === 0) return null;

      const totalTimes = simResults.map(r => r.totalTime);
      const avg = totalTimes.reduce((a,b) => a+b, 0) / totalTimes.length;
      const min = Math.min(...totalTimes);
      const max = Math.max(...totalTimes);
      const overCount = simResults.filter(r => r.isOverTakt).length;
      const riskProb = (overCount / simResults.length) * 100;
      
      // Percentiles
      totalTimes.sort((a,b) => a-b);
      const p90 = totalTimes[Math.floor(totalTimes.length * 0.90)];
      const p99 = totalTimes[Math.floor(totalTimes.length * 0.99)];

      const stats: SimulationStats = { avg, min, max, riskProb, p90, p99 };
      if (onResults) onResults(stats);

      // Histogram Data
      const bucketCount = 20;
      const range = max - min;
      const bucketSize = range / bucketCount;
      const histogram: { range: string, count: number, mid: number }[] = [];
      
      for(let i=0; i<bucketCount; i++) {
          const start = min + (i * bucketSize);
          const end = start + bucketSize;
          const count = totalTimes.filter(t => t >= start && t < end).length;
          histogram.push({
              range: `${start.toFixed(1)}-${end.toFixed(1)}`,
              count,
              mid: (start + end) / 2
          });
      }

      return { ...stats, histogram };
  }, [simResults, taktTime, onResults]);

  return (
    <div className="flex h-full gap-4 bg-gray-900 p-4 text-gray-200">
      
      {/* LEFT: MODEL CONFIGURATION */}
      <div className="w-96 flex flex-col gap-4 bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden">
          <div className="p-3 border-b border-gray-700 bg-gray-800/80 flex items-center gap-2">
              <Settings className="text-blue-400" size={18} />
              <h3 className="font-bold">Model Parameters</h3>
          </div>
          
          <div className="px-4 py-2 space-y-4">
              {/* Global Params */}
              <div className="bg-black/30 p-3 rounded-lg border border-gray-700/50 space-y-3">
                  <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Iterations (Runs)</span>
                      <input 
                        type="number" 
                        value={iterations} 
                        onChange={(e) => setIterations(Number(e.target.value))}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-right w-20 text-sm font-mono"
                      />
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Target Takt Time (s)</span>
                      <input 
                        type="number" 
                        value={taktTime} 
                        onChange={(e) => setTaktTime(Number(e.target.value))}
                        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-right w-20 text-sm font-mono text-red-400 font-bold"
                      />
                  </div>
              </div>

              {/* Task Table */}
              <div className="flex-grow flex flex-col min-h-0">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2 flex justify-between items-center">
                      <span>Variable inputs (Tasks)</span>
                      <span className="text-[10px] text-gray-600">Mean ± SD</span>
                  </div>
                  <div className="overflow-y-auto max-h-[calc(100vh-350px)] custom-scrollbar space-y-1">
                      {taskStats.map((task, idx) => (
                          <div key={task.id} className="bg-gray-900/50 p-2 rounded border border-gray-700 hover:border-blue-500/50 transition-colors">
                              <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-bold truncate w-32">{idx+1}. {task.name}</span>
                                  <div className="flex gap-1">
                                      <input 
                                        type="number" step="0.1"
                                        value={task.mean.toFixed(2)}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setTaskStats(prev => prev.map(t => t.id === task.id ? { ...t, mean: val } : t));
                                        }}
                                        className="w-12 bg-black border border-gray-700 rounded text-[10px] text-center text-green-400"
                                        title="Mean Time"
                                      />
                                      <span className="text-gray-500 text-xs">±</span>
                                      <input 
                                        type="number" step="0.1"
                                        value={task.stdDev.toFixed(2)}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setTaskStats(prev => prev.map(t => t.id === task.id ? { ...t, stdDev: val } : t));
                                        }}
                                        className="w-10 bg-black border border-gray-700 rounded text-[10px] text-center text-yellow-400"
                                        title="Standard Deviation"
                                      />
                                  </div>
                              </div>
                              {/* Visual Variance Bar */}
                              <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden relative">
                                  <div 
                                    className="absolute top-0 bottom-0 bg-blue-500 opacity-50"
                                    style={{
                                        left: '20%', 
                                        width: `${Math.min(100, (task.stdDev / (task.mean || 1)) * 300)}%` // Visualization scaling
                                    }}
                                  ></div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>

          <div className="p-4 mt-auto border-t border-gray-700 bg-gray-800">
              <button 
                onClick={runSimulation}
                disabled={isSimulating}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg hover:shadow-blue-900/50 transition-all flex items-center justify-center gap-2"
              >
                  {isSimulating ? <RefreshCw className="animate-spin" size={20}/> : <BrainCircuit size={20}/>}
                  RUN SIMULATION
              </button>
          </div>
      </div>

      {/* RIGHT: RESULTS DASHBOARD */}
      <div className="flex-1 flex flex-col gap-4">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                  <div className="text-xs text-gray-400 uppercase font-bold mb-1">Simulated Mean</div>
                  <div className="text-2xl font-mono font-bold text-white flex items-center gap-2">
                      {analysis ? analysis.avg.toFixed(2) : '--'} <span className="text-xs text-gray-500">s</span>
                  </div>
              </div>
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                  <div className="text-xs text-gray-400 uppercase font-bold mb-1">Risk Probability</div>
                  <div className={`text-2xl font-mono font-bold flex items-center gap-2 ${(analysis?.riskProb || 0) > 5 ? 'text-red-500' : 'text-green-500'}`}>
                      {analysis ? analysis.riskProb.toFixed(1) : '--'} <span className="text-xs text-gray-500">%</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">Chance of Line Stop</div>
              </div>
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                  <div className="text-xs text-gray-400 uppercase font-bold mb-1">Worst Case (P99)</div>
                  <div className="text-2xl font-mono font-bold text-yellow-400 flex items-center gap-2">
                      {analysis ? analysis.p99.toFixed(2) : '--'} <span className="text-xs text-gray-500">s</span>
                  </div>
              </div>
              <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                  <div className="text-xs text-gray-400 uppercase font-bold mb-1">Est. Output</div>
                  <div className="text-2xl font-mono font-bold text-blue-400 flex items-center gap-2">
                      {analysis ? Math.floor((3600 * 7.5) / analysis.avg) : '--'} <span className="text-xs text-gray-500">unit/shift</span>
                  </div>
              </div>
          </div>

          {/* Main Chart Area */}
          <div className="flex-grow bg-gray-800 rounded-xl border border-gray-700 shadow-lg p-4 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-white flex items-center gap-2"><BarChart2 className="text-purple-400"/> Cycle Time Distribution (Monte Carlo)</h3>
                  {analysis && <span className="text-xs text-gray-400">Based on {iterations} iterations</span>}
              </div>

              {analysis ? (
                  <div className="flex-grow w-full min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analysis.histogram} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                              <XAxis 
                                dataKey="mid" 
                                tickFormatter={(val) => val.toFixed(1)} 
                                stroke="#9CA3AF" 
                                tick={{fontSize: 10}}
                                label={{ value: 'Cycle Time (s)', position: 'insideBottom', offset: -5, fill: '#6B7280', fontSize: 10 }}
                              />
                              <YAxis stroke="#9CA3AF" tick={{fontSize: 10}}/>
                              <Tooltip 
                                contentStyle={{backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6'}}
                                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                labelFormatter={(label) => `Time Bin: ${label}`}
                              />
                              {/* Takt Time Line */}
                              <ReferenceLine x={taktTime} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'TAKT', fill: '#EF4444', fontSize: 10, position: 'top' }} />
                              
                              <Bar dataKey="count" name="Frequency">
                                  {analysis.histogram.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.mid > taktTime ? '#EF4444' : '#3B82F6'} />
                                  ))}
                              </Bar>
                          </BarChart>
                      </ResponsiveContainer>
                  </div>
              ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-gray-600 gap-4">
                      <TrendingUp size={64} strokeWidth={1} />
                      <p>Run simulation to view probability distribution</p>
                  </div>
              )}
          </div>
          
          {/* Insights Panel */}
          {analysis && (
            <div className={`p-4 rounded-xl border flex items-start gap-3 ${analysis.riskProb > 20 ? 'bg-red-900/20 border-red-800' : 'bg-green-900/20 border-green-800'}`}>
                {analysis.riskProb > 20 ? <AlertTriangle className="text-red-500 shrink-0"/> : <Target className="text-green-500 shrink-0"/>}
                <div>
                    <h4 className={`font-bold text-sm ${analysis.riskProb > 20 ? 'text-red-400' : 'text-green-400'}`}>
                        {analysis.riskProb > 20 ? 'High Process Risk Detected' : 'Process is Stable'}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1">
                        {analysis.riskProb > 20 
                            ? `The simulation indicates a ${analysis.riskProb.toFixed(1)}% chance of exceeding the Takt Time of ${taktTime}s. This suggests frequent line stoppages. Consider reducing variance in top contributing tasks.` 
                            : `The process is capable. Only ${analysis.riskProb.toFixed(1)}% of cycles are expected to exceed Takt Time.`}
                    </p>
                </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default SimulationAnalysis;
