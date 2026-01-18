
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { Timer, TrendingUp, AlertOctagon, Activity } from 'lucide-react';
import { Cycle } from '../types';

interface Props {
  cycles: Cycle[];
  taktTime: number;
  onCycleClick?: (timestamp: number) => void;
}

// Industrial 4.0 Color Palette
const COLORS = {
  VA: '#10B981',   // Emerald 500 - Value Added
  NNVA: '#FBBF24', // Amber 400 - Necessary Non-Value
  WASTE: '#F43F5E',// Rose 500 - Waste
  ABNORMAL: '#A855F7', // Purple 500 - Abnormal/Break
  TAKT: '#BE123C', // Rose 700 - Takt Line
  BG: '#FFFFFF',
  GRID: '#E5E7EB',
  TEXT: '#6B7280'
};

const KPICard = ({ title, value, unit, icon: Icon, colorClass }: any) => (
  <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex items-center justify-between">
    <div>
      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold ${colorClass}`}>{value}</span>
        <span className="text-[10px] text-gray-500 font-medium">{unit}</span>
      </div>
    </div>
    <div className={`p-2 rounded-md bg-opacity-10 ${colorClass.replace('text-', 'bg-')}`}>
      <Icon size={16} className={colorClass} />
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label, taktTime }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((acc: number, p: any) => acc + (p.value || 0), 0);
    const isOver = total > taktTime;
    const isAbnormal = payload.some((p: any) => p.dataKey === 'abnormal' && p.value > 0);
    
    return (
      <div className="bg-white border border-gray-200 shadow-xl rounded-lg p-3 z-50">
        <div className="flex justify-between items-center mb-2 border-b border-gray-100 pb-1">
          <span className="font-bold text-gray-700 text-xs">รอบที่ {label}</span>
          <span className="font-mono text-xs text-gray-500">{payload[0].payload.timestamp.toFixed(1)}s</span>
        </div>
        
        {isAbnormal ? (
             <div className="text-xs text-purple-600 font-bold mb-2">Abnormal / Idle Time</div>
        ) : (
            <div className="space-y-1 text-xs mb-2">
            <div className="flex justify-between gap-4">
                <span className="text-emerald-600 font-medium">เพิ่มมูลค่า (VA):</span>
                <span className="font-mono font-bold">{payload[0]?.value.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between gap-4">
                <span className="text-amber-500 font-medium">จำเป็น (NNVA):</span>
                <span className="font-mono font-bold">{payload[1]?.value.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between gap-4">
                <span className="text-rose-500 font-medium">ความสูญเปล่า (Waste):</span>
                <span className="font-mono font-bold">{payload[2]?.value.toFixed(2)}s</span>
            </div>
            </div>
        )}

        <div className="pt-2 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-600">รวม:</span>
          <span className={`text-sm font-mono font-bold ${isAbnormal ? 'text-purple-600' : isOver ? 'text-rose-600' : 'text-emerald-600'}`}>
            {total.toFixed(2)}s
          </span>
        </div>
      </div>
    );
  }
  return null;
};

const YamazumiChart: React.FC<Props> = ({ cycles, taktTime, onCycleClick }) => {
  // Transformation Logic: Simulate VA/NNVA breakdown if not provided by backend
  const chartData = useMemo(() => {
    return cycles.map((cycle, idx) => {
      // Logic: Anything over Takt is Waste. The rest is split 80/20 VA/NNVA for visualization
      
      if (cycle.status === 'abnormal') {
          return {
              name: `${idx + 1}`,
              va: 0,
              nnva: 0,
              waste: 0,
              abnormal: cycle.duration,
              total: cycle.duration,
              timestamp: cycle.startTime,
              status: cycle.status
          };
      }

      let waste = 0;
      let usefulTime = cycle.duration;

      if (cycle.duration > taktTime) {
        waste = cycle.duration - taktTime;
        usefulTime = taktTime;
      } else {
        // Even under takt, assume small waste/NNVA variance
        waste = cycle.duration * 0.05; 
        usefulTime = cycle.duration - waste;
      }

      const nnva = usefulTime * 0.25; // Assume 25% represents setups/walks
      const va = usefulTime * 0.75;   // Assume 75% is actual work

      return {
        name: `${idx + 1}`,
        va: parseFloat(va.toFixed(2)),
        nnva: parseFloat(nnva.toFixed(2)),
        waste: parseFloat(waste.toFixed(2)),
        abnormal: 0,
        total: cycle.duration,
        timestamp: cycle.startTime,
        status: cycle.status
      };
    });
  }, [cycles, taktTime]);

  // KPI Calculations
  const kpis = useMemo(() => {
    if (cycles.length === 0) return { avg: 0, efficiency: 0, total: 0 };
    
    // Filter out abnormal cycles for Average calc to not skew data
    const validCycles = cycles.filter(c => c.status !== 'abnormal');
    const avg = validCycles.length > 0 ? validCycles.reduce((acc, c) => acc + c.duration, 0) / validCycles.length : 0;
    
    const overCycleCount = validCycles.filter(c => c.duration > taktTime).length;
    const efficiency = validCycles.length > 0 ? ((validCycles.length - overCycleCount) / validCycles.length) * 100 : 0;
    
    return { avg, efficiency, total: cycles.length };
  }, [cycles, taktTime]);

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg p-2 gap-2 overflow-hidden">
      
      {/* 1. Header & KPI Section */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        <KPICard 
          title="เวลาเฉลี่ย (Avg)" 
          value={kpis.avg.toFixed(1)} 
          unit="วิ" 
          icon={Timer} 
          colorClass="text-blue-600" 
        />
        <KPICard 
          title="ประสิทธิภาพ (Eff)" 
          value={kpis.efficiency.toFixed(0)} 
          unit="%" 
          icon={Activity} 
          colorClass={kpis.efficiency > 85 ? 'text-emerald-600' : 'text-amber-500'} 
        />
        <KPICard 
          title="จำนวนรอบรวม" 
          value={kpis.total} 
          unit="รอบ" 
          icon={TrendingUp} 
          colorClass="text-purple-600" 
        />
      </div>

      {/* 2. Main Chart Card */}
      <div className="flex-grow bg-white rounded-xl shadow-md border border-gray-200 p-4 flex flex-col min-h-0 relative">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <AlertOctagon size={14} className="text-gray-400"/>
              ความแปรปรวนรอบเวลา (Yamazumi)
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">Stacked Analysis: Value Added vs Waste</p>
          </div>
          <div className="flex gap-4 text-[10px]">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>VA</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400"></div>NNVA</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Waste</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div>Abnormal</div>
          </div>
        </div>

        <div className="flex-grow min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData} 
              margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.GRID} />
              <XAxis 
                dataKey="name" 
                stroke={COLORS.TEXT} 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                dy={5}
              />
              <YAxis 
                stroke={COLORS.TEXT} 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                content={<CustomTooltip taktTime={taktTime} />} 
                cursor={{ fill: '#F3F4F6', opacity: 0.6 }} 
              />
              
              <ReferenceLine 
                y={taktTime} 
                stroke={COLORS.TAKT} 
                strokeDasharray="4 4" 
                strokeWidth={2}
                label={{ 
                  value: `Takt: ${taktTime}s`, 
                  position: 'insideTopRight', 
                  fill: COLORS.TAKT, 
                  fontSize: 10, 
                  fontWeight: 'bold',
                  dy: -10 
                }} 
              />

              {/* Stacked Bars */}
              <Bar dataKey="va" stackId="a" fill={COLORS.VA} radius={[0, 0, 0, 0]} onClick={(data: any) => onCycleClick && onCycleClick(data.payload.timestamp)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="nnva" stackId="a" fill={COLORS.NNVA} radius={[0, 0, 0, 0]} onClick={(data: any) => onCycleClick && onCycleClick(data.payload.timestamp)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="waste" stackId="a" fill={COLORS.WASTE} radius={[4, 4, 0, 0]} onClick={(data: any) => onCycleClick && onCycleClick(data.payload.timestamp)} style={{ cursor: 'pointer' }} />
              <Bar dataKey="abnormal" stackId="a" fill={COLORS.ABNORMAL} radius={[4, 4, 4, 4]} onClick={(data: any) => onCycleClick && onCycleClick(data.payload.timestamp)} style={{ cursor: 'pointer' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {chartData.length === 0 && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm">
              <TrendingUp className="text-gray-300 mb-2" size={48} />
              <p className="text-xs text-gray-400 font-medium">รอข้อมูลรอบเวลา...</p>
           </div>
        )}
      </div>
    </div>
  );
};

export default YamazumiChart;
