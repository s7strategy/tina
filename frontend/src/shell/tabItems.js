import {
  BarChart3,
  CalendarDays,
  Gift,
  ListChecks,
  Timer,
  UtensilsCrossed,
} from 'lucide-react'

export const tabItems = [
  { key: 'cal', Icon: CalendarDays, label: 'Agenda' },
  { key: 'tasks', Icon: ListChecks, label: 'Tarefas' },
  { key: 'time', Icon: Timer, label: 'Tempo' },
  { key: 'rewards', Icon: Gift, label: 'Prêmios' },
  { key: 'meals', Icon: UtensilsCrossed, label: 'Refeições' },
  { key: 'charts', Icon: BarChart3, label: 'Gráficos' },
]
