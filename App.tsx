
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Settings, Activity, Video, BarChart2, FolderDown, FolderUp, Download, ClipboardList, Zap, Trash2, X, SplitSquareHorizontal, GitPullRequest, Layers, Menu, Save, FileText, HelpCircle, CheckCircle, LogOut, FilePlus, Scissors, Copy, Clipboard, Monitor, ZoomIn, ZoomOut, Info, ShieldAlert, BrainCircuit, Box, Cloud, Wifi, WifiOff } from 'lucide-react';
import VideoAnalyzer from './components/VideoAnalyzer';
import VideoRecorder from './components/VideoRecorder';
import YamazumiChart from './components/YamazumiChart';
import CycleLog from './components/CycleLog';
import WorkStudy from './components/WorkStudy';
import VideoComparison from './components/VideoComparison';
import Rearrangement from './components/Rearrangement';
import MultiAxialAnalysis from './components/MultiAxialAnalysis';
import SmartReport from './components/SmartReport';
import ErgonomicsAnalysis from './components/ErgonomicsAnalysis';
import SimulationAnalysis from './components/SimulationAnalysis';
import ProductionDigitalTwin from './components/ProductionDigitalTwin';
import { ProjectRepository } from './services/ProjectRepository';
import { Cycle, ProjectData, Rect, TriggerStep, WorkStudyTask, MultiAxialResource, MultiAxialEvent, ErgoFrame, SimulationStats, SyncStatus } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'record' | 'analyze' | 'workstudy' | 'compare' | 'rearrange' | 'multiaxis' | 'report' | 'ergonomics' | 'simulation' | 'digitaltwin'>('record');
  
  // App State with Persistence
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [taktTime, setTaktTime] = useState<number>(10);
  const [sensitivity, setSensitivity] = useState<number>(6);
  const [refRect, setRefRect] = useState<Rect | null>(null);
  const [triggerSteps, setTriggerSteps] = useState<TriggerStep[]>([]);
  const [workStudyTasks, setWorkStudyTasks] = useState<WorkStudyTask[]>([]);
  
  // Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'synced', lastSyncedAt: new Date() });
  
  // Other States
  const [seekRequest, setSeekRequest] = useState<{ time: number, id: number } | null>(null);
  const [activeStationMapping, setActiveStationMapping] = useState<number>(0);
  const [lbDependencies, setLbDependencies] = useState<Record<string, string[]>>({});
  const [maResources, setMaResources] = useState<MultiAxialResource[]>([
      { id: 1, name: 'พนักงาน (Operator)', type: 'MAN', src: undefined, offset: 0, color: '#3b82f6' },
      { id: 2, name: 'เครื่องจักร A (Machine A)', type: 'MACHINE', src: undefined, offset: 0, color: '#a855f7' },
  ]);
  const [maEvents, setMaEvents] = useState<MultiAxialEvent[]>([]);
  const [ergoData, setErgoData] = useState<ErgoFrame[]>([]);
  const [simStats, setSimStats] = useState<SimulationStats | null>(null);
  const [fps, setFps] = useState(0);
  const [status, setStatus] = useState("Ready (LocalDB Active)");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  // --- PERSISTENCE LOGIC ---
  // Load on mount
  useEffect(() => {
      const loadData = async () => {
          try {
              const data = await ProjectRepository.load();
              if (data) {
                  if (data.cycles) setCycles(data.cycles);
                  if (data.taktTime) setTaktTime(data.taktTime);
                  if (data.sensitivity) setSensitivity(data.sensitivity);
                  if (data.refRect) setRefRect(data.refRect);
                  if (data.triggerSteps) setTriggerSteps(data.triggerSteps);
                  if (data.workStudyTasks) setWorkStudyTasks(data.workStudyTasks);
                  setStatus("Loaded project from Local Database");
              } else {
                  // Init Default
                  setWorkStudyTasks([{ id: crypto.randomUUID(), name: "งานย่อยที่ 1", rounds: [], activity: 'Operation', rating: 100, allowance: 10 }]);
              }
          } catch (e) {
              console.error("DB Load Failed", e);
              setStatus("Database Error - Using Memory Only");
          }
      };
      loadData();
  }, []);

  // Auto-Save Effect (Debounced)
  useEffect(() => {
      const saveData = async () => {
          setSyncStatus(prev => ({ ...prev, state: 'syncing' }));
          try {
              await ProjectRepository.save({
                  cycles,
                  taktTime,
                  sensitivity,
                  refRect,
                  triggerSteps,
                  workStudyTasks,
                  videoSrc: null // Skip heavy blob
              });
              setSyncStatus({ state: 'synced', lastSyncedAt: new Date() });
          } catch (e) {
              setSyncStatus(prev => ({ ...prev, state: 'error' }));
          }
      };
      
      const timeout = setTimeout(saveData, 2000); // Auto-save 2s after change
      return () => clearTimeout(timeout);
  }, [cycles, taktTime, sensitivity, refRect, triggerSteps, workStudyTasks]);

  // Click Outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setCycles([]);
      setTriggerSteps([]); 
      setRefRect(null);    
      setStatus("Video loaded. Previous analytics reset.");
      setActiveMenu(null);
    }
  };

  const handleCycleComplete = useCallback((cycle: Cycle) => {
    setCycles(prev => [...prev, cycle]);
    setWorkStudyTasks(prevTasks => {
        const newTasks = [...prevTasks];
        if (newTasks[activeStationMapping]) {
            const task = { ...newTasks[activeStationMapping] };
            const newRound = {
                ht: cycle.duration, 
                wt: 0,
                mt: 0,
                total: cycle.duration,
                startTime: cycle.startTime,
                endTime: cycle.endTime
            };
            const currentRounds = task.rounds.filter(r => r !== null && r !== undefined) as any[];
            const updatedRounds = [...currentRounds, newRound].slice(-20); 
            task.rounds = updatedRounds;
            newTasks[activeStationMapping] = task;
        }
        return newTasks;
    });
  }, [activeStationMapping]);

  const handleSaveProject = () => {
      const projectData: ProjectData = {
          videoSrc: null, 
          cycles,
          taktTime,
          sensitivity,
          refRect,
          triggerSteps,
          workStudyTasks,
          updatedAt: Date.now()
      };
      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yamazumi_project_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Project Exported");
      setActiveMenu(null);
  };

  const handleLoadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const data = JSON.parse(e.target?.result as string) as ProjectData;
              setTaktTime(data.taktTime || 10);
              setSensitivity(data.sensitivity || 6);
              setCycles(data.cycles || []);
              setRefRect(data.refRect || null);
              setTriggerSteps(data.triggerSteps || []);
              if (data.workStudyTasks) setWorkStudyTasks(data.workStudyTasks);
              setStatus("Project Imported successfully");
          } catch (err) { alert("Invalid project file"); }
      };
      reader.readAsText(file);
      event.target.value = '';
      setActiveMenu(null);
  };

  const removeStep = (id: string) => setTriggerSteps(prev => prev.filter(s => s.id !== id));
  const clearAllSteps = () => { if (confirm("Clear all trigger zones?")) setTriggerSteps([]); };

  const handleNewProject = async () => {
      if(confirm("Create new project? Unsaved changes may be lost.")) {
          await ProjectRepository.clear();
          setCycles([]);
          setTriggerSteps([]);
          setRefRect(null);
          setWorkStudyTasks([{ id: crypto.randomUUID(), name: "Task 1", rounds: [], activity: 'Operation', rating: 100, allowance: 10 }]);
          setVideoSrc(null);
          setStatus("New Project Created (DB Cleared)");
      }
      setActiveMenu(null);
  };

  const menuStructure = [
      {
          label: 'File',
          items: [
              { label: 'New Project', shortcut: 'Ctrl+N', icon: <FilePlus size={14}/>, action: handleNewProject },
              { label: 'Open Project...', shortcut: 'Ctrl+O', icon: <FolderUp size={14}/>, action: () => projectInputRef.current?.click() },
              { label: 'Export JSON', shortcut: 'Ctrl+S', icon: <Save size={14}/>, action: handleSaveProject },
              { type: 'separator' },
              { label: 'Import Video...', shortcut: 'Ctrl+I', icon: <Video size={14}/>, action: () => fileInputRef.current?.click() },
              { type: 'separator' },
              { label: 'Exit', shortcut: 'Alt+F4', icon: <LogOut size={14}/>, action: () => window.close() }, 
          ]
      },
      {
          label: 'View',
          items: [
              { label: 'Zoom In', icon: <ZoomIn size={14}/>, action: () => (document.body.style as any).zoom = "110%" },
              { label: 'Zoom Out', icon: <ZoomOut size={14}/>, action: () => (document.body.style as any).zoom = "100%" },
              { label: 'Reset Zoom', icon: <Monitor size={14}/>, action: () => (document.body.style as any).zoom = "100%" },
          ]
      },
      { label: 'Help', items: [{ label: 'About', icon: <Info size={14}/>, action: () => alert("Yamazumi AI Analyst\nv3.0 World-Class Edition") }] }
  ];

  const TabButton = ({ id, label, icon: Icon }: any) => (
      <button 
        onClick={() => setActiveTab(id)} 
        className={`px-3 py-1.5 flex items-center gap-2 text-xs border-r border-gray-300 hover:bg-gray-100 transition-colors whitespace-nowrap ${activeTab === id ? 'bg-white font-bold border-t-2 border-t-blue-500 border-b-white z-10' : 'bg-[#f0f0f0] text-gray-600 border-b border-gray-300'}`}
        style={{ marginBottom: '-1px' }}
      >
          <Icon size={14} className={activeTab === id ? 'text-blue-600' : 'text-gray-500'} />
          {label}
      </button>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-[#f0f0f0] text-[#222]">
      <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      <input type="file" accept=".json" ref={projectInputRef} onChange={handleLoadProject} className="hidden" />

      {/* MENU BAR */}
      <div ref={menuRef} className="flex items-center px-2 py-0.5 bg-white border-b border-gray-300 text-xs select-none relative z-50 shrink-0">
          {menuStructure.map((menu) => (
              <div key={menu.label} className="relative">
                  <div 
                    className={`px-3 py-1 cursor-pointer hover:bg-[#cce8ff] hover:border-[#99d1ff] border border-transparent ${activeMenu === menu.label ? 'bg-[#cce8ff] border-[#99d1ff] shadow-inner' : ''}`}
                    onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
                    onMouseEnter={() => { if(activeMenu) setActiveMenu(menu.label); }}
                  >
                      {menu.label}
                  </div>
                  {activeMenu === menu.label && (
                      <div className="absolute top-full left-0 min-w-[220px] bg-white border border-[#a0a0a0] shadow-xl py-1 z-50">
                          {menu.items.map((item, idx) => {
                              if (item.type === 'separator') return <div key={idx} className="border-b border-gray-200 my-1 mx-1"></div>;
                              return (
                                  <div 
                                    key={idx}
                                    className={`px-6 py-1 flex justify-between items-center cursor-pointer group hover:bg-[#0078d7] hover:text-white`}
                                    onClick={() => { item.action && item.action(); setActiveMenu(null); }}
                                  >
                                      <div className="flex items-center gap-2">
                                          <div className="w-4 flex justify-center opacity-70">{item.icon}</div>
                                          <span>{item.label}</span>
                                      </div>
                                      {item.shortcut && <span className="text-[10px] ml-4 text-gray-400 group-hover:text-white">{item.shortcut}</span>}
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          ))}
          <div className="ml-auto flex items-center gap-4 pr-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  {syncStatus.state === 'synced' ? <Cloud size={12} className="text-green-500"/> : syncStatus.state === 'syncing' ? <Activity size={12} className="text-blue-500 animate-spin"/> : <WifiOff size={12} className="text-red-500"/>}
                  <span className="hidden md:inline">{syncStatus.state === 'synced' ? 'Synced' : syncStatus.state === 'syncing' ? 'Saving...' : 'Offline'}</span>
              </div>
          </div>
      </div>

      {/* TABS */}
      <div className="flex px-2 pt-2 bg-[#f0f0f0] border-b border-gray-300 shrink-0 overflow-x-auto no-scrollbar">
          <TabButton id="record" label="Capture" icon={Video} />
          <TabButton id="analyze" label="AI Analyzer" icon={BarChart2} />
          <TabButton id="workstudy" label="Work Study" icon={ClipboardList} />
          <TabButton id="compare" label="Compare" icon={SplitSquareHorizontal} />
          <TabButton id="rearrange" label="Balance" icon={GitPullRequest} />
          <TabButton id="digitaltwin" label="3D Twin" icon={Box} />
          <TabButton id="multiaxis" label="Man-Machine" icon={Layers} />
          <TabButton id="report" label="Report" icon={FileText} />
          <TabButton id="ergonomics" label="Ergo" icon={ShieldAlert} />
          <TabButton id="simulation" label="Sim" icon={BrainCircuit} />
      </div>

      {/* WORKSPACE */}
      <div className="flex-grow overflow-hidden bg-white relative">
        {activeTab === 'record' ? (<div className="w-full h-full p-2"><VideoRecorder /></div>) : 
         activeTab === 'analyze' ? (
            <div className="flex h-full flex-col md:flex-row">
                <div className="flex-grow p-2 bg-[#f0f0f0] flex flex-col min-w-0 border-r border-gray-300">
                    <div className="flex-grow border border-gray-400 bg-black">
                        <VideoAnalyzer 
                            videoSrc={videoSrc} 
                            taktTime={taktTime} 
                            sensitivity={sensitivity} 
                            refRect={refRect} 
                            triggerSteps={triggerSteps} 
                            onRefRectChange={setRefRect} 
                            onTriggerStepsChange={setTriggerSteps} 
                            onCycleComplete={handleCycleComplete} 
                            onFPSUpdate={setFps} 
                            onStatusUpdate={setStatus}
                            seekRequest={seekRequest}
                        />
                    </div>
                </div>
                <div className="w-full md:w-80 bg-[#f5f5f5] flex flex-col overflow-y-auto shrink-0 border-l border-white h-1/3 md:h-full">
                    <div className="p-1 bg-[#e1e1e1] border-b border-gray-400 text-xs font-bold text-gray-700 px-2 flex justify-between items-center">
                        <span>Properties</span>
                        <Settings size={14} />
                    </div>
                    <div className="p-2 space-y-4">
                        <fieldset className="border border-blue-400 bg-blue-50 p-2 rounded-sm">
                            <legend className="text-[10px] text-blue-700 font-bold px-1 ml-1 bg-blue-50">Digital Twin Link</legend>
                            <div className="space-y-1">
                                <label className="text-xs block text-gray-600">Map to Station:</label>
                                <select className="w-full text-xs border border-blue-300 rounded px-1 py-1 bg-white outline-none" value={activeStationMapping} onChange={(e) => setActiveStationMapping(Number(e.target.value))}>
                                    {workStudyTasks.map((t, i) => <option key={t.id} value={i}>{i+1}. {t.name}</option>)}
                                </select>
                            </div>
                        </fieldset>
                        
                        <fieldset className="border border-gray-300 p-2 rounded-sm bg-white">
                            <legend className="text-[10px] text-blue-600 font-bold px-1 ml-1">Statistics</legend>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>FPS: <b>{fps}</b></div>
                                <div>Cycles: <b>{cycles.length}</b></div>
                            </div>
                        </fieldset>

                        <div className="flex flex-col h-64 border border-gray-400 bg-white">
                            <div className="bg-[#f0f0f0] border-b border-gray-300 px-2 py-1 text-xs font-bold flex justify-between">
                                <span>Trigger Zones</span>
                                <button onClick={clearAllSteps}><Trash2 size={12}/></button>
                            </div>
                            <div className="flex-grow overflow-y-auto p-1 space-y-1">
                                {triggerSteps.map((s, i) => (
                                    <div key={s.id} className="flex items-center justify-between text-xs p-1 hover:bg-[#cce8ff] border border-transparent hover:border-[#99d1ff] cursor-pointer">
                                        <div className="flex items-center gap-2"><span className="font-bold text-blue-700">{i+1}.</span><span>{s.name}</span></div>
                                        <button onClick={() => removeStep(s.id)}><X size={12} className="text-gray-500 hover:text-red-500"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="h-48 border border-gray-400 bg-white p-1">
                             <YamazumiChart cycles={cycles} taktTime={taktTime} onCycleClick={(time) => setSeekRequest({ time, id: Date.now() })} />
                        </div>
                    </div>
                </div>
            </div>
        ) : activeTab === 'compare' ? (<div className="w-full h-full p-2"><VideoComparison /></div>) : 
         activeTab === 'rearrange' ? (<div className="w-full h-full p-2"><Rearrangement sourceTasks={workStudyTasks} defaultTaktTime={taktTime} dependencies={lbDependencies} setDependencies={setLbDependencies} /></div>) : 
         activeTab === 'digitaltwin' ? (<div className="w-full h-full"><ProductionDigitalTwin tasks={workStudyTasks} taktTime={taktTime} /></div>) : 
         activeTab === 'multiaxis' ? (<div className="w-full h-full"><MultiAxialAnalysis resources={maResources} setResources={setMaResources} events={maEvents} setEvents={setMaEvents} /></div>) : 
         activeTab === 'report' ? (<div className="w-full h-full"><SmartReport tasks={workStudyTasks} videoSrc={videoSrc} ergoData={ergoData} simStats={simStats} /></div>) : 
         activeTab === 'ergonomics' ? (<div className="w-full h-full"><ErgonomicsAnalysis videoSrc={videoSrc} onDataUpdate={setErgoData} /></div>) : 
         activeTab === 'simulation' ? (<div className="w-full h-full"><SimulationAnalysis tasks={workStudyTasks} defaultTaktTime={taktTime} onResults={setSimStats} /></div>) : 
         (<div className="w-full h-full p-2"><WorkStudy videoSrc={videoSrc} tasks={workStudyTasks} setTasks={setWorkStudyTasks} /></div>)}
      </div>

      {/* STATUS BAR */}
      <div className="h-6 bg-[#007acc] text-white flex items-center px-2 text-xs justify-between border-t border-gray-400 shrink-0">
          <div className="flex gap-4">
              <span className="flex items-center gap-1"><Activity size={12}/> {status}</span>
          </div>
          <div className="flex gap-4 hidden md:flex">
              <span>{syncStatus.state === 'synced' ? `Saved: ${syncStatus.lastSyncedAt.toLocaleTimeString()}` : ''}</span>
          </div>
      </div>
    </div>
  );
};

export default App;
