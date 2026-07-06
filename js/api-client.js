export function createApiClient() {
  let pending = 0;

  async function requestJson(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function postReps(count) {
    return requestJson('/api/reps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count }),
    });
  }

  async function flush() {
    if (pending <= 0) return null;
    const count = pending;
    const state = await postReps(count);
    pending -= count;
    return state;
  }

  return {
    async getState() {
      return requestJson('/api/state');
    },

    async sendReps(count) {
      pending += count;
      try {
        return await flush();
      } catch {
        return null;
      }
    },

    async setGoal(goal) {
      return requestJson('/api/goal', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
    },
  };
}
