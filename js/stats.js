function prevDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function hourlyStatsForDay(day) {
  if (!day) return [];
  const sessions = Array.isArray(day.sessions) ? day.sessions : [];
  if (!sessions.length) {
    return day.reps > 0 ? [{ hour: 'Total zi', reps: day.reps }] : [];
  }

  const byHour = new Map();
  for (const session of sessions) {
    const hour = typeof session.hour === 'string' ? session.hour : 'Fara ora';
    const reps = Number.isInteger(session.reps) && session.reps >= 0 ? session.reps : 0;
    byHour.set(hour, (byHour.get(hour) || 0) + reps);
  }

  const rows = [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, reps]) => ({ hour, reps }));
  const sessionTotal = rows.reduce((sum, row) => sum + row.reps, 0);
  if (Number.isInteger(day.reps) && day.reps > sessionTotal) {
    rows.push({ hour: 'Corectie', reps: day.reps - sessionTotal });
  }
  return rows;
}

export function hourlyStatsByDay(days) {
  return [...days]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(day => ({
      date: day.date,
      reps: Number.isInteger(day.reps) && day.reps >= 0 ? day.reps : 0,
      hourly: hourlyStatsForDay(day),
    }))
    .filter(day => day.reps > 0 || day.hourly.length > 0);
}

export function computeStats(days, today) {
  const total = days.reduce((s, d) => s + d.reps, 0);
  const bestDay = days.reduce((m, d) => Math.max(m, d.reps), 0);
  const average = days.length ? Math.round(total / days.length) : 0;

  const byDate = new Map(days.map(d => [d.date, d]));
  const met = date => {
    const e = byDate.get(date);
    return !!e && e.reps >= e.goal;
  };

  let currentStreak = 0;
  let cursor = today;
  while (met(cursor)) {
    currentStreak += 1;
    cursor = prevDate(cursor);
  }

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    const ok = d.reps >= d.goal;
    if (ok && prev && prevDate(d.date) === prev && met(prev)) {
      run += 1;
    } else if (ok) {
      run = 1;
    } else {
      run = 0;
    }
    bestStreak = Math.max(bestStreak, run);
    prev = d.date;
  }

  return {
    total, bestDay, average,
    currentStreak, bestStreak,
    metGoalToday: met(today),
  };
}
