import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MeetingSignal, MeetingDetectorOptions, MeetingEventCallback, ErrorEventCallback } from './types.js';

export class MeetingDetector extends EventEmitter {
  private process?: ChildProcess;
  private options: Required<MeetingDetectorOptions>;
  private recentSignals: Map<string, { timestamp: Date; signal: MeetingSignal }> = new Map();

  constructor(options: MeetingDetectorOptions = {}) {
    super();
    
    // Get the absolute path to the script relative to this package
    const defaultScriptPath = options.scriptPath || join(
      dirname(fileURLToPath(import.meta.url)),
      '../meeting-detect.sh'
    );
    
    this.options = {
      scriptPath: defaultScriptPath,
      debug: options.debug || false
    };
  }

  /**
   * Start monitoring for meeting signals
   * @param callback Optional callback function for meeting events
   */
  public start(callback?: MeetingEventCallback): void {
    if (this.process) {
      throw new Error('Detector is already running');
    }

    if (callback) {
      this.on('meeting', callback);
    }

    this.process = spawn('sh', [this.options.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const signal = this.parseSignal(line);
            
            // Suppress unwanted process signals
            const processName = signal.process?.toLowerCase() || '';
            if (processName.includes('afplay') || processName.includes('sirincservice')) {
              if (this.options.debug) {
                console.log('[MeetingDetector] Suppressing signal from:', signal.process);
              }
              continue;
            }
            
            if (this.options.debug) {
              console.log('[MeetingDetector] Parsed signal:', signal);
            }
            
            // Check for duplicate signals within 1 minute window
            if (!this.isDuplicateSignal(signal)) {
              this.emit('meeting', signal);
              this.trackSignal(signal);
            } else if (this.options.debug) {
              console.log('[MeetingDetector] Skipping duplicate signal for PID:', signal.pid);
            }
          } catch (error) {
            if (this.options.debug) {
              console.log('[MeetingDetector] Failed to parse line:', line);
            }
            this.emit('error', new Error(`Failed to parse signal: ${line}`));
          }
        }
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      if (this.options.debug) {
        console.log('[MeetingDetector] stderr:', data.toString());
      }
    });

    this.process.on('error', (error) => {
      this.emit('error', error);
    });

    this.process.on('exit', (code, signal) => {
      if (this.options.debug) {
        console.log(`[MeetingDetector] Process exited with code ${code}, signal ${signal}`);
      }
      this.process = undefined;
      this.emit('exit', { code, signal });
    });

    if (this.options.debug) {
      console.log('[MeetingDetector] Started monitoring');
    }
  }

  /**
   * Stop monitoring
   */
  public stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = undefined;
      
      if (this.options.debug) {
        console.log('[MeetingDetector] Stopped monitoring');
      }
    }
  }

  /**
   * Check if the detector is currently running
   */
  public isRunning(): boolean {
    return !!this.process;
  }

  /**
   * Add a meeting event listener
   */
  public onMeeting(callback: MeetingEventCallback): void {
    this.on('meeting', callback);
  }

  /**
   * Add an error event listener
   */
  public onError(callback: ErrorEventCallback): void {
    this.on('error', callback);
  }

  private parseSignal(line: string): MeetingSignal {
    const signal = JSON.parse(line) as Record<string, any>;
    
    // Use transformed app name as service if the original service is a system service like 'microphone' or 'camera'
    const originalService = signal.service || '';
    const transformedService = this.transformAppName(signal.front_app, signal.process);
    const finalService = (originalService === 'microphone' || originalService === 'camera' || !originalService) 
      ? transformedService 
      : originalService;
    
    return {
      event: signal.event,
      timestamp: signal.timestamp,
      service: finalService,
      verdict: signal.verdict || '',
      process: signal.process || '',
      pid: signal.pid || '',
      front_app: signal.front_app || '',
      camera_active: signal.camera_active === 'true' || signal.camera_active === true
    };
  }

  private transformAppName(frontApp: string, process: string): string {
    const app = frontApp?.toLowerCase() || '';
    const proc = process?.toLowerCase() || '';
    
    if (app.includes('slack') || proc.includes('slack')) {
      return 'Slack';
    } else if (app.includes('msteams') || proc.includes('microsoft teams') || proc.includes('teams')) {
      return 'Microsoft Teams';
    } else if (app.includes('zoom') || proc.includes('zoom')) {
      return 'Zoom';
    } else if (app.includes('webex') || proc.includes('webex') || proc.includes('cisco webex')) {
      return 'Webex';
    } else if (app.includes('google meet') || proc.includes('google meet') || proc.includes('meet.google.com') || (app.includes('chrome') && proc.includes('chrome'))) {
      return 'Google Meet';
    } else if (app.includes('skype') || proc.includes('skype')) {
      return 'Skype';
    } else if (app.includes('discord') || proc.includes('discord')) {
      return 'Discord';
    } else if (app.includes('facetime') || proc.includes('facetime')) {
      return 'FaceTime';
    } else if (app.includes('gotomeeting') || proc.includes('gotomeeting') || proc.includes('goto meeting')) {
      return 'GoToMeeting';
    } else if (app.includes('bluejeans') || proc.includes('bluejeans') || proc.includes('blue jeans')) {
      return 'BlueJeans';
    } else if (app.includes('jitsi') || proc.includes('jitsi')) {
      return 'Jitsi Meet';
    } else if (app.includes('whereby') || proc.includes('whereby')) {
      return 'Whereby';
    } else if (app.includes('8x8') || proc.includes('8x8')) {
      return '8x8';
    } else if (app.includes('ringcentral') || proc.includes('ringcentral') || proc.includes('ring central')) {
      return 'RingCentral';
    } else if (app.includes('bigbluebutton') || proc.includes('bigbluebutton') || proc.includes('big blue button')) {
      return 'BigBlueButton';
    } else if (app.includes('chime') || proc.includes('chime') || proc.includes('amazon chime')) {
      return 'Amazon Chime';
    } else if (app.includes('hangouts') || proc.includes('hangouts') || proc.includes('google hangouts')) {
      return 'Google Hangouts';
    } else if (app.includes('adobe connect') || proc.includes('adobe connect')) {
      return 'Adobe Connect';
    } else if (app.includes('teamviewer') || proc.includes('teamviewer')) {
      return 'TeamViewer';
    } else if (app.includes('anydesk') || proc.includes('anydesk')) {
      return 'AnyDesk';
    } else if (app.includes('clickmeeting') || proc.includes('clickmeeting')) {
      return 'ClickMeeting';
    } else if (app.includes('appear.in') || proc.includes('appear.in')) {
      return 'Appear.in';
    } else {
      // Fallback to front_app if no match
      return frontApp || 'Meeting App';
    }
  }

  private isDuplicateSignal(signal: MeetingSignal): boolean {
    if (!signal.pid) return false;

    const key = `${signal.pid}-${signal.service}-${signal.verdict}`;
    const existing = this.recentSignals.get(key);
    
    if (!existing) return false;

    // Check if the signal is within 1 minute (60000ms) of the previous one
    const timeDiff = Date.now() - existing.timestamp.getTime();
    return timeDiff < 60000;
  }

  private trackSignal(signal: MeetingSignal): void {
    if (!signal.pid) return;

    const key = `${signal.pid}-${signal.service}-${signal.verdict}`;
    this.recentSignals.set(key, {
      timestamp: new Date(),
      signal
    });

    // Clean up old signals (older than 2 minutes)
    const cutoffTime = Date.now() - 120000;
    for (const [key, entry] of this.recentSignals.entries()) {
      if (entry.timestamp.getTime() < cutoffTime) {
        this.recentSignals.delete(key);
      }
    }
  }
}

// Convenience function for simple usage
export function detector(callback: MeetingEventCallback, options?: MeetingDetectorOptions): MeetingDetector {
  const detector = new MeetingDetector(options);
  detector.start(callback);
  return detector;
}