import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../lib/api.js'
import Modal from '../../ui/Modal.jsx'
import PlannerMonthCalendar, { dayLabelFromYmd } from './PlannerMonthCalendar.jsx'
import { MEAL_CATEGORIES } from '../../../lib/mealCategories.js'
import { RECIPE_TAG_PRESETS, labelForRecipeTag, normalizeTagsList } from '../../../lib/recipeTags.js'
import {
  formatFamilyCookAmount,
  formatFamilyTotalPlateGrams,
  formatRecipeLineAmount,
  mealCategoryUsesFixedRecipeYield,
  tryParseQty,
} from './recipeAmountFormat.js'
import { FAMILY_INGREDIENT_SCALE_MARGIN } from './recipeScaling.js'

/** Igual a MealsPlanner — seleção de quais cardápios aparecem na semana. */
const PLANNER_MENU_IDS_KEY = 'meals.plannerSelectedMenuIds'

/** Ingredientes da receita são escritos para 1 kg de prato. */
const RECIPE_BASE_KG = 1

const AMOUNT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'cs', label: 'Col. sopa' },
  { value: 'cc', label: 'Col. chá' },
]

/** Normaliza texto antigo / livre para o valor do select. */
function normalizeIngredientUnit(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
  if (!t) return ''
  if (['kg', 'g', 'ml', 'cs', 'cc'].includes(t)) return t
  if (t.includes('sopa') || t === 'col.s' || t === 'cols') return 'cs'
  if (t.includes('chá') || t.includes('cha') || t === 'col.c') return 'cc'
  if (t === 'l' || t === 'lt' || t === 'litro' || t === 'litros') return 'ml'
  if (t === 'grama' || t === 'gramas') return 'g'
  if (t === 'quilo' || t === 'kilos') return 'kg'
  return ''
}

/** Igual ao backend: conversões fixas — col. sopa 50 g, col. chá 4 g; kg/g/ml automáticos. */
const GRAMS_PER_SOUP_SPOON = 50
const GRAMS_PER_TEA_SPOON = 4

function kgPerPerson(servings, amountUnit) {
  const s = Number(String(servings).replace(',', '.'))
  if (!Number.isFinite(s) || s <= 0) return 0
  let u = String(amountUnit || 'kg').toLowerCase()
  if (u === 'portion') u = 'kg'
  if (u === 'kg' || u === '') return s
  if (u === 'g') return s / 1000
  if (u === 'ml') return s / 1000
  if (u === 'cs') return (s * GRAMS_PER_SOUP_SPOON) / 1000
  if (u === 'cc') return (s * GRAMS_PER_TEA_SPOON) / 1000
  return 0
}

export function RecipeForm({ token, recipeId, members, onSaved }) {
  const memberMetaKey = members.map((m) => `${m.id}:${m.name}`).sort().join('|')

  const [name, setName] = useState('')
  const [mealCategory, setMealCategory] = useState('')
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [mode, setMode] = useState('simple')
  const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: '' }])
  const [memberServings, setMemberServings] = useState([])
  const [loading, setLoading] = useState(false)
  const [plannerMenus, setPlannerMenus] = useState([])
  /** Por dia (YYYY-MM-DD): ids de cardápio onde a receita entra (cada dia configurável). */
  const [plannerDateMenus, setPlannerDateMenus] = useState({})
  const [recipeDayMenuPick, setRecipeDayMenuPick] = useState(null)
  const [recipeMenuPickDraft, setRecipeMenuPickDraft] = useState([])
  const [preparationSteps, setPreparationSteps] = useState([''])
  const [ingSuggestions, setIngSuggestions] = useState([])
  const ingNameSearchTimer = useRef(null)

  const totalKgFamily = useMemo(() => {
    let sum = 0
    for (const m of memberServings) {
      sum += kgPerPerson(m.servings, m.amountUnit)
    }
    return sum
  }, [memberServings])

  const ingredientScale = useMemo(() => {
    if (mealCategoryUsesFixedRecipeYield(mealCategory)) return 1
    if (totalKgFamily > 0) return (totalKgFamily / RECIPE_BASE_KG) * FAMILY_INGREDIENT_SCALE_MARGIN
    return 1
  }, [mealCategory, totalKgFamily])

  useEffect(() => {
    if (!token) {
      setPlannerMenus([])
      return
    }
    ;(async () => {
      try {
        const r = await api.listMenus(token)
        setPlannerMenus(r.menus || [])
      } catch {
        setPlannerMenus([])
      }
    })()
  }, [token])

  function mapMembersFromRecipe(rec) {
    return members.map((m) => {
      const ms = rec.memberServings?.find((x) => x.memberId === m.id)
      let u = ms?.amountUnit || 'kg'
      if (u === 'portion') u = 'kg'
      return {
        memberId: m.id,
        name: m.name,
        servings: ms ? String(ms.servings) : '1',
        amountUnit: u,
      }
    })
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.listIngredientNames(token, '')
        if (!cancelled) setIngSuggestions(r.names || [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  function queueIngredientNameSearch(query) {
    if (ingNameSearchTimer.current) clearTimeout(ingNameSearchTimer.current)
    ingNameSearchTimer.current = setTimeout(async () => {
      if (!token) return
      try {
        const r = await api.listIngredientNames(token, String(query || '').slice(0, 80))
        setIngSuggestions(r.names || [])
      } catch {
        /* ignore */
      }
    }, 280)
  }

  useEffect(() => {
    if (!token || !recipeId) return
    ;(async () => {
      setLoading(true)
      try {
        const r = await api.getRecipe(token, recipeId)
        const rec = r.recipe
        setName(rec.name || '')
        setMealCategory(rec.mealCategory || '')
        setTags(normalizeTagsList(rec.tags))
        setMode(rec.mode || 'simple')
        setIngredients(
          rec.ingredients?.length
            ? rec.ingredients.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                unit: normalizeIngredientUnit(i.unit || '') || '',
              }))
            : [{ name: '', quantity: '', unit: '' }],
        )
        let ms = mapMembersFromRecipe(rec)
        if (rec.servingsSource === 'family' && (!rec.memberServings || rec.memberServings.length === 0)) {
          ms = members.map((m) => ({ memberId: m.id, name: m.name, servings: '0.25', amountUnit: 'kg' }))
        }
        setMemberServings(ms)
        const steps = rec.preparationSteps?.length ? rec.preparationSteps : ['']
        setPreparationSteps(steps)
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    })()
  }, [token, recipeId, memberMetaKey])

  useEffect(() => {
    if (recipeId) return
    setMemberServings(
      members.map((m) => ({ memberId: m.id, name: m.name, servings: '0.25', amountUnit: 'kg' })),
    )
  }, [recipeId, memberMetaKey])

  function togglePresetTag(id) {
    setTags((prev) => {
      const i = prev.indexOf(id)
      if (i >= 0) return prev.filter((x) => x !== id)
      return [...prev, id]
    })
  }

  function removeTag(id) {
    setTags((prev) => prev.filter((x) => x !== id))
  }

  function addCustomTagFromInput() {
    const raw = tagInput.trim()
    if (!raw) return
    const next = normalizeTagsList([...tags, raw])
    setTags(next)
    setTagInput('')
  }

  /** Devolve o id da receita após criar ou atualizar; `null` se falhar ou validação. */
  async function save() {
    if (!name.trim()) {
      window.alert('Nome é obrigatório.')
      return null
    }
    if (mode === 'advanced') {
      for (const i of ingredients) {
        if (!i.name.trim()) continue
        const q = tryParseQty(i.quantity)
        if (q != null && !String(i.unit || '').trim()) {
          window.alert('Escolhe a unidade no menu para cada ingrediente que tenha quantidade.')
          return null
        }
      }
    }
    try {
      const ing = mode === 'advanced' ? ingredients.filter((i) => i.name.trim()) : []
      const ms = (memberServings || [])
        .map((x) => ({
          memberId: x.memberId,
          servings: Number(String(x.servings).replace(',', '.')) || 0,
          amountUnit: x.amountUnit === 'portion' ? 'kg' : x.amountUnit || 'kg',
        }))
        .filter((x) => x.servings > 0)

      const prep = (preparationSteps || []).map((s) => String(s || '').trim()).filter(Boolean)
      const payload = {
        name: name.trim(),
        mode,
        baseServings: mode === 'advanced' ? 1 : 4,
        placeholderKey: null,
        ingredients: ing,
        memberServings: ms,
        preparationSteps: prep,
        servingsSource: 'manual',
        gramsPerPortion: null,
        mlPerPortion: null,
        spoonSoupPerPortion: null,
        spoonTeaPerPortion: null,
        mealCategory: mealCategory || null,
        tags,
      }
      if (recipeId) {
        await api.updateRecipe(token, recipeId, payload)
        onSaved()
        return recipeId
      }
      const res = await api.createRecipe(token, payload)
      const newId = res.recipe?.id || null
      onSaved(newId)
      return newId
    } catch (e) {
      window.alert(e?.message || 'Erro ao salvar.')
      return null
    }
  }

  async function pickImage(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file || !recipeId) return
    try {
      await api.uploadRecipeImage(token, recipeId, file)
      onSaved(recipeId)
    } catch (err) {
      window.alert(err?.message || 'Erro no upload.')
    }
  }

  function openRecipeDayMenuPick(ymd) {
    const existing = plannerDateMenus[ymd]
    setRecipeMenuPickDraft(
      existing?.length ? [...existing] : plannerMenus.map((m) => m.id),
    )
    setRecipeDayMenuPick({ ymd })
  }

  function toggleRecipeMenuPickDraft(menuId) {
    setRecipeMenuPickDraft((prev) => {
      if (prev.includes(menuId)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== menuId)
      }
      return [...prev, menuId]
    })
  }

  function confirmRecipeDayMenuPick() {
    if (!recipeDayMenuPick) return
    const { ymd } = recipeDayMenuPick
    setPlannerDateMenus((prev) => {
      const n = { ...prev }
      if (recipeMenuPickDraft.length === 0) delete n[ymd]
      else n[ymd] = [...recipeMenuPickDraft]
      return n
    })
    setRecipeDayMenuPick(null)
  }

  async function addRecipeToPlanner() {
    let rid = recipeId
    if (!rid) {
      const savedId = await save()
      if (!savedId) return
      rid = savedId
    }
    const entries = Object.entries(plannerDateMenus).filter(([, ids]) => ids?.length > 0)
    if (entries.length === 0) {
      window.alert('Escolhe pelo menos um dia no calendário e os cardápios nesse dia.')
      return
    }
    try {
      const tasks = []
      const menuIdsUsed = new Set()
      for (const [planDate, menuIds] of entries) {
        for (const menuId of menuIds) {
          menuIdsUsed.add(menuId)
          tasks.push(
            api.createMealPlannerSlot(token, {
              menuId,
              planDate,
              slotType: 'meal',
              recipeId: rid,
            }),
          )
        }
      }
      await Promise.all(tasks)
      try {
        const raw = localStorage.getItem(PLANNER_MENU_IDS_KEY)
        const saved = raw ? JSON.parse(raw) : null
        const arr = Array.isArray(saved) ? [...saved] : []
        for (const mid of menuIdsUsed) {
          if (!arr.includes(mid)) arr.push(mid)
        }
        localStorage.setItem(PLANNER_MENU_IDS_KEY, JSON.stringify(arr))
      } catch {
        /* ignore */
      }
      for (const mid of menuIdsUsed) {
        window.dispatchEvent(new CustomEvent('mealsPlannerEnsureMenu', { detail: { menuId: mid } }))
      }
      window.dispatchEvent(new CustomEvent('mealsPlannerReload'))
      setPlannerDateMenus({})
      window.alert('Receita adicionada ao cardápio.')
    } catch (e) {
      window.alert(e?.message || 'Erro ao planear.')
    }
  }

  async function removeRecipe() {
    if (!recipeId) return
    if (!window.confirm('Remover esta receita?')) return
    try {
      await api.deleteRecipe(token, recipeId)
      onSaved()
    } catch (e) {
      window.alert(e?.message)
    }
  }

  if (loading && recipeId) {
    return <div className="feedback">A carregar…</div>
  }

  return (
    <div className="meals-recipe-form">
      <datalist id="ingredient-suggestions">
        {ingSuggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="form-label">Nome</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da receita (ex.: Strogonoff)"
      />

      <div className="form-label" style={{ marginTop: 10 }}>
        Tipo de refeição <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: '0.85em' }}>(opcional)</span>
      </div>
      <p className="meals-recipe-plan-hint" style={{ marginTop: 2, marginBottom: 6 }}>
        Que tipo de prato é esse? Ajuda a montar o cardápio. Pode deixar em branco se não souber.
      </p>
      <select className="sel" value={mealCategory} onChange={(e) => setMealCategory(e.target.value)} aria-label="Categoria da receita">
        <option value="">Sem categoria</option>
        {MEAL_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {mealCategory === 'carb' ? (
        <p className="meals-recipe-plan-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Usa Carboidrato sobretudo para acompanhamentos de almoço ou jantar (arroz, massa simples, batata, purê).
          Pão, crepioca, pipoca ou panquecas encaixam melhor em <strong>Lanche</strong>. Lasanha só de vegetais em{' '}
          <strong>Legumes</strong>.
        </p>
      ) : null}

      <div className="form-label" style={{ marginTop: 10 }}>
        Etiquetas <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: '0.85em' }}>(opcional)</span>
      </div>
      <p className="meals-recipe-plan-hint" style={{ marginTop: 2, marginBottom: 8 }}>
        Toque para marcar ou escreva uma etiqueta e prima Enter. Ao importar JSON, as tags podem vir no campo{' '}
        <code style={{ fontSize: '0.9em' }}>tags</code>.
      </p>
      <div className="meals-recipe-tags-presets">
        {RECIPE_TAG_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`meals-pill-btn${tags.includes(p.id) ? ' on' : ''}`}
            onClick={() => togglePresetTag(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="meals-recipe-tags-input-row">
        <input
          className="meals-field"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustomTagFromInput()
            }
          }}
          placeholder="Outra etiqueta (Enter para adicionar)"
          aria-label="Adicionar etiqueta personalizada"
        />
      </div>
      {tags.length > 0 ? (
        <div className="meals-recipe-tags-active" aria-label="Etiquetas desta receita">
          {tags.map((t) => (
            <span key={t} className="meals-recipe-tag-chip">
              {labelForRecipeTag(t)}
              <button type="button" className="meals-recipe-tag-chip-x" onClick={() => removeTag(t)} aria-label={`Remover ${t}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="form-label" style={{ marginTop: 10 }}>
        Modo
      </div>
      <div className="radio-row">
        <label className="radio-opt">
          <input type="radio" checked={mode === 'simple'} onChange={() => setMode('simple')} />
          Simples
        </label>
        <label className="radio-opt">
          <input type="radio" checked={mode === 'advanced'} onChange={() => setMode('advanced')} />
          Avançado (ingredientes)
        </label>
      </div>

      {recipeId ? (
        <div style={{ marginTop: 12 }}>
          <div className="form-label">Foto da receita (opcional)</div>
          <label className="ib" style={{ cursor: 'pointer' }}>
            Carregar imagem
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pickImage} />
          </label>
        </div>
      ) : null}

      {mode === 'simple' ? null : (
        <>
          <div className="form-label" style={{ marginTop: 10 }}>
            Ingredientes
          </div>
          <p className="meals-recipe-plan-hint" style={{ marginTop: 4 }}>
            Escreva cada ingrediente para <strong>1 kg</strong> de prato pronto. Escolhe a <strong>unidade</strong> no
            menu ao lado da quantidade. Em verde vês quanto <strong>cozinhar para a família</strong> (em gramas quando a
            receita está em kg); em colheres aparece em frases simples (metade, divide em 3…). Categorias{' '}
            <strong>Doces</strong>, <strong>Bebida</strong> (sucos) e <strong>Molhos</strong> mantêm a receita inteira
            (lote/jarra/pote — não multiplica por pessoa). Nos outros pratos, aplicamos ~
            {Math.round((FAMILY_INGREDIENT_SCALE_MARGIN - 1) * 100)}% de folga nas quantidades para sobrar um pouco na
            mesa.
          </p>

          {ingredients.map((row, idx) => {
            const fixedYield = mealCategoryUsesFixedRecipeYield(mealCategory)
            const qRaw = tryParseQty(row.quantity)
            const scaledNum = qRaw != null && !Number.isNaN(qRaw) ? qRaw * ingredientScale : null
            const scaledLabel =
              !fixedYield && scaledNum != null && Number.isFinite(scaledNum)
                ? formatFamilyCookAmount(scaledNum, row.unit)
                : null
            const recipeLine =
              qRaw != null && Number.isFinite(qRaw) ? formatRecipeLineAmount(qRaw, row.unit) : null
            return (
              <div key={idx} className="meals-recipe-ing-block">
                <div className="meals-recipe-ing-row">
                  <input
                    className="meals-recipe-ing-name"
                    placeholder="Nome (ex.: carne)"
                    list="ingredient-suggestions"
                    autoComplete="off"
                    value={row.name}
                    onChange={(e) => {
                      const v = e.target.value
                      const next = [...ingredients]
                      next[idx] = { ...row, name: v }
                      setIngredients(next)
                      queueIngredientNameSearch(v)
                    }}
                  />
                  <input
                    className="meals-recipe-ing-qty"
                    placeholder="Qtd"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...ingredients]
                      next[idx] = { ...row, quantity: e.target.value }
                      setIngredients(next)
                    }}
                  />
                  <select
                    className="sel meals-recipe-ing-unit"
                    aria-label="Unidade do ingrediente"
                    value={row.unit || ''}
                    onChange={(e) => {
                      const next = [...ingredients]
                      next[idx] = { ...row, unit: e.target.value }
                      setIngredients(next)
                    }}
                  >
                    <option value="">Unidade…</option>
                    {AMOUNT_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                {scaledLabel ? (
                  <div
                    className={`meals-recipe-cook-tab${idx % 2 === 1 ? ' meals-recipe-cook-tab--alt' : ''}`}
                    role="status"
                  >
                    <div className="meals-recipe-cook-tab-inner">
                      <span className="meals-recipe-cook-tab-kicker">Para esta família</span>
                      <p className="meals-recipe-cook-tab-main">
                        Cozinhar <strong>{scaledLabel}</strong>
                        {row.name.trim() ? (
                          <>
                            {' '}
                            <span className="meals-recipe-cook-tab-ing">({row.name.trim()})</span>
                          </>
                        ) : null}
                      </p>
                      {recipeLine ? (
                        <p className="meals-recipe-cook-tab-ref">
                          Na receita para 1 kg de prato: {recipeLine}
                          {totalKgFamily > 0 ? (
                            <>
                              {' · '}
                              Família ~<strong>{formatFamilyTotalPlateGrams(totalKgFamily)}</strong> de prato no total
                              {' · '}
                              verde já com ~{Math.round((FAMILY_INGREDIENT_SCALE_MARGIN - 1) * 100)}% de folga
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : fixedYield && recipeLine ? (
                  <div className="meals-recipe-cook-tab meals-recipe-cook-tab--muted" role="status">
                    <div className="meals-recipe-cook-tab-inner">
                      <p className="meals-recipe-cook-tab-hintonly">
                        Receita inteira (doce, bebida ou molho): quantidades fixas da receita, sem multiplicar por
                        pessoa.
                        Referência: <strong>{recipeLine}</strong>
                        {row.name.trim() ? (
                          <>
                            {' '}
                            <span className="meals-recipe-cook-tab-ing">({row.name.trim()})</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="meals-recipe-cook-tab meals-recipe-cook-tab--muted" role="status">
                    <div className="meals-recipe-cook-tab-inner">
                      <p className="meals-recipe-cook-tab-hintonly">
                        {!String(row.unit || '').trim()
                          ? 'Escolhe a unidade (menu) e a quantidade para ver quanto cozinhar para a família.'
                          : 'Preencha a quantidade em cima para ver quanto cozinhar para a família.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="ib"
            onClick={() => setIngredients((x) => [...x, { name: '', quantity: '', unit: '' }])}
          >
            + Ingrediente
          </button>

          <div className="form-label" style={{ marginTop: 16 }}>
            Quanto cada pessoa come
          </div>
          <p className="meals-recipe-plan-hint" style={{ marginTop: 4, marginBottom: 10 }}>
            Define o total em kg de prato (ou colheres/ml) e atualiza as caixas verdes em cada ingrediente. No planeador,
            em <strong>modo automático</strong>, pode guardar colheres por pessoa para alinhar com a lista de compras.
          </p>
          {memberServings.map((m) => (
            <div key={m.memberId} className="meals-recipe-member-row">
              <span className="meals-recipe-member-name" title={m.name}>
                {m.name}
              </span>
              <input
                className="meals-recipe-member-qty"
                inputMode="decimal"
                value={m.servings}
                onChange={(e) => {
                  setMemberServings((prev) =>
                    prev.map((x) => (x.memberId === m.memberId ? { ...x, servings: e.target.value } : x)),
                  )
                }}
              />
              <select
                className="sel meals-recipe-member-unit"
                value={m.amountUnit || 'kg'}
                onChange={(e) => {
                  setMemberServings((prev) =>
                    prev.map((x) =>
                      x.memberId === m.memberId ? { ...x, amountUnit: e.target.value } : x,
                    ),
                  )
                }}
              >
                {AMOUNT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}

      <div className="form-label" style={{ marginTop: 16 }}>
        COMO FAZER
      </div>
      <p className="meals-recipe-plan-hint" style={{ marginTop: 4 }}>
        Passo a passo em texto livre. Pode adicionar quantos passos precisar.
      </p>
      {preparationSteps.map((step, idx) => (
        <textarea
          key={idx}
          className="meals-recipe-step"
          placeholder="Ex.: Corte a carne em cubos e tempere com sal"
          value={step}
          onChange={(e) => {
            const next = [...preparationSteps]
            next[idx] = e.target.value
            setPreparationSteps(next)
          }}
          rows={2}
        />
      ))}
      <button type="button" className="ib" onClick={() => setPreparationSteps((s) => [...s, ''])}>
        + Próximo passo
      </button>

      {plannerMenus.length > 0 ? (
        <div className="meals-recipe-plan meals-combos-repeat">
          <div className="form-label" style={{ marginTop: 16 }}>
            Repetir no cardápio <span style={{ fontWeight: 600, color: 'var(--t3)', fontSize: '0.85em' }}>(opcional)</span>
          </div>
          <p className="meals-combos-hint" style={{ marginTop: 4 }}>
            Toca num <strong>dia</strong> no calendário (1 a 31) e escolhe os cardápios ao centro (ex.: só almoço nesse dia).
            {!recipeId ? (
              <>
                {' '}
                Se ainda não guardaste a receita, <strong>Adicionar ao cardápio</strong> guarda-a primeiro e depois
                coloca-a nos dias.
              </>
            ) : null}
          </p>
          <div className="form-label">Calendário</div>
          <PlannerMonthCalendar
            hasMenusForDay={(ymd) => (plannerDateMenus[ymd]?.length ?? 0) > 0}
            onDayClick={openRecipeDayMenuPick}
          />
          <button type="button" className="meals-primary-btn meals-combos-save" onClick={addRecipeToPlanner}>
            Adicionar ao cardápio
          </button>
          <Modal
            isOpen={Boolean(recipeDayMenuPick)}
            id="modal-meals-recipe-day-menus"
            onClose={() => setRecipeDayMenuPick(null)}
            title={recipeDayMenuPick ? `Cardápios — ${dayLabelFromYmd(recipeDayMenuPick.ymd)}` : ''}
          >
            <p className="meals-combos-hint" style={{ marginTop: 0 }}>
              Em que cardápios quer esta receita neste dia? Pode marcar vários.
            </p>
            <div className="meals-menu-chips" role="group" aria-label="Cardápios para este dia">
              {plannerMenus.map((m) => {
                const on = recipeMenuPickDraft.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`meals-menu-chip${on ? ' meals-menu-chip--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggleRecipeMenuPickDraft(m.id)}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="meals-primary-btn"
                style={{ flex: '1 1 auto', minWidth: 120 }}
                onClick={confirmRecipeDayMenuPick}
              >
                Guardar neste dia
              </button>
              <button type="button" className="ib" style={{ flex: '1 1 auto' }} onClick={() => setRecipeDayMenuPick(null)}>
                Cancelar
              </button>
            </div>
          </Modal>
        </div>
      ) : token ? (
        <p className="meals-combos-hint" style={{ marginTop: 16 }}>
          Para repetir no calendário, cria pelo menos um <strong>cardápio</strong> no separador Cardápio (barra no topo das
          refeições).
        </p>
      ) : null}

      <button type="button" className="save-btn meals-recipe-save-btn" onClick={() => save()}>
        Salvar
      </button>

      {recipeId ? (
        <button type="button" className="ib" style={{ marginTop: 8, color: 'var(--rd)' }} onClick={removeRecipe}>
          Excluir receita
        </button>
      ) : null}
    </div>
  )
}
