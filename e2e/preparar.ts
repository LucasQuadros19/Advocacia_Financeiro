import pg from 'pg'
import { gerarHash } from '../api/src/lib/senha.ts'

export default async function preparar() {
  process.loadEnvFile('.env.test')
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  await client.query(
    'truncate parcelas, contas, caso_advogados, casos, clientes, advogados, despesas, lancamentos, transferencias, carteiras, auditoria, usuarios restart identity cascade',
  )
  await client.query(`insert into usuarios (nome, login, senha_hash) values ('Lucas Quadros', 'teste', $1)`, [
    await gerarHash(process.env.SENHA_TESTE!),
  ])
  await client.end()
}
