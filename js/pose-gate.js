export const LM = {
  LEFT_SHOULDER: 11,
  LEFT_ELBOW: 13,
  LEFT_WRIST: 15,
  LEFT_HIP: 23,
  LEFT_KNEE: 25,
  LEFT_ANKLE: 27,
  RIGHT_SHOULDER: 12,
  RIGHT_ELBOW: 14,
  RIGHT_WRIST: 16,
  RIGHT_HIP: 24,
  RIGHT_KNEE: 26,
  RIGHT_ANKLE: 28,
};

const SIDES = {
  left: {
    shoulder: LM.LEFT_SHOULDER,
    elbow: LM.LEFT_ELBOW,
    wrist: LM.LEFT_WRIST,
    hip: LM.LEFT_HIP,
    knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER,
    elbow: LM.RIGHT_ELBOW,
    wrist: LM.RIGHT_WRIST,
    hip: LM.RIGHT_HIP,
    knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE,
  },
};

function visibility(point) {
  return point?.visibility ?? 1;
}

function visible(point, minVisibility) {
  return !!point && visibility(point) >= minVisibility;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sideCandidate(marks, side, opts) {
  const idx = SIDES[side];
  const shoulder = marks[idx.shoulder];
  const elbow = marks[idx.elbow];
  const wrist = marks[idx.wrist];
  const hip = marks[idx.hip];
  const knee = marks[idx.knee];
  const ankle = marks[idx.ankle];
  const core = [shoulder, elbow, wrist, hip];
  const leg = visible(knee, opts.minVisibility) ? knee : ankle;

  if (!core.every(point => visible(point, opts.minVisibility)) || !visible(leg, opts.minVisibility)) {
    return { ready: false, reason: 'body-not-visible', score: 0 };
  }

  const torso = distance(shoulder, hip);
  const lowerBody = distance(hip, leg);
  const arm = distance(shoulder, wrist);
  if (torso < opts.minTorsoLength || lowerBody < opts.minLowerBodyLength || arm < opts.minArmLength) {
    return { ready: false, reason: 'body-too-small', score: torso + lowerBody + arm };
  }

  const bodyTilt = Math.abs(shoulder.y - hip.y) / Math.max(torso, 0.001);
  if (bodyTilt > opts.maxBodyTilt) {
    return { ready: false, reason: 'not-pushup-position', score: torso + lowerBody + arm };
  }

  const score = core.reduce((sum, point) => sum + visibility(point), 0)
    + visibility(leg)
    + torso
    + lowerBody
    + arm;

  return {
    ready: true,
    reason: 'ready',
    side,
    score,
    arm: { shoulder, elbow, wrist },
  };
}

export function evaluatePushupPose(marks, opts = {}) {
  if (!Array.isArray(marks)) {
    return { ready: false, reason: 'body-not-visible' };
  }

  const options = {
    minVisibility: opts.minVisibility ?? 0.55,
    minTorsoLength: opts.minTorsoLength ?? 0.14,
    minLowerBodyLength: opts.minLowerBodyLength ?? 0.14,
    minArmLength: opts.minArmLength ?? 0.08,
    maxBodyTilt: opts.maxBodyTilt ?? 0.75,
  };

  const left = sideCandidate(marks, 'left', options);
  const right = sideCandidate(marks, 'right', options);
  const best = left.score >= right.score ? left : right;

  if (best.ready) return best;
  if (left.reason === 'body-not-visible' && right.reason === 'body-not-visible') {
    return { ready: false, reason: 'body-not-visible' };
  }
  if (left.reason === 'body-too-small' || right.reason === 'body-too-small') {
    return { ready: false, reason: 'body-too-small' };
  }
  return { ready: false, reason: 'not-pushup-position' };
}
