create table escritorio (
  id boolean primary key default true check (id),
  nome text not null default '',
  documento text,
  oab text,
  endereco text,
  cidade text,
  telefone text,
  email text,
  clausulas_parcelamento text,
  atualizado_em timestamptz not null default now()
);

insert into escritorio (id) values (true);

alter table notas add column editado_em timestamptz;
