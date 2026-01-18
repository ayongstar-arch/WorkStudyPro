
import React, { useState, useRef, useEffect } from 'react';
import { WorkStudyTask, ErgoFrame, SimulationStats } from '../types';
import { FileText, Printer, Play, Pause, SkipForward, Repeat, Video, Monitor, AlertCircle, CheckCircle2, Factory, Activity, ShieldAlert, BrainCircuit } from 'lucide-react';

interface Props {
  tasks: WorkStudyTask[];
  videoSrc: string | null;
  projectTitle?: string;
  ergoData?: ErgoFrame[];
  simStats?: SimulationStats | null;
}

const SmartReport: React.FC<Props> = ({ tasks, videoSrc, projectTitle = "ขั้นตอนการปฏิบัติงานมาตรฐาน (SOP)", ergoData, simStats }) => {
  const [activeTab, setActiveTab] = useState<'doc' | 'digital'>('doc');
  const [docTitle, setDocTitle] = useState(projectTitle);
  const [engineer, setEngineer] = useState("วิศวกร IE");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Digital SOP State
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoLoop, setAutoLoop] = useState(true);

  // Filter only tasks with timing data
  const validTasks = tasks.filter(t => t.rounds.length > 0 && t.rounds[0]);

  const handlePrint = () => {
    window.print();
  };

  // --- DIGITAL SOP LOGIC ---
  const playStep = (index: number) => {
    if (!videoRef.current || !validTasks[index]) return;
    const task = validTasks[index];
    const round = task.rounds[0];
    if (round && round.startTime !== undefined) {
        setCurrentStep(index);
        videoRef.current.currentTime = round.startTime;
        videoRef.current.play();
        setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !validTasks[currentStep]) return;
    const task = validTasks[currentStep];
    const round = task.rounds[0];
    
    // Check if step ended
    if (round && round.endTime && videoRef.current.currentTime >= round.endTime) {
        if (autoLoop) {
            // Loop current step
            videoRef.current.currentTime = round.startTime || 0;
            videoRef.current.play();
        } else {
            // Pause
            videoRef.current.pause();
            setIsPlaying(false);
        }
    }
  };

  const nextStep = () => {
      const next = (currentStep + 1) % validTasks.length;
      playStep(next);
  };

  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* TOOLBAR (No Print) */}
      <div className="h-12 bg-white border-b border-gray-300 flex items-center justify-between px-4 no-print shrink-0">
          <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-gray-700 flex items-center gap-2">
                  <FileText className="text-blue-600"/> Smart Report & SOP
              </h2>
              <div className="flex bg-gray-100 rounded p-1 border border-gray-200">
                  <button onClick={() => setActiveTab('doc')} className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'doc' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>เอกสาร</button>
                  <button onClick={() => setActiveTab('digital')} className={`px-3 py-1 text-xs font-bold rounded ${activeTab === 'digital' ? 'bg-white shadow text-purple-600' : 'text-gray-500'}`}>วิดีโอคู่มือ (Digital SOP)</button>
              </div>
          </div>
          <div className="flex items-center gap-2">
              {activeTab === 'doc' && (
                  <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold shadow-sm">
                      <Printer size={16}/> พิมพ์ / บันทึก PDF
                  </button>
              )}
          </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-grow overflow-auto p-8 flex justify-center bg-gray-200 print:bg-white print:p-0">
          
          {/* 1. DOCUMENT REPORT (A4 Styled) */}
          {activeTab === 'doc' && (
              <div className="bg-white shadow-xl print:shadow-none w-[210mm] min-h-[297mm] p-[10mm] mx-auto text-black relative flex flex-col gap-6">
                  {/* Header */}
                  <div className="border-b-2 border-black pb-4 flex justify-between items-start">
                      <div>
                          <input 
                            value={docTitle} 
                            onChange={(e) => setDocTitle(e.target.value)}
                            className="text-2xl font-bold uppercase tracking-wide w-full outline-none placeholder-gray-300" 
                            placeholder="TITLE..."
                          />
                          <div className="text-sm mt-1">Standard Operation Procedure (SOP)</div>
                      </div>
                      <div className="text-right text-xs">
                          <div className="flex items-center gap-2 justify-end mb-1">
                              <span className="font-bold">ผู้ออกเอกสาร:</span>
                              <input value={engineer} onChange={e=>setEngineer(e.target.value)} className="border-b border-gray-300 text-right w-32 outline-none"/>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                              <span className="font-bold">วันที่:</span>
                              <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border-b border-gray-300 text-right w-32 outline-none"/>
                          </div>
                      </div>
                  </div>

                  {/* Operational Steps */}
                  <div className="break-inside-avoid">
                      <h4 className="font-bold border-b border-gray-300 mb-2 pb-1 text-sm flex items-center gap-2"><Factory size={16}/> ขั้นตอนการปฏิบัติงาน</h4>
                      <table className="w-full text-xs border-collapse border border-black mb-4">
                          <thead>
                              <tr className="bg-gray-100">
                                  <th className="border border-black p-2 w-10 text-center">ลำดับ</th>
                                  <th className="border border-black p-2 w-24 text-center">ภาพประกอบ</th>
                                  <th className="border border-black p-2 text-left">ขั้นตอนและจุดสำคัญ</th>
                                  <th className="border border-black p-2 w-20 text-center">เวลา (วิ)</th>
                                  <th className="border border-black p-2 w-16 text-center">ประเภท</th>
                              </tr>
                          </thead>
                          <tbody>
                              {validTasks.map((task, idx) => {
                                  const round = task.rounds[0];
                                  const time = round ? round.total.toFixed(2) : '-';
                                  return (
                                      <tr key={task.id} className="break-inside-avoid">
                                          <td className="border border-black p-2 text-center font-bold">{idx + 1}</td>
                                          <td className="border border-black p-2 text-center">
                                              {task.thumbnail ? (
                                                  <img src={task.thumbnail} className="w-20 h-14 object-cover mx-auto border border-gray-200" />
                                              ) : (
                                                  <div className="w-20 h-14 bg-gray-100 flex items-center justify-center text-gray-400 mx-auto text-[10px]">No Image</div>
                                              )}
                                          </td>
                                          <td className="border border-black p-2 align-top">
                                              <div className="font-bold text-sm mb-1">{task.name}</div>
                                              <div className="text-gray-600 whitespace-pre-wrap">{task.description || "-"}</div>
                                          </td>
                                          <td className="border border-black p-2 text-center font-mono">{time}</td>
                                          <td className="border border-black p-2 text-center">
                                              {task.activity === 'Operation' && <div className="w-4 h-4 rounded-full bg-green-200 border border-green-600 mx-auto" title="ทำงาน"></div>}
                                              {task.activity === 'Transport' && <div className="w-4 h-4 rounded-full bg-blue-200 border border-blue-600 mx-auto" title="เคลื่อนย้าย"></div>}
                                              {task.activity === 'Inspection' && <div className="w-4 h-4 border border-black mx-auto" title="ตรวจสอบ"></div>}
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>

                  {/* Advanced Analytics Section (Ergo & Sim) */}
                  {(ergoData || simStats) && (
                      <div className="grid grid-cols-2 gap-4 break-inside-avoid">
                          {/* Ergonomics */}
                          {ergoData && ergoData.length > 0 && (
                              <div className="border border-gray-300 p-2 rounded">
                                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><ShieldAlert size={16} className="text-red-600"/> การประเมินท่าทางการทำงาน (Ergonomics)</h4>
                                  <div className="flex items-center gap-4">
                                      <div className="w-24 h-24 rounded-full border-4 border-gray-200 flex items-center justify-center bg-gray-50">
                                          <div className="text-center">
                                              <div className="text-2xl font-bold text-gray-800">
                                                  {(ergoData.reduce((acc, f) => acc + f.score, 0) / ergoData.length).toFixed(1)}
                                              </div>
                                              <div className="text-[9px] text-gray-500 uppercase">คะแนนเฉลี่ย</div>
                                          </div>
                                      </div>
                                      <div className="text-xs space-y-1">
                                          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500"></div> เสี่ยงต่ำ: {ergoData.filter(f=>f.riskLevel==='Low').length} เฟรม</div>
                                          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-yellow-500"></div> เสี่ยงปานกลาง: {ergoData.filter(f=>f.riskLevel==='Medium').length} เฟรม</div>
                                          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500"></div> เสี่ยงสูง: {ergoData.filter(f=>f.riskLevel==='High'||f.riskLevel==='Very High').length} เฟรม</div>
                                      </div>
                                  </div>
                              </div>
                          )}

                          {/* Simulation */}
                          {simStats && (
                              <div className="border border-gray-300 p-2 rounded">
                                  <h4 className="font-bold text-sm mb-2 flex items-center gap-2"><BrainCircuit size={16} className="text-purple-600"/> ความสามารถกระบวนการ (Sim Capability)</h4>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div className="bg-gray-50 p-2 rounded border border-gray-200">
                                          <div className="text-gray-500">เวลาเฉลี่ย (Mean)</div>
                                          <div className="font-bold text-lg">{simStats.avg.toFixed(2)}s</div>
                                      </div>
                                      <div className={`p-2 rounded border ${simStats.riskProb > 10 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                          <div className="opacity-80">ความเสี่ยงไลน์หยุด</div>
                                          <div className="font-bold text-lg">{simStats.riskProb.toFixed(1)}%</div>
                                      </div>
                                      <div className="bg-gray-50 p-2 rounded border border-gray-200">
                                          <div className="text-gray-500">แย่ที่สุด (P99)</div>
                                          <div className="font-bold">{simStats.p99.toFixed(2)}s</div>
                                      </div>
                                      <div className="bg-gray-50 p-2 rounded border border-gray-200">
                                          <div className="text-gray-500">กำลังการผลิต/ชม.</div>
                                          <div className="font-bold">{Math.floor(3600 / simStats.avg)} ชิ้น</div>
                                      </div>
                                  </div>
                              </div>
                          )}
                      </div>
                  )}

                  {/* Summary Footer */}
                  <div className="border border-black p-4 flex justify-between items-start text-xs break-inside-avoid mt-auto">
                      <div>
                          <h4 className="font-bold mb-2">ข้อควรระวังความปลอดภัย:</h4>
                          <ul className="list-disc ml-4 space-y-1">
                              <li>สวมแว่นตานิรภัยตลอดเวลา</li>
                              <li>ตรวจสอบให้แน่ใจว่าเครื่องจักรหยุดสนิทก่อนหยิบชิ้นงาน</li>
                              <li>รักษาพื้นที่ให้สะอาดตามหลัก 5ส</li>
                          </ul>
                      </div>
                      <div className="w-64">
                           <div className="flex justify-between border-b border-gray-300 py-1">
                               <span>เวลามาตรฐานรวม:</span>
                               <span className="font-bold">{validTasks.reduce((acc, t) => acc + (t.rounds[0]?.total || 0), 0).toFixed(2)} วิ</span>
                           </div>
                           <div className="flex justify-between border-b border-gray-300 py-1">
                               <span>กำลังการผลิต/ชม.:</span>
                               <span className="font-bold">{Math.floor(3600 / (validTasks.reduce((acc, t) => acc + (t.rounds[0]?.total || 0), 0) || 1))} ชิ้น</span>
                           </div>
                           <div className="mt-4 pt-8 border-t border-black text-center">
                               อนุมัติโดย (ผู้จัดการ)
                           </div>
                      </div>
                  </div>

                  {/* Print Footer */}
                  <div className="absolute bottom-4 left-0 w-full text-center text-[10px] text-gray-400 print:block hidden">
                      Generated by Yamazumi AI Analyst • www.ie-business-solution.com
                  </div>
              </div>
          )}

          {/* 2. DIGITAL VIDEO SOP */}
          {activeTab === 'digital' && (
              <div className="w-full max-w-6xl flex gap-4 h-[calc(100vh-140px)]">
                  {/* Left: Video Player */}
                  <div className="flex-grow bg-black rounded-xl overflow-hidden relative shadow-2xl flex flex-col">
                       <div className="relative flex-grow bg-black flex items-center justify-center">
                           {videoSrc ? (
                               <video 
                                    ref={videoRef}
                                    src={videoSrc}
                                    className="max-h-full max-w-full"
                                    onTimeUpdate={handleTimeUpdate}
                                    playsInline
                                    muted={false} // Allow audio for training
                               />
                           ) : (
                               <div className="text-gray-500 flex flex-col items-center"><Video size={48} className="mb-2"/> ไม่มีวิดีโอต้นฉบับ</div>
                           )}

                           {/* Step Overlay */}
                           {validTasks[currentStep] && (
                               <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-6 py-4 rounded-xl border border-white/20 text-center max-w-2xl shadow-xl">
                                   <div className="text-blue-400 font-bold text-xs tracking-wider mb-1 uppercase">ขั้นตอนที่ {currentStep + 1} จาก {validTasks.length}</div>
                                   <div className="text-white font-bold text-2xl mb-2">{validTasks[currentStep].name}</div>
                                   <div className="text-gray-300 text-sm">{validTasks[currentStep].description}</div>
                               </div>
                           )}
                       </div>

                       {/* Controls */}
                       <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center justify-between px-6 shrink-0">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-all">
                                    {isPlaying ? <Pause size={20} fill="black"/> : <Play size={20} fill="black" className="ml-1"/>}
                                </button>
                                <button onClick={nextStep} className="text-gray-400 hover:text-white"><SkipForward size={24}/></button>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-500 uppercase mr-2">โหมด:</span>
                                <button 
                                    onClick={() => setAutoLoop(!autoLoop)} 
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${autoLoop ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                                >
                                    <Repeat size={14}/> {autoLoop ? 'วนซ้ำขั้นตอน' : 'เล่นครั้งเดียว'}
                                </button>
                            </div>
                       </div>
                  </div>

                  {/* Right: Steps List */}
                  <div className="w-80 bg-white rounded-xl shadow-xl flex flex-col border border-gray-200 overflow-hidden shrink-0">
                      <div className="p-4 border-b border-gray-100 bg-gray-50">
                          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Factory size={16} className="text-blue-600"/> รายการขั้นตอน</h3>
                      </div>
                      <div className="flex-grow overflow-y-auto p-2 space-y-2">
                          {validTasks.map((t, idx) => (
                              <div 
                                key={t.id}
                                onClick={() => playStep(idx)}
                                className={`p-3 rounded-lg cursor-pointer border transition-all ${currentStep === idx ? 'bg-blue-600 text-white shadow-lg scale-105 border-blue-500 z-10' : 'bg-white hover:bg-gray-50 border-gray-100 text-gray-600'}`}
                              >
                                  <div className="flex justify-between items-start mb-1">
                                      <div className="font-bold text-sm">{idx + 1}. {t.name}</div>
                                      <div className={`text-[10px] font-mono opacity-80 ${currentStep === idx ? 'text-blue-100' : 'text-gray-400'}`}>
                                          {t.rounds[0]?.total.toFixed(1)}s
                                      </div>
                                  </div>
                                  {currentStep === idx && (
                                      <div className="text-xs text-blue-100 mt-1 line-clamp-2">{t.description}</div>
                                  )}
                                  {currentStep === idx && (
                                      <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-300">
                                          <Activity size={12} className="animate-pulse"/> กำลังแสดง
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>
                      <div className="p-3 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-200">
                          Yamazumi AI • Digital Work Instruction
                      </div>
                  </div>
              </div>
          )}

      </div>
    </div>
  );
};

export default SmartReport;
