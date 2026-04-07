const { many, value } = require('./db')

const APP_TZ = process.env.APP_TZ || 'America/Sao_Paulo'

/** YYYY-MM-DD no fuso da app (Brasil por omissão). */
function ymdInAppTz(d) {
  return d.toLocaleDateString('en-CA', { timeZone: APP_TZ })
}

/** Seg=0 … Dom=6 no fuso da app (semana começa na segunda). */
function weekdayMon0InAppTz(d) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: APP_TZ, weekday: 'short' }).format(d)
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return map[s] ?? 0
}

function todayYmdApp() {
  return ymdInAppTz(new Date())
}

function generateCurrentWeek() {
  const now = new Date()
  const diffToMonday = weekdayMon0InAppTz(now)
  const mondayInstant = new Date(now.getTime() - diffToMonday * 86400000)

  const keys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
  const names = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

  const todayYmd = ymdInAppTz(now)
  const week = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayInstant.getTime() + i * 86400000)
    const fullDate = ymdInAppTz(d)
    const dayNum = Number(fullDate.split('-')[2])
    week.push({
      key: keys[i],
      name: names[i],
      num: String(dayNum).padStart(2, '0'),
      today: fullDate === todayYmd,
      fullDate,
    })
  }

  const firstDay = week[0]
  const lastDay = week[6]
  const m0 = Number(firstDay.fullDate.split('-')[1]) - 1
  const m1 = Number(lastDay.fullDate.split('-')[1]) - 1
  const monthStart = months[m0]
  const monthEnd = months[m1]
  const weekRange = `${firstDay.num} ${monthStart !== monthEnd ? monthStart + ' ' : ''}— ${lastDay.num} ${monthEnd}`

  return { weekDays: week, weekRange }
}

function formatTimeLabel(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TZ,
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
  const activeEntries = entries.filter((entry) => entry.active)
  const totalSeconds = entries.reduce(
    (sum, entry) => sum + (entry.active ? getLiveSeconds(entry) : Number(entry.duration_seconds || 0)),
    0,
  )

  const log = entries.map((entry) => {
    const sec = entry.active ? getLiveSeconds(entry) : Number(entry.duration_seconds || 0)
    return {
      id: entry.id,
      name: entry.label,
      time: `${formatTimeLabel(entry.started_at)}–${entry.active ? 'agora' : formatTimeLabel(entry.ended_at)}`,
      durationSeconds: sec,
      durationMinutes: Math.floor(sec / 60),
      active: Boolean(entry.active),
      paused: Boolean(entry.paused),
      startedAt: entry.started_at || null,
      endedAt: entry.active ? null : entry.ended_at || null,
      cat: entry.cat || '',
      sub: entry.sub || '',
      detail: entry.detail || '',
      favoriteId: entry.favorite_id || null,
    }
  })

  const activeSessions = activeEntries.map((entry) => ({
    id: entry.id,
    cat: entry.cat || '',
    sub: entry.sub || '',
    detail: entry.detail || '',
    favoriteId: entry.favorite_id || null,
    paused: Boolean(entry.paused),
    seconds: getLiveSeconds(entry),
  }))

  const primary = activeEntries[0] || null

  if (!primary) {
    return {
      active: false,
      paused: false,
      cat: '🏠 Casa',
      sub: '',
      detail: '',
      favoriteId: null,
      seconds: 0,
      activeSessions: [],
      totalMinutes: Math.floor(totalSeconds / 60),
      log,
    }
  }

  return {
    active: true,
    paused: Boolean(primary.paused),
    cat: primary.cat || '🏠 Casa',
    sub: primary.sub || '',
    detail: primary.detail || '',
    favoriteId: primary.favorite_id || null,
    seconds: getLiveSeconds(primary),
    activeSessions,
    totalMinutes: Math.floor(totalSeconds / 60),
    log,
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

async function getWorkspaceForUser(user, todayOverride = null) {
  const todayStr =
    todayOverride && /^\d{4}-\d{2}-\d{2}$/.test(todayOverride) ? todayOverride : todayYmdApp()
  const [members, tasks, categories, events, favorites, meals, rewards, timeEntries, plansPreview, shoppingListCountRaw] = await Promise.all([
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
        SELECT id, profile_key, participant_keys_json, title, tag, time_type, time_value, priority, reward, points, done, recurrence, for_date AS "forDate", archived
        FROM tasks
        WHERE owner_user_id = $1
          AND COALESCE(archived, false) = false
          AND (for_date IS NULL OR for_date = $2)
        ORDER BY created_at ASC
      `,
      [user.id, todayStr],
    ),
    many(
      `
        SELECT id, profile_key, icon, icon_image_url, name, visibility_scope
        FROM categories
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, day_key, event_date, title, event_time AS time, cls, member_keys_json, recurrence_type, recurrence_days
        FROM events
        WHERE owner_user_id = $1
        ORDER BY created_at ASC
      `,
      [user.id],
    ),
    many(
      `
        SELECT id, profile_key, icon, icon_image_url, label, cat, sub, detail, participant_keys_json, sort_order
        FROM favorites
        WHERE owner_user_id = $1
        ORDER BY sort_order ASC, created_at ASC
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
        SELECT id, profile_key, label, cat, sub, detail, started_at, ended_at, duration_seconds, active, paused, last_resumed_at, favorite_id
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
    value(`SELECT COUNT(*)::int FROM shopping_lists WHERE owner_user_id = $1`, [user.id]),
  ])

  const profiles = {}

  if (user.role !== 'user') {
    profiles.gestor = createManagerProfile()
  }

  members.forEach((member) => {
    const memberTasks = tasks
      .filter((task) => {
        const keys = JSON.parse(task.participant_keys_json || '[]')
        return keys.includes('Todos') || keys.includes(member.key) || task.profile_key === member.key
      })
      .map((task) => ({
        id: task.id,
        title: task.title,
        done: Boolean(task.done),
        tag: task.tag,
        points: task.points,
        timeType: task.time_type,
        timeValue: task.time_value,
        priority: task.priority,
        reward: task.reward,
        recurrence: task.recurrence,
        forDate: task.forDate || null,
        participantKeys: JSON.parse(task.participant_keys_json || '[]'),
      }))

    const memberCategories = categories
      .filter((category) => {
        let vis = category.visibility_scope
        try {
          if (vis && vis.startsWith('[')) vis = JSON.parse(vis)
          else vis = [vis]
        } catch (e) { vis = [vis] }
        return (!vis || vis.length === 0 || vis.includes('Todos') || vis.includes(member.key) || category.profile_key === member.key)
      })
      .map((category) => ({
        id: category.id,
        icon: category.icon,
        iconImageUrl: Boolean(category.icon_image_url),
        name: category.name,
        visibility: category.visibility_scope,
      }))

    const memberFavorites = favorites
      .filter((favorite) => favorite.profile_key === member.key)
      .map((favorite) => ({
        id: favorite.id,
        icon: favorite.icon,
        iconImageUrl: Boolean(favorite.icon_image_url),
        label: favorite.label,
        cat: favorite.cat,
        sub: favorite.sub || '',
        detail: favorite.detail || '',
        participantKeys: JSON.parse(favorite.participant_keys_json || '[]'),
      }))

    const memberEntries = timeEntries.filter((entry) => entry.profile_key === member.key)
    profiles[member.key] = {
      id: member.id,
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

  const { weekDays, weekRange } = generateCurrentWeek()

  const calendar = weekDays.reduce((accumulator, day) => {
    accumulator[day.key] = events
      .filter((event) => {
        if (event.event_date === day.fullDate) return true
        if (event.day_key === day.key && (!event.recurrence_type || event.recurrence_type === 'único' || event.recurrence_type === '')) return true
        if (event.recurrence_type === 'diária') return true
        if (['semanal', 'quinzenal'].includes(event.recurrence_type) && event.recurrence_days && event.recurrence_days.includes(day.key)) return true
        if (event.recurrence_type === 'mensal' && event.event_date) {
          return Number(event.event_date.split('-')[2]) === Number(day.num)
        }
        return false
      })
      .map((event) => {
        const members = JSON.parse(event.member_keys_json || '[]')
        return {
          id: event.id,
          title: event.title,
          time: event.time,
          cls: event.cls,
          members: members,
          isForEveryone: members.includes('Todos')
        }
      })
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
    weekRange,
    weekDays,
    calendar,
    rawEvents: events,
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
    shoppingListCount: Number(shoppingListCountRaw ?? 0),
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
