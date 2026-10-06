import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm, transacao } from '../db.ts'
import {
  ApiError, DATA, DINHEIRO, TEXTO, TEXTO_LONGO, UUID, UUID_OPCIONAL,
  invalido, naoEncontrado, ordenacao, paginar, paramsId, queryOrdem, queryPaginacao, resposta,
} from '../lib/http.ts'
import { validarCarteira } from './carteiras.ts'
import { FORMAS, criarRepasses, repassesSchema, validarRepasses, type Repasse } from './contas.ts'
import { gerarLancamentos } from './despesas.ts'

const SITUACOES = ['pendente', 'proxima', 'vencida', 'pago']
const TIPOS = ['entrada', 'saida']
const ORIGENS = ['parcela', 'recebimento', 'despesa', 'repasse', 'manual', 'transferencia']

const campos = `id, tipo, origem, descricao, contraparte, cliente_id, caso_id, caso_titulo, advogado_id,
                pai_id, pai_descricao, numero, total_parcelas, e_entrada, categoria, valor, valor_parcela, vencimento,
                status, data_pagamento, forma_pagamento, carteira_id, carteira_nome, carteira_destino_id,
                carteira_destino_nome, observacoes, situacao, dias_para_vencimento`

const ORDEM_LANCAMENTOS = {
  descricao: 'descricao',
  contraparte: 'contraparte',
  vencimento: 'vencimento',
  valor: 'valor',
  conta: 'carteira_nome',
}

const ORDEM_CASOS = {
  caso: 'caso_titulo',
  cliente: 'cliente_nome',
  percentual: 'percentual',
  recebido: 'total_recebido',
  repassado: 'repassado',
  minha_recebida: 'advogado_recebido',
  minha_a_receber: 'advogado_a_receber',
}

const corpoManual = {
  type: 'object',
  required: ['tipo', 'descricao', 'valor', 'data'],
  additionalProperties: false,
  properties: {
    tipo: { type: 'string', enum: TIPOS },
    descricao: TEXTO,
    categoria: { type: 'string', maxLength: 60 },
    valor: DINHEIRO,
    data: DATA,
    cliente_id: UUID_OPCIONAL,
    caso_id: UUID_OPCIONAL,
    carteira_id: UUID_OPCIONAL,
    forma_pagamento: { type: 'string', enum: FORMAS },
    observacoes: TEXTO_LONGO,
    repasses: repassesSchema,
  },
} as const

type CorpoManual = {
  tipo: 'entrada' | 'saida'
  descricao: string
  categoria?: string
  valor: number
  data: string
  cliente_id?: string | null
  caso_id?: string | null
  carteira_id?: string | null
  forma_pagamento?: string
  observacoes?: string
  repasses?: Repasse[]
}

export function registrarCaixa(app: FastifyInstance) {
  app.get(
    '/api/caixa/lancamentos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...queryPaginacao,
            ...queryOrdem(ORDEM_LANCAMENTOS),
            tipo: { type: 'string', enum: [...TIPOS, 'transferencia'] },
            origem: { type: 'string', enum: ORIGENS },
            situacao: { type: 'string', enum: SITUACOES },
            status: { type: 'string', enum: ['pendente', 'pago'] },
            mes: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
            carteira_id: UUID,
          },
        },
      },
    },
    async (req) => {
      // as contas programadas só viram lançamento quando o livro é lido
      await gerarLancamentos()
      const q = req.query as {
        tipo?: string
        origem?: string
        situacao?: string
        status?: string
        mes?: string
        carteira_id?: string
        ordem?: string
        direcao?: string
      }
      const { pagina, limite, offset } = paginar(req.query as never)
      const filtros = [
        q.tipo ?? null,
        q.origem ?? null,
        q.situacao ?? null,
        q.mes ? `${q.mes}-01` : null,
        q.status ?? null,
        q.carteira_id ?? null,
      ]
      const onde = `($1::text is null or tipo = $1)
                    and ($2::text is null or origem = $2)
                    and ($3::text is null or situacao = $3)
                    and ($4::date is null or date_trunc('month', coalesce(data_pagamento, vencimento)) = $4)
                    and ($5::text is null or status = $5)
                    and ($6::uuid is null or carteira_id = $6 or carteira_destino_id = $6)`
      const ordem = ordenacao(
        q,
        ORDEM_LANCAMENTOS,
        `case when status = 'pago' then 1 else 0 end,
         case when status = 'pendente' then vencimento end,
         data_pagamento desc, descricao, id`,
        'id',
      )

      const [linhas, totais] = await Promise.all([
        consultar(
          `select ${campos}, count(*) over () as total
           from vw_caixa_lancamentos
           where ${onde}
           order by ${ordem}
           limit $7 offset $8`,
          [...filtros, limite, offset],
        ),
        consultarUm(
          `select
             coalesce(sum(valor) filter (where tipo = 'entrada' and status = 'pago'), 0) as entrou,
             coalesce(sum(valor) filter (where tipo = 'saida' and status = 'pago'), 0) as saiu,
             coalesce(sum(valor) filter (where tipo = 'entrada' and status = 'pendente'), 0) as a_receber,
             coalesce(sum(valor) filter (where tipo = 'saida' and status = 'pendente'), 0) as a_pagar,
             coalesce(sum(valor) filter (where tipo = 'entrada' and status = 'pago'), 0)
               - coalesce(sum(valor) filter (where tipo = 'saida' and status = 'pago'), 0) as saldo,
             coalesce(sum(valor) filter (where origem = 'repasse'), 0) as repassado
           from vw_caixa_lancamentos
           where ${onde}`,
          filtros,
        ),
      ])
      return { ...resposta(linhas, pagina, limite), totais }
    },
  )

  app.post('/api/caixa/lancamentos', { schema: { body: corpoManual } }, async (req, reply) => {
    const c = req.body as CorpoManual
    if (c.data > new Date().toLocaleDateString('en-CA')) {
      throw invalido('A data do lançamento não pode ser futura')
    }
    const repasses = validarRepasses(c.repasses ?? [])
    if (repasses.length && c.tipo !== 'entrada') {
      throw invalido('Repasse só existe em entrada: dividir uma saída não faz sentido')
    }

    const lancamento = await transacao(async (client) => {
      if (c.cliente_id) {
        const { rowCount } = await client.query('select 1 from clientes where id = $1', [c.cliente_id])
        if (!rowCount) throw naoEncontrado('Cliente')
      }
      if (c.caso_id) {
        const { rows: casos } = await client.query<{ cliente_id: string }>('select cliente_id from casos where id = $1', [
          c.caso_id,
        ])
        if (!casos[0]) throw naoEncontrado('Caso')
        if (c.cliente_id && casos[0].cliente_id !== c.cliente_id) {
          throw invalido('O caso informado pertence a outro cliente')
        }
      }
      const carteira = await validarCarteira(client, c.carteira_id)
      const { rows } = await client.query(
        `insert into lancamentos (tipo, descricao, categoria, valor, data, cliente_id, caso_id, carteira_id,
                                  forma_pagamento, observacoes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id, tipo, descricao, categoria, valor, data, cliente_id, caso_id, carteira_id`,
        [
          c.tipo, c.descricao, c.categoria || null, c.valor, c.data,
          c.cliente_id || null, c.caso_id || null, carteira,
          c.forma_pagamento || null, c.observacoes || null,
        ],
      )
      await criarRepasses(client, { lancamento_id: rows[0].id }, c.valor, repasses)
      return rows[0]
    })
    reply.code(201)
    return lancamento
  })

  app.delete('/api/caixa/lancamentos/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const pagos = await consultarUm<{ total: string }>(
      `select count(*) as total from repasses where lancamento_id = $1 and status = 'pago'`,
      [id],
    )
    if (Number(pagos?.total ?? 0) > 0) {
      throw new ApiError(409, 'Há repasse já pago neste lançamento. Estorne o repasse antes de excluir.')
    }
    const removido = await consultarUm('delete from lancamentos where id = $1 returning id', [id])
    if (!removido) throw naoEncontrado('Lançamento')
    reply.code(204)
  })

  app.get(
    '/api/caixa',
    { schema: { querystring: { type: 'object', properties: { ...queryPaginacao, ...queryOrdem(ORDEM_CASOS) } } } },
    async (req) => {
      const { pagina, limite, offset } = paginar(req.query as never)
      const ordem = ordenacao(
        req.query as never,
        ORDEM_CASOS,
        'advogado_a_receber desc, advogado_recebido desc, cliente_id',
        'cliente_id',
      )
      const [linhas, totais, advogado] = await Promise.all([
        consultar(
          `select caso_id, caso_titulo, caso_status, cliente_id, cliente_nome, percentual,
                  total_recebido, total_pendente, total_vencido, repassado,
                  advogado_recebido, advogado_a_receber, advogado_vencido,
                  count(*) over () as total
           from vw_caixa
           order by ${ordem}
           limit $1 offset $2`,
          [limite, offset],
        ),
        consultarUm(
          `select coalesce(sum(total_recebido), 0) as escritorio_recebido,
                  coalesce(sum(total_pendente), 0) as escritorio_pendente,
                  coalesce(sum(repassado), 0) as repassado,
                  coalesce(sum(advogado_recebido), 0) as recebido,
                  coalesce(sum(advogado_a_receber), 0) as a_receber,
                  coalesce(sum(advogado_vencido), 0) as vencido
           from vw_caixa`,
        ),
        consultarUm('select id, nome, oab from advogados where principal'),
      ])
      return { ...resposta(linhas, pagina, limite), totais, advogado: advogado ?? null }
    },
  )

  app.post(
    '/api/repasses/:id/pagamento',
    {
      schema: {
        params: paramsId,
        body: {
          type: 'object',
          required: ['data_pagamento'],
          additionalProperties: false,
          properties: {
            data_pagamento: DATA,
            forma_pagamento: { type: 'string', enum: FORMAS },
            carteira_id: UUID_OPCIONAL,
            observacoes: TEXTO_LONGO,
          },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const c = req.body as { data_pagamento: string; forma_pagamento?: string; carteira_id?: string | null; observacoes?: string }
      const pago = await transacao(async (client) => {
        const carteira = await validarCarteira(client, c.carteira_id)
        const { rows } = await client.query<{ id: string }>(
          `update repasses
              set status = 'pago', data_pagamento = $2,
                  forma_pagamento = coalesce($3, forma_pagamento),
                  carteira_id = $5,
                  observacoes = coalesce($4, observacoes)
            where id = $1 and status = 'pendente' and $2::date <= current_date
            returning id`,
          [id, c.data_pagamento, c.forma_pagamento || null, c.observacoes || null, carteira],
        )
        return rows[0]
      })
      if (!pago) {
        const existe = await consultarUm<{ status: string }>('select status from repasses where id = $1', [id])
        if (!existe) throw naoEncontrado('Repasse')
        throw existe.status === 'pago'
          ? new ApiError(409, 'Repasse já está pago')
          : invalido('A data do pagamento não pode ser futura')
      }
      return consultarUm(`select ${campos} from vw_caixa_lancamentos where id = $1 and origem = 'repasse'`, [id])
    },
  )

  app.delete('/api/repasses/:id/pagamento', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const revertido = await consultarUm<{ id: string }>(
      `update repasses set status = 'pendente', data_pagamento = null, carteira_id = null
       where id = $1 and status = 'pago' returning id`,
      [id],
    )
    if (!revertido) throw new ApiError(409, 'Repasse não está pago')
    return consultarUm(`select ${campos} from vw_caixa_lancamentos where id = $1 and origem = 'repasse'`, [id])
  })
}
