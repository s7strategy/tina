/**
 * Garante colunas corretas na tabela `events` (migrações antigas / coluna `time` reservada no PG).
 * Idempotente; pode ser chamado no arranque e antes de cada INSERT.
 */
const { many, query } = require('./db')

async function listEventColumns() {
  const rows = await many(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events'
    `,
  )
  return new Set(rows.map((r) => r.column_name))
}

async function ensureEventsTableReady() {
  let cols = await listEventColumns()
  if (cols.size === 0) return

  if (cols.has('time') && !cols.has('event_time')) {
    try {
      await query(`ALTER TABLE events RENAME COLUMN "time" TO event_time`)
    } catch (e) {
      console.error('[eventsSchema] RENAME time→event_time', e.message)
    }
    cols = await listEventColumns()
  }

  if (cols.has('time') && cols.has('event_time')) {
    try {
      await query(`UPDATE events SET event_time = "time"::text WHERE "time" IS NOT NULL`)
    } catch (e) {
      console.error('[eventsSchema] UPDATE copy time→event_time', e.message)
    }
    try {
      await query(`ALTER TABLE events DROP COLUMN IF EXISTS "time"`)
    } catch (e) {
      console.error('[eventsSchema] DROP time', e.message)
    }
    cols = await listEventColumns()
  }

  if (!cols.has('event_time')) {
    try {
      await query(`ALTER TABLE events ADD COLUMN event_time TEXT NOT NULL DEFAULT '09:00'`)
    } catch (e) {
      console.error('[eventsSchema] ADD event_time', e.message)
    }
    cols = await listEventColumns()
  }

  const extras = [
    ['event_date', 'ALTER TABLE events ADD COLUMN event_date TEXT'],
    ['recurrence_type', `ALTER TABLE events ADD COLUMN recurrence_type TEXT DEFAULT 'único'`],
    ['recurrence_days', 'ALTER TABLE events ADD COLUMN recurrence_days TEXT'],
    [
      'created_at',
      `ALTER TABLE events ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,
    ],
    [
      'updated_at',
      `ALTER TABLE events ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'`,
    ],
  ]
  for (const [name, sql] of extras) {
    if (!cols.has(name)) {
      try {
        await query(sql)
      } catch (e) {
        console.error(`[eventsSchema] ADD ${name}`, e.message)
      }
    }
  }

  try {
    await query(
      `UPDATE events SET updated_at = created_at WHERE updated_at = '1970-01-01T00:00:00.000Z' AND created_at IS NOT NULL AND created_at <> '1970-01-01T00:00:00.000Z'`,
    )
  } catch (e) {
    console.error('[eventsSchema] backfill updated_at from created_at', e.message)
  }
}

module.exports = { ensureEventsTableReady, listEventColumns }
