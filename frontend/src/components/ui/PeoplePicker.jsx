/**
 * Seletor de pessoas em formato de bolhas.
 * Props:
 *   profiles   – array de objetos com { key, name, color, avatar }
 *   selected   – string (single) ou string[] (multi)
 *   multi      – boolean; se true permite múltipla seleção
 *   onChange   – callback com o novo valor (string ou string[])
 *   label      – texto acima das bolhas (opcional)
 *   includeAll – mostra opção "Todos" (valor 'todos'), útil em categorias
 */
export default function PeoplePicker({ profiles = [], selected, multi = false, onChange, label, includeAll = false }) {
  function isSelected(key) {
    if (multi) return Array.isArray(selected) && selected.includes(key)
    return selected === key
  }

  function toggle(key) {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : []
      if (key === 'todos') {
        onChange(arr.includes('todos') ? [] : ['todos'])
        return
      }
      const without = arr.filter((k) => k !== 'todos')
      onChange(without.includes(key) ? without.filter((k) => k !== key) : [...without, key])
    } else {
      onChange(key)
    }
  }

  const allSelected = multi
    ? Array.isArray(selected) && selected.includes('todos')
    : selected === 'todos'

  return (
    <div style={{ marginBottom: 8 }}>
      {label && (
        <div style={{ fontSize: '0.68em', fontWeight: 700, color: 'var(--t3)', margin: '8px 0 6px' }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {includeAll && (
          <button
            type="button"
            onClick={() => toggle('todos')}
            style={bubbleStyle(allSelected, '#1e1e2e')}
          >
            <span style={avatarStyle(allSelected, '#1e1e2e')}>👥</span>
            Todos
          </button>
        )}
        {profiles.map((p) => {
          const sel = isSelected(p.key)
          const color = p.color || '#7c6aef'
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => toggle(p.key)}
              style={bubbleStyle(sel, color)}
              aria-pressed={sel}
            >
              <span style={avatarStyle(sel, color)}>
                {p.avatar ?? p.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              {p.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function bubbleStyle(selected, color) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 11px 5px 5px',
    borderRadius: 999,
    border: `2px solid ${selected ? color : 'var(--bd)'}`,
    background: selected ? color + '20' : 'var(--w)',
    color: selected ? color : 'var(--t2)',
    fontSize: '0.75em',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
  }
}

function avatarStyle(selected, color) {
  return {
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: selected ? color : `linear-gradient(135deg, ${color} 0%, #999 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '0.75em',
    fontWeight: 800,
    flexShrink: 0,
  }
}
