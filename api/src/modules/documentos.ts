import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { naoEncontrado, paramsId, UUID } from '../lib/http.ts'

const textoCurto = (max: number) => ({ type: 'string', maxLength: max }) as const

const corpoEscritorio = {
  type: 'object',
  required: ['nome'],
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 1, maxLength: 200 },
    documento: textoCurto(30),
    oab: textoCurto(60),
    endereco: textoCurto(300),
    cidade: textoCurto(100),
    telefone: textoCurto(40),
    email: textoCurto(200),
    clausulas_parcelamento: textoCurto(4000),
  },
} as const

type CorpoEscritorio = Record<keyof typeof corpoEscritorio.properties, string | undefined>

const camposEscritorio = 'nome, documento, oab, endereco, cidade, telefone, email, clausulas_parcelamento'

const emissor = () =>
  Promise.all([
    consultarUm(`select ${camposEscritorio} from escritorio`),
    consultarUm('select nome, oab from advogados where principal'),
  ]).then(([escritorio, advogado]) => ({ escritorio, advogado: advogado ?? null }))

export function registrarDocumentos(app: FastifyInstance) {
  app.get('/api/escritorio', () => consultarUm(`select ${camposEscritorio} from escritorio`))

  app.put('/api/escritorio', { schema: { body: corpoEscritorio } }, async (req) => {
    const c = req.body as CorpoEscritorio
    const valor = (v?: string) => v?.trim() || null
    return consultarUm(
      `update escritorio
          set nome = $1, documento = $2, oab = $3, endereco = $4, cidade = $5, telefone = $6, email = $7,
              clausulas_parcelamento = $8, atualizado_em = now()
        returning ${camposEscritorio}`,
      [
        c.nome!.trim(), valor(c.documento), valor(c.oab), valor(c.endereco), valor(c.cidade),
        valor(c.telefone), valor(c.email), valor(c.clausulas_parcelamento),
      ],
    )
  })

  app.get(
    '/api/documentos/recibo/:origem/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['origem', 'id'],
          properties: { origem: { type: 'string', enum: ['recebimento', 'manual'] }, id: UUID },
        },
      },
    },
    async (req) => {
      const { origem, id } = req.params as { origem: 'recebimento' | 'manual'; id: string }
      const recibo =
        origem === 'recebimento'
          ? await consultarUm(
              `select rc.id, rc.valor, rc.data, rc.forma_pagamento, rc.observacoes,
                      c.descricao, cs.titulo as caso_titulo, p.numero, p.total_parcelas, p.entrada,
                      p.valor as valor_parcela,
                      p.valor - (select sum(r2.valor) from recebimentos r2
                                  where r2.parcela_id = p.id and (r2.data, r2.criado_em) <= (rc.data, rc.criado_em))
                        as restante_apos,
                      cl.nome as cliente_nome, cl.documento as cliente_documento
               from recebimentos rc
               join parcelas p on p.id = rc.parcela_id
               join contas c on c.id = p.conta_id
               join clientes cl on cl.id = c.cliente_id
               left join casos cs on cs.id = c.caso_id
               where rc.id = $1`,
              [id],
            )
          : await consultarUm(
              `select m.id, m.valor, m.data, m.forma_pagamento, m.observacoes, m.descricao,
                      cs.titulo as caso_titulo, null::int as numero, null::int as total_parcelas, false as entrada,
                      null::numeric as valor_parcela, null::numeric as restante_apos,
                      cl.nome as cliente_nome, cl.documento as cliente_documento
               from lancamentos m
               left join clientes cl on cl.id = m.cliente_id
               left join casos cs on cs.id = m.caso_id
               where m.id = $1 and m.tipo = 'entrada'`,
              [id],
            )
      if (!recibo) throw naoEncontrado('Recebimento')
      return { ...(await emissor()), recibo }
    },
  )

  app.get('/api/documentos/parcelamento/:id', { schema: { params: paramsId } }, async (req) => {
    const { id } = req.params as { id: string }
    const conta = await consultarUm(
      `select c.id, c.descricao, c.valor_total, c.forma_pagamento, c.observacoes, c.criado_em,
              cs.titulo as caso_titulo,
              cl.nome as cliente_nome, cl.documento as cliente_documento, cl.email as cliente_email,
              cl.telefone as cliente_telefone
       from contas c
       join clientes cl on cl.id = c.cliente_id
       left join casos cs on cs.id = c.caso_id
       where c.id = $1`,
      [id],
    )
    if (!conta) throw naoEncontrado('Cobrança')
    const parcelas = await consultar(
      `select numero, total_parcelas, entrada, valor, vencimento, status, valor_pago
       from parcelas where conta_id = $1 order by numero`,
      [id],
    )
    return { ...(await emissor()), conta, parcelas }
  })
}
