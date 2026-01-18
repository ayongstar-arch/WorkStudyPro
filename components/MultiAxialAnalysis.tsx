
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Upload, X, Play, Pause, Grid, Square, Plus, Trash2, Clock, Move, Activity, Users, List, ChevronRight, ChevronDown, Monitor, Cpu, GripVertical, Settings } from 'lucide-react';
import { MultiAxialResource, MultiAxialEvent } from '../types';

interface Props {
    resources: MultiAxialResource[];
    setResources: React.Dispatch<React.SetStateAction<MultiAxialResource[]>>;
    events: MultiAxialEvent[];
    setEvents: React.Dispatch<React.SetStateAction<MultiAxialEvent[]>>;
}

const COLOR_MAP = {
    VA: '#22c55e',   // Green
    NVA: '#ef4444',  // Red (Idle/Wait)
    NNVA: '#eab308'  // Yellow (Setup/Walk)
};

const MultiAxialAnalysis: React.FC<Props> = ({ resources, setResources, events, setEvents }) => {
  // --- STATE ---
  // Resources and Events are now props from parent

  const [masterTime, setMasterTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [maxDuration, setMaxDuration] = useState(15);
  const [zoomScale, setZoomScale] = useState(50); // Pixels per second
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  
  // Video Layout
  const [layoutMode, setLayoutMode] = useState<'grid' | 'cinema'>('grid');
  const [activeResId, setActiveResId] = useState<number>(1);

  // Refs for Dragging
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const requestRef = useRef<number | null>(null);
  
  const dragInteraction = useRef<{
      type: 'MOVE' | 'RESIZE_L' | 'RESIZE_R' | 'CREATE';
      eventId: string | null;
      startX: number;
      originalStart: number;
      originalDuration: number;
      resourceId?: number;
  } | null>(null);

  // --- VIDEO SYNC ENGINE ---
  useEffect(() => {
      const loop = () => {
          if (isPlaying) {
              setMasterTime(prev => {
                  const next = prev + 0.033; // Approx 30fps
                  if (next >= maxDuration) {
                      setIsPlaying(false);
                      return maxDuration;
                  }
                  return next;
              });
          }
          requestRef.current = requestAnimationFrame(loop);
      };
      if (isPlaying) requestRef.current = requestAnimationFrame(loop);
      return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, maxDuration]);

  // Sync Videos to MasterTime
  useEffect(() => {
      videoRefs.current.forEach((v, idx) => {
          if (v && v.src && !v.paused && !isPlaying) v.pause();
          if (v && v.src && v.paused && isPlaying) v.play();
          
          if (v && v.src && Math.abs(v.currentTime - (masterTime + resources[idx].offset)) > 0.3) {
             v.currentTime = Math.max(0, masterTime + resources[idx].offset);
          }
      });
  }, [masterTime, isPlaying, resources]);


  // --- INTERACTION HANDLERS ---
  const handleTimelineMouseDown = (e: React.MouseEvent, type: 'MOVE' | 'RESIZE_L' | 'RESIZE_R' | 'CREATE', eventId: string | null, resourceId?: number) => {
      e.stopPropagation();
      e.preventDefault();
      
      const evt = events.find(ev => ev.id === eventId);
      
      dragInteraction.current = {
          type,
          eventId,
          startX: e.clientX,
          originalStart: evt ? evt.startTime : masterTime,
          originalDuration: evt ? evt.duration : 0,
          resourceId
      };
      
      if (eventId) setSelectedEventId(eventId);
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
      if (!dragInteraction.current || !timelineRef.current) return;

      const { type, eventId, startX, originalStart, originalDuration, resourceId } = dragInteraction.current;
      const deltaPixels = e.clientX - startX;
      const deltaTime = deltaPixels / zoomScale;

      if (type === 'MOVE' && eventId) {
          setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, startTime: Math.max(0, originalStart + deltaTime) } : ev));
      } else if (type === 'RESIZE_R' && eventId) {
          setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, duration: Math.max(0.1, originalDuration + deltaTime) } : ev));
      } else if (type === 'RESIZE_L' && eventId) {
          // Complex: Moving start time needs to reduce duration to keep end time same
          const newStart = Math.max(0, originalStart + deltaTime);
          const newDur = Math.max(0.1, originalDuration - deltaTime);
          setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, startTime: newStart, duration: newDur } : ev));
      }
  }, [zoomScale, setEvents]);

  const handleGlobalMouseUp = useCallback(() => {
      dragInteraction.current = null;
  }, []);

  useEffect(() => {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
          window.removeEventListener('mousemove', handleGlobalMouseMove);
          window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
  }, [handleGlobalMouseMove, handleGlobalMouseUp]);

  const addEvent = (resId: number) => {
      const newEvent: MultiAxialEvent = {
          id: crypto.randomUUID(),
          resourceId: resId,
          name: 'New Activity',
          startTime: masterTime,
          duration: 2.0,
          type: 'VA'
      };
      setEvents([...events, newEvent]);
      setSelectedEventId(newEvent.id);
  };

  const deleteSelected = () => {
      if (selectedEventId) {
          setEvents(events.filter(e => e.id !== selectedEventId));
          setSelectedEventId(null);
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, id: number) => {
    const file = e.target.files?.[0];
    if (file) {
        const url = URL.createObjectURL(file);
        setResources(prev => prev.map(r => r.id === id ? { ...r, src: url } : r));
    }
  };

  // --- STATISTICS ---
  const stats = useMemo(() => {
      return resources.map(res => {
          const resEvents = events.filter(e => e.resourceId === res.id);
          const totalWork = resEvents.filter(e => e.type !== 'NVA').reduce((acc, e) => acc + e.duration, 0);
          const totalIdle = maxDuration - totalWork; // Simplified: Idle is remaining time
          const utilization = (totalWork / maxDuration) * 100;
          return { ...res, totalWork, totalIdle, utilization };
      });
  }, [resources, events, maxDuration]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-200 select-none">
        {/* --- TOP: TOOLBAR & ANALYTICS --- */}
        <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Activity className="text-purple-500" size={20} />
                    <div>
                        <h2 className="font-bold text-sm tracking-wide text-white">MAN-MACHINE CHART</h2>
                        <div className="text-[10px] text-gray-500">Multi-Axial Analysis Engine</div>
                    </div>
                </div>
                
                <div className="h-8 w-px bg-gray-700 mx-2"></div>
                
                {/* Global Stats Micro-View */}
                <div className="flex gap-4">
                     {stats.slice(0, 2).map(s => (
                         <div key={s.id} className="flex flex-col">
                             <span className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                 {s.type === 'MAN' ? <Users size={10}/> : <Cpu size={10}/>} {s.name}
                             </span>
                             <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                                 <div className={`h-full ${s.utilization > 85 ? 'bg-green-500' : s.utilization > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${s.utilization}%`}}></div>
                             </div>
                             <span className="text-[9px] font-mono text-gray-300 mt-0.5">{s.utilization.toFixed(1)}% Util</span>
                         </div>
                     ))}
                </div>
            </div>

            <div className="flex items-center gap-3">
                 <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                     <button onClick={() => setLayoutMode('grid')} className={`p-1.5 rounded ${layoutMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}><Grid size={14}/></button>
                     <button onClick={() => setLayoutMode('cinema')} className={`p-1.5 rounded ${layoutMode === 'cinema' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}><Monitor size={14}/></button>
                 </div>
                 <div className="w-px h-6 bg-gray-700"></div>
                 <div className="flex items-center bg-black rounded-lg border border-gray-700 p-1">
                     <Clock size={14} className="text-gray-500 ml-2 mr-2"/>
                     <span className="font-mono text-lg font-bold text-white w-16 text-center">{masterTime.toFixed(2)}s</span>
                 </div>
                 <button onClick={() => setIsPlaying(!isPlaying)} className={`w-10 h-10 flex items-center justify-center rounded-full shadow-lg hover:scale-105 transition-all ${isPlaying ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'}`}>
                    {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor" className="ml-1"/>}
                 </button>
            </div>
        </div>

        {/* --- MIDDLE: VIDEO GRID --- */}
        <div className="flex-1 min-h-0 grid grid-cols-12 bg-black relative">
            {/* Resources List & Offsets (Left Panel) */}
            <div className="col-span-2 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">
                <div className="p-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-950 border-b border-gray-800">Video Sync & Resources</div>
                {resources.map((res, idx) => (
                    <div key={res.id} className={`p-2 border-b border-gray-800 ${activeResId === res.id ? 'bg-gray-800' : ''}`} onClick={() => setActiveResId(res.id)}>
                        <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-xs text-gray-200 truncate">{res.name}</span>
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: res.color}}></div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[9px] px-1 rounded ${res.type === 'MAN' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'}`}>{res.type}</span>
                            <span className="text-[9px] text-gray-500 truncate">{res.src ? 'Video Loaded' : 'No Source'}</span>
                        </div>
                        {/* Offset Control */}
                        <div className="bg-black/30 p-1.5 rounded border border-gray-700/50">
                            <div className="flex justify-between text-[9px] text-gray-400 mb-1">
                                <span>Sync Offset</span>
                                <span className={res.offset !== 0 ? 'text-yellow-500' : ''}>{res.offset.toFixed(2)}s</span>
                            </div>
                            <input 
                                type="range" min="-5" max="5" step="0.05" 
                                value={res.offset}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setResources(prev => prev.map(r => r.id === res.id ? { ...r, offset: val } : r));
                                }}
                                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Video Area */}
            <div className="col-span-10 bg-black relative p-2">
                <div className={`grid gap-2 w-full h-full ${layoutMode === 'grid' ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'}`}>
                    {resources.map((res, idx) => {
                        // In Cinema mode, only show active
                        if (layoutMode === 'cinema' && res.id !== activeResId) return null;
                        
                        return (
                            <div key={res.id} className="relative bg-gray-900 rounded-lg overflow-hidden border border-gray-800 group" onClick={() => setActiveResId(res.id)}>
                                {res.src ? (
                                    <video 
                                        ref={el => { videoRefs.current[idx] = el; }}
                                        src={res.src}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                    />
                                ) : (
                                    <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors">
                                        <Upload className="text-gray-600 mb-2" size={24}/>
                                        <span className="text-xs text-gray-500">Upload {res.name}</span>
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, res.id)} />
                                    </label>
                                )}
                                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-white border border-white/10">
                                    {res.name} {res.offset !== 0 && <span className="text-yellow-400">({res.offset > 0 ? '+' : ''}{res.offset}s)</span>}
                                </div>
                                {activeResId === res.id && <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none"></div>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* --- BOTTOM: INTERACTIVE GANTT EDITOR --- */}
        <div className="h-64 bg-gray-900 border-t border-gray-800 flex flex-col shrink-0">
            {/* Toolbar */}
            <div className="h-8 bg-gray-850 border-b border-gray-800 flex justify-between items-center px-2">
                <div className="flex items-center gap-2">
                    <button onClick={() => setZoomScale(z => Math.max(10, z - 10))} className="p-1 hover:text-white text-gray-500"><Monitor size={14}/></button>
                    <input 
                        type="range" min="10" max="200" value={zoomScale} 
                        onChange={(e) => setZoomScale(Number(e.target.value))} 
                        className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <button onClick={() => setZoomScale(z => Math.min(200, z + 10))} className="p-1 hover:text-white text-gray-500"><Monitor size={14}/></button>
                </div>
                
                <div className="flex items-center gap-2">
                     <span className="text-[10px] text-gray-500 mr-2">Selected: {events.find(e => e.id === selectedEventId)?.name || 'None'}</span>
                     {selectedEventId && (
                         <>
                             <div className="flex bg-gray-800 rounded border border-gray-700 p-0.5">
                                 {['VA', 'NNVA', 'NVA'].map((t) => (
                                     <button 
                                        key={t}
                                        onClick={() => setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, type: t as any } : e))}
                                        className={`px-2 py-0.5 text-[9px] font-bold rounded ${events.find(e => e.id === selectedEventId)?.type === t ? 'text-black' : 'text-gray-400 hover:text-white'}`}
                                        style={{backgroundColor: events.find(e => e.id === selectedEventId)?.type === t ? COLOR_MAP[t as keyof typeof COLOR_MAP] : 'transparent'}}
                                     >
                                         {t}
                                     </button>
                                 ))}
                             </div>
                             <div className="w-px h-4 bg-gray-700"></div>
                             <button onClick={deleteSelected} className="text-gray-500 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                         </>
                     )}
                </div>
            </div>

            {/* Timeline Container */}
            <div className="flex-1 flex overflow-hidden">
                {/* Y-Axis Headers */}
                <div className="w-32 bg-gray-900 border-r border-gray-800 flex flex-col pt-6 relative z-10 shadow-lg">
                    {resources.map(res => (
                        <div key={res.id} className="h-10 flex items-center justify-between px-2 border-b border-gray-800 hover:bg-gray-800 group relative">
                            <span className="text-[10px] font-bold text-gray-300 truncate">{res.name}</span>
                            <button onClick={() => addEvent(res.id)} className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300">
                                <Plus size={12}/>
                            </button>
                        </div>
                    ))}
                </div>

                {/* Scrollable Timeline Area */}
                <div className="flex-1 overflow-x-auto relative bg-gray-950 custom-scrollbar" ref={timelineRef}>
                    <div className="h-full relative pt-6" style={{ width: `${Math.max(100, (maxDuration + 5) * zoomScale)}px` }}>
                        
                        {/* Time Ruler */}
                        <div className="absolute top-0 left-0 right-0 h-6 bg-gray-900 border-b border-gray-800 flex items-end">
                             {Array.from({ length: Math.ceil(maxDuration + 5) }).map((_, sec) => (
                                 <div key={sec} className="absolute bottom-0 border-l border-gray-700 h-2" style={{ left: sec * zoomScale }}>
                                     <span className="absolute -top-4 -left-1 text-[9px] text-gray-500">{sec}s</span>
                                 </div>
                             ))}
                        </div>

                        {/* Tracks */}
                        {resources.map(res => (
                            <div key={res.id} className="h-10 border-b border-gray-800/50 relative group hover:bg-gray-900/30 transition-colors">
                                {/* Grid Lines */}
                                {Array.from({ length: Math.ceil(maxDuration + 5) }).map((_, sec) => (
                                     <div key={sec} className="absolute top-0 bottom-0 border-l border-gray-800 pointer-events-none" style={{ left: sec * zoomScale }}></div>
                                ))}

                                {/* Events */}
                                {events.filter(e => e.resourceId === res.id).map(evt => (
                                    <div
                                        key={evt.id}
                                        className={`absolute top-1 bottom-1 rounded-sm border cursor-pointer overflow-hidden flex items-center px-1 select-none group/event ${selectedEventId === evt.id ? 'ring-2 ring-white z-10' : 'border-black/20 opacity-90 hover:opacity-100'}`}
                                        style={{
                                            left: evt.startTime * zoomScale,
                                            width: evt.duration * zoomScale,
                                            backgroundColor: COLOR_MAP[evt.type],
                                            color: evt.type === 'VA' ? '#000' : '#fff'
                                        }}
                                        onMouseDown={(e) => handleTimelineMouseDown(e, 'MOVE', evt.id)}
                                    >
                                        {/* Resize Handles */}
                                        <div 
                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-black/20 z-20"
                                            onMouseDown={(e) => handleTimelineMouseDown(e, 'RESIZE_L', evt.id)}
                                        ></div>
                                        
                                        <div className="flex-1 truncate text-[9px] font-bold pointer-events-none">
                                            {evt.name}
                                        </div>

                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-black/20 z-20"
                                            onMouseDown={(e) => handleTimelineMouseDown(e, 'RESIZE_R', evt.id)}
                                        ></div>
                                    </div>
                                ))}
                            </div>
                        ))}

                        {/* Playhead */}
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                            style={{ left: masterTime * zoomScale }}
                        >
                            <div className="absolute -top-0 -translate-x-1/2 bg-red-600 text-[9px] text-white px-1 rounded-b">
                                {masterTime.toFixed(2)}s
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default MultiAxialAnalysis;
