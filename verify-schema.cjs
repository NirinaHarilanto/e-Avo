const { Client } = require('pg')

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  const { rows: tables } = await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
    order by c.relname
  `)
  console.log('Tables/vues et statut RLS :')
  for (const t of tables) {
    console.log(`  ${t.rls_enabled ? '✓ RLS' : '✗ RLS'}  ${t.table_name}`)
  }

  const { rows: fns } = await client.query(`
    select p.proname as fn, r.rolname as owner, p.prosecdef as security_definer
    from pg_proc p
    join pg_roles r on r.oid = p.proowner
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('current_etablissement_id', 'is_admin_etablissement', 'handle_new_user')
  `)
  console.log('\nFonctions security definer :')
  for (const f of fns) {
    console.log(`  ${f.fn}  owner=${f.owner}  security_definer=${f.security_definer}`)
  }

  const { rows: bypass } = await client.query(`select rolname, rolbypassrls from pg_roles where rolname = current_user`)
  console.log(`\nRôle courant (${bypass[0]?.rolname}) bypassrls = ${bypass[0]?.rolbypassrls}`)

  const { rows: policies } = await client.query(`select count(*)::int as n from pg_policies where schemaname = 'public'`)
  console.log(`Nombre de policies RLS créées : ${policies[0].n}`)

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
