create table repasses (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas (id) on delete cascade,
  advogado_id uuid not null references advogados (id) on delete restrict,
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  valor numeric(14, 2) not null check (valor > 0),
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  data_pagamento date,
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (parcela_id, advogado_id),
  check ((status = 'pago') = (data_pagamento is not null))
);

create index repasses_advogado_idx on repasses (advogado_id);
create index repasses_pendentes_idx on repasses (status) where status = 'pendente';

-- Livro-caixa: entradas (parcelas) e saídas (contas programadas e repasses) na mesma forma.
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
    p.numero,
    p.total_parcelas,
    p.entrada as e_entrada,
    p.valor,
    p.vencimento,
    p.status,
    p.data_pagamento,
    p.forma_pagamento
  from parcelas p
  join contas c on c.id = p.conta_id
  join clientes cl on cl.id = c.cliente_id
  left join casos cs on cs.id = c.caso_id

  union all

  select
    l.id,
    'saida',
    'despesa',
    d.descricao,
    coalesce(d.categoria, 'Conta programada'),
    null::uuid,
    null::uuid,
    null::text,
    null::uuid,
    null::int,
    null::int,
    false,
    l.valor,
    l.vencimento,
    l.status,
    l.data_pagamento,
    l.forma_pagamento
  from despesa_lancamentos l
  join despesas d on d.id = l.despesa_id

  union all

  select
    r.id,
    'saida',
    'repasse',
    'Repasse a ' || a.nome,
    a.nome,
    c.cliente_id,
    c.caso_id,
    cs.titulo,
    r.advogado_id,
    null::int,
    null::int,
    false,
    r.valor,
    p.data_pagamento,
    r.status,
    r.data_pagamento,
    r.forma_pagamento
  from repasses r
  join advogados a on a.id = r.advogado_id
  join parcelas p on p.id = r.parcela_id
  join contas c on c.id = p.conta_id
  left join casos cs on cs.id = c.caso_id
)
select
  m.*,
  case
    when m.status = 'pago' then 'pago'
    when m.vencimento < current_date then 'vencida'
    when m.vencimento <= current_date + 7 then 'proxima'
    else 'pendente'
  end as situacao,
  m.vencimento - current_date as dias_para_vencimento
from movimentos m;
