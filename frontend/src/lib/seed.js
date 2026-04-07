const baseCalendar = {
  seg: [
    { id: 'evt-seg-1', title: '🏫 Escola', time: '07–12h', members: ['pedro', 'sofia'], cls: 'ce-ped' },
    { id: 'evt-seg-2', title: '🧘 Yoga', time: '09h', members: ['mae'], cls: 'ce-mae' },
    { id: 'evt-seg-3', title: '💼 Reunião', time: '14h', members: ['pai'], cls: 'ce-pai' },
    { id: 'evt-seg-4', title: '⚽ Futebol', time: '16h', members: ['pedro'], cls: 'ce-ped' },
  ],
  ter: [
    { id: 'evt-ter-1', title: '🏫 Escola', time: '07–12h', members: ['pedro', 'sofia'], cls: 'ce-ped' },
    { id: 'evt-ter-2', title: '🏥 Pediatra', time: '14h', members: ['mae', 'sofia'], cls: 'ce-mae' },
    { id: 'evt-ter-3', title: '💃 Ballet', time: '15h', members: ['sofia'], cls: 'ce-sof' },
  ],
  qua: [
    { id: 'evt-qua-1', title: '🏫 Escola', time: '07–12h', members: ['pedro', 'sofia'], cls: 'ce-ped' },
    { id: 'evt-qua-2', title: '🧘 Yoga', time: '09h', members: ['mae'], cls: 'ce-mae' },
    { id: 'evt-qua-3', title: '💃 Ballet', time: '15h', members: ['sofia', 'mae'], cls: 'ce-sof' },
    { id: 'evt-qua-4', title: '🏫 Reunião escola', time: '19h', members: ['mae', 'pai'], cls: 'ce-all' },
  ],
  qui: [
    { id: 'evt-qui-1', title: '🏫 Escola', time: '07–12h', members: ['pedro', 'sofia'], cls: 'ce-ped' },
    { id: 'evt-qui-2', title: '🥋 Jiu-jitsu', time: '19:30', members: ['pai'], cls: 'ce-pai' },
  ],
  sex: [
    { id: 'evt-sex-1', title: '🏫 Escola', time: '07–12h', members: ['pedro', 'sofia'], cls: 'ce-ped' },
    { id: 'evt-sex-2', title: '🎬 Filme', time: '20h', members: ['mae', 'pai', 'pedro', 'sofia'], cls: 'ce-all' },
  ],
  sab: [
    { id: 'evt-sab-1', title: '⚽ Jogo', time: '09h', members: ['pedro', 'pai'], cls: 'ce-ped' },
    { id: 'evt-sab-2', title: '🛒 Feira', time: '08h', members: ['mae'], cls: 'ce-mae' },
    { id: 'evt-sab-3', title: '🍕 Almoço vovó', time: '12h', members: ['mae', 'pai', 'pedro', 'sofia'], cls: 'ce-all' },
  ],
  dom: [
    { id: 'evt-dom-1', title: '⛪ Missa', time: '10h', members: ['mae'], cls: 'ce-all' },
    { id: 'evt-dom-2', title: '🏖️ Parque', time: '15h', members: ['mae', 'pai', 'pedro', 'sofia'], cls: 'ce-all' },
  ],
}

const weekDays = [
  { key: 'seg', name: 'Seg', num: '24' },
  { key: 'ter', name: 'Ter', num: '25' },
  { key: 'qua', name: 'Qua', num: '26', today: true },
  { key: 'qui', name: 'Qui', num: '27' },
  { key: 'sex', name: 'Sex', num: '28' },
  { key: 'sab', name: 'Sáb', num: '29' },
  { key: 'dom', name: 'Dom', num: '30' },
]

const mealPlan = [
  { id: 'meal-1', day: 'Seg', icon: '🍗', name: 'Frango grelhado', today: false, shopping: '' },
  { id: 'meal-2', day: 'Ter', icon: '🍝', name: 'Macarrão bolonhesa', today: false, shopping: '' },
  { id: 'meal-3', day: 'Qua · Hoje', icon: '🐟', name: 'Peixe com legumes', today: true, shopping: 'tilápia, cenoura' },
  { id: 'meal-4', day: 'Qui', icon: '🥘', name: 'Feijoada leve', today: false, shopping: '' },
  { id: 'meal-5', day: 'Sex', icon: '🍕', name: 'Noite da pizza!', today: false, shopping: '' },
  { id: 'meal-6', day: 'Sáb', icon: '🍖', name: 'Almoço na vovó', today: false, shopping: '' },
  { id: 'meal-7', day: 'Dom', icon: '🥩', name: 'Churrasco', today: false, shopping: 'picanha' },
]

const rewardTiers = [
  {
    id: 'tier-6',
    label: '🔵 Escolhas do Dia',
    cost: 6,
    color: '#6fa8dc',
    items: [
      '🎵 Música do carro',
      '🎶 Trilha da casa',
      '🧃 Suco do dia',
      '🍎 Fruta do dia',
      '🎨 Cor do dia',
      '🥪 Lanche',
      '☕ Café da manhã',
      '📺 Assistir dormindo',
    ],
  },
  {
    id: 'tier-8',
    label: '🟠 Especiais',
    cost: 8,
    color: '#e8983a',
    items: [
      '🌙 Acordada até 23h30',
      '⛺ Barraca no quarto',
      '🍿 Lanche + filme',
      '🎬 Filme família',
      '🎲 Jogos família',
      '👩‍🍳 Cozinhar juntos',
      '🏖️ 1h no mar',
      '⚽ Bola na praia',
    ],
  },
  {
    id: 'tier-12',
    label: '🟣 Super',
    cost: 12,
    color: '#b07ec5',
    items: [
      '🎀 Festa do pijama',
      '👯 Amiga dormir',
      '🍦 Centrinho sorvete',
      '✅ Dia do SIM',
      '🎨 Criar juntas',
      '🏊 Festa piscina',
      '🎁 Passeio surpresa',
      '🎥 Mini filme juntas',
    ],
  },
]

const profileSeed = {
  gestor: {
    key: 'gestor',
    name: 'Gestor',
    short: 'Visão geral',
    color: '#333',
    avatar: '👑',
    type: 'manager',
    statsLabel: 'Visão geral',
  },
  mae: {
    key: 'mae',
    name: 'Mamãe',
    short: '3/5 tarefas',
    color: '#7c6aef',
    avatarUrl: 'https://i.pravatar.cc/84?img=47',
    statusColor: '#22c55e',
    tasks: [
      { id: 'mae-task-1', title: 'Yoga matinal', done: true, tag: 'Manhã', points: 0 },
      { id: 'mae-task-2', title: 'Preparar marmitas', done: true, tag: 'Manhã', points: 0 },
      { id: 'mae-task-3', title: 'Lavar roupas', done: true, tag: 'Manhã', points: 0 },
      { id: 'mae-task-4', title: 'Pagar conta de luz', done: false, tag: 'Tarde', points: 0 },
      { id: 'mae-task-5', title: 'Comprar presente vovó', done: false, tag: 'Tarde', points: 0 },
    ],
    categories: [
      { id: 'mae-cat-1', icon: '💼', name: 'Trabalho', visibility: 'Todos' },
      { id: 'mae-cat-2', icon: '🏠', name: 'Casa', visibility: 'Todos' },
      { id: 'mae-cat-3', icon: '👨‍👩‍👧‍👦', name: 'Família', visibility: 'Todos' },
      { id: 'mae-cat-4', icon: '🧘', name: 'Pessoal', visibility: 'Mamãe' },
    ],
    favorites: [
      { id: 'mae-fav-1', icon: '💼', label: 'Trabalho', cat: '💼 Trabalho', sub: 'S7 Strategy', detail: 'Campanhas' },
      { id: 'mae-fav-2', icon: '🧘', label: 'Yoga', cat: '🧘 Pessoal', sub: 'Yoga', detail: '' },
      { id: 'mae-fav-3', icon: '🧹', label: 'Limpeza', cat: '🏠 Casa', sub: 'Limpeza', detail: '' },
      { id: 'mae-fav-4', icon: '🍳', label: 'Cozinha', cat: '🏠 Casa', sub: 'Cozinha', detail: '' },
    ],
    workSubs: [
      { company: 'S7 Strategy', activities: ['Campanhas', 'Criativos', 'Relatórios', 'Reunião'] },
      { company: 'Freelance', activities: ['Projeto avulso', 'Consultoria'] },
      { company: 'Estudo', activities: ['Curso', 'Leitura', 'Pesquisa'] },
    ],
    tracking: {
      active: true,
      paused: false,
      cat: '💼 Trabalho',
      sub: 'S7 Strategy',
      detail: 'Campanhas',
      seconds: 8072,
      totalMinutes: 309,
      log: [
        { id: 'mae-log-1', name: '🧘 Yoga', time: '06:30–07:30', durationMinutes: 60, active: false },
        { id: 'mae-log-2', name: '🚗 Levar kids', time: '07:45–08:15', durationMinutes: 30, active: false },
        { id: 'mae-log-3', name: '🧹 Limpeza', time: '08:20–09:00', durationMinutes: 40, active: false },
        { id: 'mae-log-4', name: '🍳 Marmitas', time: '09:05–09:50', durationMinutes: 45, active: false },
        { id: 'mae-log-5', name: '💼 Trabalho — S7 Strategy — Campanhas', time: '12:20–agora', durationMinutes: 134, active: true },
      ],
    },
  },
  pai: {
    key: 'pai',
    name: 'Papai',
    short: '2/4 tarefas',
    color: '#2d9cdb',
    avatarUrl: 'https://i.pravatar.cc/84?img=68',
    statusColor: '#f59e0b',
    tasks: [
      { id: 'pai-task-1', title: 'Levar kids na escola', done: true, tag: 'Manhã', points: 0 },
      { id: 'pai-task-2', title: 'Consertar torneira', done: true, tag: 'Tarde', points: 0 },
      { id: 'pai-task-3', title: 'Buscar Pedro futebol', done: false, tag: 'Tarde', points: 0 },
      { id: 'pai-task-4', title: 'Limpar churrasqueira', done: false, tag: 'Noite', points: 0 },
    ],
    categories: [
      { id: 'pai-cat-1', icon: '💼', name: 'Trabalho', visibility: 'Todos' },
      { id: 'pai-cat-2', icon: '🏠', name: 'Casa', visibility: 'Todos' },
      { id: 'pai-cat-3', icon: '🧘', name: 'Pessoal', visibility: 'Papai' },
    ],
    favorites: [
      { id: 'pai-fav-1', icon: '💼', label: 'Freelance', cat: '💼 Trabalho', sub: 'Freelance', detail: 'Projeto' },
      { id: 'pai-fav-2', icon: '🔧', label: 'Manutenção', cat: '🏠 Casa', sub: 'Manutenção', detail: '' },
      { id: 'pai-fav-3', icon: '🥋', label: 'Jiu-jitsu', cat: '🧘 Pessoal', sub: 'Jiu-jitsu', detail: '' },
      { id: 'pai-fav-4', icon: '🚗', label: 'Levar kids', cat: '🚗 Deslocamento', sub: 'Escola', detail: '' },
    ],
    workSubs: [{ company: 'Freelance', activities: ['Projeto', 'Reunião', 'Proposta'] }],
    tracking: {
      active: false,
      paused: true,
      cat: '💼 Trabalho',
      sub: 'Freelance',
      detail: 'Projeto',
      seconds: 6310,
      totalMinutes: 175,
      log: [
        { id: 'pai-log-1', name: '🚗 Levar kids', time: '07:30–08:00', durationMinutes: 30, active: false },
        { id: 'pai-log-2', name: '💼 Freelance — Projeto', time: '08:15–10:00', durationMinutes: 105, active: false },
        { id: 'pai-log-3', name: '🔧 Torneira', time: '10:10–10:50', durationMinutes: 40, active: false },
        { id: 'pai-log-4', name: '🍽️ Almoço', time: '12:00–agora', durationMinutes: 0, active: true },
      ],
    },
  },
  pedro: {
    key: 'pedro',
    name: 'Pedro',
    short: '5/6 · ⭐186',
    color: '#27ae60',
    avatarUrl: 'https://i.pravatar.cc/84?img=59',
    statusColor: '#22c55e',
    stars: 186,
    streak: 12,
    tasks: [
      { id: 'pedro-task-1', title: 'Arrumar a cama', done: true, tag: 'Manhã', points: 5 },
      { id: 'pedro-task-2', title: 'Escovar dentes', done: true, tag: 'Manhã', points: 3 },
      { id: 'pedro-task-3', title: 'Guardar mochila', done: true, tag: 'Tarde', points: 3 },
      { id: 'pedro-task-4', title: 'Lição de casa', done: true, tag: 'Tarde', points: 10 },
      { id: 'pedro-task-5', title: 'Tirar a mesa', done: false, tag: 'Noite', points: 3 },
      { id: 'pedro-task-6', title: 'Guardar brinquedos', done: false, tag: 'Noite', points: 5 },
    ],
    categories: [
      { id: 'pedro-cat-1', icon: '🏫', name: 'Escola', visibility: 'Pedro' },
      { id: 'pedro-cat-2', icon: '⚽', name: 'Futebol', visibility: 'Pedro' },
      { id: 'pedro-cat-3', icon: '📚', name: 'Estudo', visibility: 'Pedro' },
    ],
    favorites: [
      { id: 'pedro-fav-1', icon: '🏫', label: 'Escola', cat: '🏫 Escola', sub: '', detail: '' },
      { id: 'pedro-fav-2', icon: '⚽', label: 'Futebol', cat: '🧘 Pessoal', sub: 'Futebol', detail: '' },
      { id: 'pedro-fav-3', icon: '📚', label: 'Lição', cat: '📚 Estudo', sub: 'Lição de casa', detail: '' },
      { id: 'pedro-fav-4', icon: '🎮', label: 'Jogar', cat: '🎮 Lazer', sub: 'Jogos', detail: '' },
    ],
    workSubs: [],
    tracking: {
      active: true,
      paused: false,
      cat: '🏫 Escola',
      sub: '',
      detail: '',
      seconds: 16500,
      totalMinutes: 275,
      log: [
        { id: 'pedro-log-1', name: '🏫 Escola', time: '07:00–agora', durationMinutes: 275, active: true },
      ],
    },
  },
  sofia: {
    key: 'sofia',
    name: 'Sofia',
    short: '6/6 ✓ · ⭐143',
    color: '#e84393',
    avatarUrl: 'https://i.pravatar.cc/84?img=44',
    statusColor: '#e84393',
    stars: 143,
    streak: 8,
    tasks: [
      { id: 'sofia-task-1', title: 'Arrumar a cama', done: true, tag: 'Manhã', points: 5 },
      { id: 'sofia-task-2', title: 'Escovar dentes', done: true, tag: 'Manhã', points: 3 },
      { id: 'sofia-task-3', title: 'Colorir/desenhar', done: true, tag: 'Tarde', points: 5 },
      { id: 'sofia-task-4', title: 'Guardar roupas', done: true, tag: 'Tarde', points: 5 },
      { id: 'sofia-task-5', title: 'Ajudar no jantar', done: true, tag: 'Noite', points: 8 },
      { id: 'sofia-task-6', title: 'Escovar dentes noite', done: true, tag: 'Noite', points: 3 },
    ],
    categories: [
      { id: 'sofia-cat-1', icon: '🏫', name: 'Escola', visibility: 'Sofia' },
      { id: 'sofia-cat-2', icon: '💃', name: 'Ballet', visibility: 'Sofia' },
      { id: 'sofia-cat-3', icon: '🎨', name: 'Desenho', visibility: 'Sofia' },
    ],
    favorites: [
      { id: 'sofia-fav-1', icon: '🏫', label: 'Escola', cat: '🏫 Escola', sub: '', detail: '' },
      { id: 'sofia-fav-2', icon: '💃', label: 'Ballet', cat: '🧘 Pessoal', sub: 'Ballet', detail: '' },
      { id: 'sofia-fav-3', icon: '🎨', label: 'Desenhar', cat: '🎨 Lazer', sub: 'Desenho', detail: '' },
    ],
    workSubs: [],
    tracking: {
      active: true,
      paused: false,
      cat: '🏫 Escola',
      sub: '',
      detail: '',
      seconds: 16500,
      totalMinutes: 275,
      log: [
        { id: 'sofia-log-1', name: '🏫 Escola', time: '07:00–agora', durationMinutes: 275, active: true },
      ],
    },
  },
  vovo: {
    key: 'vovo',
    name: 'Vovó',
    short: '0/2 tarefas',
    color: '#e67e22',
    avatarUrl: 'https://i.pravatar.cc/84?img=32',
    statusColor: '#e67e22',
    tasks: [
      { id: 'vovo-task-1', title: 'Regar as plantas', done: false, tag: 'Manhã', points: 0 },
      { id: 'vovo-task-2', title: 'Separar legumes', done: false, tag: 'Tarde', points: 0 },
    ],
    categories: [{ id: 'vovo-cat-1', icon: '🏠', name: 'Casa', visibility: 'Vovó' }],
    favorites: [],
    workSubs: [],
    tracking: {
      active: false,
      paused: false,
      cat: '🏠 Casa',
      sub: '',
      detail: '',
      seconds: 0,
      totalMinutes: 0,
      log: [],
    },
  },
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export function formatClock(seconds) {
  const value = Math.max(0, seconds)
  const h = String(Math.floor(value / 3600)).padStart(2, '0')
  const m = String(Math.floor((value % 3600) / 60)).padStart(2, '0')
  const s = String(value % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function formatMinutes(minutes) {
  const totalSec = Math.max(0, Math.round(Number(minutes) * 60))
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  if (hrs === 0 && mins === 0 && totalSec > 0) return `${totalSec}s`
  return `${hrs}h${String(mins).padStart(2, '0')}`
}

export function createDefaultWorkspace() {
  return {
    currentTab: 'cal',
    currentProf: 'gestor',
    currentView: 'Semanal',
    weekRange: '24 — 30 Março',
    weekDays,
    calendar: structuredClone(baseCalendar),
    profiles: structuredClone(profileSeed),
    rewards: structuredClone(rewardTiers),
    meals: structuredClone(mealPlan),
    shoppingListCount: 4,
    plansPreview: [
      { id: 'plan-starter', name: 'Essencial', code: 'essencial', limits: 'Plano de entrada', active: true },
      { id: 'plan-growth', name: 'Profissional', code: 'profissional', limits: 'Plano intermediário', active: true },
    ],
  }
}

export const demoAccounts = [
  { email: 'superadmin@tina.local', password: 'admin123', role: 'super_admin' },
  { email: 'admin@tina.local', password: 'admin123', role: 'admin' },
  { email: 'user@tina.local', password: 'user123', role: 'user' },
]
