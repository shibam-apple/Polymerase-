import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type SonarStatus = { running: boolean; path: string | null; startedAt: number; seconds: number; source: string; error: string };
export type SonarFrame = { iq: number[]; rms: number; seconds: number };

type SonarNative = {
  start(tones: number[], volume: number, live: boolean): Promise<{ path: string; unprocessed: boolean; mediaVolume: number }>;
  stop(): Promise<SonarStatus>;
  status(): SonarStatus;
  read(path: string): Promise<string>;
  remove(path: string): Promise<boolean>;
  addListener(event: 'onFrame', cb: (e: SonarFrame) => void): { remove(): void };
};

/** Android only: speaker + microphone continuous-wave sonar (modules/sonar). Null elsewhere. */
export const Sonar = Platform.OS === 'android' ? requireOptionalNativeModule<SonarNative>('Sonar') : null;
