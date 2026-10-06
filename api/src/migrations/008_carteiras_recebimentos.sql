create table carteiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('banco', 'dinheiro')),
  saldo_inicial numeric(14, 2) not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create unique index carteiras_nome_unico on carteiras (lower(nome));

create table recebimentos (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid not null references parcelas (id) on delete cascade,
  valor numeric(14, 2) not null check (valor > 0),
  data date not null,
  forma_pagamento text,
  carteira_id uuid references carteiras (id) on delete restrict,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index recebimentos_parcela_idx on recebimentos (parcela_id);

insert into recebimentos (parcela_id, valor, data, forma_pagamento, criado_em)
select id, valor, data_pagamento, forma_pagamento, criado_em from parcelas where status = 'pago';

alter table parcelas add column valor_pago numeric(14, 2) not null default 0;
update parcelas set valor_pago = valor where status = 'pago';
alter table parcelas add constraint parcelas_valor_pago check (valor_pago >= 0 and valor_pago <= valor);
alter table parcelas add constraint parcelas_quitada check ((status = 'pago') = (valor_pago = valor));

drop view vw_caixa_lancamentos;
drop view vw_caixa;
drop view vw_participacao;
drop view vw_parcelas;

alter table repasses add column recebimento_id uuid references recebimentos (id) on delete cascade;
update repasses r set recebimento_id = rc.id from recebimentos rc where rc.parcela_id = r.parcela_id;
alter table repasses drop constraint repasses_origem_unica;
alter table repasses drop column parcela_id;
alter table repasses add constraint repasses_origem_unica check ((recebimento_id is null) <> (lancamento_id is null));
create unique index repasses_recebimento_advogado on repasses (recebimento_id, advogado_id)
  where recebimento_id is not null;

alter table repasses add column carteira_id uuid references carteiras (id) on delete restrict;
alter table despesa_lancamentos add column carteira_id uuid references carteiras (id) on delete restrict;
alter table lancamentos add column carteira_id uuid references carteiras (id) on delete restrict;

create table transferencias (
  id uuid primary key default gen_random_uuid(),
  de_carteira_id uuid not null references carteiras (id) on delete restrict,
  para_carteira_id uuid not null references carteiras (id) on delete restrict,
  valor numeric(14, 2) not null check (valor > 0),
  data date not null,
  observacoes text,
  criado_em timestamptz not null default now(),
  check (de_carteira_id <> para_carteira_id)
);

create view vw_parcelas as
select
  p.id,
  p.conta_id,
  p.numero,
  p.total_parcelas,
  p.entrada,
  p.valor,
  p.valor_pago,
  p.valor - p.valor_pago as restante,
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
  greatest(
    100 - coalesce(
      sum(ca.percentual) filter (
        where ca.advogado_id is distinct from (select a.id from advogados a where a.principal)
      ),
      0
    ),
    0
  ) as percentual
from casos cs
left join caso_advogados ca on ca.caso_id = cs.id
group by cs.id;

create view vw_caixa as
with por_conta as (
  select
    c.caso_id,
    c.cliente_id,
    sum(p.valor_pago) as recebido,
    sum(p.valor - p.valor_pago) as pendente,
    coalesce(sum(p.valor - p.valor_pago) filter (where p.status = 'pendente' and p.vencimento < current_date), 0) as vencido
  from parcelas p
  join contas c on c.id = p.conta_id
  group by c.caso_id, c.cliente_id
),
repassado as (
  select c.caso_id, c.cliente_id, sum(r.valor) as valor
  from repasses r
  join recebimentos rc on rc.id = r.recebimento_id
  join parcelas p on p.id = rc.parcela_id
  join contas c on c.id = p.conta_id
  group by c.caso_id, c.cliente_id
)
select
  pc.caso_id,
  cs.titulo as caso_titulo,
  cs.status as caso_status,
  pc.cliente_id,
  cl.nome as cliente_nome,
  coalesce(pa.percentual, 100) as percentual,
  pc.recebido as total_recebido,
  pc.pendente as total_pendente,
  pc.vencido as total_vencido,
  coalesce(rp.valor, 0) as repassado,
  pc.recebido - coalesce(rp.valor, 0) as advogado_recebido,
  round(pc.pendente * coalesce(pa.percentual, 100) / 100, 2) as advogado_a_receber,
  round(pc.vencido * coalesce(pa.percentual, 100) / 100, 2) as advogado_vencido
from por_conta pc
join clientes cl on cl.id = pc.cliente_id
left join casos cs on cs.id = pc.caso_id
left join vw_participacao pa on pa.caso_id = pc.caso_id
left join repassado rp on rp.cliente_id = pc.cliente_id and rp.caso_id is not distinct from pc.caso_id;

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
    null::uuid as carteira_destino_id
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
    rc.valor, p.valor, p.vencimento, 'pago', rc.data, rc.forma_pagamento, rc.carteira_id, null
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
    l.valor, null, l.vencimento, l.status, l.data_pagamento, l.forma_pagamento, l.carteira_id, null
  from despesa_lancamentos l
  join despesas d on d.id = l.despesa_id

  union all

  select
    m.id, m.tipo, 'manual', m.descricao, coalesce(cl.nome, m.categoria, 'Lançamento manual'),
    m.cliente_id, m.caso_id, cs.titulo, null, null, null,
    null, null, false, m.categoria,
    m.valor, null, m.data, 'pago', m.data, m.forma_pagamento, m.carteira_id, null
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
    r.valor, null, coalesce(rc.data, m.data), r.status, r.data_pagamento, r.forma_pagamento, r.carteira_id, null
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
    t.valor, null, t.data, 'pago', t.data, null, t.de_carteira_id, t.para_carteira_id
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
