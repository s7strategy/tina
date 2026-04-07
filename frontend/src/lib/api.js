export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api')

async function request(path, options = {}) {
  const { token, headers: extraHeaders, ...fetchOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...fetchOptions,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    const base = payload.error ?? 'Erro inesperado na API.'
    const extra = [payload.detail, payload.code].filter(Boolean).join(' ')
    throw new Error(extra ? `${base} ${extra}` : base)
  }

  return response.status === 204 ? null : response.json()
}

async function requestMultipart(path, { token, formData, method = 'POST' }) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error ?? 'Erro ao enviar ficheiro.')
  }
  return response.json()
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
  dashboard(token, params = {}) {
    return request(`/dashboard${buildQuery(params)}`, { token })
  },
  listUsers(token, params = {}) {
    return request(`/users${buildQuery(params)}`, { token })
  },
  adminAnalytics(token, params = {}) {
    return request(`/users/analytics${buildQuery(params)}`, { token })
  },
  getAdminPlatform(token) {
    return request('/admin/platform', { token })
  },
  patchAdminPlatform(token, payload) {
    return request('/admin/platform', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload || {}),
    })
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
  rolloverTasks(token, payload) {
    return request('/tasks/rollover', {
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
  updateCategory(token, id, payload) {
    return request(`/categories/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  uploadCategoryIcon(token, id, file) {
    const form = new FormData()
    form.append('image', file)
    return requestMultipart(`/categories/${id}/icon`, { token, formData: form })
  },
  deleteCategoryIcon(token, id) {
    return request(`/categories/${id}/icon`, { method: 'DELETE', token })
  },
  deleteCategory(token, id) {
    return request(`/categories/${id}`, {
      method: 'DELETE',
      token,
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
  updateMember(token, id, payload) {
    return request(`/members/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  listEvents(token, params = {}) {
    return request(`/events${buildQuery(params)}`, { token })
  },
  createEvent(token, payload) {
    return request('/events', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    })
  },
  updateEvent(token, id, payload) {
    return request(`/events/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  deleteEvent(token, id) {
    return request(`/events/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  getTaskHistory(token, params = {}) {
    return request(`/tasks/history${buildQuery(params)}`, { token })
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
  reorderFavorites(token, payload) {
    return request('/favorites/reorder', {
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
  uploadFavoriteIcon(token, id, file) {
    const form = new FormData()
    form.append('image', file)
    return requestMultipart(`/favorites/${id}/icon`, { token, formData: form })
  },
  deleteFavoriteIcon(token, id) {
    return request(`/favorites/${id}/icon`, { method: 'DELETE', token })
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
  listMenus(token) {
    return request('/meals/planner/menus', { token })
  },
  createMenu(token, payload) {
    return request('/meals/planner/menus', { method: 'POST', token, body: JSON.stringify(payload || {}) })
  },
  updateMenu(token, id, payload) {
    return request(`/meals/planner/menus/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
  },
  deleteMenu(token, id) {
    return request(`/meals/planner/menus/${id}`, { method: 'DELETE', token })
  },
  generateMenuAutoVariations(token, menuId, payload) {
    return request(`/meals/planner/menus/${encodeURIComponent(menuId)}/auto-variations/generate`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload || {}),
    })
  },
  patchMenuAutoVariations(token, menuId, payload) {
    return request(`/meals/planner/menus/${encodeURIComponent(menuId)}/auto-variations`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload || {}),
    })
  },
  getMealsPlanner(token, { from, to, menuId, menuIds }) {
    const q = new URLSearchParams({ from, to })
    if (menuIds && menuIds.length) {
      q.set('menuIds', menuIds.join(','))
    } else if (menuId) {
      q.set('menuId', menuId)
    }
    return request(`/meals/planner?${q}`, { token })
  },
  createMealPlannerSlot(token, payload) {
    return request('/meals/planner/slots', { method: 'POST', token, body: JSON.stringify(payload) })
  },
  updateMealPlannerSlot(token, id, payload) {
    return request(`/meals/planner/slots/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
  },
  deleteMealPlannerSlot(token, id) {
    return request(`/meals/planner/slots/${id}`, { method: 'DELETE', token })
  },
  bulkRepeatMealsPlanner(token, payload) {
    return request('/meals/planner/bulk-repeat', { method: 'POST', token, body: JSON.stringify(payload) })
  },
  autoFillPlannerMonth(token, payload) {
    return request('/meals/planner/auto-fill-month', { method: 'POST', token, body: JSON.stringify(payload || {}) })
  },
  randomizeMealPlannerSlot(token, slotId) {
    return request(`/meals/planner/slots/${encodeURIComponent(slotId)}/randomize`, { method: 'POST', token })
  },
  listRecipeCategories(token) {
    return request('/meals/recipes/categories', { token })
  },
  listRecipeTagOptions(token) {
    return request('/meals/recipes/tag-options', { token })
  },
  getFamilyPortions(token) {
    return request('/meals/family-portions', { token })
  },
  updateFamilyPortions(token, payload) {
    return request('/meals/family-portions', { method: 'PATCH', token, body: JSON.stringify(payload) })
  },
  listRecipes(token, { mealCategories, mealCategory, q, tags, tag } = {}) {
    const qs = new URLSearchParams()
    const cats = Array.isArray(mealCategories)
      ? mealCategories
      : mealCategory
        ? [mealCategory]
        : []
    for (const c of cats) {
      if (c) qs.append('mealCategory', c)
    }
    const tagList = Array.isArray(tags) ? tags : tag ? [tag] : []
    for (const t of tagList) {
      if (t) qs.append('tag', t)
    }
    if (q) qs.set('q', q)
    const str = qs.toString()
    return request(`/meals/recipes${str ? `?${str}` : ''}`, { token })
  },
  listGlobalRecipes(token, { mealCategories, mealCategory, q, tags, tag } = {}) {
    const qs = new URLSearchParams()
    const cats = Array.isArray(mealCategories)
      ? mealCategories
      : mealCategory
        ? [mealCategory]
        : []
    for (const c of cats) {
      if (c) qs.append('mealCategory', c)
    }
    const tagList = Array.isArray(tags) ? tags : tag ? [tag] : []
    for (const t of tagList) {
      if (t) qs.append('tag', t)
    }
    if (q) qs.set('q', q)
    const str = qs.toString()
    return request(`/meals/recipes/catalog${str ? `?${str}` : ''}`, { token })
  },
  getGlobalRecipe(token, id) {
    return request(`/meals/recipes/catalog/${encodeURIComponent(id)}`, { token })
  },
  forkGlobalRecipe(token, globalRecipeId) {
    return request('/meals/recipes/fork-global', {
      method: 'POST',
      token,
      body: JSON.stringify({ globalRecipeId }),
    })
  },
  listIngredientNames(token, q) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : ''
    return request(`/meals/recipes/ingredient-names${qs}`, { token })
  },
  listMealCombinations(token) {
    return request('/meals/combinations', { token })
  },
  createMealCombination(token, payload) {
    return request('/meals/combinations', { method: 'POST', token, body: JSON.stringify(payload) })
  },
  deleteMealCombination(token, id) {
    return request(`/meals/combinations/${id}`, { method: 'DELETE', token })
  },
  /** Adiciona ou substitui a receita numa categoria da combinação. */
  patchMealCombination(token, id, payload) {
    return request(`/meals/combinations/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload || {}) })
  },
  applyMealCombination(token, id, payload) {
    return request(`/meals/combinations/${id}/apply`, { method: 'POST', token, body: JSON.stringify(payload) })
  },
  getRecipe(token, id) {
    return request(`/meals/recipes/${id}`, { token })
  },
  createRecipe(token, payload) {
    return request('/meals/recipes', { method: 'POST', token, body: JSON.stringify(payload) })
  },
  updateRecipe(token, id, payload) {
    return request(`/meals/recipes/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
  },
  deleteRecipe(token, id) {
    return request(`/meals/recipes/${id}`, { method: 'DELETE', token })
  },
  uploadRecipeImage(token, id, file) {
    const form = new FormData()
    form.append('image', file)
    return requestMultipart(`/meals/recipes/${id}/image`, { token, formData: form })
  },
  getShoppingListDefault(token, { horizonDays = 7, skipMerge = false } = {}) {
    const q = new URLSearchParams()
    if ([7, 15, 30].includes(Number(horizonDays))) q.set('horizonDays', String(horizonDays))
    if (skipMerge) q.set('skipMerge', '1')
    const qs = q.toString()
    return request(`/meals/shopping${qs ? `?${qs}` : ''}`, { token })
  },
  getShoppingIngredientSuggestions(token, q, { limit = 18 } = {}) {
    const params = new URLSearchParams()
    params.set('q', String(q || '').trim())
    if (limit) params.set('limit', String(limit))
    return request(`/meals/shopping/ingredient-suggestions?${params.toString()}`, { token })
  },
  syncShoppingFromPlanner(token, payload) {
    const body =
      typeof payload === 'number'
        ? { horizonDays: payload }
        : { horizonDays: payload?.horizonDays, periodStart: payload?.periodStart, periodEnd: payload?.periodEnd }
    return request('/meals/shopping/sync', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    })
  },
  /** scope: 'all' | 'generated' */
  clearShoppingListDefault(token, payload = {}) {
    return request('/meals/shopping/clear', {
      method: 'POST',
      token,
      body: JSON.stringify({ scope: payload.scope === 'generated' ? 'generated' : 'all' }),
    })
  },
  listShoppingLists(token) {
    return request('/meals/shopping/lists', { token })
  },
  getShoppingList(token, id) {
    return request(`/meals/shopping/lists/${id}`, { token })
  },
  createShoppingList(token, payload) {
    return request('/meals/shopping/lists', { method: 'POST', token, body: JSON.stringify(payload) })
  },
  deleteShoppingList(token, id) {
    return request(`/meals/shopping/lists/${id}`, { method: 'DELETE', token })
  },
  generateShoppingList(token, id) {
    return request(`/meals/shopping/lists/${id}/generate`, { method: 'POST', token, body: JSON.stringify({}) })
  },
  createShoppingItem(token, listId, payload) {
    return request(`/meals/shopping/lists/${listId}/items`, { method: 'POST', token, body: JSON.stringify(payload) })
  },
  updateShoppingItem(token, id, payload) {
    return request(`/meals/shopping/items/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
  },
  deleteShoppingItem(token, id) {
    return request(`/meals/shopping/items/${id}`, { method: 'DELETE', token })
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
  createManualTimeEntry(token, payload) {
    return request('/time-entries/manual', {
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
  updateTimeEntry(token, id, payload) {
    return request(`/time-entries/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
  deleteTimeEntry(token, id) {
    return request(`/time-entries/${id}`, {
      method: 'DELETE',
      token,
    })
  },
  updateFavorite(token, id, payload) {
    return request(`/favorites/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  },
}
