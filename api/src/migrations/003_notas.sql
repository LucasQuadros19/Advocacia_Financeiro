create table notas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes (id) on delete cascade,
  caso_id uuid references casos (id) on delete cascade,
  autor text not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  constraint notas_alvo_unico check ((cliente_id is null) <> (caso_id is null))
);

create index notas_cliente_idx on notas (cliente_id, criado_em desc) where cliente_id is not null;
create index notas_caso_idx on notas (caso_id, criado_em desc) where caso_id is not null;
