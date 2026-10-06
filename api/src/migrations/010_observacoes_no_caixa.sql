drop view vw_caixa_lancamentos;

create view vw_caixa_lancamentos as
with movimentos as (
  select
    p.id,
    'entrada'::text as tipo,
    'parcela'::text as origem,
    c.descricao,
    cl.nome as contraparte,
    c.cliente_id,
    c.caso_id,
    cs.titulo as caso_titulo,
    null::uuid as advogado_id,
    null::uuid as pai_id,
    null::text as pai_descricao,
    p.numero,
    p.total_parcelas,
    p.entrada as e_entrada,
    null::text as categoria,
    p.valor - p.valor_pago as valor,
    p.valor as valor_parcela,
    p.vencimento,
    p.status,
    p.data_pagamento,
    p.forma_pagamento,
    null::uuid as carteira_id,
    null::uuid as carteira_destino_id,
    p.observacoes
  from parcelas p
  join contas c on c.id = p.conta_id
  join clientes cl on cl.id = c.cliente_id
  left join casos cs on cs.id = c.caso_id
  where p.status = 'pendente'

  union all

  select
    rc.id, 'entrada', 'recebimento', c.descricao, cl.nome,
    c.cliente_id, c.caso_id, cs.titulo, null, p.id, null,
    p.numero, p.total_parcelas, p.entrada, null,
    rc.valor, p.valor, p.vencimento, 'pago', rc.data, rc.forma_pagamento, rc.carteira_id, null, rc.observacoes
  from recebimentos rc
  join parcelas p on p.id = rc.parcela_id
  join contas c on c.id = p.conta_id
  join clientes cl on cl.id = c.cliente_id
  left join casos cs on cs.id = c.caso_id

  union all

  select
    l.id, 'saida', 'despesa', d.descricao, coalesce(d.categoria, 'Conta programada'),
    null, null, null, null, null, null,
    null, null, false, d.categoria,
    l.valor, null, l.vencimento, l.status, l.data_pagamento, l.forma_pagamento, l.carteira_id, null, l.observacoes
  from despesa_lancamentos l
  join despesas d on d.id = l.despesa_id

  union all

  select
    m.id, m.tipo, 'manual', m.descricao, coalesce(cl.nome, m.categoria, 'Lançamento manual'),
    m.cliente_id, m.caso_id, cs.titulo, null, null, null,
    null, null, false, m.categoria,
    m.valor, null, m.data, 'pago', m.data, m.forma_pagamento, m.carteira_id, null, m.observacoes
  from lancamentos m
  left join clientes cl on cl.id = m.cliente_id
  left join casos cs on cs.id = m.caso_id

  union all

  select
    r.id, 'saida', 'repasse', 'Repasse a ' || a.nome, a.nome,
    coalesce(c.cliente_id, m.cliente_id),
    coalesce(c.caso_id, m.caso_id),
    cs.titulo,
    r.advogado_id,
    coalesce(r.recebimento_id, r.lancamento_id),
    coalesce(c.descricao, m.descricao),
    null, null, false, 'Repasse',
    r.valor, null, coalesce(rc.data, m.data), r.status, r.data_pagamento, r.forma_pagamento, r.carteira_id, null, r.observacoes
  from repasses r
  join advogados a on a.id = r.advogado_id
  left join recebimentos rc on rc.id = r.recebimento_id
  left join parcelas p on p.id = rc.parcela_id
  left join contas c on c.id = p.conta_id
  left join lancamentos m on m.id = r.lancamento_id
  left join casos cs on cs.id = coalesce(c.caso_id, m.caso_id)

  union all

  select
    t.id, 'transferencia', 'transferencia', 'Transferência entre contas', de.nome || ' → ' || para.nome,
    null, null, null, null, null, null,
    null, null, false, null,
    t.valor, null, t.data, 'pago', t.data, null, t.de_carteira_id, t.para_carteira_id, t.observacoes
  from transferencias t
  join carteiras de on de.id = t.de_carteira_id
  join carteiras para on para.id = t.para_carteira_id
)
select
  mv.*,
  ca.nome as carteira_nome,
  cd.nome as carteira_destino_nome,
  case
    when mv.status = 'pago' then 'pago'
    when mv.vencimento < current_date then 'vencida'
    when mv.vencimento <= current_date + 7 then 'proxima'
    else 'pendente'
  end as situacao,
  mv.vencimento - current_date as dias_para_vencimento
from movimentos mv
left join carteiras ca on ca.id = mv.carteira_id
left join carteiras cd on cd.id = mv.carteira_destino_id;
