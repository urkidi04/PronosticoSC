-- Pronóstico SC — permite agregar, editar y eliminar tareas desde la página.
-- Ejecutar DESPUÉS de schema.sql (Supabase → SQL Editor → New query → Run).
-- Se puede ejecutar más de una vez.
--
-- Reglas:
--   * Cualquier usuario @bafar.com.mx con sesión: ve el scorecard y captura la columna "real".
--   * Solo los correos en public.sc_editores: agregan, editan (nombre, peso, meta, unidad,
--     indicador, orden) y eliminan tareas.
-- Para dar permiso de editor:
--   insert into public.sc_editores (email) values ('nombre@bafar.com.mx') on conflict do nothing;

-- 1. Lista de editores
create table if not exists public.sc_editores (
-- 2. ID automático para tareas nuevas (secuencia normal, sin identity)
create sequence if not exists public.sc_tareas_id_seq as smallint owned by public.sc_tareas.id;
alter table public.sc_tareas alter column id set default nextval('public.sc_tareas_id_seq');
select setval('public.sc_tareas_id_seq', greatest((select coalesce(max(id),0) from public.sc_tareas), 1));
alter table public.sc_tareas alter column unidad set default '%';
alter table public.sc_tareas alter column orden  set default 99;

-- 3. ¿Es editor el usuario con sesión?
create or replace function public.sc_es_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_usuario_permitido()
     and exists (select 1 from public.sc_editores where email = lower(auth.jwt() ->> 'email'));
$$;

-- 4. Auditoría + candado: quien no es editor solo puede cambiar "real"
create or replace function public.sc_tareas_auditoria() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not public.sc_es_editor() and
     (new.nombre, new.peso, new.meta, new.unidad, new.indicador_id, new.orden)
       is distinct from
     (old.nombre, old.peso, old.meta, old.unidad, old.indicador_id, old.orden) then
    raise exception 'Solo los editores pueden modificar la tarea; tú solo puedes capturar el valor real.';
  end if;
  new.actualizado_por := auth.jwt() ->> 'email';
  new.actualizado_en  := now();
  return new;
end $$;

drop trigger if exists sc_tareas_auditoria on public.sc_tareas;
create trigger sc_tareas_auditoria before insert or update on public.sc_tareas
  for each row execute function public.sc_tareas_auditoria();

-- 5. Políticas
alter table public.sc_editores enable row level security;
drop policy if exists "ver mi permiso"  on public.sc_editores;
create policy "ver mi permiso" on public.sc_editores for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "agregar tareas"  on public.sc_tareas;
drop policy if exists "eliminar tareas" on public.sc_tareas;
create policy "agregar tareas"  on public.sc_tareas for insert to authenticated with check (public.sc_es_editor());
create policy "eliminar tareas" on public.sc_tareas for delete to authenticated using (public.sc_es_editor());

-- 6. Permisos
revoke all on public.sc_editores from anon, authenticated;
grant select on public.sc_editores to authenticated;
grant insert, delete on public.sc_tareas to authenticated;
grant update (real, nombre, peso, meta, unidad, indicador_id, orden) on public.sc_tareas to authenticated;
grant usage, select on sequence public.sc_tareas_id_seq to authenticated;

-- 7. Verificación: debe listar INSERT, DELETE, varios UPDATE y la secuencia
select privilege_type || coalesce(' ' || column_name, '') as permiso
from information_schema.column_privileges
where table_schema='public' and table_name='sc_tareas' and grantee='authenticated' and privilege_type <> 'SELECT'
union all
select privilege_type from information_schema.table_privileges
where table_schema='public' and table_name='sc_tareas' and grantee='authenticated' and privilege_type in ('INSERT','DELETE')
union all
select 'default id: ' || column_default from information_schema.columns
where table_schema='public' and table_name='sc_tareas' and column_name='id';
