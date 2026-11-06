'use client';

import type { FaceDetector } from '@mediapipe/tasks-vision';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const DETECT_EVERY_MS = 150;
// LiveKit RPC replies are capped at 15 KiB, so the photo is shrunk until it fits.
const MAX_PHOTO_CHARS = 14000;
const PHOTO_SETTLE_MS = 800;

async function openCamera(video: HTMLVideoElement | null, facing: 'user' | 'environment'): Promise<MediaStream> {
  const stream = await navigator.mediaDevices
    .getUserMedia({ video: { width: 640, height: 640, facingMode: { exact: facing } }, audio: false })
    .catch(() => navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 640, facingMode: facing }, audio: false }));
  if (video) {
    video.srcObject = stream;
    await video.play().catch(() => undefined);
  }
  return stream;
}

function snapshot(video: HTMLVideoElement): string {
  for (const [size, quality] of [[384, 0.6], [320, 0.5], [256, 0.45], [192, 0.4]] as const) {
    const scale = size / Math.max(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_PHOTO_CHARS) return url;
  }
  throw new Error('photo too large');
}

export type FaceStatus = 'none' | 'present' | 'looking';

export interface FaceWatchOptions {
  // A face must keep looking at the camera this long before onSeen fires.
  lookMs: number;
  // Nobody in frame this long fires onLost.
  lostMs: number;
  onSeen: () => void;
  onLost: () => void;
  // While true, a fresh look fires onSeen; each false -> true change re-arms it after rearmDelayMs.
  armed: boolean;
  rearmDelayMs: number;
}

// Frontal when the nose sits near the midpoint between the eyes.
function isLooking(keypoints: { x: number; y: number }[]): boolean {
  const [rightEye, leftEye, nose] = keypoints;
  if (!rightEye || !leftEye || !nose) return false;
  const eyeDist = Math.abs(leftEye.x - rightEye.x);
  if (eyeDist === 0) return false;
  const offset = Math.abs(nose.x - (leftEye.x + rightEye.x) / 2) / eyeDist;
  return offset < 0.25;
}

// Opens the camera into videoRef and watches for a face looking at it; nothing leaves the browser.
export default function useFaceWatch(videoRef: RefObject<HTMLVideoElement>, options: FaceWatchOptions) {
  const [status, setStatus] = useState<FaceStatus>('none');
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const streamRef = useRef<MediaStream | null>(null);
  const pausedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const rearmAt = useRef(0);
  const wasArmed = useRef(options.armed);
  if (options.armed && !wasArmed.current) rearmAt.current = Date.now() + options.rearmDelayMs;
  wasArmed.current = options.armed;

  useEffect(() => {
    let stopped = false;
    let detector: FaceDetector | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lookingSince: number | null = null;
    let lastSeen = Date.now();
    let firedForArm = -1;
    let lostFired = true;

    const tick = () => {
      const video = videoRef.current;
      if (stopped || !detector || !video) return;
      const now = performance.now();
      if (video.readyState >= 2 && !pausedRef.current) {
        const faces = detector.detectForVideo(video, now).detections;
        const looking = faces.some(f => isLooking(f.keypoints));
        const wall = Date.now();
        setStatus(faces.length === 0 ? 'none' : looking ? 'looking' : 'present');

        if (faces.length > 0) {
          lastSeen = wall;
          lostFired = false;
        } else if (!lostFired && wall - lastSeen >= optionsRef.current.lostMs) {
          lostFired = true;
          firedForArm = -1;
          optionsRef.current.onLost();
        }

        const canFire = optionsRef.current.armed && wall >= rearmAt.current && firedForArm !== rearmAt.current;
        if (looking && canFire) {
          lookingSince ??= wall;
          if (wall - lookingSince >= optionsRef.current.lookMs) {
            firedForArm = rearmAt.current;
            optionsRef.current.onSeen();
          }
        } else {
          lookingSince = null;
        }
      }
      timer = setTimeout(tick, DETECT_EVERY_MS);
    };

    (async () => {
      try {
        streamRef.current = await openCamera(videoRef.current, 'user');
        if (stopped) return;
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.6,
        });
        if (!stopped) tick();
      } catch (err) {
        console.error('Camera or face detector failed', err);
        setError(err instanceof Error ? err.message : 'Camera unavailable');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      detector?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [videoRef]);

  // Briefly switches the preview to the back camera, takes a photo of the plant, then switches back.
  const capturePlant = useCallback(async (): Promise<string> => {
    const video = videoRef.current;
    if (!video) throw new Error('no camera preview');
    pausedRef.current = true;
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setFacing('environment');
      streamRef.current = await openCamera(video, 'environment');
      await new Promise(r => setTimeout(r, PHOTO_SETTLE_MS));
      return snapshot(video);
    } finally {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setFacing('user');
      streamRef.current = await openCamera(video, 'user').catch(err => {
        console.error('Could not reopen the front camera', err);
        return null;
      });
      pausedRef.current = false;
    }
  }, [videoRef]);

  return { status, error, facing, capturePlant };
}
