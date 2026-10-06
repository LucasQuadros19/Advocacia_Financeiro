import type { FastifyInstance } from 'fastify'
import { consultar } from '../db.ts'
import { termoBusca } from '../lib/http.ts'

const POR_GRUPO = 5

export function valorBuscado(texto: string): number | null {
  const limpo = texto.replace(/r\$/i, '').replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(limpo)) return null
  let normalizado = limpo
  if (limpo.includes(',')) normalizado = limpo.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normalizado = limpo.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  const numero = Number(normalizado)
  return numero > 0 ? numero : null
}

export function registrarBusca(app: FastifyInstance) {
  app.get(
    '/api/busca',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: { q: { type: 'string', minLength: 2, maxLength: 100 } },
        },
      },
    },
    async (req) => {
      const q = (req.query as { q: string }).q.trim()
      const termo = termoBusca(q)
      const digitos = q.replace(/\D/g, '')
      const valor = valorBuscado(q)

      const [clientes, casos, cobrancas, valores] = await Promise.all([
        consultar(
          `select id, nome, documento from clientes
           where nome ilike $1 or documento ilike $1
              or ($2::text is not null and regexp_replace(coalesce(documento, ''), '\\D', '', 'g') like $2)
           order by nome limit ${POR_GRUPO}`,
          [termo, digitos.length >= 3 ? `%${digitos}%` : null],
        ),
        consultar(
          `select cs.id, cs.titulo, cs.status, cl.nome as cliente_nome
           from casos cs join clientes cl on cl.id = cs.cliente_id
           where cs.titulo ilike $1 or cl.nome ilike $1
           order by cs.status = 'ativo' desc, cs.criado_em desc limit ${POR_GRUPO}`,
          [termo],
        ),
        consultar(
          `select c.id, c.descricao, c.cliente_id, cl.nome as cliente_nome, c.caso_id
           from contas c join clientes cl on cl.id = c.cliente_id
           where c.descricao ilike $1
           order by c.criado_em desc limit ${POR_GRUPO}`,
          [termo],
        ),
        valor === null
          ? Promise.resolve([])
          : consultar(
              `select id, tipo, origem, descricao, contraparte, cliente_id, caso_id, valor, valor_parcela, status,
                      coalesce(data_pagamento, vencimento) as data
               from vw_caixa_lancamentos
               where (valor = $1 or valor_parcela = $1) and tipo <> 'transferencia'
               order by coalesce(data_pagamento, vencimento) desc limit ${POR_GRUPO}`,
              [valor],
            ),
      ])
      return { clientes, casos, cobrancas, valores }
    },
  )
}
