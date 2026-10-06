import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm, transacao } from '../db.ts'
import { ApiError, DATA, DINHEIRO, TEXTO, TEXTO_LONGO, UUID, UUID_OPCIONAL, invalido, naoEncontrado, paramsId } from '../lib/http.ts'
import { montarParcelas, type Parcelamento } from '../lib/parcelas.ts'
import { validarCarteira } from './carteiras.ts'

export const FORMAS = ['pix', 'dinheiro', 'transferencia', 'boleto', 'cartao', 'cheque', 'outro']

export const repassesSchema = {
  type: 'array',
  maxItems: 10,
  items: {
    type: 'object',
    required: ['advogado_id', 'percentual'],
    additionalProperties: false,
    properties: { advogado_id: UUID, percentual: { type: 'number', exclusiveMinimum: 0, maximum: 100 } },
  },
} as const

export type Repasse = { advogado_id: string; percentual: number }

export const cobranca = {
  type: 'object',
  required: ['descricao', 'valor_total', 'primeiro_vencimento'],
  additionalProperties: false,
  properties: {
    descricao: TEXTO,
    valor_total: DINHEIRO,
    entrada: { type: 'number', minimum: 0, maximum: 99999999.99, default: 0 },
    entrada_vencimento: DATA,
    entrada_paga: { type: 'boolean', default: false },
    entrada_carteira_id: UUID_OPCIONAL,
    quantidade_parcelas: { type: 'integer', minimum: 1, maximum: 360, default: 1 },
    primeiro_vencimento: DATA,
    forma_pagamento: { type: 'string', enum: FORMAS },
    observacoes: TEXTO_LONGO,
  },
} as const

export type Cobranca = Parcelamento & {
  descricao: string
  entrada_paga?: boolean
  entrada_carteira_id?: string | null
  forma_pagamento?: string
  observacoes?: string
}

const corpoConta = {
  ...cobranca,
  required: ['cliente_id', ...cobranca.required],
  properties: { ...cobranca.properties, cliente_id: UUID, caso_id: UUID_OPCIONAL },
} as const

const camposParcela =
  `id, conta_id, numero, total_parcelas, entrada, valor, valor_pago, restante, vencimento, status, data_pagamento,
   forma_pagamento, observacoes, situacao, dias_para_vencimento`

export function validarRepasses(lista: Repasse[]): Repasse[] {
  if (!lista.length) return []
  const ids = new Set(lista.map((r) => r.advogado_id))
  if (ids.size !== lista.length) throw invalido('Advogado repetido no repasse')
  const total = lista.reduce((soma, r) => soma + Math.round(r.percentual * 100), 0)
  if (total > 10000) throw invalido('A soma dos repasses não pode passar de 100% do valor recebido')
  return lista
}

export async function criarRepasses(
  client: PoolClient,
  origem: { recebimento_id: string } | { lancamento_id: string },
  valor: number,
  repasses: Repasse[],
) {
  if (!repasses.length) return
  const { rowCount } = await client.query('select 1 from advogados where id = any($1)', [
    repasses.map((r) => r.advogado_id),
  ])
  if (rowCount !== repasses.length) throw naoEncontrado('Advogado')

  const centavos = Math.round(valor * 100)
  const valores = repasses.map((r) => Math.round((centavos * r.percentual) / 100) / 100)
  if (valores.some((v) => v <= 0)) throw invalido('O repasse ficou menor que um centavo')

  const coluna = 'recebimento_id' in origem ? 'recebimento_id' : 'lancamento_id'
  const id = 'recebimento_id' in origem ? origem.recebimento_id : origem.lancamento_id
  await client.query(
    `insert into repasses (${coluna}, advogado_id, percentual, valor)
     select $1, r.advogado_id, r.percentual, r.valor
     from unnest($2::uuid[], $3::numeric[], $4::numeric[]) as r(advogado_id, percentual, valor)`,
    [id, repasses.map((r) => r.advogado_id), repasses.map((r) => r.percentual), valores],
  )
}

export async function validarCaso(clienteId: string, casoId: string | null | undefined) {
  if (!casoId) return null
  const caso = await consultarUm<{ cliente_id: string }>('select cliente_id from casos where id = $1', [casoId])
  if (!caso) throw naoEncontrado('Caso')
  if (caso.cliente_id !== clienteId) throw invalido('O caso informado pertence a outro cliente')
  return casoId
}

async function sincronizarParcela(client: PoolClient, parcelaId: string) {
  await client.query(
    `update parcelas p
        set valor_pago = r.pago,
            status = case when r.pago >= p.valor then 'pago' else 'pendente' end,
            data_pagamento = case when r.pago >= p.valor then r.ultima end
       from (select coalesce(sum(valor), 0) as pago, max(data) as ultima from recebimentos where parcela_id = $1) r
      where p.id = $1`,
    [parcelaId],
  )
}

export async function criarConta(client: PoolClient, clienteId: string, casoId: string | null, c: Cobranca) {
  let parcelas
  try {
    parcelas = montarParcelas(c)
  } catch (erro) {
    throw invalido((erro as Error).message)
  }

  const pagas = parcelas.map((p) => Boolean(c.entrada_paga) && p.entrada)
  if (pagas[0]) {
    const { rows } = await client.query<{ futura: boolean }>('select $1::date > current_date as futura', [
      parcelas[0]!.vencimento,
    ])
    if (rows[0]!.futura) throw invalido('A data da entrada não pode ser futura')
  }
  const carteira = pagas[0] ? await validarCarteira(client, c.entrada_carteira_id) : null

  const { rows } = await client.query(
    `insert into contas (cliente_id, caso_id, descricao, valor_total, forma_pagamento, observacoes)
     values ($1, $2, $3, $4, $5, $6)
     returning id, cliente_id, caso_id, descricao, valor_total, forma_pagamento, observacoes, criado_em`,
    [clienteId, casoId, c.descricao, c.valor_total, c.forma_pagamento || null, c.observacoes || null],
  )
  const conta = rows[0]

  await client.query(
    `insert into parcelas (conta_id, numero, total_parcelas, entrada, valor, valor_pago, vencimento, status,
                           data_pagamento, forma_pagamento)
     select $1, n.numero, $2, n.entrada, n.valor,
            case when n.paga then n.valor else 0 end,
            n.vencimento,
            case when n.paga then 'pago' else 'pendente' end,
            case when n.paga then n.vencimento end,
            case when n.paga then $8::text end
     from unnest($3::int[], $4::numeric[], $5::date[], $6::bool[], $7::bool[]) as n(numero, valor, vencimento, entrada, paga)`,
    [
      conta.id,
      parcelas.length,
      parcelas.map((p) => p.numero),
      parcelas.map((p) => p.valor),
      parcelas.map((p) => p.vencimento),
      parcelas.map((p) => p.entrada),
      pagas,
      c.forma_pagamento || null,
    ],
  )
  if (pagas[0]) {
    await client.query(
      `insert into recebimentos (parcela_id, valor, data, forma_pagamento, carteira_id)
       select id, valor, vencimento, forma_pagamento, $2 from parcelas where conta_id = $1 and status = 'pago'`,
      [conta.id, carteira],
    )
  }
  return conta
}

export function registrarContas(app: FastifyInstance) {
  app.post('/api/contas', { schema: { body: corpoConta } }, async (req, reply) => {
    const c = req.body as Cobranca & { cliente_id: string; caso_id?: string | null }
    const cliente = await consultarUm('select id from clientes where id = $1', [c.cliente_id])
    if (!cliente) throw naoEncontrado('Cliente')
    const casoId = await validarCaso(c.cliente_id, c.caso_id)
    const conta = await transacao((client) => criarConta(client, c.cliente_id, casoId, c))
    reply.code(201)
    return conta
  })

  app.get('/api/contas/:id', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const conta = await consultarUm(
      `select c.id, c.cliente_id, c.caso_id, c.descricao, c.valor_total, c.forma_pagamento, c.observacoes, c.criado_em,
              cl.nome as cliente_nome, cs.titulo as caso_titulo
       from contas c
       join clientes cl on cl.id = c.cliente_id
       left join casos cs on cs.id = c.caso_id
       where c.id = $1`,
      [id],
    )
    if (!conta) throw naoEncontrado('Conta')
    const parcelas = await consultar(`select ${camposParcela} from vw_parcelas where conta_id = $1 order by numero`, [id])
    return { ...conta, parcelas }
  })

  app.put(
    '/api/contas/:id',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          required: ['descricao'],
          additionalProperties: false,
          properties: {
            descricao: TEXTO,
            caso_id: UUID_OPCIONAL,
            forma_pagamento: { type: 'string', enum: FORMAS },
            observacoes: TEXTO_LONGO,
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const c = req.body as { descricao: string; caso_id?: string | null; forma_pagamento?: string; observacoes?: string }
      const atual = await consultarUm<{ cliente_id: string }>('select cliente_id from contas where id = $1', [id])
      if (!atual) throw naoEncontrado('Conta')
      const casoId = await validarCaso(atual.cliente_id, c.caso_id)
      return consultarUm(
        `update contas set descricao = $2, caso_id = $3, forma_pagamento = $4, observacoes = $5, atualizado_em = now()
         where id = $1
         returning id, cliente_id, caso_id, descricao, valor_total, forma_pagamento, observacoes`,
        [id, c.descricao, casoId, c.forma_pagamento || null, c.observacoes || null],
      )
    },
  )

  app.delete('/api/contas/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const pagas = await consultarUm<{ total: string }>(
      'select count(*) as total from parcelas where conta_id = $1 and valor_pago > 0',
      [id],
    )
    if (Number(pagas?.total ?? 0) > 0) throw new ApiError(409, 'Conta possui pagamentos registrados e não pode ser excluída')
    const removida = await consultarUm('delete from contas where id = $1 returning id', [id])
    if (!removida) throw naoEncontrado('Conta')
    reply.code(204)
  })

  app.patch(
    '/api/parcelas/:id',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { valor: DINHEIRO, vencimento: DATA, observacoes: TEXTO_LONGO },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const c = req.body as { valor?: number; vencimento?: string; observacoes?: string }
      return transacao(async (client) => {
        const { rows } = await client.query<{ status: string; conta_id: string; valor_pago: string }>(
          'select status, conta_id, valor_pago from parcelas where id = $1 for update',
          [id],
        )
        const parcela = rows[0]
        if (!parcela) throw naoEncontrado('Parcela')
        if (parcela.status === 'pago') throw new ApiError(409, 'Parcela já paga não pode ser alterada')
        if (c.valor !== undefined && Math.round(c.valor * 100) < Math.round(Number(parcela.valor_pago) * 100)) {
          throw invalido(`O valor não pode ficar abaixo do que já foi recebido (${parcela.valor_pago})`)
        }
        await client.query(
          `update parcelas
             set valor = coalesce($2, valor), vencimento = coalesce($3, vencimento), observacoes = coalesce($4, observacoes),
                 status = case when valor_pago >= coalesce($2, valor) then 'pago' else 'pendente' end,
                 data_pagamento = case when valor_pago >= coalesce($2, valor)
                                       then (select max(data) from recebimentos where parcela_id = $1) end
           where id = $1`,
          [id, c.valor ?? null, c.vencimento ?? null, c.observacoes ?? null],
        )
        await client.query(
          `update contas set valor_total = (select sum(valor) from parcelas where conta_id = $1), atualizado_em = now()
           where id = $1`,
          [parcela.conta_id],
        )
        const { rows: final } = await client.query(`select ${camposParcela} from vw_parcelas where id = $1`, [id])
        return final[0]
      })
    },
  )

  app.post(
    '/api/parcelas/:id/pagamento',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          required: ['data_pagamento'],
          additionalProperties: false,
          properties: {
            valor: DINHEIRO,
            data_pagamento: DATA,
            forma_pagamento: { type: 'string', enum: FORMAS },
            carteira_id: UUID_OPCIONAL,
            observacoes: TEXTO_LONGO,
            repasses: repassesSchema,
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const c = req.body as {
        valor?: number
        data_pagamento: string
        forma_pagamento?: string
        carteira_id?: string | null
        observacoes?: string
        repasses?: Repasse[]
      }
      const repasses = validarRepasses(c.repasses ?? [])

      await transacao(async (client) => {
        const { rows } = await client.query<{ restante: string; status: string; futura: boolean }>(
          `select valor - valor_pago as restante, status, $2::date > current_date as futura
           from parcelas where id = $1 for update`,
          [id, c.data_pagamento],
        )
        const parcela = rows[0]
        if (!parcela) throw naoEncontrado('Parcela')
        if (parcela.status === 'pago') throw new ApiError(409, 'Parcela já está paga')
        if (parcela.futura) throw invalido('A data do pagamento não pode ser futura')

        const restante = Math.round(Number(parcela.restante) * 100)
        const centavos = c.valor === undefined ? restante : Math.round(c.valor * 100)
        if (centavos > restante) {
          throw invalido(`O valor recebido passa do que falta nesta parcela (${(restante / 100).toFixed(2)})`)
        }
        const carteira = await validarCarteira(client, c.carteira_id)

        const { rows: criado } = await client.query<{ id: string }>(
          `insert into recebimentos (parcela_id, valor, data, forma_pagamento, carteira_id, observacoes)
           values ($1, $2, $3, $4, $5, $6) returning id`,
          [id, centavos / 100, c.data_pagamento, c.forma_pagamento || null, carteira, c.observacoes || null],
        )
        await sincronizarParcela(client, id)
        await criarRepasses(client, { recebimento_id: criado[0]!.id }, centavos / 100, repasses)
      })

      return consultarUm(`select ${camposParcela} from vw_parcelas where id = $1`, [id])
    },
  )

  app.delete('/api/recebimentos/:id', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const parcelaId = await transacao(async (client) => {
      const { rows } = await client.query<{ parcela_id: string }>(
        'select parcela_id from recebimentos where id = $1 for update',
        [id],
      )
      if (!rows[0]) throw naoEncontrado('Recebimento')
      const { rows: pagos } = await client.query<{ total: string }>(
        `select count(*) as total from repasses where recebimento_id = $1 and status = 'pago'`,
        [id],
      )
      if (Number(pagos[0]?.total ?? 0) > 0) {
        throw new ApiError(409, 'Há repasse já pago neste recebimento. Estorne o repasse antes.')
      }
      await client.query('delete from recebimentos where id = $1', [id])
      await sincronizarParcela(client, rows[0].parcela_id)
      return rows[0].parcela_id
    })
    return consultarUm(`select ${camposParcela} from vw_parcelas where id = $1`, [parcelaId])
  })
}
