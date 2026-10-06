import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { saldosCarteiras } from './carteiras.ts'

const MES = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' } as const

export function registrarHistorico(app: FastifyInstance) {
  app.get('/api/historico', { schema: { querystring: { type: 'object', properties: { mes: MES } } } }, async (req) => {
    const mes = (req.query as { mes?: string }).mes ?? new Date().toLocaleDateString('en-CA').slice(0, 7)
    const inicio = `${mes}-01`
    const [contas, resumo, porOrigem, saidasPorCategoria, meses, primeiro] = await Promise.all([
      saldosCarteiras(mes),
      consultarUm(
        `select coalesce(sum(valor) filter (where tipo = 'entrada'), 0) as entradas,
                coalesce(sum(valor) filter (where tipo = 'saida'), 0) as saidas,
                count(*) filter (where tipo <> 'transferencia') as movimentos
         from vw_caixa_lancamentos
         where status = 'pago' and date_trunc('month', data_pagamento) = $1::date`,
        [inicio],
      ),
      consultar(
        `select tipo, origem, sum(valor) as total, count(*) as quantidade
         from vw_caixa_lancamentos
         where status = 'pago' and tipo <> 'transferencia' and date_trunc('month', data_pagamento) = $1::date
         group by tipo, origem
         order by tipo, total desc`,
        [inicio],
      ),
      consultar(
        `select coalesce(categoria, 'Sem categoria') as categoria, sum(valor) as total
         from vw_caixa_lancamentos
         where status = 'pago' and tipo = 'saida' and date_trunc('month', data_pagamento) = $1::date
         group by 1
         order by total desc
         limit 12`,
        [inicio],
      ),
      consultar(
        `with meses as (
           select generate_series($1::date - interval '11 months', $1::date, interval '1 month') as mes
         )
         select to_char(m.mes, 'YYYY-MM') as mes,
                coalesce(sum(v.valor) filter (where v.tipo = 'entrada'), 0) as entradas,
                coalesce(sum(v.valor) filter (where v.tipo = 'saida'), 0) as saidas
         from meses m
         left join vw_caixa_lancamentos v
           on v.status = 'pago' and v.tipo <> 'transferencia' and date_trunc('month', v.data_pagamento) = m.mes
         group by m.mes
         order by m.mes`,
        [inicio],
      ),
      consultarUm<{ mes: string | null }>(
        `select to_char(min(data_pagamento), 'YYYY-MM') as mes from vw_caixa_lancamentos where status = 'pago'`,
      ),
    ])
    return {
      mes,
      primeiro_mes: primeiro?.mes ?? mes,
      contas: contas.dados,
      sem_carteira: contas.sem_carteira,
      resumo,
      por_origem: porOrigem,
      saidas_por_categoria: saidasPorCategoria,
      meses,
    }
  })
}
