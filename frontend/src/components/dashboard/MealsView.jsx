export default function MealsView({ workspace, openModal }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {workspace.meals.map((meal) => (
          <div className="ml" style={meal.today ? { border: '2px solid var(--mae)' } : undefined} key={meal.id}>
            <div className="ml-d" style={meal.today ? { color: 'var(--mae)' } : undefined}>{meal.day}</div>
            <div className="ml-i">{meal.icon}</div>
            <div className="ml-n">{meal.name}</div>
            {meal.shopping && <div className="ml-m">🛒 {meal.shopping}</div>}
          </div>
        ))}
        <div className="ml" style={{ border: '1.5px dashed var(--bd)' }}>
          <div className="ml-d">🛒 Lista</div>
          <div className="ml-i">📝</div>
          <div className="ml-n" style={{ color: 'var(--sof)' }}>{workspace.shoppingListCount} itens</div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 3 }}>
        <button className="ib" onClick={() => openModal('meal')} aria-label="Adicionar refeição">➕ Adicionar refeição</button>
      </div>
    </>
  )
}
