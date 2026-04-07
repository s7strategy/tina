import { useCallback, useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '../../../lib/api.js'

const SHOPPING_UNITS = [
  { value: 'un', label: 'un' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
  { value: 'dz', label: 'dz' },
  { value: 'pct', label: 'pct' },
]

function unitCssKey(unit) {
  if (!unit) return 'un'
  const s = String(unit).trim()
  if (s === 'L') return 'L'
  const lower = s.toLowerCase()
  if (['un', 'g', 'kg', 'ml', 'dz', 'pct'].includes(lower)) return lower
  return 'un'
}

function QtyButton({ item, token, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(item.quantityText || '')

  useEffect(() => {
    setLocal(item.quantityText || '')
  }, [item.id, item.quantityText])

  async function commit() {
    const next = String(local)
    if (next === String(item.quantityText || '')) {
      setEditing(false)
      return
    }
    try {
      await api.updateShoppingItem(token, item.id, { quantityText: next })
      setEditing(false)
      onSaved()
    } catch (e) {
      window.alert(e?.message)
    }
  }

  function cancel() {
    setLocal(item.quantityText || '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="meals-shop-qty-edit">
        <input
          autoFocus
          className="meals-shop-qty-input meals-shop-qty-input--inline"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
        />
        <button type="button" className="meals-shop-qty-ok" aria-label="Guardar quantidade" onClick={commit}>
          <Check size={15} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <button type="button" className="meals-shop-qty" onClick={() => setEditing(true)}>
      {(item.quantityText || '').trim() || '—'}
    </button>
  )
}

function SourceTag({ source }) {
  const isGenerated = source === 'generated'
  return (
    <span
      className={`meals-shop-tag${isGenerated ? ' meals-shop-tag--plan' : ' meals-shop-tag--manual'}`}
      title={isGenerated ? 'Calculado a partir do cardápio e receitas' : 'Adicionado manualmente à lista'}
    >
      {isGenerated ? 'do cardápio' : 'adicionado por você'}
    </span>
  )
}

function UnitSelect({ item, token, onSaved }) {
  const k = unitCssKey(item.unit)
  return (
    <select
      className={`meals-unit-select meals-unit-select--compact meals-unit--${k}`}
      aria-label="Unidade"
      value={k}
      onChange={async (e) => {
        const next = e.target.value
        try {
          await api.updateShoppingItem(token, item.id, { unit: next === 'un' ? null : next })
          onSaved()
        } catch (err) {
          window.alert(err?.message)
        }
      }}
    >
      {SHOPPING_UNITS.map((u) => (
        <option key={u.value} value={u.value}>
          {u.label}
        </option>
      ))}
    </select>
  )
}

export default function MealsShopping({ token, embedded = false }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [horizonDays, setHorizonDays] = useState(7)
  const [newItem, setNewItem] = useState({ name: '', quantityText: '', unit: 'un' })

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    let skipMerge = false
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('mealsShoppingPreferSkipMergeOnce') === '1') {
        skipMerge = true
        sessionStorage.removeItem('mealsShoppingPreferSkipMergeOnce')
      }
    } catch {
      /* ignore */
    }
    try {
      const r = await api.getShoppingListDefault(token, { horizonDays, skipMerge })
      setDetail(r.list)
    } catch {
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [token, horizonDays])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onShoppingReload() {
      load()
    }
    window.addEventListener('mealsShoppingReload', onShoppingReload)
    return () => window.removeEventListener('mealsShoppingReload', onShoppingReload)
  }, [load])

  async function addItem() {
    if (!detail?.id) return
    if (!newItem.name.trim()) {
      window.alert('Escreve o nome do produto primeiro.')
      return
    }
    try {
      await api.createShoppingItem(token, detail.id, {
        name: newItem.name.trim(),
        quantityText: newItem.quantityText || '',
        unit: newItem.unit === 'un' ? null : newItem.unit,
      })
      setNewItem({ name: '', quantityText: '', unit: 'un' })
      await load()
    } catch (e) {
      window.alert(e?.message)
    }
  }

  async function toggleItem(item) {
    try {
      await api.updateShoppingItem(token, item.id, { checked: !item.checked })
      await load()
    } catch (e) {
      window.alert(e?.message)
    }
  }

  async function deleteItem(id) {
    try {
      await api.deleteShoppingItem(token, id)
      await load()
    } catch (e) {
      window.alert(e?.message)
    }
  }

  if (loading && !detail) {
    return <div className="feedback">A carregar…</div>
  }

  const items = detail?.items || []

  return (
    <div className={`meals-shopping${embedded ? ' meals-shopping--embedded' : ''}`}>
      {!embedded ? (
        <section className="meals-surface meals-shop-card">
          <div className="meals-section-label">Lista de compras</div>
          <p className="meals-shop-lead">
            Tudo que você precisa comprar — baseado no cardápio da semana. Os ingredientes do plano entram sozinhos conforme o horizonte; adiciona o que faltar à mão e marca o que já tens.
          </p>
        </section>
      ) : (
        <p className="meals-shop-lead meals-shop-lead--modal">
          Ingredientes do cardápio + itens manuais — marca o que já tens.
        </p>
      )}

      <div className="meals-shop-toolbar">
        <span className="meals-shop-toolbar-lbl">Lista para</span>
        <select
          className="sel meals-shop-horizon"
          value={horizonDays}
          onChange={(e) => setHorizonDays(Number(e.target.value))}
          aria-label="Horizonte da lista em dias"
        >
          <option value={7}>7 dias</option>
          <option value={15}>15 dias</option>
          <option value={30}>30 dias</option>
        </select>
      </div>

      <section className="meals-surface meals-shop-list-card">
        <div className="meals-shop-add-row">
          <button type="button" className="meals-shop-fab" aria-label="Adicionar item" onClick={addItem}>
            +
          </button>
          <input
            className="meals-field meals-shop-add-name"
            placeholder="Novo item"
            value={newItem.name}
            onChange={(e) => setNewItem((c) => ({ ...c, name: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem()
            }}
          />
          <input
            className="meals-field meals-shop-add-qty"
            placeholder="Qtd"
            value={newItem.quantityText}
            onChange={(e) => setNewItem((c) => ({ ...c, quantityText: e.target.value }))}
          />
          <select
            className={`meals-unit-select meals-unit-select--compact meals-unit--${newItem.unit}`}
            aria-label="Unidade (novo item)"
            value={newItem.unit}
            onChange={(e) => setNewItem((c) => ({ ...c, unit: e.target.value }))}
          >
            {SHOPPING_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="feedback" style={{ marginTop: 8 }}>
            A atualizar…
          </div>
        ) : null}

        {items.length === 0 && !loading ? (
          <div className="meals-shop-empty">
            Ainda não há itens. Marca refeições no cardápio ou adiciona produtos aqui.
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="meals-shop-items">
            {items.map((it) => (
              <div key={it.id} className="meals-shop-row">
                <span
                  role="checkbox"
                  aria-checked={it.checked}
                  tabIndex={0}
                  className={`meals-shop-check${it.checked ? ' is-on' : ''}`}
                  onClick={() => toggleItem(it)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      toggleItem(it)
                    }
                  }}
                />
                <span className={`meals-shop-name${it.checked ? ' is-done' : ''}`}>
                  <span className="meals-shop-name-text">{it.name}</span>
                  <SourceTag source={it.source === 'generated' ? 'generated' : 'manual'} />
                </span>
                <div className="meals-shop-measures">
                  <QtyButton item={it} token={token} onSaved={load} />
                  <UnitSelect item={it} token={token} onSaved={load} />
                </div>
                <button type="button" className="meals-shop-rm" aria-label="Remover" onClick={() => deleteItem(it.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
