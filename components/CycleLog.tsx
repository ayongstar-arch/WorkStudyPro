
import React from 'react';
import { Cycle } from '../types';
import { Clock, Download, FileSpreadsheet } from 'lucide-react';
import XLSX from 'xlsx';

interface Props {
  cycles: Cycle[];
  onExport?: () => void; // Optional legacy prop
}

const CycleLog: React.FC<Props> = ({ cycles }) => {

  const handleProfessionalExport = () => {
    if (cycles.length === 0) {
        alert("ไม่มีข้อมูลให้ส่งออก");
        return;
    }

    // 1. Calculate Stats (Exclude Abnormal for Avg)
    const validDurations = cycles.filter(c => c.status !== 'abnormal').map(c => c.duration);
    const totalTime = validDurations.reduce((a, b) => a + b, 0);
    const avgTime = validDurations.length > 0 ? totalTime / validDurations.length : 0;
    const minTime = validDurations.length > 0 ? Math.min(...validDurations) : 0;
    const maxTime = validDurations.length > 0 ? Math.max(...validDurations) : 0;
    const range = maxTime - minTime;
    const stdDev = validDurations.length > 0 ? Math.sqrt(validDurations.reduce((a, b) => a + Math.pow(b - avgTime, 2), 0) / validDurations.length) : 0;
    
    // 2. Prepare Data Sheets
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Summary Report ---
    const summaryData: any[][] = [
        ["AI ANALYST - PRODUCTION REPORT"],
        ["Generated:", new Date().toLocaleString()],
        [],
        ["SUMMARY STATISTICS (Valid Cycles)", "", "CAPACITY ANALYSIS (Est.)"],
        ["Total Cycles", String(cycles.length), "Shift Duration (Hrs)", "8"],
        ["Valid Cycles", String(validDurations.length), "Abnormal/Break Cycles", String(cycles.length - validDurations.length)],
        ["Average Cycle Time", avgTime.toFixed(3), "Operating Time (Min)", "460"],
        ["Minimum Time", minTime.toFixed(3), "Daily Output (Units)", avgTime > 0 ? String(Math.floor((460*60)/avgTime)) : "-"],
        ["Maximum Time", maxTime.toFixed(3), "Utilization %", "100%"], // Placeholder
        ["Range (Fluctuation)", range.toFixed(3)],
        ["Standard Deviation", stdDev.toFixed(3)],
        ["Stability Score", stdDev < 1 ? "HIGH" : stdDev < 3 ? "MEDIUM" : "LOW"],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Style adjustments (width)
    (wsSummary as any)['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary Report");

    // --- Sheet 2: Raw Data ---
    const rawData: any[][] = [
        ["Cycle ID", "Start Time (s)", "End Time (s)", "Duration (s)", "Status", "Deviation from Avg"]
    ];
    cycles.forEach(c => {
        rawData.push([
            c.id,
            c.startTime.toFixed(3),
            c.endTime.toFixed(3),
            c.duration.toFixed(3),
            c.status.toUpperCase(),
            (c.duration - avgTime).toFixed(3)
        ]);
    });
    const wsRaw = XLSX.utils.aoa_to_sheet(rawData);
    (wsRaw as any)['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsRaw, "Raw Data");

    // 3. Save File
    XLSX.writeFile(wb, `Yamazumi_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg border border-gray-700 shadow-sm overflow-hidden">
      <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800">
        <h3 className="text-gray-300 font-bold text-sm flex items-center gap-2">
          <Clock size={16} /> บันทึกข้อมูลรอบเวลา (Cycle Log)
        </h3>
        <button 
          onClick={handleProfessionalExport}
          className="flex items-center gap-2 px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-xs text-white font-bold transition-colors"
          title="Export Professional Excel Report"
        >
          <FileSpreadsheet size={14} /> ส่งออกรายงาน
        </button>
      </div>
      
      <div className="flex-grow overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase bg-gray-900 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">เริ่ม (Start)</th>
              <th className="px-3 py-2">ระยะเวลา (Duration)</th>
              <th className="px-3 py-2">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {cycles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-500 italic">
                  รอข้อมูลการวิเคราะห์...
                </td>
              </tr>
            ) : (
              cycles.map((cycle, idx) => (
                <tr key={cycle.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-3 py-2 font-mono text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-2 text-gray-400">{cycle.startTime.toFixed(1)}s</td>
                  <td className="px-3 py-2 font-bold text-white">{cycle.duration.toFixed(2)}s</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      cycle.status === 'ok' 
                        ? 'bg-green-900/50 text-green-400 border border-green-800' 
                        : cycle.status === 'over'
                            ? 'bg-red-900/50 text-red-400 border border-red-800'
                            : 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    }`}>
                      {cycle.status === 'ok' ? 'ปกติ' : cycle.status === 'over' ? 'เกินกำหนด' : 'ผิดปกติ'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CycleLog;
