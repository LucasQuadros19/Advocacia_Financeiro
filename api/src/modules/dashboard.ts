import type { FastifyInstance } from 'fastify'
import { consultar, consultarUm } from '../db.ts'
import { saldosCarteiras } from './carteiras.ts'
import { gerarLancamentos } from './despesas.ts'

const DIAS_ATRASO = 30
const DIAS_REPASSE_PARADO = 15
const HORIZONTES = [30, 60, 90]

// contas programadas ainda não geradas entram como ocorrências virtuais até o maior horizonte
const PREVISAO = `
  with dias(d) as (select unnest($1::int[])),
  receber as (
    select vencimento, valor - valor_pago as valor from parcelas
    where status = 'pendente' and vencimento >= current_date
  ),
  pagar as (
    select vencimento, valor from despesa_lancamentos where status = 'pendente'
    union all
    select g.vencimento, d.valor
    from despesas d
    cross join lateral generate_series(
      date_trunc('month', current_date), date_trunc('month', current_date + $2::int), interval '1 month'
    ) as m(mes)
    cross join lateral (
      select (m.mes + (least(
        d.dia_vencimento, extract(day from (m.mes + interval '1 month' - interval '1 day'))::int
      ) - 1) * interval '1 day')::date as vencimento
    ) g
    where d.ativa and g.vencimento >= d.inicio and (d.fim is null or g.vencimento <= d.fim)
      and g.vencimento >= current_date
      and not exists (select 1 from despesa_lancamentos l where l.despesa_id = d.id and l.competencia = m.mes::date)
  )
  select dias.d as dias,
         (select coalesce(sum(valor), 0) from receber where vencimento <= current_date + dias.d) as a_receber,
         (select coalesce(sum(valor), 0) from pagar where vencimento <= current_date + dias.d) as a_pagar,
         (select coalesce(sum(valor), 0) from repasses where status = 'pendente') as repasses
  from dias
  order by dias.d`

export function registrarDashboard(app: FastifyInstance) {
  app.get('/api/dashboard', async () => {
    await gerarLancamentos()
    const [financeiro, contagens, advogado, proximos, meses, carteiras, alertas, horizontes] = await Promise.all([
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
      consultarUm<Record<string, string>>(
        `with p as (
           select count(*) as qtd, coalesce(sum(valor - valor_pago), 0) as valor
           from parcelas where status = 'pendente' and vencimento < current_date - $1::int
         ),
         r as (
           select count(*) as qtd, coalesce(sum(r.valor), 0) as valor
           from repasses r
           left join recebimentos rc on rc.id = r.recebimento_id
           left join lancamentos m on m.id = r.lancamento_id
           where r.status = 'pendente' and coalesce(rc.data, m.data) < current_date - $2::int
         ),
         d as (
           select count(*) as qtd, coalesce(sum(valor), 0) as valor
           from despesa_lancamentos where status = 'pendente' and vencimento < current_date
         )
         select p.qtd as parcelas_atrasadas, p.valor as parcelas_atrasadas_valor,
                r.qtd as repasses_parados, r.valor as repasses_parados_valor,
                d.qtd as contas_vencidas, d.valor as contas_vencidas_valor
         from p, r, d`,
        [DIAS_ATRASO, DIAS_REPASSE_PARADO],
      ),
      consultar<{ dias: number; a_receber: string; a_pagar: string; repasses: string }>(PREVISAO, [
        HORIZONTES,
        Math.max(...HORIZONTES),
      ]),
    ])
    const caixa = {
      saldo: [...carteiras.dados, ...(carteiras.sem_carteira ? [carteiras.sem_carteira] : [])]
        .reduce((soma, c) => soma + Math.round(Number(c.saldo) * 100), 0) / 100,
      contas: carteiras.dados.filter((c) => c.ativa).length,
    }
    const centavos = (v: string | number) => Math.round(Number(v) * 100)
    const previsao = horizontes.map((h) => ({
      ...h,
      saldo_previsto:
        (centavos(caixa.saldo) + centavos(h.a_receber) - centavos(h.a_pagar) - centavos(h.repasses)) / 100,
    }))
    return {
      financeiro,
      contagens,
      advogado,
      proximos,
      meses,
      caixa,
      previsao,
      alertas: {
        ...alertas,
        dias_atraso: DIAS_ATRASO,
        dias_repasse: DIAS_REPASSE_PARADO,
        contas_negativas: carteiras.dados
          .filter((c) => c.ativa && Number(c.saldo) < 0)
          .map((c) => ({ id: c.id, nome: c.nome, saldo: c.saldo })),
      },
    }
  })
}
