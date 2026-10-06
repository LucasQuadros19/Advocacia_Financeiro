alter table parcelas add column entrada boolean not null default false;

drop view vw_parcelas;

create view vw_parcelas as
select
  p.id,
  p.conta_id,
  p.numero,
  p.total_parcelas,
  p.entrada,
  p.valor,
  p.vencimento,
  p.status,
  p.data_pagamento,
  p.forma_pagamento,
  p.observacoes,
  case
    when p.status = 'pago' then 'pago'
    when p.vencimento < current_date then 'vencida'
    when p.vencimento <= current_date + 7 then 'proxima'
    else 'pendente'
  end as situacao,
  p.vencimento - current_date as dias_para_vencimento,
  c.cliente_id,
  c.caso_id,
  c.descricao as conta_descricao,
  cl.nome as cliente_nome,
  cs.titulo as caso_titulo
from parcelas p
join contas c on c.id = p.conta_id
join clientes cl on cl.id = c.cliente_id
left join casos cs on cs.id = c.caso_id;
