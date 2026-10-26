-- Pronóstico SC Q4 2026 — esquema para Supabase
-- Ejecutar completo en Supabase → SQL Editor → New query → Run
-- (se puede usar el mismo proyecto que HubInnovacion).
-- Solo usuarios autenticados con correo @bafar.com.mx pueden leer y capturar.

create table if not exists public.sc_indicadores (
  id       smallint primary key,
  periodo  text     not null,
  nombre   text     not null,
  medible  text     not null,
  peso     numeric  not null check (peso >= 0),
  color    text     not null,
  fecha_inicio date not null,
  fecha_fin    date not null
);

create table if not exists public.sc_tareas (
  id            smallint primary key,
  indicador_id  smallint not null references public.sc_indicadores(id) on delete cascade,
  orden         smallint not null,
  nombre        text     not null,
  peso          numeric  not null check (peso >= 0),
  meta          numeric  not null check (meta > 0),
  unidad        text     not null,
  real          numeric  check (real is null or real >= 0),
  actualizado_por text,
  actualizado_en  timestamptz
);

-- Misma regla de dominio que HubInnovacion
create or replace function public.es_usuario_permitido() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@bafar.com.mx', false);
$$;

-- Registra quién y cuándo capturó el valor real
create or replace function public.sc_tareas_auditoria() returns trigger
language plpgsql as $$
begin
  new.actualizado_por := auth.jwt() ->> 'email';
  new.actualizado_en  := now();
  return new;
end $$;

drop trigger if exists sc_tareas_auditoria on public.sc_tareas;
create trigger sc_tareas_auditoria before update on public.sc_tareas
  for each row execute function public.sc_tareas_auditoria();

alter table public.sc_indicadores enable row level security;
alter table public.sc_tareas      enable row level security;

drop policy if exists "leer indicadores" on public.sc_indicadores;
drop policy if exists "leer tareas"      on public.sc_tareas;
drop policy if exists "capturar real"    on public.sc_tareas;

create policy "leer indicadores" on public.sc_indicadores for select to authenticated using (public.es_usuario_permitido());
create policy "leer tareas"      on public.sc_tareas      for select to authenticated using (public.es_usuario_permitido());
create policy "capturar real"    on public.sc_tareas      for update to authenticated
  using (public.es_usuario_permitido()) with check (public.es_usuario_permitido());

-- Nadie anónimo; los usuarios solo pueden cambiar la columna "real".
-- Metas, pesos y nombres solo se modifican desde el SQL Editor.
revoke all on public.sc_indicadores, public.sc_tareas from anon;
revoke all on public.sc_indicadores, public.sc_tareas from authenticated;
grant select on public.sc_indicadores, public.sc_tareas to authenticated;
grant update (real) on public.sc_tareas to authenticated;

-- Actualizaciones en vivo entre usuarios
do $$ begin
  alter publication supabase_realtime add table public.sc_tareas;
exception when duplicate_object then null; end $$;

-- Los datos base (metas y pesos) NO van en este repo público.
-- Ejecuta aparte el archivo seed_q4_2026.sql que se comparte por fuera.
