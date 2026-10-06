import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import {
  ApiError, TEXTO, TEXTO_LONGO, UUID, naoEncontrado, ordenacao, paginar, paramsId, queryOrdem, queryPaginacao, resposta, termoBusca,
} from '../lib/http.ts'

const corpoCliente = {
  type: 'object',
  required: ['nome'],
  additionalProperties: false,
  properties: {
    nome: TEXTO,
    documento: { type: 'string', maxLength: 20 },
    email: { type: 'string', maxLength: 120 },
    telefone: { type: 'string', maxLength: 30 },
    observacoes: TEXTO_LONGO,
  },
} as const

type CorpoCliente = { nome: string; documento?: string; email?: string; telefone?: string; observacoes?: string }

const camposCliente = 'id, nome, documento, email, telefone, observacoes, criado_em'

const ORDEM = {
  nome: 'cl.nome',
  documento: 'cl.documento',
  casos: 'casos',
  pendente: 'pendente',
  vencido: 'vencido',
  recebido: 'recebido',
}

const digitosBusca = (texto?: string) => {
  const digitos = (texto ?? '').replace(/\D/g, '')
  return digitos.length >= 3 ? `%${digitos}%` : null
}

export function registrarClientes(app: FastifyInstance) {
  app.get(
    '/api/clientes',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { ...queryPaginacao, ...queryOrdem(ORDEM), busca: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (req) => {
      const { busca } = req.query as { busca?: string }
      const { pagina, limite, offset } = paginar(req.query as never)
      const ordem = ordenacao(req.query as never, ORDEM, 'cl.nome, cl.id', 'cl.id')
      const linhas = await consultar(
        `select cl.id, cl.nome, cl.documento, cl.email, cl.telefone, cl.criado_em, count(*) over () as total,
                coalesce(f.pendente, 0) as pendente, coalesce(f.recebido, 0) as recebido,
                coalesce(f.vencido, 0) as vencido, coalesce(k.casos, 0) as casos
         from clientes cl
         left join (
           select c.cliente_id,
                  sum(p.valor - p.valor_pago) as pendente,
                  sum(p.valor_pago) as recebido,
                  sum(p.valor - p.valor_pago) filter (where p.status = 'pendente' and p.vencimento < current_date) as vencido
           from contas c join parcelas p on p.conta_id = c.id
           group by c.cliente_id
         ) f on f.cliente_id = cl.id
         left join (select cliente_id, count(*) as casos from casos group by cliente_id) k on k.cliente_id = cl.id
         where $1::text is null
            or cl.nome ilike $1
            or cl.documento ilike $1
            or ($2::text is not null and regexp_replace(coalesce(cl.documento, ''), '\\D', '', 'g') like $2)
         order by ${ordem}
         limit $3 offset $4`,
        [termoBusca(busca), digitosBusca(busca), limite, offset],
      )
      return resposta(linhas, pagina, limite)
    },
  )

  app.post('/api/clientes', { schema: { body: corpoCliente } }, async (req, reply) => {
    const c = req.body as CorpoCliente
    const cliente = await consultarUm(
      `insert into clientes (nome, documento, email, telefone, observacoes)
       values ($1, $2, $3, $4, $5) returning ${camposCliente}`,
      [c.nome, c.documento || null, c.email || null, c.telefone || null, c.observacoes || null],
    )
    reply.code(201)
    return cliente
  })

  app.get('/api/clientes/:id', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const [cliente, totais] = await Promise.all([
      consultarUm(`select ${camposCliente} from clientes where id = $1`, [id]),
      consultarUm(
        `select coalesce(sum(valor_pago), 0) as recebido,
                coalesce(sum(restante), 0) as pendente,
                coalesce(sum(restante) filter (where status = 'pendente' and vencimento < current_date), 0) as vencido,
                coalesce(sum(restante) filter (where status = 'pendente' and vencimento >= current_date), 0) as a_vencer,
                count(distinct conta_id) as contas
         from vw_parcelas where cliente_id = $1`,
        [id],
      ),
    ])
    if (!cliente) throw naoEncontrado('Cliente')
    return { ...cliente, totais }
  })

  app.put('/api/clientes/:id', { schema: { params: paramsId, body: corpoCliente } }, async (req) => {
    const { id } = req.params as { id: string }
    const c = req.body as CorpoCliente
    const cliente = await consultarUm(
      `update clientes set nome = $2, documento = $3, email = $4, telefone = $5, observacoes = $6, atualizado_em = now()
       where id = $1 returning ${camposCliente}`,
      [id, c.nome, c.documento || null, c.email || null, c.telefone || null, c.observacoes || null],
    )
    if (!cliente) throw naoEncontrado('Cliente')
    return cliente
  })

  app.delete('/api/clientes/:id', { schema: { params: paramsId } }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const pagas = await consultarUm<{ total: string }>(
      `select count(*) as total from vw_parcelas where cliente_id = $1 and valor_pago > 0`,
      [id],
    )
    if (Number(pagas?.total ?? 0) > 0) {
      throw new ApiError(409, 'Cliente possui pagamentos registrados e não pode ser excluído')
    }
    const removido = await consultarUm('delete from clientes where id = $1 returning id', [id])
    if (!removido) throw naoEncontrado('Cliente')
    reply.code(204)
  })

  app.get(
    '/api/clientes/:id/contas',
    {
      schema: {
        params: paramsId,
        querystring: { type: 'object', properties: { ...queryPaginacao, caso_id: UUID } },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string }
      const { caso_id } = req.query as { caso_id?: string }
      const { pagina, limite, offset } = paginar(req.query as never)
      const contas = await consultar<{ id: string; total: string }>(
        `with pagina as (
           select c.id, c.descricao, c.valor_total, c.forma_pagamento, c.observacoes, c.caso_id, c.criado_em,
                  count(*) over () as total
           from contas c
           where c.cliente_id = $1 and ($4::uuid is null or c.caso_id = $4)
           order by c.criado_em desc
           limit $2 offset $3
         )
         select pagina.*, cs.titulo as caso_titulo,
                coalesce(f.recebido, 0) as recebido, coalesce(f.pendente, 0) as pendente,
                f.qtd_parcelas, f.tem_entrada, f.proximo_vencimento, f.situacao
         from pagina
         left join casos cs on cs.id = pagina.caso_id
         left join lateral (
           select sum(valor_pago) as recebido,
                  sum(valor - valor_pago) as pendente,
                  count(*) as qtd_parcelas,
                  bool_or(entrada) as tem_entrada,
                  min(vencimento) filter (where status = 'pendente') as proximo_vencimento,
                  case
                    when count(*) filter (where status = 'pendente') = 0 then 'pago'
                    when count(*) filter (where status = 'pendente' and vencimento < current_date) > 0 then 'vencida'
                    when sum(valor_pago) > 0 then 'parcial'
                    else 'pendente'
                  end as situacao
           from parcelas where conta_id = pagina.id
         ) f on true`,
        [id, limite, offset, caso_id ?? null],
      )
      const ids = contas.map((c) => c.id)
      const [parcelas, recebimentos] = ids.length
        ? await Promise.all([
            consultar<{ id: string; conta_id: string }>(
              `select id, conta_id, numero, total_parcelas, entrada, valor, valor_pago, restante, vencimento, status,
                      data_pagamento, forma_pagamento, observacoes, situacao, dias_para_vencimento
               from vw_parcelas where conta_id = any($1) order by numero`,
              [ids],
            ),
            consultar<{ parcela_id: string }>(
              `select r.id, r.parcela_id, r.valor, r.data, r.forma_pagamento, r.observacoes, ca.nome as carteira_nome
               from recebimentos r
               join parcelas p on p.id = r.parcela_id
               left join carteiras ca on ca.id = r.carteira_id
               where p.conta_id = any($1)
               order by r.data, r.criado_em`,
              [ids],
            ),
          ])
        : [[], []]
      const pagina1 = resposta(contas, pagina, limite)
      return {
        ...pagina1,
        dados: pagina1.dados.map((conta) => ({
          ...conta,
          parcelas: parcelas
            .filter((p) => p.conta_id === (conta as { id: string }).id)
            .map((p) => ({ ...p, recebimentos: recebimentos.filter((r) => r.parcela_id === p.id) })),
        })),
      }
    },
  )

  app.get(
    '/api/clientes/:id/casos',
    { schema: { params: paramsId, querystring: { type: 'object', properties: queryPaginacao } } },
    async (req) => {
      const { id } = req.params as { id: string }
      const { pagina, limite, offset } = paginar(req.query as never)
      const linhas = await consultar(
        `select cs.id, cs.titulo, cs.status, cs.valor, cs.criado_em, count(*) over () as total,
                coalesce(cx.total_recebido, 0) as recebido, coalesce(cx.total_pendente, 0) as pendente,
                coalesce(pa.percentual, 100) as percentual_principal
         from casos cs
         left join vw_caixa cx on cx.caso_id = cs.id
         left join vw_participacao pa on pa.caso_id = cs.id
         where cs.cliente_id = $1
         order by cs.criado_em desc
         limit $2 offset $3`,
        [id, limite, offset],
      )
      return resposta(linhas, pagina, limite)
    },
  )
}
