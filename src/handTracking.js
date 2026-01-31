import {
  FilesetResolver,
  HandLandmarker,
  GestureRecognizer
} from '@mediapipe/tasks-vision';

const HAND_LANDMARK_COUNT = 21;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothLandmarks(prev, current, alpha) {
  if (!prev) {
    return current.map((lm) => ({ ...lm }));
  }
  return current.map((lm, i) => ({
    x: lerp(prev[i].x, lm.x, alpha),
    y: lerp(prev[i].y, lm.y, alpha),
    z: lerp(prev[i].z, lm.z, alpha)
  }));
}

export class HandTracker {
  constructor({ onResults, onStatus }) {
    this.onResults = onResults;
    this.onStatus = onStatus;
    this.handLandmarker = null;
    this.gestureRecognizer = null;
    this.video = null;
    this.running = false;
    this.lastVideoTime = -1;
    this.smoothingAlpha = 0.35;
    this.prevByHand = new Map();
  }

  async init(videoEl) {
    this.video = videoEl;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }
    });
    this.video.srcObject = stream;
    await this.video.play();

    const resolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm'
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task'
      },
      runningMode: 'VIDEO',
      numHands: 2
    });

    try {
      this.gestureRecognizer = await GestureRecognizer.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-assets/gesture_recognizer.task'
        },
        runningMode: 'VIDEO',
        numHands: 2
      });
      this.onStatus?.('gesture');
    } catch (err) {
      console.warn('Gesture recognizer unavailable, using heuristics only.', err);
      this.onStatus?.('heuristic');
    }
  }

  start() {
    if (!this.video || !this.handLandmarker) {
      throw new Error('HandTracker not initialized.');
    }
    this.running = true;
    this.lastVideoTime = -1;
    this.loop();
  }

  stop() {
    this.running = false;
  }

  loop() {
    if (!this.running) return;

    const now = performance.now();
    if (this.video.readyState >= 2 && this.lastVideoTime !== this.video.currentTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.handLandmarker.detectForVideo(this.video, now);
      let gestureResult = null;
      if (this.gestureRecognizer) {
        gestureResult = this.gestureRecognizer.recognizeForVideo(this.video, now);
      }

      const smoothed = [];
      const handednesses = result.handednesses || [];
      const landmarksList = result.landmarks || [];

      for (let i = 0; i < landmarksList.length; i++) {
        const handedness = handednesses[i]?.[0]?.categoryName || `hand-${i}`;
        const prev = this.prevByHand.get(handedness);
        const current = landmarksList[i];
        if (current.length !== HAND_LANDMARK_COUNT) {
          smoothed.push(current);
          continue;
        }
        const smooth = smoothLandmarks(prev, current, this.smoothingAlpha);
        this.prevByHand.set(handedness, smooth);
        smoothed.push(smooth);
      }

      this.onResults?.({
        landmarks: smoothed,
        handednesses,
        gestureResult,
        video: this.video
      });
    }

    requestAnimationFrame(() => this.loop());
  }
}
