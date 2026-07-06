export function elbowAngle(shoulder, elbow, wrist) {
  const a = { x: shoulder.x - elbow.x, y: shoulder.y - elbow.y };
  const b = { x: wrist.x - elbow.x, y: wrist.y - elbow.y };
  const dot = a.x * b.x + a.y * b.y;
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return 0;
  let cos = dot / (magA * magB);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function createRepCounter(opts = {}) {
  const downAngle = opts.downAngle ?? 90;
  const upAngle = opts.upAngle ?? 150;
  const minVisibility = opts.minVisibility ?? 0.5;

  let state = 'unknown';
  let total = 0;
  let reachedDown = false;

  function update(points) {
    const { shoulder, elbow, wrist } = points;
    const visOk = [shoulder, elbow, wrist].every(
      p => (p.visibility ?? 1) >= minVisibility
    );
    if (!visOk) {
      return { counted: false, state: 'unknown', total };
    }
    const angle = elbowAngle(shoulder, elbow, wrist);
    let counted = false;
    if (angle <= downAngle) {
      state = 'down';
      reachedDown = true;
    } else if (angle >= upAngle) {
      if (state === 'down' && reachedDown) {
        total += 1;
        counted = true;
        reachedDown = false;
      }
      state = 'up';
    }
    return { counted, state, total };
  }

  return {
    update,
    reset() { state = 'unknown'; total = 0; reachedDown = false; },
    get total() { return total; },
  };
}
