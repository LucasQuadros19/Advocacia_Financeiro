import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm, transacao } from '../db.ts'
import { ApiError, TEXTO, naoEncontrado, paginar, paramsId, queryPaginacao, resposta } from '../lib/http.ts'

const corpoAdvogado = {
  type: 'object',
  required: ['nome'],
  additionalProperties: false,
  properties: {
    nome: TEXTO,
    cpf: { type: 'string', maxLength: 20 },
    oab: { type: 'string', maxLength: 20 },
    email: { type: 'string', maxLength: 120 },
    telefone: { type: 'string', maxLength: 30 },
    principal: { type: 'boolean', default: false },
  },
} as const

type CorpoAdvogado = { nome: string; cpf?: string; oab?: string; email?: string; telefone?: string; principal?: boolean }

const campos = 'id, nome, cpf, oab, email, telefone, principal, criado_em'

async function definirPrincipal(id: string) {
  await transacao(async (client) => {
    await client.query('update advogados set principal = false where principal and id <> $1', [id])
    await client.query('update advogados set principal = true where id = $1', [id])
  })
}

export function registrarAdvogados(app: FastifyInstance) {
  app.get(
    '/api/advogados',
    { schema: { querystring: { type: 'object', properties: queryPaginacao } } },
    async (req) => {
      const { pagina, limite, offset } = paginar(req.query as never)
      const linhas = await consultar(
        `select ${campos}, count(*) over () as total,
                (select count(*) from caso_advogados ca where ca.advogado_id = advogados.id) as casos
         from advogados
         order by principal desc, nome
         limit $1 offset $2`,
        [limite, offset],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.post('/api/advogados', { schema: { body: corpoAdvogado } }, async (req, reply) => {
    const a = req.body as CorpoAdvogado
    const advogado = await consultarUm<{ id: string }>(
      `insert into advogados (nome, cpf, oab, email, telefone) values ($1, $2, $3, $4, $5) returning ${campos}`,
      [a.nome, a.cpf || null, a.oab || null, a.email || null, a.telefone || null],
    )
    if (a.principal && advogado) await definirPrincipal(advogado.id)
    reply.code(201)
    return a.principal ? { ...advogado, principal: true } : advogado
  })

  app.put('/api/advogados/:id', { schema: { params: paramsId, body: corpoAdvogado } }, async (req) => {
    const { id } = req.params as { id: string }
    const a = req.body as CorpoAdvogado
    const advogado = await consultarUm(
      `update advogados set nome = $2, cpf = $3, oab = $4, email = $5, telefone = $6 where id = $1 returning ${campos}`,
      [id, a.nome, a.cpf || null, a.oab || null, a.email || null, a.telefone || null],
    )
    if (!advogado) throw naoEncontrado('Advogado')
    return advogado
  })

  app.put('/api/advogados/:id/principal', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const advogado = await consultarUm('select id from advogados where id = $1', [id])
    if (!advogado) throw naoEncontrado('Advogado')
    await definirPrincipal(id)
    return consultarUm(`select ${campos} from advogados where id = $1`, [id])
  })

  app.delete('/api/advogados/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const vinculos = await consultarUm<{ total: string }>(
      'select count(*) as total from caso_advogados where advogado_id = $1',
      [id],
    )
    if (Number(vinculos?.total ?? 0) > 0) throw new ApiError(409, 'Advogado está vinculado a casos e não pode ser excluído')
    const removido = await consultarUm('delete from advogados where id = $1 returning id', [id])
    if (!removido) throw naoEncontrado('Advogado')
    reply.code(204)
  })
}
