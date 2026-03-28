const { many } = require('./db')

const weekDays = [
  { key: 'seg', name: 'Seg', num: '24' },
  { key: 'ter', name: 'Ter', num: '25' },
  { key: 'qua', name: 'Qua', num: '26', today: true },
  { key: 'qui', name: 'Qui', num: '27' },
  { key: 'sex', name: 'Sex', num: '28' },
  { key: 'sab', name: 'Sáb', num: '29' },
  { key: 'dom', name: 'Dom', num: '30' },
]

function formatTimeLabel(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLiveSeconds(entry) {
  const baseSeconds = Number(entry.duration_seconds || 0)
  if (!entry.active || entry.paused || !entry.last_resumed_at) {
    return baseSeconds
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(entry.last_resumed_at).getTime()) / 1000))
  return baseSeconds + diffSeconds
}

function buildTracking(entries) {
  const current = entries.find((entry) => entry.active)
  const totalSeconds = entries.reduce((sum, entry) => sum + (entry.active ? getLiveSeconds(entry) : Number(entry.duration_seconds || 0)), 0)

  if (!current) {
    return {
      active: false,
      paused: false,
      cat: '🏠 Casa',
      sub: '',
      detail: '',
      seconds: 0,
      totalMinutes: Math.floor(totalSeconds / 60),
      log: entries.map((entry) => ({
        id: entry.id,
        name: entry.label,
        time: `${formatTimeLabel(entry.started_at)}–${formatTimeLabel(entry.ended_at)}`,
        durationMinutes: Math.floor(Number(entry.duration_seconds || 0) / 60),
        active: false,
      })),
    }
  }

  return {
    active: Boolean(current.active),
    paused: Boolean(current.paused),
    cat: current.cat || '🏠 Casa',
    sub: current.sub || '',
    detail: current.detail || '',
    seconds: getLiveSeconds(current),
    totalMinutes: Math.floor(totalSeconds / 60),
    log: entries.map((entry) => ({
      id: entry.id,
      name: entry.label,
      time: `${formatTimeLabel(entry.started_at)}–${entry.active ? 'agora' : formatTimeLabel(entry.ended_at)}`,
      durationMinutes: Math.floor((entry.active ? getLiveSeconds(entry) : Number(entry.duration_seconds || 0)) / 60),
      active: Boolean(entry.active),
    })),
  }
}

function createManagerProfile() {
  return {
    key: 'gestor',
    name: 'Gestor',
    short: 'Visão geral',
    color: '#333',
    avatar: '👑',
    type: 'manager',
    statsLabel: 'Visão geral',
  }
}

function buildMemberShort(member, tasks) {
  const doneTasks = tasks.filter((task) => task.done).length
  const totalTasks = tasks.length

  if (member.stars && totalTasks > 0) {
    const streakLabel = member.streak ? ` · 🔥${member.streak}d` : ''
    return `${doneTasks}/${totalTasks} · ⭐${member.stars}${streakLabel}`
  }

  if (totalTasks > 0) {
    return `${doneTasks}/${totalTasks} tarefas`
  }

  return member.short || 'Sem tarefas'
}

async function getWorkspaceForUser(user) {
  const [members, tasks, categories, events, favorites, meals, rewards, timeEntries, plansPreview] = await Promise.all([
    many(
      `
        SELECT *
        FROM members
        WHERE owner_user_id = $1
        ORDER BY sort_order ASC, created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, profile_key, title, tag, points, done
        FROM tasks
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, profile_key, icon, name, visibility_scope
        FROM categories
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, day_key, title, time, cls, member_keys_json
        FROM events
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, profile_key, icon, label, cat, sub, detail
        FROM favorites
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, day_label, icon, name, shopping, today
        FROM meals
        WHERE owner_user_id = $1
        ORDER BY sort_order ASC, created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, tier_id, tier_label, cost, color, label
        FROM rewards
        WHERE owner_user_id = $1
        ORDER BY cost ASC, created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, profile_key, label, cat, sub, detail, started_at, ended_at, duration_seconds, active, paused, last_resumed_at
        FROM time_entries
        WHERE owner_user_id = $1
        ORDER BY created_at ASC, started_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, name, code, active
        FROM plans
        ORDER BY created_at ASC
        LIMIT 2
      `,
      [],
    ),
  ])

  const profiles = {}

  if (user.role !== 'user') {
    profiles.gestor = createManagerProfile()
  }

  members.forEach((member) => {
    const memberTasks = tasks
      .filter((task) => task.profile_key === member.key)
      .map((task) => ({
        id: task.id,
        title: task.title,
        done: Boolean(task.done),
        tag: task.tag,
        points: task.points,
      }))

    const memberCategories = categories
      .filter((category) => category.profile_key === member.key)
      .map((category) => ({
        id: category.id,
        icon: category.icon,
        name: category.name,
        visibility: category.visibility_scope,
      }))

    const memberFavorites = favorites
      .filter((favorite) => favorite.profile_key === member.key)
      .map((favorite) => ({
        id: favorite.id,
        icon: favorite.icon,
        label: favorite.label,
        cat: favorite.cat,
        sub: favorite.sub || '',
        detail: favorite.detail || '',
      }))

    const memberEntries = timeEntries.filter((entry) => entry.profile_key === member.key)
    profiles[member.key] = {
      key: member.key,
      name: member.name,
      short: buildMemberShort(member, memberTasks),
      color: member.color,
      avatarUrl: member.avatar_url || '',
      avatar: member.avatar_text || member.name[0],
      relation: member.relation || '',
      profileType: member.profile_type || '',
      age: member.age,
      statusColor: member.status_color || '',
      stars: member.stars || 0,
      streak: member.streak || 0,
      tasks: memberTasks,
      categories: memberCategories,
      favorites: memberFavorites,
      workSubs: JSON.parse(member.work_subs_json || '[]'),
      tracking: buildTracking(memberEntries),
    }
  })

  const calendar = weekDays.reduce((accumulator, day) => {
    accumulator[day.key] = events
      .filter((event) => event.day_key === day.key)
      .map((event) => ({
        id: event.id,
        title: event.title,
        time: event.time,
        cls: event.cls,
        members: JSON.parse(event.member_keys_json || '[]'),
      }))
    return accumulator
  }, {})

  const rewardsByTierMap = rewards.reduce((accumulator, reward) => {
      if (!accumulator[reward.tier_id]) {
        accumulator[reward.tier_id] = {
          id: reward.tier_id,
          label: reward.tier_label,
          cost: reward.cost,
          color: reward.color,
          items: [],
        }
      }

      accumulator[reward.tier_id].items.push(reward.label)
      return accumulator
    }, {})

  ;[
    { id: 'tier-6', label: '🔵 Escolhas do Dia', cost: 6, color: '#6fa8dc' },
    { id: 'tier-8', label: '🟠 Especiais', cost: 8, color: '#e8983a' },
    { id: 'tier-12', label: '🟣 Super', cost: 12, color: '#b07ec5' },
  ].forEach((tier) => {
    if (!rewardsByTierMap[tier.id]) {
      rewardsByTierMap[tier.id] = { ...tier, items: [] }
    }
  })

  const rewardsByTier = Object.values(rewardsByTierMap).sort((left, right) => left.cost - right.cost)

  return {
    currentTab: 'cal',
    currentProf: user.role === 'user' ? members[0]?.key || 'self' : 'gestor',
    currentView: 'Semanal',
    weekRange: '24 — 30 Março',
    weekDays,
    calendar,
    profiles,
    rewards: rewardsByTier,
    meals: meals.map((meal) => ({
      id: meal.id,
      day: meal.day_label,
      icon: meal.icon,
      name: meal.name,
      shopping: meal.shopping || '',
      today: Boolean(meal.today),
    })),
    shoppingListCount: meals.filter((meal) => meal.shopping).length,
    plansPreview: plansPreview.map((plan) => ({
        id: plan.id,
        name: plan.name,
        code: plan.code,
        limits: '',
        active: Boolean(plan.active),
      })),
  }
}

module.exports = {
  getWorkspaceForUser,
}
