import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { cookieDeSessao } from '../auth.ts'
import { ApiError, invalido, naoEncontrado, paramsId } from '../lib/http.ts'
import { gerarHash } from '../lib/senha.ts'

const NOME = { type: 'string', minLength: 2, maxLength: 120 } as const
const LOGIN = { type: 'string', pattern: '^[a-zA-Z0-9._-]{3,40}$' } as const
const SENHA = { type: 'string', minLength: 8, maxLength: 200 } as const

const campos = 'id, nome, login, ativo, ultimo_acesso, criado_em'

async function comLoginUnico<T>(acao: () => Promise<T>) {
  try {
    return await acao()
  } catch (erro) {
    if ((erro as { code?: string }).code === '23505') throw new ApiError(409, 'Já existe um usuário com esse login')
    throw erro
  }
}

export function registrarUsuarios(app: FastifyInstance) {
  app.get('/api/usuarios', async () => ({
    dados: await consultar(`select ${campos} from usuarios order by ativo desc, nome limit 100`),
  }))

  app.post(
    '/api/usuarios',
    {
      schema: {
        body: {
          type: 'object',
          required: ['nome', 'login', 'senha'],
          additionalProperties: false,
          properties: { nome: NOME, login: LOGIN, senha: SENHA },
        },
      },
    },
    async (req, reply) => {
      const u = req.body as { nome: string; login: string; senha: string }
      const hash = await gerarHash(u.senha)
      const criado = await comLoginUnico(() =>
        consultarUm(
          `insert into usuarios (nome, login, senha_hash) values ($1, $2, $3) returning ${campos}`,
          [u.nome.trim(), u.login.toLowerCase(), hash],
        ),
      )
      reply.code(201)
      return criado
    },
  )

  app.put(
    '/api/usuarios/:id',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          required: ['nome', 'login', 'ativo'],
          additionalProperties: false,
          properties: { nome: NOME, login: LOGIN, ativo: { type: 'boolean' } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const u = req.body as { nome: string; login: string; ativo: boolean }
      if (id === req.usuario!.id && !u.ativo) throw invalido('Você não pode desativar o próprio usuário')
      const alterado = await comLoginUnico(() =>
        consultarUm(
          `update usuarios
              set nome = $2, login = $3, ativo = $4,
                  versao_sessao = versao_sessao + case when ativo and not $4 then 1 else 0 end
            where id = $1
            returning ${campos}`,
          [id, u.nome.trim(), u.login.toLowerCase(), u.ativo],
        ),
      )
      if (!alterado) throw naoEncontrado('Usuário')
      return alterado
    },
  )

  app.put(
    '/api/usuarios/:id/senha',
    {
      schema: {
        params: paramsId,
        body: { type: 'object', required: ['senha'], additionalProperties: false, properties: { senha: SENHA } },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { senha } = req.body as { senha: string }
      const alterado = await consultarUm<{ versao_sessao: number }>(
        `update usuarios set senha_hash = $2, versao_sessao = versao_sessao + 1 where id = $1 returning versao_sessao`,
        [id, await gerarHash(senha)],
      )
      if (!alterado) throw naoEncontrado('Usuário')
      if (id === req.usuario!.id) reply.header('set-cookie', cookieDeSessao(id, alterado.versao_sessao))
      return { id, alterada: true }
    },
  )
}
