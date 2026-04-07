import { useEffect, useState } from 'react'
import { api } from '../../../lib/api.js'
import Modal from '../../ui/Modal.jsx'
import { MEAL_CATEGORIES } from '../../../lib/mealCategories.js'

/**
 * Após importar receita Tina: juntar a combinação existente ou criar nova (receita já é tua — fork feito antes).
 */
export default function GlobalRecipeComboModal({ token, userRecipeId, mealCategory: initialCat, recipeName, onClose, onDone }) {
  const [combos, setCombos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedComboId, setSelectedComboId] = useState('')
  const [newName, setNewName] = useState('')
  const [categoryDraft, setCategoryDraft] = useState(initialCat || '')

  useEffect(() => {
    setCategoryDraft(initialCat || '')
  }, [initialCat])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      setLoading(true)
      try {
        const r = await api.listMealCombinations(token)
        setCombos(r.combinations || [])
      } catch {
        setCombos([])
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  function effectiveCategory() {
    const c = String(categoryDraft || '').trim()
    return c || null
  }

  async function addToExisting() {
    if (!selectedComboId) {
      window.alert('Escolhe uma combinação na lista.')
      return
    }
    const cat = effectiveCategory()
    if (!cat) {
      window.alert('Escolhe o tipo de refeição (categoria) desta receita.')
      return
    }
    try {
      await api.patchMealCombination(token, selectedComboId, { mealCategory: cat, recipeId: userRecipeId })
      window.alert('Receita adicionada à combinação.')
      onDone?.()
    } catch (e) {
      window.alert(e?.message || 'Erro ao atualizar a combinação.')
    }
  }

  async function createNew() {
    const name = newName.trim()
    if (!name) {
      window.alert('Escreve um nome para a nova combinação.')
      return
    }
    const cat = effectiveCategory()
    if (!cat) {
      window.alert('Escolhe o tipo de refeição (categoria) desta receita.')
      return
    }
    try {
      await api.createMealCombination(token, {
        name,
        items: [{ mealCategory: cat, recipeId: userRecipeId }],
      })
      window.alert('Combinação criada.')
      onDone?.()
    } catch (e) {
      window.alert(e?.message || 'Erro ao criar.')
    }
  }

  return (
    <Modal isOpen={true} id="modal-global-recipe-combo" onClose={onClose} title="Adicionar à combinação">
      <p className="meals-combos-hint" style={{ marginTop: 0 }}>
        A receita <strong>{recipeName || 'esta receita'}</strong> já está na tua conta. Escolhe em que tipo de refeição
        entra e junta a uma combinação ou cria uma nova.
      </p>
      <div className="form-label">Tipo de refeição</div>
      <select
        className="sel"
        value={categoryDraft}
        onChange={(e) => setCategoryDraft(e.target.value)}
        aria-label="Categoria da receita na combinação"
      >
        <option value="">— Escolher —</option>
        {MEAL_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>

      <div className="form-label" style={{ marginTop: 14 }}>
        Combinação existente
      </div>
      {loading ? <div className="feedback">A carregar…</div> : null}
      {!loading && combos.length === 0 ? (
        <p className="meals-combos-hint">Ainda não tens combinações guardadas — podes criar uma abaixo.</p>
      ) : null}
      {!loading && combos.length > 0 ? (
        <select
          className="sel"
          value={selectedComboId}
          onChange={(e) => setSelectedComboId(e.target.value)}
          aria-label="Combinação"
        >
          <option value="">— Escolher —</option>
          {combos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      <button type="button" className="meals-primary-btn" style={{ width: '100%', marginTop: 10 }} onClick={addToExisting}>
        Adicionar à combinação escolhida
      </button>

      <div className="form-label" style={{ marginTop: 16 }}>
        Criar combinação nova
      </div>
      <input
        className="meals-field"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Ex.: Almoço completo em casa"
        aria-label="Nome da nova combinação"
      />
      <button type="button" className="meals-primary-btn" style={{ width: '100%', marginTop: 8 }} onClick={createNew}>
        Criar combinação com esta receita
      </button>
      <button type="button" className="ib" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
        Fechar
      </button>
    </Modal>
  )
}
