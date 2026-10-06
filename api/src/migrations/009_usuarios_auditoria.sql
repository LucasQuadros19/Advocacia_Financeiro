create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  login text not null,
  senha_hash text not null,
  ativo boolean not null default true,
  versao_sessao int not null default 0,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now()
);

create unique index usuarios_login_unico on usuarios (lower(login));

create table auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid references usuarios (id) on delete set null,
  usuario_nome text,
  acao text not null,
  alvo text not null,
  alvo_id text,
  descricao text not null,
  metodo text,
  rota text,
  status int,
  dados jsonb,
  antes jsonb,
  resposta jsonb,
  ip text,
  criado_em timestamptz not null default now()
);

create index auditoria_criado_idx on auditoria (criado_em desc, id desc);

create function auditoria_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'Registros de auditoria não podem ser alterados nem apagados';
end
$$;

create trigger auditoria_sem_alteracao
  before update or delete on auditoria
  for each row execute function auditoria_imutavel();

alter table despesa_lancamentos add column vencimento_original date;

drop view vw_despesa_lancamentos;

create view vw_despesa_lancamentos as
select
  l.id,
  l.despesa_id,
  l.competencia,
  l.vencimento,
  l.vencimento_original,
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
