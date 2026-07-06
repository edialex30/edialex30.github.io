import { PoseLandmarker, FilesetResolver } from '../vendor/vision_bundle.mjs';

export const LM = {
  LEFT_SHOULDER: 11,
  LEFT_ELBOW: 13,
  LEFT_WRIST: 15,
  RIGHT_SHOULDER: 12,
  RIGHT_ELBOW: 14,
  RIGHT_WRIST: 16,
};

export async function createPoseTracker({ video, onLandmarks }) {
  const fileset = await FilesetResolver.forVisionTasks('./vendor/wasm');
  let landmarker;

  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: './vendor/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  } catch {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: './vendor/pose_landmarker_lite.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
  }

  let running = false;
  let lastTs = -1;

  function loop() {
    if (!running) return;
    const ts = performance.now();
    if (video.readyState >= 2 && ts !== lastTs) {
      lastTs = ts;
      const result = landmarker.detectForVideo(video, ts);
      onLandmarks(result.landmarks?.[0] || null);
    }
    requestAnimationFrame(loop);
  }

  return {
    start() {
      if (!running) {
        running = true;
        requestAnimationFrame(loop);
      }
    },
    stop() {
      running = false;
    },
  };
}
