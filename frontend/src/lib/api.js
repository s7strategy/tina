const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Erro inesperado na API.')
  }

  return response.status === 204 ? null : response.json()
}

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value)
    }
  })

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export const api = {
  register(payload) {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  login(payload) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  me(token) {
    return request('/auth/me', { token })
  },
  dashboard(token) {
    return request('/dashboard', { token })
  },
  listUsers(token, params = {}) {
    return request(`/users${buildQuery(params)}`, { token })
  },
  adminAnalytics(token, params = {}) {
    return request(`/users/analytics${buildQuery(params)}`, { token })
  },
  createUser(token, payload) {
    return request('/users', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  updateUser(token, id, payload) {
    return request(`/users/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  deleteUser(token, id) {
    return request(`/users/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  listPlans(token) {
    return request('/plans', { token })
  },
  createPlan(token, payload) {
    return request('/plans', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  updatePlan(token, id, payload) {
    return request(`/plans/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  listTasks(token, profileKey) {
    const query = profileKey ? `?profileKey=${encodeURIComponent(profileKey)}` : ''
    return request(`/tasks${query}`, { token })
  },
  createTask(token, payload) {
    return request('/tasks', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  updateTask(token, id, payload) {
    return request(`/tasks/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  deleteTask(token, id) {
    return request(`/tasks/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  listCategories(token, profileKey) {
    const query = profileKey ? `?profileKey=${encodeURIComponent(profileKey)}` : ''
    return request(`/categories${query}`, { token })
  },
  createCategory(token, payload) {
    return request('/categories', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  listMembers(token) {
    return request('/members', { token })
  },
  createMember(token, payload) {
    return request('/members', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  listEvents(token) {
    return request('/events', { token })
  },
  createEvent(token, payload) {
    return request('/events', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  listFavorites(token) {
    return request('/favorites', { token })
  },
  createFavorite(token, payload) {
    return request('/favorites', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  deleteFavorite(token, id) {
    return request(`/favorites/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  listMeals(token) {
    return request('/meals', { token })
  },
  createMeal(token, payload) {
    return request('/meals', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  listRewards(token) {
    return request('/rewards', { token })
  },
  createReward(token, payload) {
    return request('/rewards', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  startTimeEntry(token, payload) {
    return request('/time-entries/start', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  togglePauseTimeEntry(token, payload) {
    return request('/time-entries/toggle-pause', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  stopTimeEntry(token, payload) {
    return request('/time-entries/stop', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
}
