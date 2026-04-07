import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { api } from '../../../lib/api.js'
import Modal from '../../ui/Modal.jsx'
import { RecipeForm } from './RecipeForm.jsx'
import RecipeDetailModal from './RecipeDetailModal.jsx'
import GlobalRecipeCalendarModal from './GlobalRecipeCalendarModal.jsx'
import GlobalRecipeComboModal from './GlobalRecipeComboModal.jsx'
import { MEAL_CATEGORIES } from '../../../lib/mealCategories.js'
import { labelForRecipeTag } from '../../../lib/recipeTags.js'

export default function MealsRecipes({ token, members }) {
  const [list, setList] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilters, setCatFilters] = useState([])
  const [tagFilters, setTagFilters] = useState([])
  const [tagOptions, setTagOptions] = useState([])
  const [filterCatsOpen, setFilterCatsOpen] = useState(false)
  const [filterTagsOpen, setFilterTagsOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [detail, setDetail] = useState(null)
  /** Receita já importada (fork) para o fluxo “Adicionar ao calendário”. */
  const [calendarForkedRecipeId, setCalendarForkedRecipeId] = useState(null)
  /** Fork + meta para “Adicionar à combinação”. */
  const [comboFork, setComboFork] = useState(null)
  /** globalId → user recipe id (evita vários forks ao usar vários botões na mesma sessão). */
  const globalForkCacheRef = useRef(new Map())

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [r, c] = await Promise.all([
        api.listRecipes(token, {
          mealCategories: catFilters.length > 0 ? catFilters : undefined,
          q: search.trim() || undefined,
          tags: tagFilters.length > 0 ? tagFilters : undefined,
        }),
        api.listGlobalRecipes(token, {
          mealCategories: catFilters.length > 0 ? catFilters : undefined,
          q: search.trim() || undefined,
          tags: tagFilters.length > 0 ? tagFilters : undefined,
        }),
      ])
      setList(r.recipes || [])
      setCatalog(c.recipes || [])
    } catch {
      setList([])
      setCatalog([])
    } finally {
      setLoading(false)
    }
  }, [token, catFilters, tagFilters, search])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const r = await api.listRecipeTagOptions(token)
        setTagOptions(Array.isArray(r.tags) ? r.tags : [])
      } catch {
        setTagOptions([])
      }
    })()
  }, [token])

  useEffect(() => {
    const t = setTimeout(() => {
      load()
    }, 200)
    return () => clearTimeout(t)
  }, [load])

  const sections = useMemo(() => {
    const map = new Map(MEAL_CATEGORIES.map((c) => [c.id, []]))
    const uncategorized = []
    for (const r of list) {
      const cat = r.mealCategory
      if (cat && map.has(cat)) map.get(cat).push(r)
      else uncategorized.push(r)
    }
    const out = []
    for (const c of MEAL_CATEGORIES) {
      const items = map.get(c.id) || []
      if (items.length > 0) out.push({ key: c.id, title: c.label, items })
    }
    if (uncategorized.length > 0) {
      out.push({ key: '_other', title: 'Sem categoria', items: uncategorized })
    }
    return out
  }, [list])

  const catalogSections = useMemo(() => {
    const map = new Map(MEAL_CATEGORIES.map((c) => [c.id, []]))
    const uncategorized = []
    for (const r of catalog) {
      const cat = r.mealCategory
      if (cat && map.has(cat)) map.get(cat).push(r)
      else uncategorized.push(r)
    }
    const out = []
    for (const c of MEAL_CATEGORIES) {
      const items = map.get(c.id) || []
      if (items.length > 0) out.push({ key: `g-${c.id}`, title: c.label, items })
    }
    if (uncategorized.length > 0) {
      out.push({ key: 'g-_other', title: 'Sem categoria', items: uncategorized })
    }
    return out
  }, [catalog])

  function openNew() {
    setEditingId(null)
    setModal('edit')
  }

  function toggleCatFilter(id) {
    setCatFilters((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleTagFilter(slug) {
    setTagFilters((prev) => (prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]))
  }

  function clearRecipeFilters() {
    setCatFilters([])
    setTagFilters([])
  }

  const hasChipFilters = catFilters.length > 0 || tagFilters.length > 0

  async function ensureUserRecipeForGlobal(globalId) {
    const cached = globalForkCacheRef.current.get(globalId)
    if (cached) {
      try {
        const gr = await api.getRecipe(token, cached)
        return { userRecipeId: cached, recipe: gr.recipe }
      } catch {
        globalForkCacheRef.current.delete(globalId)
      }
    }
    const r = await api.forkGlobalRecipe(token, globalId)
    const newId = r.recipe?.id
    if (!newId) throw new Error('Não foi possível importar a receita.')
    globalForkCacheRef.current.set(globalId, newId)
    const gr = await api.getRecipe(token, newId)
    await load()
    return { userRecipeId: newId, recipe: gr.recipe }
  }

  return (
    <div className="meals-recipes">
      <section
        className="meals-surface meals-recipes-filter-card meals-recipes-filter-card--modern"
        aria-label="Buscar e filtrar receitas"
      >
        <div className="meals-recipes-filter-search-row">
          <label className="meals-recipes-filter-kicker" htmlFor="meals-recipes-q">
            Procurar
          </label>
          <div className="meals-recipes-filter-search-wrap">
            <span className="meals-recipes-filter-search-ic" aria-hidden>
              ⌕
            </span>
            <input
              id="meals-recipes-q"
              className="meals-recipes-filter-search"
              type="search"
              placeholder="Nome da receita…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              aria-label="Buscar receita por nome"
            />
          </div>
        </div>

        <div className="meals-recipes-filter-chips-head">
          <span className="meals-recipes-filter-chips-head-label">Filtrar por</span>
          {hasChipFilters ? (
            <button type="button" className="meals-recipes-filter-clear" onClick={clearRecipeFilters}>
              Limpar
            </button>
          ) : null}
        </div>

        <div className="meals-recipes-filter-panels">
          <div className="meals-filter-panel">
            <button
              type="button"
              className={`meals-filter-panel-trigger${filterCatsOpen ? ' is-open' : ''}`}
              onClick={() => setFilterCatsOpen((o) => !o)}
              aria-expanded={filterCatsOpen}
              aria-controls="meals-filter-cats-panel"
              id="meals-filter-cats-trigger"
            >
              <span className="meals-filter-panel-trigger-text">
                <span className="meals-filter-panel-trigger-title">Tipo de prato</span>
                {catFilters.length > 0 ? (
                  <span className="meals-filter-panel-trigger-meta">
                    {catFilters.length} {catFilters.length === 1 ? 'tipo' : 'tipos'}
                  </span>
                ) : (
                  <span className="meals-filter-panel-trigger-meta meals-filter-panel-trigger-meta--muted">
                    Toque para escolher
                  </span>
                )}
              </span>
              <span className="meals-filter-panel-trigger-chev" aria-hidden>
                {filterCatsOpen ? '▴' : '▾'}
              </span>
            </button>
            {filterCatsOpen ? (
              <div
                id="meals-filter-cats-panel"
                className="meals-filter-panel-body"
                role="group"
                aria-labelledby="meals-filter-cats-trigger"
              >
                <div className="meals-recipes-filter-chip-scroll">
                  {MEAL_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`meals-filter-chip${catFilters.includes(c.id) ? ' is-on' : ''}`}
                      onClick={() => toggleCatFilter(c.id)}
                      aria-pressed={catFilters.includes(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="meals-filter-panel">
            <button
              type="button"
              className={`meals-filter-panel-trigger${filterTagsOpen ? ' is-open' : ''}`}
              onClick={() => setFilterTagsOpen((o) => !o)}
              aria-expanded={filterTagsOpen}
              aria-controls="meals-filter-tags-panel"
              id="meals-filter-tags-trigger"
            >
              <span className="meals-filter-panel-trigger-text">
                <span className="meals-filter-panel-trigger-title">Etiquetas</span>
                {tagFilters.length > 0 ? (
                  <span className="meals-filter-panel-trigger-meta">
                    {tagFilters.length} {tagFilters.length === 1 ? 'etiqueta' : 'etiquetas'}
                  </span>
                ) : (
                  <span className="meals-filter-panel-trigger-meta meals-filter-panel-trigger-meta--muted">
                    Toque para escolher
                  </span>
                )}
              </span>
              <span className="meals-filter-panel-trigger-chev" aria-hidden>
                {filterTagsOpen ? '▴' : '▾'}
              </span>
            </button>
            {filterTagsOpen ? (
              <div
                id="meals-filter-tags-panel"
                className="meals-filter-panel-body"
                role="group"
                aria-labelledby="meals-filter-tags-trigger"
              >
                <div className="meals-recipes-filter-chip-scroll">
                  {tagOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`meals-filter-chip${tagFilters.includes(t) ? ' is-on' : ''}`}
                      onClick={() => toggleTagFilter(t)}
                      aria-pressed={tagFilters.includes(t)}
                    >
                      {labelForRecipeTag(t)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="meals-recipes-private-head">
        <h2 className="meals-recipes-section-heading">Receitas pessoais</h2>
        <button type="button" className="meals-primary-btn meals-btn--delicate meals-recipes-private-add-btn" onClick={openNew}>
          + Nova receita
        </button>
      </div>

      {loading ? <div className="feedback">A carregar…</div> : null}

      {!loading && list.length === 0 && catalogSections.length === 0 ? (
        <p className="meals-recipes-empty-hint">
          Nenhuma receita encontrada. Tente outro nome ou crie uma nova!
        </p>
      ) : null}

      {!loading && sections.map((sec) => (
        <section key={sec.key} className="meals-recipes-cat" aria-labelledby={`meals-recipes-cat-${sec.key}`}>
          <h2 id={`meals-recipes-cat-${sec.key}`} className="meals-recipes-cat-title">
            {sec.title}
          </h2>
          <div className="meals-recipes-cat-scroll" role="region" aria-label={`Receitas: ${sec.title}`}>
            <div className="meals-recipes-cat-grid">
              {sec.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="meals-recipe-tile meals-recipe-tile--cat"
                  onClick={() => setDetail({ kind: 'user', id: r.id })}
                >
                  <div className="meals-recipe-tile-inner meals-recipe-tile-inner--text">
                    <div className="meals-recipe-tile-text">
                      <div className="meals-recipe-tile-name">{r.name}</div>
                      <div className="meals-recipe-tile-meta">{r.mode === 'advanced' ? 'Com ingredientes' : 'Simples'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}

      {!loading && catalogSections.length > 0 ? (
        <div className="meals-catalog-block" aria-labelledby="meals-catalog-title">
          <h2 id="meals-catalog-title" className="meals-recipes-section-heading">
            Receitas Tina
          </h2>
          {catalogSections.map((sec) => (
            <section
              key={sec.key}
              className="meals-recipes-cat meals-recipes-cat--catalog"
              aria-labelledby={`meals-catalog-sub-${sec.key}`}
            >
              <h3 id={`meals-catalog-sub-${sec.key}`} className="meals-recipes-cat-title">
                {sec.title}
              </h3>
              <div className="meals-recipes-cat-scroll" role="region" aria-label={`Receitas Tina: ${sec.title}`}>
                <div className="meals-recipes-cat-grid">
                  {sec.items.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="meals-recipe-tile meals-recipe-tile--cat meals-recipe-tile--global"
                      onClick={() => setDetail({ kind: 'global', id: r.id })}
                    >
                      <div className="meals-recipe-tile-inner meals-recipe-tile-inner--text">
                        <div className="meals-recipe-tile-text">
                          <div className="meals-recipe-tile-name">{r.name}</div>
                          <div className="meals-recipe-tile-meta">Pré-carregada</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null}

      <Modal
        isOpen={modal === 'edit'}
        id="modal-recipe"
        onClose={() => {
          setModal(null)
          setEditingId(null)
        }}
        title={editingId ? 'Editar receita' : 'Nova receita'}
      >
        <RecipeForm
          token={token}
          recipeId={editingId}
          members={members}
          onSaved={(newId) => {
            load()
            if (newId) setEditingId(newId)
            else {
              setModal(null)
              setEditingId(null)
            }
          }}
        />
      </Modal>

      <Modal
        isOpen={Boolean(detail)}
        id="modal-recipe-detail"
        onClose={() => setDetail(null)}
        title="Receita"
      >
        {detail ? (
          <RecipeDetailModal
            token={token}
            mode={detail.kind}
            recipeId={detail.kind === 'user' ? detail.id : null}
            globalId={detail.kind === 'global' ? detail.id : null}
            onClose={() => setDetail(null)}
            onEdit={(id) => {
              setDetail(null)
              setEditingId(id)
              setModal('edit')
            }}
            onPersonalizeGlobal={async (gid) => {
              try {
                const { userRecipeId } = await ensureUserRecipeForGlobal(gid)
                setDetail(null)
                setEditingId(userRecipeId)
                setModal('edit')
              } catch (e) {
                window.alert(e?.message || 'Erro ao importar receita.')
              }
            }}
            onAddToCalendar={async (gid) => {
              try {
                const { userRecipeId } = await ensureUserRecipeForGlobal(gid)
                setDetail(null)
                setCalendarForkedRecipeId(userRecipeId)
              } catch (e) {
                window.alert(e?.message || 'Erro ao importar receita.')
              }
            }}
            onAddToCombination={async (gid) => {
              try {
                const { userRecipeId, recipe } = await ensureUserRecipeForGlobal(gid)
                setDetail(null)
                setComboFork({
                  userRecipeId,
                  mealCategory: recipe?.mealCategory || '',
                  recipeName: recipe?.name || '',
                })
              } catch (e) {
                window.alert(e?.message || 'Erro ao importar receita.')
              }
            }}
          />
        ) : null}
      </Modal>

      {calendarForkedRecipeId ? (
        <GlobalRecipeCalendarModal
          token={token}
          recipeId={calendarForkedRecipeId}
          onClose={() => setCalendarForkedRecipeId(null)}
          onDone={() => load()}
        />
      ) : null}

      {comboFork ? (
        <GlobalRecipeComboModal
          token={token}
          userRecipeId={comboFork.userRecipeId}
          mealCategory={comboFork.mealCategory}
          recipeName={comboFork.recipeName}
          onClose={() => setComboFork(null)}
          onDone={() => {
            setComboFork(null)
            load()
          }}
        />
      ) : null}
    </div>
  )
}
