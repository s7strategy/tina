import { useState } from 'react'

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/'

function emojiToUrl(emoji) {
  const cps = []
  for (const ch of emoji) {
    const cp = ch.codePointAt(0)
    if (cp !== 0xfe0f) cps.push(cp.toString(16))
  }
  return `${TWEMOJI_BASE}${cps.join('-')}.svg`
}

function TwemojiImg({ emoji, size = 28 }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span style={{ fontSize: size * 0.75 }}>{emoji}</span>
  return (
    <img
      src={emojiToUrl(emoji)}
      alt={emoji}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      style={{ display: 'block' }}
    />
  )
}

const EMOJI_CATEGORIES = [
  {
    label: 'Familia',
    tab: '👨‍👩‍👧',
    emojis: ['👨‍👩‍👧', '👶', '👦', '👧', '👨', '👩', '👴', '👵', '🏠', '🛏', '🧸', '❤'],
  },
  {
    label: 'Rotina',
    tab: '🧹',
    emojis: ['🧹', '🧺', '🧽', '🍳', '🛁', '🪥', '🧴', '💊', '🛒', '📬', '🪴', '🐕'],
  },
  {
    label: 'Trabalho',
    tab: '💼',
    emojis: ['💼', '💻', '📊', '📧', '🎨', '📹', '🎙', '📝', '🗂', '📱', '🖥', '🗓'],
  },
  {
    label: 'Estudo',
    tab: '📚',
    emojis: ['📚', '✏', '🎓', '🧠', '📐', '🔬', '🧪', '📓', '🎯', '💡', '📖', '🏫'],
  },
  {
    label: 'Saude',
    tab: '🏃',
    emojis: ['🏃', '🧘', '🏋', '🚴', '⚽', '🏊', '🥗', '💪', '🩺', '😴', '🧘', '🥤'],
  },
  {
    label: 'Lazer',
    tab: '🎬',
    emojis: ['🎬', '🎮', '🎵', '📷', '✈', '🏖', '🎉', '🎂', '🎭', '🎪', '🏕', '🛍'],
  },
  {
    label: 'Transporte',
    tab: '🚗',
    emojis: ['🚗', '🚌', '🚲', '✈', '⛽', '🅿', '🚕', '🛵', '🚇', '🚶', '📍', '🗺'],
  },
]

export { TwemojiImg, emojiToUrl }

export default function EmojiPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  function select(emoji) {
    onChange(emoji)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      {label && <div className="form-label">{label}</div>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1.5px solid var(--bd)',
          borderRadius: 10,
          background: 'var(--w)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.82em',
          fontWeight: 600,
          color: 'var(--t1)',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#f0ecff,#e8f4fd)' }}>
          {value ? <TwemojiImg emoji={value} size={24} /> : <span style={{ fontSize: '1.2em' }}>❓</span>}
        </span>
        <span>{value ? 'Trocar icone' : 'Escolher icone'}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.75em', color: 'var(--t3)' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--w)',
          border: '1.5px solid var(--bd)',
          borderRadius: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
          padding: 12,
          marginTop: 4,
        }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 10, flexWrap: 'wrap' }}>
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                type="button"
                onClick={() => setActiveTab(i)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: 'none',
                  background: activeTab === i ? 'var(--brand)' : 'var(--bg)',
                  color: activeTab === i ? 'white' : 'var(--t2)',
                  fontSize: '0.62em',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <TwemojiImg emoji={cat.tab} size={14} />
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
            {EMOJI_CATEGORIES[activeTab].emojis.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                onClick={() => select(emoji)}
                style={{
                  padding: 6,
                  borderRadius: 10,
                  border: value === emoji ? '2px solid var(--brand)' : '2px solid transparent',
                  background: value === emoji ? '#f0ecff' : 'var(--bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.12s',
                  aspectRatio: '1',
                }}
              >
                <TwemojiImg emoji={emoji} size={28} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '6px 0',
              border: '1px solid var(--bd)',
              borderRadius: 8,
              background: 'transparent',
              fontSize: '0.68em',
              fontWeight: 700,
              color: 'var(--t3)',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
