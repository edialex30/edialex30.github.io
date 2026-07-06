const DEFAULT_WAIT_MS = 1000;

function defaultWait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureActive(isActive) {
  return typeof isActive !== 'function' || isActive();
}

async function countdown({ seconds, label, setStatus, count, wait, isActive }) {
  for (let value = seconds; value >= 1; value -= 1) {
    if (!ensureActive(isActive)) return false;
    setStatus(`${label} ${value}...`);
    count(value);
    await wait(DEFAULT_WAIT_MS);
  }
  return ensureActive(isActive);
}

async function capturePosition({ kind, label, missingMessage, getFeatures, setStatus, say, count, wait, isActive }) {
  if (!ensureActive(isActive)) return { ok: false, reason: 'cancelled' };

  say(label);
  setStatus(label);
  await wait(DEFAULT_WAIT_MS);
  const ready = await countdown({
    seconds: 3,
    label,
    setStatus,
    count,
    wait,
    isActive,
  });

  if (!ready) return { ok: false, reason: 'cancelled' };

  const features = getFeatures();
  if (!features) {
    setStatus(missingMessage);
    say('Try again');
    return { ok: false, reason: `missing-${kind}` };
  }

  setStatus(kind === 'up' ? 'Pozitia Sus salvata.' : 'Pozitia Jos salvata.');
  say(kind === 'up' ? 'Up saved' : 'Down saved');
  return { ok: true, features };
}

export async function runAutoCalibration({
  getFeatures,
  saveCalibration,
  setStatus,
  say,
  count,
  wait = defaultWait,
  isActive = () => true,
}) {
  say('Get ready');
  const ready = await countdown({
    seconds: 5,
    label: 'Pune telefonul jos. Calibrarea incepe in',
    setStatus,
    count,
    wait,
    isActive,
  });
  if (!ready) return { ok: false, reason: 'cancelled' };

  const up = await capturePosition({
    kind: 'up',
    label: 'Hold up position',
    missingMessage: 'Nu vad clar pozitia Sus. Reincearca.',
    getFeatures,
    setStatus,
    say,
    count,
    wait,
    isActive,
  });
  if (!up.ok) return up.reason === 'cancelled'
    ? { ok: false, reason: 'cancelled' }
    : { ok: false, reason: up.reason };

  const down = await capturePosition({
    kind: 'down',
    label: 'Hold down position',
    missingMessage: 'Nu vad clar pozitia Jos. Reincearca.',
    getFeatures,
    setStatus,
    say,
    count,
    wait,
    isActive,
  });
  if (!down.ok) return down.reason === 'cancelled'
    ? { ok: false, reason: 'cancelled' }
    : { ok: false, reason: down.reason };

  const calibration = { up: up.features, down: down.features };
  saveCalibration(calibration);
  setStatus('Calibrare terminata. Poti incepe.');
  say('Calibration done');
  return { ok: true, calibration };
}
