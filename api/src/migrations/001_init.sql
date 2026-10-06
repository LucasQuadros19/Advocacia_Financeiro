create table advogados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  oab text,
  email text,
  telefone text,
  principal boolean not null default false,
  criado_em timestamptz not null default now()
);

create unique index advogados_principal_unico on advogados (principal) where principal;

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  email text,
  telefone text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index clientes_nome_idx on clientes (lower(nome));

create table casos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  titulo text not null,
  descricao text,
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  status text not null default 'ativo' check (status in ('ativo', 'encerrado', 'arquivado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index casos_cliente_idx on casos (cliente_id);

create table caso_advogados (
  caso_id uuid not null references casos (id) on delete cascade,
  advogado_id uuid not null references advogados (id) on delete restrict,
  percentual numeric(5, 2) not null check (percentual > 0 and percentual <= 100),
  primary key (caso_id, advogado_id)
);

create index caso_advogados_advogado_idx on caso_advogados (advogado_id);

create table contas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  caso_id uuid references casos (id) on delete set null,
  descricao text not null,
  valor_total numeric(14, 2) not null check (valor_total > 0),
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index contas_cliente_idx on contas (cliente_id);
create index contas_caso_idx on contas (caso_id) where caso_id is not null;

create table parcelas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references contas (id) on delete cascade,
  numero int not null check (numero > 0),
  total_parcelas int not null check (total_parcelas > 0),
  valor numeric(14, 2) not null check (valor > 0),
  vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  data_pagamento date,
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (conta_id, numero),
  check ((status = 'pago') = (data_pagamento is not null))
);

create index parcelas_conta_idx on parcelas (conta_id);
create index parcelas_pendentes_idx on parcelas (vencimento) where status = 'pendente';

create view vw_parcelas as
select
  p.id,
  p.conta_id,
  p.numero,
  p.total_parcelas,
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

create view vw_participacao as
select
  cs.id as caso_id,
  coalesce(
    max(ca.percentual) filter (where ca.advogado_id = (select a.id from advogados a where a.principal)),
    case when count(ca.caso_id) = 0 then 100 else 0 end
  ) as percentual
from casos cs
left join caso_advogados ca on ca.caso_id = cs.id
group by cs.id;

create view vw_caixa as
select
  c.caso_id,
  cs.titulo as caso_titulo,
  cs.status as caso_status,
  c.cliente_id,
  cl.nome as cliente_nome,
  coalesce(pa.percentual, 100) as percentual,
  coalesce(sum(p.valor) filter (where p.status = 'pago'), 0) as total_recebido,
  coalesce(sum(p.valor) filter (where p.status = 'pendente'), 0) as total_pendente,
  coalesce(sum(p.valor) filter (where p.status = 'pendente' and p.vencimento < current_date), 0) as total_vencido,
  round(coalesce(sum(p.valor) filter (where p.status = 'pago'), 0) * coalesce(pa.percentual, 100) / 100, 2) as advogado_recebido,
  round(coalesce(sum(p.valor) filter (where p.status = 'pendente'), 0) * coalesce(pa.percentual, 100) / 100, 2) as advogado_a_receber,
  round(coalesce(sum(p.valor) filter (where p.status = 'pendente' and p.vencimento < current_date), 0) * coalesce(pa.percentual, 100) / 100, 2) as advogado_vencido
from parcelas p
join contas c on c.id = p.conta_id
join clientes cl on cl.id = c.cliente_id
left join casos cs on cs.id = c.caso_id
left join vw_participacao pa on pa.caso_id = c.caso_id
group by c.caso_id, cs.titulo, cs.status, c.cliente_id, cl.nome, pa.percentual;
