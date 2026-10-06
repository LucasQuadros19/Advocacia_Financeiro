import type { FastifyInstance, FastifyReply } from 'fastify'
import { consultar } from '../db.ts'
import { paraCsv, type Coluna } from '../lib/csv.ts'
import { DATA, UUID, invalido } from '../lib/http.ts'

const MES = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } as const
const LIMITE_LINHAS = 20000

const TIPO: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência' }
const ORIGEM: Record<string, string> = {
  recebimento: 'Cliente',
  despesa: 'Conta programada',
  repasse: 'Repasse',
  manual: 'Manual',
  transferencia: 'Transferência',
}

type Movimento = {
  tipo: string; origem: string; descricao: string; contraparte: string | null; caso_titulo: string | null
  carteira_nome: string | null; carteira_destino_nome: string | null; forma_pagamento: string | null
  categoria: string | null; valor: string; data_pagamento: string | null; vencimento: string; status: string
  observacoes: string | null; pai_descricao: string | null
}

async function limitado<T>(sql: string, params: unknown[]) {
  const linhas = await consultar<T & Record<string, unknown>>(`${sql} limit ${LIMITE_LINHAS + 1}`, params)
  if (linhas.length > LIMITE_LINHAS) throw invalido('Mais de 20.000 linhas: escolha um período menor.')
  return linhas
}

const enviar = (reply: FastifyReply, nome: string, csv: string) =>
  reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${nome}"`)
    .send(csv)

export function registrarExportar(app: FastifyInstance) {
  app.get(
    '/api/exportar/caixa.csv',
    { schema: { querystring: { type: 'object', required: ['mes'], properties: { mes: MES } } } },
    async (req, reply) => {
      const { mes } = req.query as { mes: string }
      const linhas = await limitado<Movimento>(
        `select tipo, origem, descricao, contraparte, caso_titulo, carteira_nome, carteira_destino_nome,
                forma_pagamento, categoria, valor, data_pagamento, vencimento, status, observacoes, pai_descricao
         from vw_caixa_lancamentos
         where status = 'pago' and date_trunc('month', data_pagamento) = $1::date
         order by data_pagamento, tipo, descricao`,
        [`${mes}-01`],
      )
      const colunas: Coluna<Movimento>[] = [
        { titulo: 'Data', valor: (l) => l.data_pagamento?.split('-').reverse().join('/') },
        { titulo: 'Tipo', valor: (l) => TIPO[l.tipo] },
        { titulo: 'Origem', valor: (l) => ORIGEM[l.origem] ?? l.origem },
        { titulo: 'Descrição', valor: (l) => l.descricao },
        { titulo: 'Cliente / para', valor: (l) => (l.tipo === 'transferencia' ? null : l.contraparte) },
        { titulo: 'Caso', valor: (l) => l.caso_titulo },
        { titulo: 'Conta', valor: (l) => l.carteira_nome ?? 'Sem conta' },
        { titulo: 'Conta de destino', valor: (l) => l.carteira_destino_nome },
        { titulo: 'Forma', valor: (l) => l.forma_pagamento },
        { titulo: 'Categoria', valor: (l) => l.categoria },
        { titulo: 'Entrada', valor: (l) => (l.tipo === 'entrada' ? l.valor : null), dinheiro: true },
        { titulo: 'Saída', valor: (l) => (l.tipo === 'saida' ? l.valor : null), dinheiro: true },
        { titulo: 'Transferido', valor: (l) => (l.tipo === 'transferencia' ? l.valor : null), dinheiro: true },
        { titulo: 'Observações', valor: (l) => l.observacoes },
      ]
      return enviar(reply, `caixa-${mes}.csv`, paraCsv(colunas, linhas))
    },
  )

  app.get(
    '/api/exportar/historico.csv',
    { schema: { querystring: { type: 'object', required: ['mes'], properties: { mes: MES } } } },
    async (req, reply) => {
      const { mes } = req.query as { mes: string }
      type Mes = { mes: string; entradas: string; saidas: string }
      const linhas = await consultar<Mes>(
        `with meses as (
           select generate_series($1::date - interval '11 months', $1::date, interval '1 month') as mes
         )
         select to_char(m.mes, 'MM/YYYY') as mes,
                coalesce(sum(v.valor) filter (where v.tipo = 'entrada'), 0) as entradas,
                coalesce(sum(v.valor) filter (where v.tipo = 'saida'), 0) as saidas
         from meses m
         left join vw_caixa_lancamentos v
           on v.status = 'pago' and v.tipo <> 'transferencia' and date_trunc('month', v.data_pagamento) = m.mes
         group by m.mes
         order by m.mes`,
        [`${mes}-01`],
      )
      const colunas: Coluna<Mes>[] = [
        { titulo: 'Mês', valor: (l) => l.mes },
        { titulo: 'Entradas', valor: (l) => l.entradas, dinheiro: true },
        { titulo: 'Saídas', valor: (l) => l.saidas, dinheiro: true },
        { titulo: 'Resultado', valor: (l) => Number(l.entradas) - Number(l.saidas), dinheiro: true },
      ]
      return enviar(reply, `historico-ate-${mes}.csv`, paraCsv(colunas, linhas))
    },
  )

  app.get(
    '/api/exportar/repasses.csv',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            advogado_id: UUID,
            status: { type: 'string', enum: ['pendente', 'pago'] },
            de: DATA,
            ate: DATA,
          },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { advogado_id?: string; status?: string; de?: string; ate?: string }
      const linhas = await limitado<Movimento>(
        `select tipo, origem, descricao, contraparte, caso_titulo, carteira_nome, carteira_destino_nome,
                forma_pagamento, categoria, valor, data_pagamento, vencimento, status, observacoes, pai_descricao
         from vw_caixa_lancamentos
         where origem = 'repasse'
           and ($1::uuid is null or advogado_id = $1)
           and ($2::text is null or status = $2)
           and ($3::date is null or vencimento >= $3)
           and ($4::date is null or vencimento <= $4)
         order by contraparte, vencimento, descricao`,
        [q.advogado_id ?? null, q.status ?? null, q.de ?? null, q.ate ?? null],
      )
      const colunas: Coluna<Movimento>[] = [
        { titulo: 'Advogado', valor: (l) => l.contraparte },
        { titulo: 'Recebido em', valor: (l) => l.vencimento.split('-').reverse().join('/') },
        { titulo: 'Veio de', valor: (l) => l.pai_descricao },
        { titulo: 'Caso', valor: (l) => l.caso_titulo },
        { titulo: 'Valor', valor: (l) => l.valor, dinheiro: true },
        { titulo: 'Situação', valor: (l) => (l.status === 'pago' ? 'Pago' : 'A pagar') },
        { titulo: 'Pago em', valor: (l) => l.data_pagamento?.split('-').reverse().join('/') },
        { titulo: 'Forma', valor: (l) => l.forma_pagamento },
        { titulo: 'Conta', valor: (l) => l.carteira_nome },
        { titulo: 'Observações', valor: (l) => l.observacoes },
      ]
      return enviar(reply, 'repasses.csv', paraCsv(colunas, linhas))
    },
  )
}
