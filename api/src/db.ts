import pg from 'pg'
import type { PoolClient, QueryResultRow } from 'pg'

pg.types.setTypeParser(1082, (v) => v)

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL não definida')

export const pool = new pg.Pool({
  connectionString,
  max: 10,
  options: `-c timezone=${process.env.TZ ?? 'America/Sao_Paulo'}`,
})

export async function consultar<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params)
  return rows
}

export async function consultarUm<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const { rows } = await pool.query<T>(sql, params)
  return rows[0]
}

export async function transacao<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const resultado = await fn(client)
    await client.query('commit')
    return resultado
  } catch (erro) {
    await client.query('rollback')
    throw erro
  } finally {
    client.release()
  }
}
