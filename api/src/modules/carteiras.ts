import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { ApiError, DATA, DINHEIRO, TEXTO_LONGO, UUID, invalido, naoEncontrado, paramsId } from '../lib/http.ts'

const MES = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } as const

const corpoCarteira = {
  type: 'object',
  required: ['nome', 'tipo'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 1, maxLength: 60 },
    tipo: { type: 'string', enum: ['banco', 'dinheiro'] },
    saldo_inicial: { type: 'number', minimum: -99999999.99, maximum: 99999999.99, default: 0 },
    ativa: { type: 'boolean', default: true },
  },
} as const

type CorpoCarteira = { nome: string; tipo: string; saldo_inicial?: number; ativa?: boolean }

const campos = 'id, nome, tipo, saldo_inicial, ativa'

const MOVIMENTOS: Record<string, { tabela: string; pago: string }> = {
  recebimento: { tabela: 'recebimentos', pago: 'true' },
  manual: { tabela: 'lancamentos', pago: 'true' },
  despesa: { tabela: 'despesa_lancamentos', pago: "status = 'pago'" },
  repasse: { tabela: 'repasses', pago: "status = 'pago'" },
}

export async function validarCarteira(client: PoolClient, id: string | null | undefined) {
  if (!id) return null
  const { rows } = await client.query<{ ativa: boolean }>('select ativa from carteiras where id = $1', [id])
  if (!rows[0]) throw naoEncontrado('Banco ou conta')
  if (!rows[0].ativa) throw invalido('Este banco está desativado')
  return id
}

export async function saldosCarteiras(mes: string) {
  const linhas = await consultar<{
    id: string | null
    nome: string
    tipo: string | null
    saldo_inicial: string
    ativa: boolean
    saldo: string
    saldo_inicio_mes: string
    saldo_fim_mes: string
    entrou_mes: string
    saiu_mes: string
  }>(
    `with mov as (
       select carteira_id, data, valor from recebimentos
       union all
       select carteira_id, data, case when tipo = 'entrada' then valor else -valor end from lancamentos
       union all
       select carteira_id, data_pagamento, -valor from despesa_lancamentos where status = 'pago'
       union all
       select carteira_id, data_pagamento, -valor from repasses where status = 'pago'
       union all
       select de_carteira_id, data, -valor from transferencias
       union all
       select para_carteira_id, data, valor from transferencias
     ),
     periodo as (select $1::date as inicio, ($1::date + interval '1 month')::date as fim),
     contas as (
       select id, nome, tipo, saldo_inicial, ativa from carteiras
       union all
       select null, 'Sem conta informada', null, 0, true
     )
     select c.id, c.nome, c.tipo, c.saldo_inicial, c.ativa,
            c.saldo_inicial + coalesce(sum(m.valor), 0) as saldo,
            c.saldo_inicial + coalesce(sum(m.valor) filter (where m.data < p.inicio), 0) as saldo_inicio_mes,
            c.saldo_inicial + coalesce(sum(m.valor) filter (where m.data < p.fim), 0) as saldo_fim_mes,
            coalesce(sum(m.valor) filter (where m.valor > 0 and m.data >= p.inicio and m.data < p.fim), 0) as entrou_mes,
            coalesce(-sum(m.valor) filter (where m.valor < 0 and m.data >= p.inicio and m.data < p.fim), 0) as saiu_mes
     from contas c
     cross join periodo p
     left join mov m on m.carteira_id is not distinct from c.id
     group by c.id, c.nome, c.tipo, c.saldo_inicial, c.ativa
     having c.id is not null or count(m.valor) > 0
     order by c.id is null, c.ativa desc, c.tipo, c.nome
     limit 101`,
    [`${mes}-01`],
  )
  return {
    dados: linhas.filter((l) => l.id !== null),
    sem_carteira: linhas.find((l) => l.id === null) ?? null,
  }
}

export function registrarCarteiras(app: FastifyInstance) {
  app.get('/api/carteiras', { schema: { querystring: { type: 'object', properties: { mes: MES } } } }, async (req) => {
    const { mes } = req.query as { mes?: string }
    return saldosCarteiras(mes ?? new Date().toLocaleDateString('en-CA').slice(0, 7))
  })

  app.post('/api/carteiras', { schema: { body: corpoCarteira } }, async (req, reply) => {
    const c = req.body as CorpoCarteira
    const carteira = await consultarUm(
      `insert into carteiras (nome, tipo, saldo_inicial, ativa) values ($1, $2, $3, $4) returning ${campos}`,
      [c.nome.trim(), c.tipo, c.saldo_inicial ?? 0, c.ativa ?? true],
    )
    reply.code(201)
    return carteira
  })

  app.put('/api/carteiras/:id', { schema: { params: paramsId, body: corpoCarteira } }, async (req) => {
    const { id } = req.params as { id: string }
    const c = req.body as CorpoCarteira
    const carteira = await consultarUm(
      `update carteiras set nome = $2, tipo = $3, saldo_inicial = $4, ativa = $5 where id = $1 returning ${campos}`,
      [id, c.nome.trim(), c.tipo, c.saldo_inicial ?? 0, c.ativa ?? true],
    )
    if (!carteira) throw naoEncontrado('Banco ou conta')
    return carteira
  })

  app.delete('/api/carteiras/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const removida = await consultarUm('delete from carteiras where id = $1 returning id', [id])
      if (!removida) throw naoEncontrado('Banco ou conta')
    } catch (erro) {
      if ((erro as { code?: string }).code === '23503') {
        throw new ApiError(409, 'Este banco já tem movimentações. Desative em vez de excluir.')
      }
      throw erro
    }
    reply.code(204)
  })

  app.post(
    '/api/caixa/transferencias',
    {
      schema: {
        body: {
          type: 'object',
          required: ['de_carteira_id', 'para_carteira_id', 'valor', 'data'],
          additionalProperties: false,
          properties: {
            de_carteira_id: UUID,
            para_carteira_id: UUID,
            valor: DINHEIRO,
            data: DATA,
            observacoes: TEXTO_LONGO,
          },
        },
      },
    },
    async (req, reply) => {
      const c = req.body as {
        de_carteira_id: string
        para_carteira_id: string
        valor: number
        data: string
        observacoes?: string
      }
      if (c.de_carteira_id === c.para_carteira_id) throw invalido('Escolha contas diferentes para transferir')
      const ativas = await consultarUm<{ total: string }>(
        'select count(*) as total from carteiras where id = any($1) and ativa',
        [[c.de_carteira_id, c.para_carteira_id]],
      )
      if (Number(ativas?.total) !== 2) throw invalido('Banco não encontrado ou desativado')
      const transferencia = await consultarUm(
        `insert into transferencias (de_carteira_id, para_carteira_id, valor, data, observacoes)
         select $1, $2, $3, $4, $5 where $4::date <= current_date
         returning id, de_carteira_id, para_carteira_id, valor, data`,
        [c.de_carteira_id, c.para_carteira_id, c.valor, c.data, c.observacoes || null],
      )
      if (!transferencia) throw invalido('A data da transferência não pode ser futura')
      reply.code(201)
      return transferencia
    },
  )

  app.delete('/api/caixa/transferencias/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const removida = await consultarUm('delete from transferencias where id = $1 returning id', [id])
    if (!removida) throw naoEncontrado('Transferência')
    reply.code(204)
  })

  app.patch(
    '/api/caixa/movimentos/:origem/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          properties: { origem: { type: 'string', enum: Object.keys(MOVIMENTOS) }, id: UUID },
        },
        body: {
          type: 'object',
          required: ['carteira_id'],
          additionalProperties: false,
          properties: { carteira_id: UUID },
        },
      },
    },
    async (req) => {
      const { origem, id } = req.params as { origem: string; id: string }
      const { carteira_id } = req.body as { carteira_id: string }
      const carteira = await consultarUm<{ ativa: boolean }>('select ativa from carteiras where id = $1', [carteira_id])
      if (!carteira) throw naoEncontrado('Banco ou conta')
      if (!carteira.ativa) throw invalido('Este banco está desativado')
      const { tabela, pago } = MOVIMENTOS[origem]!
      const alterado = await consultarUm(
        `update ${tabela} set carteira_id = $2 where id = $1 and ${pago} returning id`,
        [id, carteira_id],
      )
      if (!alterado) throw naoEncontrado('Movimento pago')
      return { id, carteira_id }
    },
  )
}
