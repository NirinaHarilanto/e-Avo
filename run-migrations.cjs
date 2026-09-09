// Exécute les fichiers de supabase/migrations/ dans l'ordre, une seule fois chacun
// (suivi dans une table schema_migrations). Lit la chaîne de connexion depuis la variable
// d'environnement DATABASE_URL — jamais stockée dans ce fichier ni committée.
//
// Usage : DATABASE_URL="postgresql://..." node run-migrations.cjs

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL manquante.')
    process.exit(1)
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()

  await client.query(`
    create table if not exists public.schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const dir = path.join(__dirname, 'supabase', 'migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  const { rows: applied } = await client.query('select id from public.schema_migrations')
  const appliedIds = new Set(applied.map((r) => r.id))

  for (const file of files) {
    if (appliedIds.has(file)) {
      console.log(`- ${file} (déjà appliquée)`)
      continue
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    console.log(`> Application de ${file}...`)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into public.schema_migrations (id) values ($1)', [file])
      await client.query('commit')
      console.log(`  ✓ ${file}`)
    } catch (error) {
      await client.query('rollback')
      console.error(`  ✗ ${file} :`, error.message)
      await client.end()
      process.exit(1)
    }
  }

  await client.end()
  console.log('Toutes les migrations sont à jour.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
