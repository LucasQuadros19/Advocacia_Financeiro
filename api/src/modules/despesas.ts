import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm, transacao } from '../db.ts'
import {
  ApiError, DATA, DATA_OPCIONAL, DINHEIRO, TEXTO, TEXTO_LONGO, UUID, UUID_OPCIONAL,
  invalido, naoEncontrado, ordenacao, paginar, paramsId, queryOrdem, queryPaginacao, resposta,
} from '../lib/http.ts'
import { validarCarteira } from './carteiras.ts'
import { FORMAS } from './contas.ts'

const SITUACOES = ['pendente', 'proxima', 'vencida', 'pago']

const ORDEM = {
  descricao: 'd.descricao',
  categoria: 'd.categoria',
  valor: 'd.valor',
  dia: 'd.dia_vencimento',
  pago_12_meses: 'pago_12_meses',
}

const corpoDespesa = {
  type: 'object',
  required: ['descricao', 'valor', 'dia_vencimento', 'inicio'],
  additionalProperties: false,
  properties: {
    descricao: TEXTO,
    categoria: { type: 'string', maxLength: 60 },
    valor: DINHEIRO,
    dia_vencimento: { type: 'integer', minimum: 1, maximum: 31 },
    inicio: DATA,
    fim: DATA_OPCIONAL,
    ativa: { type: 'boolean', default: true },
    observacoes: TEXTO_LONGO,
  },
} as const

type CorpoDespesa = {
  descricao: string
  categoria?: string
  valor: number
  dia_vencimento: number
  inicio: string
  fim?: string | null
  ativa?: boolean
  observacoes?: string
}

const campos = 'id, descricao, categoria, valor, dia_vencimento, inicio, fim, ativa, observacoes, criado_em'

const camposLancamento =
  `id, despesa_id, competencia, vencimento, vencimento_original, valor, status, data_pagamento, forma_pagamento,
   observacoes, descricao, categoria, situacao, dias_para_vencimento`

const vencimentoNoMes = (mes: string, dia: string) =>
  `(${mes} + (least(${dia}, extract(day from (${mes} + interval '1 month' - interval '1 day'))::int) - 1) * interval '1 day')::date`

async function garantirProximo(client: PoolClient, despesaId: string) {
  await client.query(
    `insert into despesa_lancamentos (despesa_id, competencia, vencimento, valor)
     select d.id, u.mes::date, ${vencimentoNoMes('u.mes', 'd.dia_vencimento')}, d.valor
     from despesas d
     cross join lateral (
       select date_trunc('month', max(competencia)) + interval '1 month' as mes
       from despesa_lancamentos where despesa_id = d.id
     ) u
     where d.id = $1 and d.ativa and u.mes is not null
       and not exists (select 1 from despesa_lancamentos where despesa_id = d.id and status = 'pendente')
       and (d.fim is null or ${vencimentoNoMes('u.mes', 'd.dia_vencimento')} <= d.fim)
     on conflict (despesa_id, competencia) do nothing`,
    [despesaId],
  )
}

// ponytail: gera as ocorrências na leitura, sem cron nem fila. A janela é limitada
// (24 meses atrás até o fim do mês que vem) e o insert é idempotente pela unique
// (despesa_id, competencia). Se um dia houver muitas regras, mover para um job diário.
export const gerarLancamentos = () =>
  consultar(
    `insert into despesa_lancamentos (despesa_id, competencia, vencimento, valor)
     select g.id, g.competencia, g.vencimento, g.valor
     from (
       select d.id, d.valor, d.inicio, d.fim, m.mes::date as competencia,
              (m.mes + (least(
                 d.dia_vencimento,
                 extract(day from (m.mes + interval '1 month' - interval '1 day'))::int
               ) - 1) * interval '1 day')::date as vencimento
       from despesas d
       cross join lateral generate_series(
         greatest(date_trunc('month', d.inicio), date_trunc('month', current_date) - interval '24 months'),
         least(date_trunc('month', current_date) + interval '1 month',
               coalesce(date_trunc('month', d.fim), date_trunc('month', current_date) + interval '1 month')),
         interval '1 month'
       ) as m(mes)
       where d.ativa
     ) g
     where g.vencimento >= g.inicio and (g.fim is null or g.vencimento <= g.fim)
     on conflict (despesa_id, competencia) do nothing`,
  )

export function registrarDespesas(app: FastifyInstance) {
  app.get(
    '/api/despesas',
    { schema: { querystring: { type: 'object', properties: { ...queryPaginacao, ...queryOrdem(ORDEM) } } } },
    async (req) => {
      await gerarLancamentos()
      const { pagina, limite, offset } = paginar(req.query as never)
      const ordem = ordenacao(req.query as never, ORDEM, 'd.ativa desc, d.descricao, d.id', 'd.id')
      const linhas = await consultar(
        `select d.id, d.descricao, d.categoria, d.valor, d.dia_vencimento, d.inicio, d.fim, d.ativa,
                d.observacoes, d.criado_em, count(*) over () as total,
                coalesce(l.pago_12_meses, 0) as pago_12_meses,
                coalesce(l.pendentes, 0) as pendentes,
                px.id as proximo_id, px.vencimento as proximo_vencimento, px.valor as proximo_valor,
                px.vencimento_original as proximo_vencimento_original,
                case
                  when px.vencimento < current_date then 'vencida'
                  when px.vencimento <= current_date + 7 then 'proxima'
                  else 'pendente'
                end as proximo_situacao
         from despesas d
         left join lateral (
           select sum(valor) filter (where status = 'pago' and data_pagamento >= current_date - 365) as pago_12_meses,
                  count(*) filter (where status = 'pendente') as pendentes
           from despesa_lancamentos where despesa_id = d.id
         ) l on true
         left join lateral (
           select id, vencimento, vencimento_original, valor
           from despesa_lancamentos
           where despesa_id = d.id and status = 'pendente'
           order by vencimento, competencia
           limit 1
         ) px on true
         order by ${ordem}
         limit $1 offset $2`,
        [limite, offset],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.post('/api/despesas', { schema: { body: corpoDespesa } }, async (req, reply) => {
    const d = req.body as CorpoDespesa
    if (d.fim && d.fim < d.inicio) throw invalido('A data final não pode ser anterior ao início')
    const despesa = await consultarUm(
      `insert into despesas (descricao, categoria, valor, dia_vencimento, inicio, fim, ativa, observacoes)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${campos}`,
      [d.descricao, d.categoria || null, d.valor, d.dia_vencimento, d.inicio, d.fim || null, d.ativa ?? true, d.observacoes || null],
    )
    await gerarLancamentos()
    reply.code(201)
    return despesa
  })

  app.put('/api/despesas/:id', { schema: { params: paramsId, body: corpoDespesa } }, async (req) => {
    const { id } = req.params as { id: string }
    const d = req.body as CorpoDespesa
    if (d.fim && d.fim < d.inicio) throw invalido('A data final não pode ser anterior ao início')

    const despesa = await transacao(async (client) => {
      const { rows } = await client.query(
        `update despesas
            set descricao = $2, categoria = $3, valor = $4, dia_vencimento = $5, inicio = $6, fim = $7,
                ativa = $8, observacoes = $9, atualizado_em = now()
          where id = $1
          returning ${campos}`,
        [id, d.descricao, d.categoria || null, d.valor, d.dia_vencimento, d.inicio, d.fim || null, d.ativa ?? true, d.observacoes || null],
      )
      if (!rows[0]) throw naoEncontrado('Despesa')
      // lançamentos já pagos são histórico e não mudam; os pendentes acompanham a regra
      await client.query(
        `update despesa_lancamentos l
            set valor = $2,
                vencimento = case when l.vencimento_original is null
                                  then ${vencimentoNoMes('l.competencia', '$3::int')}
                                  else l.vencimento end
          where l.despesa_id = $1 and l.status = 'pendente'`,
        [id, d.valor, d.dia_vencimento],
      )
      await client.query(
        `delete from despesa_lancamentos l
          using despesas d
          where d.id = l.despesa_id and l.despesa_id = $1 and l.status = 'pendente'
            and (coalesce(l.vencimento_original, l.vencimento) < d.inicio
                 or coalesce(l.vencimento_original, l.vencimento) > d.fim
                 or (not d.ativa and coalesce(l.vencimento_original, l.vencimento) > current_date))`,
        [id],
      )
      return rows[0]
    })
    await gerarLancamentos()
    return despesa
  })

  app.delete('/api/despesas/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const pagos = await consultarUm<{ total: string }>(
      `select count(*) as total from despesa_lancamentos where despesa_id = $1 and status = 'pago'`,
      [id],
    )
    if (Number(pagos?.total ?? 0) > 0) {
      throw new ApiError(409, 'Despesa possui pagamentos registrados. Desative-a em vez de excluir.')
    }
    const removida = await consultarUm('delete from despesas where id = $1 returning id', [id])
    if (!removida) throw naoEncontrado('Despesa')
    reply.code(204)
  })

  app.get(
    '/api/despesas/lancamentos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...queryPaginacao,
            situacao: { type: 'string', enum: SITUACOES },
            despesa_id: UUID,
            mes: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
          },
        },
      },
    },
    async (req) => {
      await gerarLancamentos()
      const { situacao, despesa_id, mes } = req.query as { situacao?: string; despesa_id?: string; mes?: string }
      const { pagina, limite, offset } = paginar(req.query as never)
      const filtros = [situacao ?? null, despesa_id ?? null, mes ? `${mes}-01` : null]
      const onde = `($1::text is null or situacao = $1)
                    and ($2::uuid is null or despesa_id = $2)
                    and ($3::date is null or competencia = $3)`

      const [linhas, totais] = await Promise.all([
        consultar(
          `select ${camposLancamento}, count(*) over () as total
           from vw_despesa_lancamentos
           where ${onde}
           order by case when status = 'pago' then 1 else 0 end, vencimento
           limit $4 offset $5`,
          [...filtros, limite, offset],
        ),
        consultarUm(
          `select coalesce(sum(valor), 0) as total_geral,
                  coalesce(sum(valor) filter (where status = 'pago'), 0) as pago,
                  coalesce(sum(valor) filter (where status = 'pendente'), 0) as pendente,
                  coalesce(sum(valor) filter (where status = 'pendente' and vencimento < current_date), 0) as vencido
           from vw_despesa_lancamentos
           where ${onde}`,
          filtros,
        ),
      ])
      return { ...resposta(linhas, pagina, limite), totais }
    },
  )

  app.patch(
    '/api/despesas/lancamentos/:id',
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
      const alterado = await consultarUm<{ id: string }>(
        `update despesa_lancamentos
            set valor = coalesce($2, valor),
                vencimento = coalesce($3, vencimento),
                observacoes = coalesce($4, observacoes)
          where id = $1 and status = 'pendente'
          returning id`,
        [id, c.valor ?? null, c.vencimento ?? null, c.observacoes ?? null],
      )
      if (!alterado) {
        const existe = await consultarUm('select id from despesa_lancamentos where id = $1', [id])
        if (!existe) throw naoEncontrado('Lançamento')
        throw new ApiError(409, 'Lançamento já pago não pode ser alterado')
      }
      return consultarUm(`select ${camposLancamento} from vw_despesa_lancamentos where id = $1`, [id])
    },
  )

  app.post(
    '/api/despesas/lancamentos/:id/pagamento',
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
        const { rows } = await client.query<{ id: string; despesa_id: string }>(
          `update despesa_lancamentos
              set status = 'pago', data_pagamento = $2,
                  forma_pagamento = coalesce($3, forma_pagamento),
                  carteira_id = $5,
                  observacoes = coalesce($4, observacoes)
            where id = $1 and status = 'pendente' and $2::date <= current_date
            returning id, despesa_id`,
          [id, c.data_pagamento, c.forma_pagamento || null, c.observacoes || null, carteira],
        )
        if (rows[0]) await garantirProximo(client, rows[0].despesa_id)
        return rows[0]
      })
      if (!pago) {
        const existe = await consultarUm<{ status: string }>('select status from despesa_lancamentos where id = $1', [id])
        if (!existe) throw naoEncontrado('Lançamento')
        throw existe.status === 'pago'
          ? new ApiError(409, 'Lançamento já está pago')
          : invalido('A data do pagamento não pode ser futura')
      }
      return consultarUm(`select ${camposLancamento} from vw_despesa_lancamentos where id = $1`, [id])
    },
  )

  app.post('/api/despesas/lancamentos/:id/adiar', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const adiado = await transacao(async (client) => {
      const { rows } = await client.query<{ despesa_id: string }>(
        `update despesa_lancamentos l
            set vencimento_original = coalesce(l.vencimento_original, l.vencimento),
                vencimento = ${vencimentoNoMes("(date_trunc('month', l.vencimento) + interval '1 month')", 'd.dia_vencimento')}
           from despesas d
          where l.id = $1 and d.id = l.despesa_id and l.status = 'pendente'
          returning l.despesa_id`,
        [id],
      )
      if (rows[0]) await garantirProximo(client, rows[0].despesa_id)
      return rows[0]
    })
    if (!adiado) {
      const existe = await consultarUm('select id from despesa_lancamentos where id = $1', [id])
      if (!existe) throw naoEncontrado('Lançamento')
      throw new ApiError(409, 'Lançamento já pago não pode ser adiado')
    }
    return consultarUm(`select ${camposLancamento} from vw_despesa_lancamentos where id = $1`, [id])
  })

  app.delete('/api/despesas/lancamentos/:id/pagamento', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const revertido = await consultarUm<{ id: string }>(
      `update despesa_lancamentos set status = 'pendente', data_pagamento = null, carteira_id = null
       where id = $1 and status = 'pago' returning id`,
      [id],
    )
    if (!revertido) throw new ApiError(409, 'Lançamento não está pago')
    return consultarUm(`select ${camposLancamento} from vw_despesa_lancamentos where id = $1`, [id])
  })
}
