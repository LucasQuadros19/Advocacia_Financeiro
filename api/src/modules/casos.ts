import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm, transacao } from '../db.ts'
import {
  ApiError, TEXTO, TEXTO_LONGO, UUID, invalido, naoEncontrado, ordenacao, paginar, paramsId, queryOrdem, queryPaginacao,
  resposta, termoBusca,
} from '../lib/http.ts'
import { cobranca, criarConta, type Cobranca } from './contas.ts'

const STATUS = ['ativo', 'encerrado', 'arquivado']

const ORDEM = {
  titulo: 'cs.titulo',
  cliente: 'cl.nome',
  status: 'cs.status',
  valor: 'cs.valor',
  recebido: 'recebido',
  pendente: 'pendente',
  minha_parte: 'percentual_principal',
}

const participantes = {
  type: 'array',
  maxItems: 20,
  items: {
    type: 'object',
    required: ['advogado_id', 'percentual'],
    additionalProperties: false,
    properties: { advogado_id: UUID, percentual: { type: 'number', exclusiveMinimum: 0, maximum: 100 } },
  },
} as const

type Participante = { advogado_id: string; percentual: number }

const corpoCaso = {
  type: 'object',
  required: ['cliente_id', 'titulo'],
  additionalProperties: false,
  properties: {
    cliente_id: UUID,
    titulo: TEXTO,
    descricao: TEXTO_LONGO,
    valor: { type: 'number', minimum: 0, maximum: 99999999.99, default: 0 },
    status: { type: 'string', enum: STATUS, default: 'ativo' },
    advogados: participantes,
    conta: cobranca,
  },
} as const

type CorpoCaso = {
  cliente_id: string
  titulo: string
  descricao?: string
  valor?: number
  status?: string
  advogados?: Participante[]
  conta?: Cobranca
}

function validarDistribuicao(lista: Participante[]) {
  const ids = new Set(lista.map((a) => a.advogado_id))
  if (ids.size !== lista.length) throw invalido('Advogado repetido na distribuição')
  const total = lista.reduce((soma, a) => soma + Math.round(a.percentual * 100), 0)
  if (total > 10000) throw invalido('A soma dos percentuais não pode ultrapassar 100%')
  return lista.map((a) => ({ ...a, percentual: Math.round(a.percentual * 100) / 100 }))
}

async function salvarParticipantes(client: PoolClient, casoId: string, lista: Participante[]) {
  const validos = validarDistribuicao(lista)
  await client.query('delete from caso_advogados where caso_id = $1', [casoId])
  if (!validos.length) return
  const { rowCount } = await client.query('select 1 from advogados where id = any($1)', [validos.map((a) => a.advogado_id)])
  if (rowCount !== validos.length) throw naoEncontrado('Advogado')
  await client.query(
    `insert into caso_advogados (caso_id, advogado_id, percentual)
     select $1, a.advogado_id, a.percentual from unnest($2::uuid[], $3::numeric[]) as a(advogado_id, percentual)`,
    [casoId, validos.map((a) => a.advogado_id), validos.map((a) => a.percentual)],
  )
}

async function listarParticipantes(casoId: string) {
  return consultar(
    `select ca.advogado_id, ca.percentual, a.nome, a.principal
     from caso_advogados ca join advogados a on a.id = ca.advogado_id
     where ca.caso_id = $1
     order by ca.percentual desc, a.nome`,
    [casoId],
  )
}

export function registrarCasos(app: FastifyInstance) {
  app.get(
    '/api/casos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...queryPaginacao,
            ...queryOrdem(ORDEM),
            cliente_id: UUID,
            status: { type: 'string', enum: STATUS },
            busca: { type: 'string', maxLength: 100 },
          },
        },
      },
    },
    async (req) => {
      const { cliente_id, status, busca } = req.query as { cliente_id?: string; status?: string; busca?: string }
      const { pagina, limite, offset } = paginar(req.query as never)
      const ordem = ordenacao(req.query as never, ORDEM, 'cs.criado_em desc, cs.id', 'cs.id')
      const linhas = await consultar(
        `select cs.id, cs.titulo, cs.status, cs.valor, cs.criado_em, cs.cliente_id, cl.nome as cliente_nome,
                count(*) over () as total,
                coalesce(cx.total_recebido, 0) as recebido,
                coalesce(cx.total_pendente, 0) as pendente,
                coalesce(pa.percentual, 100) as percentual_principal,
                (select count(*) from caso_advogados ca join advogados a on a.id = ca.advogado_id
                 where ca.caso_id = cs.id and not a.principal) as qtd_advogados
         from casos cs
         join clientes cl on cl.id = cs.cliente_id
         left join vw_caixa cx on cx.caso_id = cs.id
         left join vw_participacao pa on pa.caso_id = cs.id
         where ($1::uuid is null or cs.cliente_id = $1)
           and ($2::text is null or cs.status = $2)
           and ($3::text is null or cs.titulo ilike $3)
         order by ${ordem}
         limit $4 offset $5`,
        [cliente_id ?? null, status ?? null, termoBusca(busca), limite, offset],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.post('/api/casos', { schema: { body: corpoCaso } }, async (req, reply) => {
    const c = req.body as CorpoCaso
    const cliente = await consultarUm('select id from clientes where id = $1', [c.cliente_id])
    if (!cliente) throw naoEncontrado('Cliente')
    const caso = await transacao(async (client) => {
      const { rows } = await client.query(
        `insert into casos (cliente_id, titulo, descricao, valor, status)
         values ($1, $2, $3, $4, $5)
         returning id, cliente_id, titulo, descricao, valor, status, criado_em`,
        [c.cliente_id, c.titulo, c.descricao || null, c.valor ?? 0, c.status ?? 'ativo'],
      )
      const novo = rows[0]
      if (c.advogados?.length) await salvarParticipantes(client, novo.id, c.advogados)
      if (c.conta) await criarConta(client, c.cliente_id, novo.id, c.conta)
      return novo
    })
    reply.code(201)
    return caso
  })

  app.get('/api/casos/:id', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const caso = await consultarUm(
      `select cs.id, cs.cliente_id, cs.titulo, cs.descricao, cs.valor, cs.status, cs.criado_em,
              cl.nome as cliente_nome,
              coalesce(cx.total_recebido, 0) as recebido,
              coalesce(cx.total_pendente, 0) as pendente,
              coalesce(cx.total_vencido, 0) as vencido,
              coalesce(cx.percentual, coalesce(pa.percentual, 100)) as percentual_principal,
              coalesce(cx.repassado, 0) as repassado,
              coalesce(cx.advogado_recebido, 0) as advogado_recebido,
              coalesce(cx.advogado_a_receber, 0) as advogado_a_receber
       from casos cs
       join clientes cl on cl.id = cs.cliente_id
       left join vw_caixa cx on cx.caso_id = cs.id
       left join vw_participacao pa on pa.caso_id = cs.id
       where cs.id = $1`,
      [id],
    )
    if (!caso) throw naoEncontrado('Caso')
    const [advogados, contas] = await Promise.all([
      listarParticipantes(id),
      consultar(
        `select c.id, c.descricao, c.valor_total, c.criado_em,
                coalesce(sum(p.valor_pago), 0) as recebido,
                coalesce(sum(p.valor - p.valor_pago), 0) as pendente
         from contas c left join parcelas p on p.conta_id = c.id
         where c.caso_id = $1
         group by c.id
         order by c.criado_em desc
         limit 50`,
        [id],
      ),
    ])
    return { ...caso, advogados, contas }
  })

  app.put(
    '/api/casos/:id',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          required: ['titulo'],
          additionalProperties: false,
          properties: {
            titulo: TEXTO,
            descricao: TEXTO_LONGO,
            valor: { type: 'number', minimum: 0, maximum: 99999999.99 },
            status: { type: 'string', enum: STATUS },
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const c = req.body as { titulo: string; descricao?: string; valor?: number; status?: string }
      const caso = await consultarUm(
        `update casos set titulo = $2, descricao = $3, valor = coalesce($4, valor), status = coalesce($5, status),
                          atualizado_em = now()
         where id = $1
         returning id, cliente_id, titulo, descricao, valor, status`,
        [id, c.titulo, c.descricao || null, c.valor ?? null, c.status ?? null],
      )
      if (!caso) throw naoEncontrado('Caso')
      return caso
    },
  )

  app.put(
    '/api/casos/:id/advogados',
    { schema: { params: paramsId, body: { type: 'object', required: ['advogados'], properties: { advogados: participantes } } } },
    async (req) => {
      const { id } = req.params as { id: string }
      const { advogados } = req.body as { advogados: Participante[] }
      const caso = await consultarUm('select id from casos where id = $1', [id])
      if (!caso) throw naoEncontrado('Caso')
      await transacao((client) => salvarParticipantes(client, id, advogados))
      return { advogados: await listarParticipantes(id) }
    },
  )

  app.delete('/api/casos/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const contas = await consultarUm<{ total: string }>('select count(*) as total from contas where caso_id = $1', [id])
    if (Number(contas?.total ?? 0) > 0) {
      throw new ApiError(409, 'Caso possui contas vinculadas. Desvincule as contas antes de excluir.')
    }
    const removido = await consultarUm('delete from casos where id = $1 returning id', [id])
    if (!removido) throw naoEncontrado('Caso')
    reply.code(204)
  })
}
