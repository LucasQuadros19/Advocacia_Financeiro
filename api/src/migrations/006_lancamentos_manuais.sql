create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  categoria text,
  valor numeric(14, 2) not null check (valor > 0),
  data date not null,
  cliente_id uuid references clientes (id) on delete set null,
  caso_id uuid references casos (id) on delete set null,
  advogado_id uuid references advogados (id) on delete restrict,
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index lancamentos_data_idx on lancamentos (data desc);

-- o repasse passa a nascer de uma parcela OU de um lançamento manual, nunca dos dois
alter table repasses alter column parcela_id drop not null;
alter table repasses add column lancamento_id uuid references lancamentos (id) on delete cascade;
alter table repasses add constraint repasses_origem_unica
  check ((parcela_id is null) <> (lancamento_id is null));
create unique index repasses_lancamento_advogado on repasses (lancamento_id, advogado_id)
  where lancamento_id is not null;

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
    l.id, 'saida', 'despesa', d.descricao, coalesce(d.categoria, 'Conta programada'),
    null::uuid, null::uuid, null::text, null::uuid, null::uuid, null::text,
    null::int, null::int, false, d.categoria,
    l.valor, l.vencimento, l.status, l.data_pagamento, l.forma_pagamento
  from despesa_lancamentos l
  join despesas d on d.id = l.despesa_id

  union all

  select
    m.id, m.tipo, 'manual', m.descricao,
    coalesce(cl.nome, a.nome, m.categoria, 'Lançamento manual'),
    m.cliente_id, m.caso_id, cs.titulo, m.advogado_id, null::uuid, null::text,
    null::int, null::int, false, m.categoria,
    m.valor, m.data, 'pago', m.data, m.forma_pagamento
  from lancamentos m
  left join clientes cl on cl.id = m.cliente_id
  left join advogados a on a.id = m.advogado_id
  left join casos cs on cs.id = m.caso_id

  union all

  select
    r.id, 'saida', 'repasse', 'Repasse a ' || a.nome, a.nome,
    coalesce(c.cliente_id, m.cliente_id),
    coalesce(c.caso_id, m.caso_id),
    cs.titulo,
    r.advogado_id,
    coalesce(r.parcela_id, r.lancamento_id),
    coalesce(c.descricao, m.descricao),
    null::int, null::int, false, 'Repasse',
    r.valor,
    coalesce(p.data_pagamento, m.data),
    r.status,
    r.data_pagamento,
    r.forma_pagamento
  from repasses r
  join advogados a on a.id = r.advogado_id
  left join parcelas p on p.id = r.parcela_id
  left join contas c on c.id = p.conta_id
  left join lancamentos m on m.id = r.lancamento_id
  left join casos cs on cs.id = coalesce(c.caso_id, m.caso_id)
)
select
  mv.*,
  case
    when mv.status = 'pago' then 'pago'
    when mv.vencimento < current_date then 'vencida'
    when mv.vencimento <= current_date + 7 then 'proxima'
    else 'pendente'
  end as situacao,
  mv.vencimento - current_date as dias_para_vencimento
from movimentos mv;
