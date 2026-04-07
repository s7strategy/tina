#!/usr/bin/env node
/**
 * Atualiza `categoria` em receitas_tina_completo.json com códigos da taxonomia Tina
 * (protein, protein_carb, legumes, …). Depois correr migrate / seed ebook no deploy.
 */
const fs = require('fs')
const path = require('path')

const CLASSIFICACAO_RAW = `
Abóbora Cremosa com Carne Seca — protein_carb
Abobrinha com Molho Branco Especial — legumes
Abobrinha Refogada — legumes
Acém de Panela com Cenoura e Azeitonas — protein
Acém na Cerveja Preta — protein
Aipim com Calabresa ao Forno — protein_carb
Aipim cozido — carb
Arroz à Carbonara — protein_carb
Arroz ao Forno — carb
Arroz branco — carb
Arroz branco (base) — carb
Arroz integral — carb
Banana Empanada — doces
Batata com Repolho Gratinado — legumes
Batata cozida — carb
Batata doce em tiras — carb
Bife a Rolê ao Molho de Creme de Cumbaru — protein
Bife acebolado — protein
Bife de Marinheiro — protein
Bifes Recheados Especiais — protein
Bobó de Camarão — protein_carb
Bolinho de Cenoura — legumes
Bolinho de Chuva de Laranja — doces
Bolo Coberto com Banana Caramelada — doces
Bolo de Abacaxi — doces
Bolo de Abacaxi com Coco — doces
Bolo de Abacaxi com Creme — doces
Bolo de Banana — doces
Bolo de Banana com Chocolate — doces
Bolo de Banana Prata — doces
Bolo de Cenoura com Canela — doces
Bolo de Cenoura com Pudim de Chocolate — doces
Bolo de Cenoura com Suco de Laranja — doces
Bolo de Chocolate com Morango e Coco — doces
Bolo de Goiaba com Banana — doces
Bolo de Iogurte — doces
Bolo de Laranja — doces
Bolo de Laranja com Calda — doces
Bolo de Laranja com Chocolate — doces
Bolo de Limão — doces
Bolo de Maçã — doces
Bolo de Morango — doces
Bolo de Morango com Chantili — doces
Bolo Gelado — doces
Bolo Gelado de Abacaxi — doces
Bolo integral de banana e maça — doces
Bolo Prático de Aipim — doces
Brigadeirão — doces
Brócolis com alho — legumes
Caldo Verde — sopa
Capa de Contrafilé Grelhado com Creme de Pequi — protein
Caponata Italiana — molhos
Carne acebolada — protein
Carne de Onça — protein
Carne de panela — protein
Carne de panela com batata — protein_carb
Carne de Panela com Limão — protein
Carne de Panela da Vovó — protein
Carne Moída com Legumes — protein
Carne moída refogada — protein
Cenoura com manteiga — legumes
Cenoura cozida — legumes
Charuto de Repolho — protein
Charuto Gratinado — legumes
Compota de Pêssego — doces
Contra-filé ao Molho de Iogurte — protein
Costela Recheada com Purê de Mandioca — protein_carb
Costelinha Assada com Aipim — protein_carb
Couve com carne moída — legumes
Couve com carne moída e abóbora — legumes
Couve com carne moída e ovo — legumes
Couve com ovo — legumes
Couve Flor Gratinada — legumes
Coxa e sobrecoxa assada com creme de alho e batatas — protein_carb
Cozido Brasileiro — protein_carb
Creme de Milho — sopa
Creme Nevado de Abacaxi — doces
Crepioca — lanche
Croquete de Aipim — carb
Cupim com Rapadura e Queijo Coalho — protein_carb
Delicioso Bolo de Cenoura (Tipo Cup Cake) — doces
Drink antioxidante - sem álcool — bebida
Escondidinho de Carne Seca com Banana da Terra — protein_carb
Escondidinho de Carne Seca e Abóbora — protein_carb
Escondidinho de Morango — doces
Espetinhos de Filé e Legumes — protein
Farofa de Domingo — carb
Farofa de Legumes com Bacon — protein_carb
Farofa de Miúdos — protein_carb
Feijão com linguiça — protein_carb
Feijão cozido (base) — leguminosas
Feijão preto — carb
Feijão Tropeiro do Bom — protein_carb
Filé de Frango a Rolê com Cenoura, Bacon e Pimentão Amarelo — protein
Filé Mignon ao Molho Mostarda — protein
Filé Mignon da Xá Ica — protein
Filés com Molho de Ameixas — protein
Flã de Limão — doces
Fondant de Laranja — doces
Frango à Passarinho — protein
Frango à Pizzaiolo — protein
Frango ao molho — protein
Frango com Laranja — protein
Frango desfiado — protein
Frango ensopado — protein
Frango Ensopado — protein
Frango Escondidinho — protein_carb
Frango grelhado — protein
Frango Indiano — protein
Frango no Vinho e Alecrim — protein
Frango Zás-Trás — protein
Gelado de Abacaxi Cremoso — doces
Granola de frigideira — lanche
Gratinado de Abóbora e Frango — protein_carb
Gratinado de Chuchu com Queijo e Presunto — legumes
Gratinado de Legumes — legumes
Gratinado de Repolho — legumes
Guisado à Moda Cuiabana — protein
Hambúrguer com Tomate — protein_carb
Hambúrguer Nutritivo — protein_carb
Iogurte funcional anti-ansiedade — lanche
Jardineira de Frango — protein_carb
Lanche leve (base) — lanche
Lasanha de Abobrinha a Milanesa — legumes
Lasanha de Cenoura — legumes
Legumes assados — legumes
Lombo Dourado com Abacaxi — protein
Macarrão à carbonara — protein_carb
Macarrão alho e óleo — carb
Macarrão ao sugo — carb
Macarrão bolonhesa — protein_carb
Macarrão com almôndega — protein_carb
Macarrão com manteiga — carb
Maminha ao Avesso Recheada com Farofa de Banana da Terra — protein_carb
Maminha Fria ao Molho de Tomate — protein
Massa de pizza sem carboidrato — carb
Milanesa de Costela com Molho de Jabuticaba e Creme de Mandioquinha — protein_carb
Molho de Abacate e Limão — molhos
Molho de Iogurte com Ervas — molhos
Molho de Mostarda e Mel — molhos
Molho de Tahine e Limão — molhos
Molho para saladas de Iogurte — molhos
Molho para saladas de manjericão e cottage — molhos
Molho para saladas de mostarda — molhos
Molho Vinaigrette Balsâmico — molhos
Mousse de abacate com cacau — doces
Músculo à Brasileira com Purê de Mandioca — protein_carb
Nhoque de Aipim — carb
Omelete colorido — legumes
Omelete com queijo — lanche
Omelete de ricota e espinafre — legumes
Omelete Vinagrete — legumes
Ossobuco com Polenta Mole — protein_carb
Ovo mexido — lanche
Ovos mexidos cremosos — lanche
Ovos preparados (base) — lanche
Paleta na Pressão — protein
Panqueca — carb
Panqueca de banana — lanche
Panqueca de cacau e frutas vermelhas — lanche
Pão de abóbora — lanche
Pão de queijo de frigideira — lanche
Pão Rápido — lanche
Pão sem Glúten — lanche
Patê de frango cremoso — protein
Patinho na Cerveja com Brócolis — protein
Pavê de Chocolate com Maracujá — doces
Pavê de Limão — doces
Picanha Recheada — protein
Pipoca Fitness de microondas — lanche
Pizza à Portuguesa — protein_carb
Pizza de Liquidificador — carb
Polenta — carb
Pudim de Banana — doces
Pudim de Milho Verde — doces
Pudim de Pão Rápido — doces
Purê de batata — carb
Quibebe (Purê de Abóbora) — legumes
Quindão — doces
Rabada com Polenta — protein_carb
Ragu de Acém com Purê de Abóbora — protein_carb
Refogado de legumes (base) — legumes
Rocambole de Carne Moída — protein
Rocambole de Frango Recheado — protein
Sal temperado — molhos
Salada Caesar Light com Frango Grelhado — protein
Salada Califórnia com Pepino, Manga, Kani Kama e Molho Tare — salada
Salada com Salmão Defumado e Shoyo — protein
Salada de abacate (tipo guacamole) — salada
Salada de Abacate com Camarões — protein
Salada de Abacate com Tomate e Cebola — salada
Salada de alface e tomate — salada
Salada de Atum com Feijão Verde — protein
Salada de Carne — protein
Salada de Couve com Maçã e Nozes — salada
Salada de Espinafre com Frango Grelhado — protein
Salada de Frango com Abacaxi — protein
Salada de Frutas com Calda — doces
Salada de Frutas com Iogurte e Aveia — doces
Salada de Grãos com Tofu — legumes
Salada de Quinoa com Legumes Assados — legumes
Salada Maromba — protein
Salada Mediterrânea de Grão-de-Bico — legumes
Salada Mista — salada
Salada simples completa — salada
Salada verde (base) — salada
Salpicão Especial — protein
Saltimboca na Pressão — protein
Sorvetão de Whey Protein — doces
Strogonoff de Carne — protein
Suco de fruta (base) — bebida
Suco de Milho Verde — bebida
Suco para desinchar — bebida
Suco rejuvenescedor — bebida
Sufê de Cenouras — legumes
Sufê de Legumes — legumes
Sufê de Repolho e Cenoura — legumes
Torta Cremosa de Banana — doces
Torta Cremosa de Repolho — legumes
Torta de Abóbora no Liquidificador — legumes
Torta de Abobrinha — legumes
Torta de Banana — doces
Torta de Banana com Pão — doces
Torta de Banana Fácil — doces
Torta de Chocolate com Pera — doces
Torta de Chuchu — legumes
Torta de Manga Simples — doces
Torta de Milho e Queijo Fresco — legumes
Torta Gelada de Banana — doces
Torta Salgada de Cenoura — legumes
Torta Salgada de Liquidificador — carb
Torta Sensação Maravilhosa — doces
Tortinhas de Pera e Especiarias — doces
Tutu de Feijão — carb
Vinagrete — salada
Waffle proteico — lanche
Wrap Fácil de Frango com molho caesar — protein_carb
Yakissoba de Carne — protein_carb
`

function parseClassificacao() {
  const map = {}
  for (const line of CLASSIFICACAO_RAW.trim().split('\n')) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(/\s+—\s+/)
    if (parts.length < 2) {
      console.warn('Linha ignorada (sem separador —):', t)
      continue
    }
    const code = parts.pop().trim()
    const nome = parts.join(' — ').trim()
    map[nome] = code
  }
  return map
}

const CLASSIFICACAO = parseClassificacao()

const dataPath = path.join(__dirname, '../data/receitas_tina_completo.json')
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
const receitas = data.receitas || []

let updated = 0
let missing = []
const nomesNoJson = new Set(receitas.map((r) => String(r.nome || '').trim()).filter(Boolean))

for (const r of receitas) {
  const nome = String(r.nome || '').trim()
  const code = CLASSIFICACAO[nome]
  if (!code) continue
  r.categoria = code
  updated += 1
}

for (const nome of Object.keys(CLASSIFICACAO)) {
  if (!nomesNoJson.has(nome)) missing.push(nome)
}

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`)
console.log('Receitas atualizadas:', updated, '/', receitas.length)
console.log('Entradas no mapa sem match no JSON:', missing.length)
if (missing.length) console.log(missing.join('\n'))
