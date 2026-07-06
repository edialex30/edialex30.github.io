const STORAGE_KEY = 'pushup-counter-state-v1';

function defaultData() {
  return {
    goal: 100,
    cameraMode: 'environment',
    days: [],
  };
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalize(data) {
  if (!data || typeof data !== 'object') return defaultData();
  const goal = Number.isInteger(data.goal) && data.goal >= 1 ? data.goal : 100;
  const cameraMode = data.cameraMode === 'user' ? 'user' : 'environment';
  const days = Array.isArray(data.days)
    ? data.days
        .filter(day =>
          typeof day.date === 'string'
          && Number.isInteger(day.reps)
          && day.reps >= 0
          && Number.isInteger(day.goal)
          && day.goal >= 1
        )
        .map(day => ({ date: day.date, reps: day.reps, goal: day.goal }))
    : [];
  return { goal, cameraMode, days };
}

export function createLocalStore({
  storage = window.localStorage,
  today = () => localDateString(),
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

  function stateFrom(data, date = today()) {
    const entry = data.days.find(day => day.date === date)
      || { date, reps: 0, goal: data.goal };
    return {
      goal: data.goal,
      cameraMode: data.cameraMode,
      today: {
        ...entry,
        remaining: Math.max(0, entry.goal - entry.reps),
      },
      days: data.days,
    };
  }

  function entryFor(data, date) {
    let entry = data.days.find(day => day.date === date);
    if (!entry) {
      entry = { date, reps: 0, goal: data.goal };
      data.days.push(entry);
    }
    return entry;
  }

  return {
    getState() {
      return stateFrom(read());
    },

    addReps(count) {
      const data = read();
      const date = today();
      const entry = entryFor(data, date);
      entry.reps += count;
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
      data.goal = goal;
      write(data);
      return stateFrom(data);
    },

    setCameraMode(cameraMode) {
      const data = read();
      data.cameraMode = cameraMode === 'user' ? 'user' : 'environment';
      write(data);
      return stateFrom(data);
    },
  };
}
