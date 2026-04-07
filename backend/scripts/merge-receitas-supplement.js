#!/usr/bin/env node
/**
 * Junta ficheiros JSON { "receitas": [...] } em receitas_tina_completo.json
 * Uso: node backend/scripts/merge-receitas-supplement.js [nome-ficheiro.json ...]
 * Sem args: receitas_supplemento_proteinas.json (comportamento antigo).
 * Caminhos relativos resolvem em backend/data/. Ignora receitas cujo nome já existe.
 */
const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, '../data')
const mainPath = path.join(dir, 'receitas_tina_completo.json')
let files = process.argv.slice(2).map((f) =>
  path.isAbsolute(f) ? f : path.join(dir, f)
)
if (files.length === 0) {
  files = [path.join(dir, 'receitas_supplemento_proteinas.json')]
}
if (!fs.existsSync(mainPath)) {
  console.error('Falta:', mainPath)
  process.exit(1)
}
for (const supPath of files) {
  if (!fs.existsSync(supPath)) {
    console.error('Falta:', supPath)
    process.exit(1)
  }
}
const main = JSON.parse(fs.readFileSync(mainPath, 'utf8'))
const seen = new Set(main.receitas.map((r) => r.nome))
const before = main.receitas.length
let added = 0
for (const supPath of files) {
  const extra = JSON.parse(fs.readFileSync(supPath, 'utf8'))
  if (!Array.isArray(extra.receitas)) {
    console.error(supPath, 'precisa de { "receitas": [...] }')
    process.exit(1)
  }
  for (const r of extra.receitas) {
    if (seen.has(r.nome)) {
      console.warn('Ignorado (duplicado):', r.nome)
      continue
    }
    seen.add(r.nome)
    main.receitas.push(r)
    added++
  }
}
fs.writeFileSync(mainPath, JSON.stringify(main, null, 2))
console.log('OK: +', added, 'receitas. Total:', main.receitas.length, '(antes', before + ')')
