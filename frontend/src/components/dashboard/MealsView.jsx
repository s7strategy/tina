import { useMemo, useState } from 'react'
import { ChevronDown, Lightbulb, ShoppingCart } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import Modal from '../ui/Modal.jsx'
import MealsPlanner from './meals/MealsPlanner.jsx'
import MealsRecipes from './meals/MealsRecipes.jsx'
import MealsCombinations from './meals/MealsCombinations.jsx'
import MealsShopping from './meals/MealsShopping.jsx'

export default function MealsView({ workspace }) {
  const { session } = useAuth()
  const token = session?.token
  const [seg, setSeg] = useState('planner') // planner | recipes | combinations
  /** Só muda quando ids/nomes de perfis não-gestor mudam — evita re-renders em cascata a cada tick do timer. */
  const peopleMetaKey = useMemo(() => {
    const profs = workspace?.profiles
    if (!profs) return ''
    return Object.values(profs)
      .filter((p) => p.key !== 'gestor')
      .map((p) => `${p.id}:${p.name}`)
      .sort()
      .join('|')
  }, [workspace?.profiles])
  const membersStable = useMemo(() => {
    const profs = workspace?.profiles
    if (!profs) return []
    return Object.values(profs).filter((p) => p.key !== 'gestor')
  }, [peopleMetaKey])
  const [plannerWeekOffset, setPlannerWeekOffset] = useState(0)
  const [shoppingOpen, setShoppingOpen] = useState(false)
  const [mealsTipOpen, setMealsTipOpen] = useState(false)

  const showMealsTopTip = seg === 'planner' || seg === 'recipes'

  return (
    <div className="meals-shell">
      <div className="meals-view-toolbar">
        <button
          type="button"
          className="meals-shopping-cta"
          onClick={() => setShoppingOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={shoppingOpen}
        >
          <ShoppingCart size={18} strokeWidth={2.25} aria-hidden />
          Lista de compras
        </button>
        <div className="meals-seg-inner meals-seg-inner--toolbar" role="tablist" aria-label="Secções de refeições">
          {[
            { k: 'planner', l: 'Cardápio' },
            { k: 'recipes', l: 'Receitas' },
            { k: 'combinations', l: 'Pratos' },
          ].map((s) => (
            <button
              key={s.k}
              type="button"
              role="tab"
              aria-selected={seg === s.k}
              className={seg === s.k ? 'on' : ''}
              onClick={() => setSeg(s.k)}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {showMealsTopTip ? (
        <div className="meals-tip-only">
          <button
            type="button"
            className={`mobile-more-tip-trigger${mealsTipOpen ? ' is-open' : ''}`}
            onClick={() => setMealsTipOpen((o) => !o)}
            aria-expanded={mealsTipOpen}
            aria-controls="meals-tip-panel"
            id="meals-tip-btn"
          >
            <Lightbulb size={16} strokeWidth={2.25} className="mobile-more-tip-trigger-ic" aria-hidden />
            <span className="mobile-more-tip-trigger-txt">Dica</span>
            <ChevronDown size={18} strokeWidth={2.25} className="mobile-more-tip-chevron" aria-hidden />
          </button>
          {mealsTipOpen ? (
            <div id="meals-tip-panel" role="region" aria-labelledby="meals-tip-btn" className="mobile-more-tip-panel">
              <p>
                Planeje o calendário, use o <strong>modo automático</strong> no Cardápio para preencher o mês (porções e
                lista de compras opcionais), e guarde receitas à medida da sua família.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!token ? (
        <div className="feedback error">Sessão inválida.</div>
      ) : (
        <>
          {seg === 'planner' ? (
            <MealsPlanner
              token={token}
              members={membersStable}
              weekOffset={plannerWeekOffset}
              onWeekOffsetChange={setPlannerWeekOffset}
            />
          ) : null}
          {seg === 'recipes' ? <MealsRecipes token={token} members={membersStable} /> : null}
          {seg === 'combinations' ? <MealsCombinations token={token} /> : null}
        </>
      )}

      <Modal
        isOpen={shoppingOpen}
        id="modal-meals-shopping"
        onClose={() => setShoppingOpen(false)}
        title="Lista de compras"
      >
        <MealsShopping token={token} embedded />
      </Modal>
    </div>
  )
}
