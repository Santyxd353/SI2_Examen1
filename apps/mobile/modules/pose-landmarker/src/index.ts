import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type Landmark = { x: number; y: number; visibility: number };
export type PoseResult = { width: number; height: number; landmarks: Landmark[] };
type NativePose = { detectPose(uri: string): Promise<PoseResult>; close(): void };
let nativePose: NativePose | null = null;

function module(): NativePose {
  if (Platform.OS !== 'android')
    throw new Error('El seguimiento corporal se está preparando para Android.');
  const found = (nativePose ??= requireOptionalNativeModule<NativePose>('VestidorPoseLandmarker'));
  if (!found)
    throw new Error(
      'Instala una development build de Android para activar el seguimiento corporal.',
    );
  return found;
}

export function isPoseAvailable(): boolean {
  return (
    Platform.OS === 'android' &&
    !!(nativePose ??= requireOptionalNativeModule<NativePose>('VestidorPoseLandmarker'))
  );
}

export async function detectPose(uri: string): Promise<PoseResult> {
  return module().detectPose(uri);
}

export function closePose() {
  nativePose?.close();
  nativePose = null;
}
