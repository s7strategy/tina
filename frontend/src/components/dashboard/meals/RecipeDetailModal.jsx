import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../lib/api.js'
import { mealCategoryLabel } from '../../../lib/mealCategories.js'
import { labelForRecipeTag } from '../../../lib/recipeTags.js'
import {
  formatFamilyCookAmount,
  formatFamilyTotalPlateGrams,
  formatRecipeLineAmount,
  mealCategoryUsesFixedRecipeYield,
  tryParseQty,
} from './recipeAmountFormat.js'
import { FAMILY_INGREDIENT_SCALE_MARGIN, kgPerPerson, normalizeIngredientRow } from './recipeScaling.js'

const RECIPE_BASE_KG = 1

export default function RecipeDetailModal({
  token,
  mode,
  recipeId,
  globalId,
  onClose,
  onEdit,
  onPersonalizeGlobal,
  onAddToCalendar,
  onAddToCombination,
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  /** Só para receitas globas: porções da conta (se ativas), para estimar “cozinhar” na pré-visualização. */
  const [familyPreview, setFamilyPreview] = useState(null)

  useEffect(() => {
    if (!token || mode !== 'global' || !globalId) {
      setFamilyPreview(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.getFamilyPortions(token)
        if (!cancelled) setFamilyPreview(r)
      } catch {
        if (!cancelled) setFamilyPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, mode, globalId])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      setLoading(true)
      try {
        if (mode === 'global' && globalId) {
          const r = await api.getGlobalRecipe(token, globalId)
          setData({ kind: 'global', recipe: r.recipe })
        } else if (mode === 'user' && recipeId) {
          const r = await api.getRecipe(token, recipeId)
          setData({ kind: 'user', recipe: r.recipe })
        } else {
          setData(null)
        }
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [token, mode, recipeId, globalId])

  const rec = data?.recipe

  const effectiveMemberServings = useMemo(() => {
    if (!rec || !data) return []
    if (data.kind === 'user' && rec.memberServings?.length) return rec.memberServings
    if (data.kind === 'global' && familyPreview?.autoActive) {
      const spoons = familyPreview.memberSpoons && typeof familyPreview.memberSpoons === 'object' ? familyPreview.memberSpoons : {}
      const rows = []
      for (const v of Object.values(spoons)) {
        const s = Number(v)
        rows.push({ servings: Number.isFinite(s) && s > 0 ? s : 4, amountUnit: 'cs' })
      }
      if (rows.length > 0) return rows
    }
    return []
  }, [data, rec, familyPreview])

  const totalKgFamily = useMemo(() => {
    let sum = 0
    for (const m of effectiveMemberServings) {
      sum += kgPerPerson(m.servings, m.amountUnit)
    }
    return sum
  }, [effectiveMemberServings])

  const fixedRecipeYield = mealCategoryUsesFixedRecipeYield(rec?.mealCategory)

  const ingredientScale = useMemo(() => {
    if (fixedRecipeYield) return 1
    if (totalKgFamily > 0) return (totalKgFamily / RECIPE_BASE_KG) * FAMILY_INGREDIENT_SCALE_MARGIN
    return 1
  }, [fixedRecipeYield, totalKgFamily])

  const showFamilyCook = Boolean(
    rec &&
      (rec.mode === 'advanced' || data?.kind === 'global') &&
      !fixedRecipeYield &&
      totalKgFamily > 0,
  )

  const normalizedIngredients = useMemo(() => {
    if (!rec?.ingredients?.length) return []
    const raw = rec.ingredients
    return raw.map((x) => normalizeIngredientRow(x)).filter(Boolean)
  }, [rec])

  if (loading) {
    return <div className="feedback">A carregar…</div>
  }
  if (!rec) {
    return <div className="feedback error">Receita não encontrada.</div>
  }

  const isGlobal = data.kind === 'global'
  const isAdvanced = rec.mode === 'advanced' || isGlobal

  return (
    <div className="meals-recipe-detail">
      <h3 className="meals-recipe-detail-title">{rec.name}</h3>
      {rec.mealCategory ? (
        <p className="meals-recipe-detail-cat">{mealCategoryLabel(rec.mealCategory)}</p>
      ) : null}

      {Array.isArray(rec.tags) && rec.tags.length > 0 ? (
        <div className="meals-recipe-detail-tags" role="list" aria-label="Etiquetas">
          {rec.tags.map((t) => (
            <span key={t} className="meals-recipe-detail-tag" role="listitem">
              {labelForRecipeTag(t)}
            </span>
          ))}
        </div>
      ) : null}

      {isGlobal ? (
        <p className="meals-recipe-plan-hint" style={{ marginBottom: 12 }}>
          Receita Tina — usa os botões em baixo para ajustar quantidades, planear refeições ou combinar com outras receitas.
        </p>
      ) : null}

      {fixedRecipeYield && isAdvanced ? (
        <p className="meals-recipe-detail-yield-note">
          Esta categoria é <strong>receita inteira</strong> (doces, bebidas/sucos ou molhos): não escala por pessoa — faz
          sentido um bolo, uma jarra de suco ou um pote de molho para a família ir consumindo.
        </p>
      ) : null}

      {normalizedIngredients.length > 0 ? (
        <section className="meals-recipe-detail-sec">
          <div className="form-label">Ingredientes</div>
          <p className="meals-recipe-detail-ing-lead">
            {!isAdvanced
              ? 'Lista de ingredientes.'
              : fixedRecipeYield
                ? 'Quantidades para a receita completa (doces, bebidas ou molhos — não multiplicamos por pessoa).'
                : 'Na receita, cada linha é a referência para 1 kg de prato; em verde, quanto preparar para a sua família.'}
          </p>
          <ul className="meals-recipe-detail-ing">
            {normalizedIngredients.map((ing, i) => {
              const rawUnit = String(ing.unit || '').trim()
              const qRaw = tryParseQty(ing.quantity)
              const scaledNum =
                qRaw != null && Number.isFinite(qRaw) && isAdvanced ? qRaw * ingredientScale : null
              const recipeLine =
                qRaw != null && Number.isFinite(qRaw) ? formatRecipeLineAmount(qRaw, rawUnit) : null
              const cookLabel =
                showFamilyCook && scaledNum != null && Number.isFinite(scaledNum)
                  ? formatFamilyCookAmount(scaledNum, rawUnit)
                  : null
              return (
                <li key={i} className="meals-recipe-detail-ing-card">
                  <div className="meals-recipe-detail-ing-top">
                    <span className="meals-recipe-detail-ing-name">{ing.name}</span>
                    {recipeLine ? (
                      <span className="meals-recipe-detail-ing-base" title="Quantidade na receita de referência">
                        {recipeLine}
                      </span>
                    ) : (
                      <span className="meals-recipe-detail-ing-base meals-recipe-detail-ing-base--muted">
                        {ing.quantity ? `${ing.quantity} ${rawUnit}`.trim() : '—'}
                      </span>
                    )}
                  </div>
                  {cookLabel ? (
                    <div className="meals-recipe-detail-ing-cook">
                      <span className="meals-recipe-detail-ing-cook-k">Cozinhar</span>
                      <span className="meals-recipe-detail-ing-cook-val">{cookLabel}</span>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {showFamilyCook ? (
            <p className="meals-recipe-detail-plate-total">
              Total de prato estimado para a família:{' '}
              <strong>{formatFamilyTotalPlateGrams(totalKgFamily)}</strong>
              <span className="meals-recipe-detail-margin-note">
                {' '}
                · As quantidades em verde incluem folga (~
                {Math.round((FAMILY_INGREDIENT_SCALE_MARGIN - 1) * 100)}%) para sobrar um pouco.
              </span>
            </p>
          ) : null}
        </section>
      ) : null}

      {(rec.preparationSteps?.length || rec.steps?.length) ? (
        <section className="meals-recipe-detail-sec">
          <div className="form-label">Como fazer</div>
          <ol className="meals-recipe-detail-steps">
            {(rec.preparationSteps || rec.steps || []).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="meals-recipe-detail-actions">
        {!isGlobal && onEdit ? (
          <button type="button" className="save-btn" onClick={() => onEdit(recipeId)}>
            Editar receita
          </button>
        ) : null}
        {isGlobal && onPersonalizeGlobal ? (
          <button type="button" className="meals-primary-btn" style={{ width: '100%' }} onClick={() => onPersonalizeGlobal(globalId)}>
            Personalizar quantidade
          </button>
        ) : null}
        {isGlobal && onAddToCalendar ? (
          <button type="button" className="meals-primary-btn" style={{ width: '100%' }} onClick={() => onAddToCalendar(globalId)}>
            Adicionar ao calendário
          </button>
        ) : null}
        {isGlobal && onAddToCombination ? (
          <button type="button" className="meals-primary-btn" style={{ width: '100%' }} onClick={() => onAddToCombination(globalId)}>
            Adicionar à combinação
          </button>
        ) : null}
        <button type="button" className="ib" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
