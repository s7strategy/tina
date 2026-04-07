/**
 * Converte ingrediente do JSON do ebook para o formato recipe_ingredients (unidades do app).
 */
function mapGlobalIngredient(ing) {
  if (!ing || typeof ing !== 'object') return null
  const nome = String(ing.nome || ing.name || '').trim()
  if (!nome) return null
  let qty = Number(ing.quantidade != null ? ing.quantidade : ing.quantity)
  if (!Number.isFinite(qty)) qty = 0
  const u = String(ing.unidade || ing.unit || '').toLowerCase().trim()

  let quantity = String(qty)
  let unit = ''

  if (u === 'kg' || u === 'g' || u === 'ml') {
    unit = u
  } else if (u === 'l' || u === 'litro' || u === 'litros') {
    unit = 'ml'
    quantity = String(Math.round(qty * 1000 * 1000) / 1000)
  } else if (u === 'un' || u === 'unidade' || u === 'xicara' || u === 'xícara') {
    unit = ''
    quantity = qty > 0 ? String(qty) : ''
  } else if (u === 'colher_sopa' || u === 'cs') {
    unit = 'cs'
  } else if (u === 'colher_cha' || u === 'colher_chá' || u === 'cc') {
    unit = 'cc'
  } else if (u === 'a_gosto' || u === 'pitada') {
    quantity = ''
    unit = ''
  } else {
    quantity = qty > 0 ? String(qty) : ''
    unit = ''
  }

  return { name: nome, quantity, unit }
}

module.exports = { mapGlobalIngredient }
