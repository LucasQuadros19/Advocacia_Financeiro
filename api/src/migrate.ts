import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, transacao } from './db.ts'

const pasta = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrar(): Promise<string[]> {
  await pool.query('create table if not exists migracoes (nome text primary key, aplicada_em timestamptz not null default now())')
  const arquivos = (await readdir(pasta)).filter((a) => a.endsWith('.sql')).sort()
  const aplicadas = new Set((await pool.query<{ nome: string }>('select nome from migracoes')).rows.map((r) => r.nome))
  const novas: string[] = []

  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue
    const sql = await readFile(join(pasta, arquivo), 'utf8')
    await transacao(async (client) => {
      await client.query('select pg_advisory_xact_lock(918273)')
      const { rowCount } = await client.query('select 1 from migracoes where nome = $1', [arquivo])
      if (rowCount) return
      await client.query(sql)
      await client.query('insert into migracoes (nome) values ($1)', [arquivo])
      novas.push(arquivo)
    })
  }
  return novas
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const novas = await migrar()
  console.log(novas.length ? `Migrações aplicadas: ${novas.join(', ')}` : 'Nenhuma migração pendente')
  await pool.end()
}
