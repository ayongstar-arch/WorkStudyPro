
import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Upload, Link as LinkIcon, Unlink, RotateCcw, FastForward, Rewind, Film, X, Clock, MousePointer2 } from 'lucide-react';

const VideoComparison: React.FC = () => {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  const [srcA, setSrcA] = useState<string | null>(null);
  const [srcB, setSrcB] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLinked, setIsLinked] = useState(true); // Sync Control
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const [timeA, setTimeA] = useState(0);
  const [timeB, setTimeB] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);

  // Clean up URLs on unmount
  useEffect(() => {
    return () => {
      if (srcA) URL.revokeObjectURL(srcA);
      if (srcB) URL.revokeObjectURL(srcB);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, side: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      if (side === 'A') setSrcA(url);
      else setSrcB(url);
    }
    e.target.value = ''; // Reset input
  };

  const clearVideo = (side: 'A' | 'B') => {
      if (side === 'A') {
          if (srcA) URL.revokeObjectURL(srcA);
          setSrcA(null);
          setTimeA(0);
          setDurationA(0);
      } else {
          if (srcB) URL.revokeObjectURL(srcB);
          setSrcB(null);
          setTimeB(0);
          setDurationB(0);
      }
      setIsPlaying(false);
  };

  // --- Master Controls ---

  const togglePlay = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);

    if (isLinked) {
        // Master Control
        if (videoARef.current) newState ? videoARef.current.play() : videoARef.current.pause();
        if (videoBRef.current) newState ? videoBRef.current.play() : videoBRef.current.pause();
    } else {
        // Should logically only play the one deemed 'active' or both?
        // Standard UX: Master Play button always tries to play both, 
        // but 'Link' usually refers to Seeking. 
        // However, for Kaizen comparison, we usually want to play both simultaneously regardless.
        if (videoARef.current) newState ? videoARef.current.play() : videoARef.current.pause();
        if (videoBRef.current) newState ? videoBRef.current.play() : videoBRef.current.pause();
    }
  };

  const changeSpeed = (rate: number) => {
      setPlaybackRate(rate);
      if (videoARef.current) videoARef.current.playbackRate = rate;
      if (videoBRef.current) videoBRef.current.playbackRate = rate;
  };

  const seek = (seconds: number, side: 'A' | 'B' | 'Both') => {
      if (side === 'A' || side === 'Both') {
          if (videoARef.current) videoARef.current.currentTime = seconds;
          setTimeA(seconds);
      }
      if (side === 'B' || side === 'Both') {
          if (videoBRef.current) videoBRef.current.currentTime = seconds;
          setTimeB(seconds);
      }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>, side: 'A' | 'B') => {
      const val = parseFloat(e.target.value);
      
      // If Linked, we need to decide logic.
      // Usually in Kaizen tools:
      // - Unlinked: Adjust sliders independently to sync the "Start Point" (e.g. hand touches part).
      // - Linked: Moving one slider moves the other by the SAME DELTA (preserving the offset).
      // For simplicity in web MVP: Linked = Master Slider moves both to same percentage or absolute time?
      // Let's go with: Independent Sliders always available. 
      // Linked Mode affects Play/Pause and Step triggers.
      
      seek(val, side);
  };
  
  const stepFrame = (delta: number) => {
      if (isLinked) {
          if (videoARef.current) videoARef.current.currentTime += delta;
          if (videoBRef.current) videoBRef.current.currentTime += delta;
      } else {
           // If unlinked, maybe just step the one that was last interacted with? 
           // Or just step both? Let's step both for convenience.
           if (videoARef.current) videoARef.current.currentTime += delta;
           if (videoBRef.current) videoBRef.current.currentTime += delta;
      }
  };
  
  const resetToStart = () => {
      seek(0, 'Both');
      setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 10);
      return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 p-4 gap-4">
      {/* Header / Toolbar */}
      <div className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
              <Film className="text-blue-400" size={20} />
              <h2 className="text-gray-200 font-bold">Kaizen Comparison</h2>
              <span className="text-xs text-gray-500 ml-2 bg-gray-900 px-2 py-1 rounded border border-gray-700">Before vs After Analysis</span>
          </div>
          
          <div className="flex items-center gap-4">
               {/* Speed Control */}
               <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                  {[0.25, 0.5, 1.0].map(rate => (
                      <button 
                        key={rate}
                        onClick={() => changeSpeed(rate)}
                        className={`px-3 py-1 text-xs font-bold rounded ${playbackRate === rate ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                      >
                          {rate}x
                      </button>
                  ))}
               </div>

               {/* Sync Toggle */}
               <button 
                onClick={() => setIsLinked(!isLinked)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border transition-all ${
                    isLinked 
                    ? 'bg-green-600/20 border-green-500 text-green-400' 
                    : 'bg-red-600/20 border-red-500 text-red-400'
                }`}
                title={isLinked ? "Videos are Linked (Play together)" : "Videos are Unlinked (Adjust independently)"}
               >
                   {isLinked ? <LinkIcon size={16} /> : <Unlink size={16} />}
                   <span className="text-sm font-bold">{isLinked ? "SYNC ON" : "SYNC OFF"}</span>
               </button>
          </div>
      </div>

      {/* Main Video Area - Split Screen */}
      <div className="flex-grow flex gap-4 min-h-0">
          {/* LEFT VIDEO (Before) */}
          <div className="flex-1 flex flex-col gap-2 bg-black/40 rounded-xl p-2 border border-gray-700/50">
              <div className="flex justify-between items-center px-2">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reference (Before)</div>
                  {srcA && <button onClick={() => clearVideo('A')} className="text-gray-500 hover:text-white"><X size={14}/></button>}
              </div>
              
              <div className="flex-grow bg-black rounded-lg border border-gray-700 relative overflow-hidden flex items-center justify-center group">
                  {srcA ? (
                      <video 
                        ref={videoARef}
                        src={srcA}
                        className="max-h-full max-w-full"
                        onTimeUpdate={(e) => setTimeA(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => setDurationA(e.currentTarget.duration)}
                        playsInline
                        muted
                        onClick={togglePlay}
                      />
                  ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 text-gray-600 hover:text-blue-400 transition-colors">
                          <Upload size={48} />
                          <span className="text-sm font-bold">Upload Video A</span>
                          <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'A')} />
                      </label>
                  )}
                  {/* Time Overlay */}
                  {srcA && (
                      <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs font-mono text-white border border-gray-600">
                          {formatTime(timeA)}
                      </div>
                  )}
              </div>
              
              {/* Individual Control A */}
              <div className="h-8 flex items-center gap-2 px-1">
                  <input 
                    type="range" 
                    min={0} max={durationA || 100} step={0.05}
                    value={timeA}
                    onChange={(e) => handleSliderChange(e, 'A')}
                    disabled={!srcA}
                    className="custom-range flex-grow h-4 cursor-pointer"
                  />
              </div>
          </div>

          {/* RIGHT VIDEO (After) */}
          <div className="flex-1 flex flex-col gap-2 bg-black/40 rounded-xl p-2 border border-gray-700/50">
               <div className="flex justify-between items-center px-2">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Target (After)</div>
                  {srcB && <button onClick={() => clearVideo('B')} className="text-gray-500 hover:text-white"><X size={14}/></button>}
              </div>

              <div className="flex-grow bg-black rounded-lg border border-gray-700 relative overflow-hidden flex items-center justify-center group">
                  {srcB ? (
                      <video 
                        ref={videoBRef}
                        src={srcB}
                        className="max-h-full max-w-full"
                        onTimeUpdate={(e) => setTimeB(e.currentTarget.currentTime)}
                        onLoadedMetadata={(e) => setDurationB(e.currentTarget.duration)}
                        playsInline
                        muted
                        onClick={togglePlay}
                      />
                  ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-2 text-gray-600 hover:text-green-400 transition-colors">
                          <Upload size={48} />
                          <span className="text-sm font-bold">Upload Video B</span>
                          <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'B')} />
                      </label>
                  )}
                   {/* Time Overlay */}
                   {srcB && (
                      <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs font-mono text-white border border-gray-600">
                          {formatTime(timeB)}
                      </div>
                  )}
              </div>
              
               {/* Individual Control B */}
               <div className="h-8 flex items-center gap-2 px-1">
                  <input 
                    type="range" 
                    min={0} max={durationB || 100} step={0.05}
                    value={timeB}
                    onChange={(e) => handleSliderChange(e, 'B')}
                    disabled={!srcB}
                    className="custom-range flex-grow h-4 cursor-pointer"
                  />
              </div>
          </div>
      </div>

      {/* Footer / Master Controls */}
      <div className="h-20 bg-gray-800 rounded-xl border border-gray-700 flex flex-col items-center justify-center relative shadow-lg">
          {/* Stats Display */}
          <div className="absolute left-6 top-1/2 -translate-y-1/2 hidden md:block">
              <div className="text-xs text-gray-500 font-bold uppercase mb-1">Time Difference</div>
              <div className={`text-xl font-mono font-bold ${Math.abs(timeA - timeB) > 0.1 ? 'text-yellow-400' : 'text-gray-300'}`}>
                  {srcA && srcB ? (Math.abs(timeA - timeB).toFixed(2) + 's') : '--'}
              </div>
          </div>

          <div className="flex items-center gap-6">
              <button onClick={() => stepFrame(-0.1)} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors" title="-0.1s">
                 <Rewind size={20} />
              </button>

              <button 
                onClick={togglePlay}
                className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 transition-all"
              >
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1"/>}
              </button>

              <button onClick={() => stepFrame(0.1)} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors" title="+0.1s">
                 <FastForward size={20} />
              </button>
          </div>
          
          <button 
            onClick={resetToStart}
            className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-white transition-colors"
          >
              <RotateCcw size={14} /> RESET
          </button>
      </div>
      <style>{`
        /* High Contrast Custom Slider (Cross-Browser) */
        input[type=range].custom-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          background: transparent;
        }
        
        /* Webkit (Chrome/Edge/Safari) */
        input[type=range].custom-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3B82F6;
          cursor: pointer;
          margin-top: -6px; /* Center thumb: (4px track - 16px thumb) / 2 */
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

export default VideoComparison;
