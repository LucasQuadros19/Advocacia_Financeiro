import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { saldosCarteiras } from './carteiras.ts'

export function registrarDashboard(app: FastifyInstance) {
  app.get('/api/dashboard', async () => {
    const [financeiro, contagens, advogado, proximos, meses, carteiras] = await Promise.all([
      consultarUm(
        `select coalesce(sum(valor - valor_pago), 0) as a_receber,
                coalesce(sum(valor_pago), 0) as recebido,
                coalesce(sum(valor - valor_pago) filter (where status = 'pendente' and vencimento < current_date), 0) as vencido,
                coalesce(sum(valor - valor_pago) filter (where status = 'pendente' and vencimento >= current_date), 0) as a_vencer,
                coalesce(sum(valor - valor_pago) filter (
                  where status = 'pendente' and vencimento between current_date and current_date + 30
                ), 0) as previsto_30_dias,
                (select coalesce(sum(valor), 0) from recebimentos
                  where data >= date_trunc('month', current_date)) as recebido_mes
         from parcelas`,
      ),
      consultarUm(
        `select (select count(*) from clientes) as clientes,
                (select count(*) from casos) as casos,
                (select count(*) from casos where status = 'ativo') as casos_ativos,
                (select count(*) from parcelas where status = 'pendente' and vencimento < current_date) as parcelas_vencidas`,
      ),
      consultarUm(
        `select coalesce(sum(advogado_recebido), 0) as recebido,
                coalesce(sum(advogado_a_receber), 0) as a_receber,
                coalesce(sum(advogado_vencido), 0) as vencido,
                (select nome from advogados where principal) as nome
         from vw_caixa`,
      ),
      consultar(
        `select id, cliente_id, cliente_nome, conta_descricao, caso_titulo, numero, total_parcelas, entrada,
                valor, valor_pago, restante, vencimento, situacao, dias_para_vencimento
         from vw_parcelas
         where status = 'pendente'
         order by vencimento
         limit 8`,
      ),
      consultar(
        `with meses as (
           select generate_series(
             date_trunc('month', current_date) - interval '2 months',
             date_trunc('month', current_date) + interval '3 months',
             interval '1 month'
           ) as mes
         ),
         valores as (
           select date_trunc('month', data) as mes, sum(valor) as recebido, 0::numeric as previsto
           from recebimentos group by 1
           union all
           select date_trunc('month', vencimento), 0::numeric, sum(valor - valor_pago)
           from parcelas where status = 'pendente' group by 1
         )
         select to_char(m.mes, 'YYYY-MM') as mes,
                coalesce(sum(v.recebido), 0) as recebido,
                coalesce(sum(v.previsto), 0) as previsto
         from meses m
         left join valores v on v.mes = m.mes
         group by m.mes
         order by m.mes`,
      ),
      saldosCarteiras(new Date().toLocaleDateString('en-CA').slice(0, 7)),
    ])
    const caixa = {
      saldo: [...carteiras.dados, ...(carteiras.sem_carteira ? [carteiras.sem_carteira] : [])]
        .reduce((soma, c) => soma + Math.round(Number(c.saldo) * 100), 0) / 100,
      contas: carteiras.dados.filter((c) => c.ativa).length,
    }
    return { financeiro, contagens, advogado, proximos, meses, caixa }
  })
}
