import { elbowAngle } from './rep-counter.js';
import { LM } from './pose-gate.js';

function visible(point) {
  return !!point && (point.visibility ?? 1) >= 0.45;
}

function average(a, b) {
  return (a + b) / 2;
}

export function extractFrontFeatures(marks) {
  if (!Array.isArray(marks)) return null;
  const ls = marks[LM.LEFT_SHOULDER];
  const le = marks[LM.LEFT_ELBOW];
  const lw = marks[LM.LEFT_WRIST];
  const rs = marks[LM.RIGHT_SHOULDER];
  const re = marks[LM.RIGHT_ELBOW];
  const rw = marks[LM.RIGHT_WRIST];
  if (![ls, le, lw, rs, re, rw].every(visible)) return null;

  return {
    leftAngle: elbowAngle(ls, le, lw),
    rightAngle: elbowAngle(rs, re, rw),
    shoulderY: average(ls.y, rs.y),
    wristY: average(lw.y, rw.y),
  };
}

function score(features, target) {
  const angle = Math.abs(average(features.leftAngle, features.rightAngle)
    - average(target.leftAngle, target.rightAngle)) / 90;
  const shoulder = Math.abs(features.shoulderY - target.shoulderY) / 0.25;
  const wrist = Math.abs(features.wristY - target.wristY) / 0.25;
  return angle + shoulder + wrist;
}

export function createCalibratedCounter({ calibration }) {
  let state = 'unknown';
  let total = 0;
  let reachedDown = false;

  function update(features) {
    if (!calibration?.up || !calibration?.down) {
      return { counted: false, state: 'needs-calibration', total };
    }
    if (!features) {
      state = 'unknown';
      return { counted: false, state, total };
    }

    const upScore = score(features, calibration.up);
    const downScore = score(features, calibration.down);
    let counted = false;

    if (downScore < 0.95 && downScore < upScore) {
      state = 'down';
      reachedDown = true;
    } else if (upScore < 0.95 && upScore < downScore) {
      if (state === 'down' && reachedDown) {
        total += 1;
        counted = true;
        reachedDown = false;
      }
      state = 'up';
    }

    return { counted, state, total, upScore, downScore };
  }

  return {
    update,
    reset() {
      state = 'unknown';
      total = 0;
      reachedDown = false;
    },
    get total() {
      return total;
    },
  };
}
