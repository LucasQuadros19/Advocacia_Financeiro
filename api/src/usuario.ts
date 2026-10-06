import { pool } from './db.ts'
import { migrar } from './migrate.ts'
import { gerarHash, senhaAleatoria } from './lib/senha.ts'
import { registrarAuditoria } from './modules/auditoria.ts'

const [login, ...partesNome] = process.argv.slice(2)
if (!login || !/^[a-z0-9._-]{3,40}$/.test(login) || !partesNome.length) {
  console.error('Uso: npm run usuario -- <login> <Nome completo>')
  process.exit(1)
}

await migrar()
const senha = senhaAleatoria()
const { rows } = await pool.query<{ id: string; novo: boolean }>(
  `insert into usuarios (nome, login, senha_hash) values ($1, $2, $3)
   on conflict (lower(login)) do update set senha_hash = excluded.senha_hash, ativo = true,
     versao_sessao = usuarios.versao_sessao + 1
   returning id, (xmax = 0) as novo`,
  [partesNome.join(' '), login, await gerarHash(senha)],
)
await registrarAuditoria({
  acao: rows[0]?.novo ? 'CRIAR' : 'ALTERAR',
  alvo: 'Usuário',
  alvo_id: rows[0]?.id,
  descricao: `${rows[0]?.novo ? 'Cadastrou o usuário' : 'Redefiniu a senha do usuário'} “${login}” pelo terminal do servidor`,
})
console.log(`${rows[0]?.novo ? 'Usuário criado' : 'Senha redefinida'}: ${login} / ${senha}`)
console.log('Troque a senha em Configurações › Usuários depois de entrar.')
await pool.end()
