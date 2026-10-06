create table despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text,
  valor numeric(14, 2) not null check (valor > 0),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  inicio date not null,
  fim date,
  ativa boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint despesas_periodo check (fim is null or fim >= inicio)
);

create index despesas_ativas_idx on despesas (ativa) where ativa;

create table despesa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  despesa_id uuid not null references despesas (id) on delete cascade,
  competencia date not null,
  vencimento date not null,
  valor numeric(14, 2) not null check (valor > 0),
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  data_pagamento date,
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (despesa_id, competencia),
  check ((status = 'pago') = (data_pagamento is not null))
);

create index despesa_lancamentos_pendentes_idx on despesa_lancamentos (vencimento) where status = 'pendente';

create view vw_despesa_lancamentos as
select
  l.id,
  l.despesa_id,
  l.competencia,
  l.vencimento,
  l.valor,
  l.status,
  l.data_pagamento,
  l.forma_pagamento,
  l.observacoes,
  d.descricao,
  d.categoria,
  d.dia_vencimento,
  d.ativa,
  case
    when l.status = 'pago' then 'pago'
    when l.vencimento < current_date then 'vencida'
    when l.vencimento <= current_date + 7 then 'proxima'
    else 'pendente'
  end as situacao,
  l.vencimento - current_date as dias_para_vencimento
from despesa_lancamentos l
join despesas d on d.id = l.despesa_id;
