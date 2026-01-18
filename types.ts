
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Cycle {
  id: number;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'ok' | 'over' | 'abnormal';
  aiLabel?: 'Operation' | 'Transport' | 'Idle' | 'Unknown'; // New AI Field
}

export interface TriggerStep {
  id: string;
  name: string;
  rect: Rect;
  isActive: boolean;
  hitCount: number;
}

export interface AppState {
  cycles: Cycle[];
  taktTime: number;
  sensitivity: number;
  isTracking: boolean;
  videoSrc: string | null;
}

export interface ProjectData {
  videoSrc: string | null;
  cycles: Cycle[];
  taktTime: number;
  sensitivity: number;
  refRect: Rect | null;
  triggerSteps: TriggerStep[];
  workStudyTasks: WorkStudyTask[]; // Added for persistence
  updatedAt: number; // Added for sync
}

export type ActivityType = 'Operation' | 'Transport' | 'Inspection' | 'Delay' | 'Hold';

export interface WorkStudyRound {
  ht: number; // Hand Time
  wt: number; // Walk Time
  mt: number; // Machine Time
  total: number;
  startTime?: number;
  endTime?: number;
}

export interface WorkStudyTask {
  id: string;
  name: string;
  description?: string;
  rounds: (WorkStudyRound | null | undefined)[];
  activity: ActivityType;
  rating: number;
  allowance: number;
  thumbnail?: string;
}

export interface LogisticsEvent {
  id: string;
  name: string;
  category: 'VA' | 'NVA' | 'NNVA';
  startTime: number;
  endTime?: number;
  duration: number;
  color?: string;
}

export interface MultiAxialResource {
  id: number;
  name: string;
  type: 'MAN' | 'MACHINE';
  color: string;
  src?: string;
  offset: number;
}

export interface MultiAxialEvent {
  id: string;
  resourceId: number;
  name: string;
  startTime: number;
  duration: number;
  type: 'VA' | 'NVA' | 'NNVA';
}

export interface ErgoFrame {
  timestamp: number;
  neckAngle: number;
  trunkAngle: number;
  upperArmAngle: number;
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Very High';
}

export interface SimulationStats {
  avg: number;
  min: number;
  max: number;
  riskProb: number;
  p90: number;
  p99: number;
  histogram?: { range: string, count: number, mid: number }[];
}

// --- DIGITAL TWIN & SIMULATION TYPES ---

export type StationStatus = 'IDLE' | 'BUSY' | 'BLOCKED' | 'STARVED' | 'DOWN';

export interface StationNode {
  id: string;
  name: string;
  baseCycleTime: number; // Mean CT
  variance: number;      // StdDev
  operators: number;
  bufferSize: number;    // Input buffer capacity
  
  // Dynamic State
  currentWIP: number;    // Items in queue
  status: StationStatus;
  progress: number;      // 0-100% of current cycle
  
  // Stats
  totalProcessed: number;
  totalTimeState: {
    IDLE: number;
    BUSY: number;
    BLOCKED: number;
    STARVED: number;
    DOWN: number;
  };
}

export interface SimulationScenario {
  id: string;
  name: string;
  taktTime: number;
  durationMinutes: number; // Simulation runtime
  speedMultiplier: number; // 1x, 10x, 100x
}

// --- AI & SYSTEM TYPES ---

export type AIActionType = 'IDLE' | 'OPERATION' | 'TRANSPORT' | 'SETUP';

export interface SyncStatus {
  state: 'synced' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: Date;
}

declare global {
  /* Fix: Use capital 'Window' to correctly augment the global Window interface */
  interface Window {
    cv: any;
    Hands: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    Pose: any;
    POSE_CONNECTIONS: any;
    Hls: any;
    showDirectoryPicker?: (options?: any) => Promise<any>;
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
}
