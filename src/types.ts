export interface MeetingSignal {
  event: 'meeting_signal';
  timestamp: string;
  service: 'microphone' | 'camera' | '';
  verdict: 'requested' | 'allowed' | 'denied' | '';
  process: string;
  pid: string;
  front_app: string;
  camera_active: boolean;
}

export interface ProcessExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface MeetingDetectorOptions {
  /**
   * Path to the meeting-detect.sh script
   * @default './meeting-detect.sh'
   */
  scriptPath?: string;
  
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

export type MeetingEventCallback = (signal: MeetingSignal) => void;
export type ErrorEventCallback = (error: Error) => void;