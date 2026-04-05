export default function RewardsView({ workspace, openModal, setRewardDraft }) {
  return workspace.rewards.map((tier) => (
    <div className="card" key={tier.id}>
      <div className="card-t" style={{ color: tier.color }}>
        {tier.label} (⭐{tier.cost})
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          <button className="ib" onClick={() => { setRewardDraft({ tierId: tier.id, value: '' }); openModal('reward') }} aria-label="Criar recompensa">
            ➕ Criar
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {tier.items.map((item) => (
          <div className="rw" key={`${tier.id}-${item}`}>
            <div className="rw-i">{item.split(' ')[0]}</div>
            <div className="rw-n">{item.slice(2)}</div>
            <div className="rw-c" style={{ color: tier.color }}>⭐{tier.cost}</div>
          </div>
        ))}
        <button className="rw rw-add" onClick={() => { setRewardDraft({ tierId: tier.id, value: '' }); openModal('reward') }} aria-label="Criar recompensa">
          <div style={{ fontSize: '1.2em', color: 'var(--t3)' }}>➕</div>
          <div className="rw-n" style={{ color: 'var(--t3)' }}>Criar</div>
        </button>
      </div>
    </div>
  ))
}
