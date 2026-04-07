import { Hand, Sparkles } from 'lucide-react'

/**
 * Escolha inicial: manual vs automático (antes do calendário e do dia).
 */
export default function PlannerModeGate({ onChooseManual, onChooseAuto }) {
  return (
    <div className="meals-planner-gate" aria-labelledby="meals-planner-gate-title">
      <div className="meals-planner-gate-head">
        <h2 id="meals-planner-gate-title" className="meals-planner-gate-title">
          Como quer planear?
        </h2>
        <p className="meals-planner-gate-sub">
          Escolha um modo para continuar. Pode mudar mais tarde quando quiser.
        </p>
      </div>
      <div className="meals-planner-gate-grid">
        <button type="button" className="meals-planner-gate-card meals-planner-gate-card--manual" onClick={onChooseManual}>
          <span className="meals-planner-gate-card-icon" aria-hidden>
            <Hand size={28} strokeWidth={1.75} />
          </span>
          <span className="meals-planner-gate-card-title">Modo manual</span>
          <span className="meals-planner-gate-card-desc">
            Monte dia a dia: toque no calendário, escolha receitas ou nomes livres, e organize ao seu ritmo.
          </span>
        </button>
        <button type="button" className="meals-planner-gate-card meals-planner-gate-card--auto" onClick={onChooseAuto}>
          <span className="meals-planner-gate-card-icon" aria-hidden>
            <Sparkles size={28} strokeWidth={1.75} />
          </span>
          <span className="meals-planner-gate-card-title">Modo automático</span>
          <span className="meals-planner-gate-card-desc">
            A Tina sugere combinações para o mês inteiro a partir dos seus cardápios. Depois pode ajustar cada dia à mão:
            trocar receita, tipo de refeição ou pedir outra sugestão aleatória do catálogo.
          </span>
        </button>
      </div>
    </div>
  )
}
