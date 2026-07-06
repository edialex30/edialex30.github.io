import { createLocalStore } from './local-store.js';
import { createPoseTracker } from './pose.js';
import { createCalibratedCounter, extractFrontFeatures } from './calibrated-counter.js';
import { runAutoCalibration } from './calibration-flow.js';
import { LM, evaluatePushupPose } from './pose-gate.js';
import { createVoice } from './voice.js';
import { computeStats, hourlyStatsForDay } from './stats.js';

const store = createLocalStore();
const voice = createVoice();
const $ = id => document.getElementById(id);

let state = null;
let tracker = null;
let counter = null;
let currentFeatures = null;
let wakeLock = null;
let chart = null;
let noBodyAnnounced = false;
let goalAnnounced = false;
let autoCalibrating = false;
let calibrationSession = 0;
let workoutSession = 0;
let isStartingWorkout = false;
let isWorkoutActive = false;
let activeSessionId = null;
let clockTimer = null;

function formatCurrentDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function renderClock() {
  const target = $('today-datetime');
  if (target) target.textContent = formatCurrentDateTime();
}

function showScreen(name) {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.screen === name);
  });
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen-${name}`);
  });
  if (name === 'stats') renderStats();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => showScreen(tab.dataset.screen));
});

function renderToday() {
  if (!state) return;
  renderClock();
  $('today-remaining').textContent = state.today.remaining;
  $('today-goal').textContent = state.today.goal;
  $('today-done').textContent = state.today.reps;
  $('goal-input').value = state.goal;
  $('manual-reps-input').value = state.today.reps;
  $('camera-mode').value = state.cameraMode;
  $('today-remaining').parentElement.classList.toggle('done', state.today.remaining === 0);
  renderCalibration();
}

function refresh() {
  state = store.getState();
  goalAnnounced = state.today.remaining === 0;
  renderToday();
}

$('goal-form').addEventListener('submit', async event => {
  event.preventDefault();
  const goal = parseInt($('goal-input').value, 10);
  if (!Number.isInteger(goal) || goal < 1) return;
  state = store.setGoal(goal);
  goalAnnounced = state.today.remaining === 0;
  renderToday();
});

$('manual-reps-form').addEventListener('submit', event => {
  event.preventDefault();
  const reps = parseInt($('manual-reps-input').value, 10);
  if (!Number.isInteger(reps) || reps < 0) return;
  state = store.setTodayReps(reps);
  goalAnnounced = state.today.remaining === 0;
  renderToday();
});

$('camera-mode').addEventListener('change', event => {
  state = store.setCameraMode(event.target.value);
  renderToday();
});

function renderCalibration() {
  if (!$('calibration-status') || !state) return;
  const hasUp = !!state.calibration?.up;
  const hasDown = !!state.calibration?.down;
  $('calibration-status').textContent = hasUp && hasDown
    ? 'Calibrare salvata. Poti incepe.'
    : 'Calibrare necesara: apasa Calibreaza automat.';
  if ($('btn-auto-calibrate')) {
    $('btn-auto-calibrate').disabled = autoCalibrating;
    $('btn-auto-calibrate').textContent = autoCalibrating ? 'Calibrare...' : 'Calibreaza automat';
  }
}

async function startAutoCalibration() {
  if (autoCalibrating) return;
  if (!tracker) {
    $('detect-status').textContent = 'Porneste camera inainte de calibrare.';
    return;
  }

  autoCalibrating = true;
  calibrationSession += 1;
  const session = calibrationSession;
  if (counter) counter.reset();
  renderCalibration();

  const result = await runAutoCalibration({
    getFeatures: () => currentFeatures,
    saveCalibration(calibration) {
      state = store.setCalibration(calibration);
      counter = createCalibratedCounter({ calibration: state.calibration });
    },
    setStatus(message) {
      $('detect-status').textContent = message;
      $('calibration-status').textContent = message;
    },
    say: message => voice.say(message),
    count: value => voice.count(value),
    isActive: () => autoCalibrating && calibrationSession === session && !!tracker,
  });

  if (calibrationSession !== session) return;
  autoCalibrating = false;
  renderCalibration();
  if (!result.ok && result.reason !== 'cancelled') {
    if (counter) counter.reset();
  }
}

$('btn-auto-calibrate').addEventListener('click', startAutoCalibration);

function resizeCanvas(canvas, video) {
  const width = video.videoWidth || canvas.clientWidth || 720;
  const height = video.videoHeight || canvas.clientHeight || 960;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawPose(marks) {
  const canvas = $('overlay');
  const video = $('video');
  const ctx = canvas.getContext('2d');
  resizeCanvas(canvas, video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!marks) return;

  const links = [
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
    [LM.LEFT_ELBOW, LM.LEFT_WRIST],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.LEFT_HIP, LM.LEFT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
    [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ];

  ctx.lineWidth = Math.max(4, canvas.width * 0.008);
  ctx.strokeStyle = '#35c46a';
  ctx.fillStyle = '#f4b63f';
  ctx.lineCap = 'round';

  for (const [a, b] of links) {
    const pa = marks[a];
    const pb = marks[b];
    if ((pa.visibility ?? 1) < 0.4 || (pb.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
    ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
    ctx.stroke();
  }

  for (const index of Object.values(LM)) {
    const point = marks[index];
    if ((point.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function onLandmarks(marks) {
  drawPose(marks);
  currentFeatures = extractFrontFeatures(marks);
  const poseReadiness = evaluatePushupPose(marks);
  if (poseReadiness.reason === 'body-too-small') {
    currentFeatures = null;
    $('detect-status').textContent = 'Apropie telefonul sau intra mai mult in cadru.';
    return;
  }
  if (autoCalibrating) return;
  if (!marks) {
    currentFeatures = null;
    counter.reset();
    $('detect-status').textContent = 'Nu te vad - intra in cadru.';
    if (!noBodyAnnounced) {
      voice.say('Nu te vad');
      noBodyAnnounced = true;
    }
    return;
  }

  noBodyAnnounced = false;
  if (!currentFeatures) {
    $('detect-status').textContent = 'Arata ambele brate catre camera.';
    return;
  }

  if (!state.calibration?.up || !state.calibration?.down) {
    $('detect-status').textContent = 'Apasa Calibreaza automat inainte de numarare.';
    return;
  }

  const result = counter.update(currentFeatures);
  $('detect-status').textContent = result.state === 'down'
    ? 'Jos'
    : result.state === 'up'
      ? 'Sus'
      : 'Te vad';

  if (!result.counted) return;

  state = store.addReps(1, { sessionId: activeSessionId });
  $('rep-count').textContent = state.today.reps;
  renderToday();
  voice.count(state.today.reps);
  if (state.today.remaining === 0 && !goalAnnounced) {
    goalAnnounced = true;
    voice.say('Gata. Tinta atinsa.');
  }
}

async function startWorkout() {
  if (isStartingWorkout || isWorkoutActive) return;
  isStartingWorkout = true;
  const session = ++workoutSession;
  showScreen('workout');
  $('detect-status').textContent = 'Pornesc camera...';
  const video = $('video');
  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.cameraMode, width: 720, height: 960 },
      audio: false,
    });
    if (session !== workoutSession) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    video.srcObject = stream;
    await video.play();
    if (session !== workoutSession) {
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      return;
    }

    state = store.startSession();
    activeSessionId = state.sessionId;
    counter = createCalibratedCounter({ calibration: state.calibration });
    currentFeatures = null;
    $('rep-count').textContent = state.today.reps;
    noBodyAnnounced = false;
    renderToday();
    if (navigator.wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }

    $('detect-status').textContent = 'Incarc detectia...';
    tracker = await createPoseTracker({ video, onLandmarks });
    if (session !== workoutSession) {
      tracker.close?.();
      tracker.stop?.();
      tracker = null;
      return;
    }
    tracker.start();
    isWorkoutActive = true;
    $('detect-status').textContent = 'Te caut in cadru.';
  } catch (err) {
    console.error(err);
    if (stream) stream.getTracks().forEach(track => track.stop());
    $('detect-status').textContent = 'Camera nu a pornit. Verifica permisiunea si HTTPS.';
  } finally {
    if (session === workoutSession) {
      isStartingWorkout = false;
    }
  }
}

async function stopWorkout() {
  workoutSession += 1;
  isStartingWorkout = false;
  isWorkoutActive = false;
  autoCalibrating = false;
  calibrationSession += 1;
  if (tracker) {
    tracker.close?.();
    tracker.stop?.();
    tracker = null;
  }
  if (activeSessionId) {
    state = store.finishSession(activeSessionId);
    activeSessionId = null;
  }

  const video = $('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }

  drawPose(null);
  if (wakeLock) {
    try {
      await wakeLock.release();
    } catch {}
    wakeLock = null;
  }

  refresh();
  showScreen('today');
}

$('btn-start').addEventListener('click', startWorkout);
$('btn-stop').addEventListener('click', stopWorkout);

function renderStats() {
  if (!state) return;
  const stats = computeStats(state.days, state.today.date);
  $('stat-total').textContent = stats.total;
  $('stat-average').textContent = stats.average;
  $('stat-best').textContent = stats.bestDay;
  $('stat-streak').textContent = stats.currentStreak;
  $('stat-best-streak').textContent = stats.bestStreak;

  const lastDays = [...state.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);
  const todayEntry = state.days.find(day => day.date === state.today.date) || state.today;
  const hourly = hourlyStatsForDay(todayEntry);

  $('hourly-list').innerHTML = hourly.length
    ? hourly.map(item => `
      <div class="hour-row">
        <span>${item.hour}</span>
        <strong>${item.reps}</strong>
      </div>
    `).join('')
    : '<p class="empty-state">Nu ai serii salvate azi.</p>';

  if (chart) chart.destroy();
  chart = new window.Chart($('chart'), {
    type: 'bar',
    data: {
      labels: lastDays.map(day => day.date.slice(5)),
      datasets: [{
        label: 'Flotari',
        data: lastDays.map(day => day.reps),
        backgroundColor: '#35c46a',
        borderColor: '#86efac',
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: '#252a33' },
          ticks: { color: '#a6adba' },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#252a33' },
          ticks: { color: '#a6adba', precision: 0 },
        },
      },
    },
  });
}

refresh();
renderClock();
clockTimer = setInterval(renderClock, 60000);
