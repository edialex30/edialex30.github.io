const STORAGE_KEY = 'pushup-counter-state-v1';

function defaultData() {
  return {
    version: 3,
    goal: 100,
    cameraMode: 'user',
    calibrations: { user: null, environment: null },
    days: [],
  };
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function localTimeString(date = new Date()) {
  const dt = toDate(date);
  const h = String(dt.getHours()).padStart(2, '0');
  const m = String(dt.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function localHourString(date = new Date()) {
  const dt = toDate(date);
  const h = String(dt.getHours()).padStart(2, '0');
  return `${h}:00`;
}

function sessionIdFrom(date, index) {
  const dt = toDate(date);
  return `${localDateString(dt)}-${localTimeString(dt).replace(':', '')}-${index + 1}`;
}

function normalizeSession(session) {
  if (!session || typeof session !== 'object') return null;
  if (typeof session.id !== 'string') return null;
  if (typeof session.startedAt !== 'string') return null;
  const reps = Number.isInteger(session.reps) && session.reps >= 0 ? session.reps : 0;
  const hour = typeof session.hour === 'string' ? session.hour : localHourString(session.startedAt);
  const endedAt = typeof session.endedAt === 'string' ? session.endedAt : null;
  return { id: session.id, startedAt: session.startedAt, endedAt, hour, reps };
}

function normalizeCalibration(data) {
  const legacy = data.calibration
    && typeof data.calibration === 'object'
    && data.calibration.up
    && data.calibration.down
    ? data.calibration
    : null;
  const byCamera = data.calibrations && typeof data.calibrations === 'object'
    ? data.calibrations
    : {};

  return {
    user: byCamera.user || legacy || null,
    environment: byCamera.environment || null,
  };
}

function normalize(data) {
  if (!data || typeof data !== 'object') return defaultData();
  const goal = Number.isInteger(data.goal) && data.goal >= 1 ? data.goal : 100;
  const cameraMode = data.version >= 2 && data.cameraMode === 'environment' ? 'environment' : 'user';
  const calibrations = normalizeCalibration(data);
  const days = Array.isArray(data.days)
    ? data.days
        .filter(day =>
          typeof day.date === 'string'
          && Number.isInteger(day.reps)
          && day.reps >= 0
          && Number.isInteger(day.goal)
          && day.goal >= 1
        )
        .map(day => ({
          date: day.date,
          reps: day.reps,
          goal: day.goal,
          sessions: Array.isArray(day.sessions)
            ? day.sessions.map(normalizeSession).filter(Boolean)
            : [],
        }))
    : [];
  return { version: 3, goal, cameraMode, calibrations, days };
}

export function createLocalStore({
  storage = window.localStorage,
  today = () => localDateString(),
  now = () => new Date(),
} = {}) {
  function read() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : defaultData();
    } catch {
      return defaultData();
    }
  }

  function write(data) {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalize(data)));
  }

  function hourlyFrom(sessions) {
    const byHour = new Map();
    for (const session of sessions) {
      byHour.set(session.hour, (byHour.get(session.hour) || 0) + session.reps);
    }
    return [...byHour.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, reps]) => ({ hour, reps }));
  }

  function stateFrom(data, date = today()) {
    const entry = data.days.find(day => day.date === date)
      || { date, reps: 0, goal: data.goal, sessions: [] };
    return {
      goal: data.goal,
      cameraMode: data.cameraMode,
      calibration: data.calibrations[data.cameraMode] || null,
      today: {
        ...entry,
        sessions: [...entry.sessions],
        hourly: hourlyFrom(entry.sessions),
        remaining: Math.max(0, entry.goal - entry.reps),
      },
      days: data.days,
    };
  }

  function entryFor(data, date) {
    let entry = data.days.find(day => day.date === date);
    if (!entry) {
      entry = { date, reps: 0, goal: data.goal, sessions: [] };
      data.days.push(entry);
    }
    if (!Array.isArray(entry.sessions)) entry.sessions = [];
    return entry;
  }

  function findSession(data, date, sessionId) {
    const entry = entryFor(data, date);
    return entry.sessions.find(session => session.id === sessionId) || null;
  }

  function createSession(entry, startedAt = now()) {
    const dt = toDate(startedAt);
    const session = {
      id: sessionIdFrom(dt, entry.sessions.length),
      startedAt: dt.toISOString(),
      endedAt: null,
      hour: localHourString(dt),
      reps: 0,
    };
    entry.sessions.push(session);
    return session;
  }

  return {
    getState() {
      return stateFrom(read());
    },

    startSession() {
      const data = read();
      const date = today();
      const entry = entryFor(data, date);
      const session = createSession(entry);
      write(data);
      return { ...stateFrom(data, date), sessionId: session.id };
    },

    finishSession(sessionId) {
      const data = read();
      const date = today();
      const session = findSession(data, date, sessionId);
      if (session) {
        session.endedAt = toDate(now()).toISOString();
        write(data);
      }
      return stateFrom(data, date);
    },

    addReps(count, { sessionId } = {}) {
      const data = read();
      const date = today();
      const entry = entryFor(data, date);
      entry.reps += count;
      let session = sessionId ? findSession(data, date, sessionId) : null;
      if (!session) session = createSession(entry);
      session.reps += count;
      write(data);
      return stateFrom(data, date);
    },

    setTodayReps(reps) {
      const data = read();
      const date = today();
      const entry = entryFor(data, date);
      entry.reps = Math.max(0, reps);
      write(data);
      return stateFrom(data, date);
    },

    setGoal(goal) {
      const data = read();
      const date = today();
      data.goal = goal;
      const entry = data.days.find(day => day.date === date);
      if (entry) entry.goal = goal;
      write(data);
      return stateFrom(data);
    },

    setCameraMode(cameraMode) {
      const data = read();
      data.cameraMode = cameraMode === 'user' ? 'user' : 'environment';
      write(data);
      return stateFrom(data);
    },

    setCalibration(calibration) {
      const data = read();
      data.calibrations[data.cameraMode] = calibration;
      write(data);
      return stateFrom(data);
    },
  };
}
