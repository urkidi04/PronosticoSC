-- Pronóstico SC — estructura del equipo y alineación (cascada) de indicadores.
-- Ejecutar DESPUÉS de 03_pronosticos.sql. Se puede ejecutar más de una vez.

-- 1. Estructura: puesto, nivel, área y jefe de cada colaborador
alter table public.pr_empleados add column if not exists puesto text;
alter table public.pr_empleados add column if not exists nivel  smallint;
alter table public.pr_empleados add column if not exists area   text;
alter table public.pr_empleados add column if not exists jefe   text;
do $$ begin
  alter table public.pr_empleados add constraint pr_empleados_jefe_fk
    foreign key (jefe) references public.pr_empleados(email) on update cascade on delete set null;
exception when duplicate_object then null; end $$;

-- Cambiar el correo de una persona actualiza sus pronósticos (correos "pendientes" al inicio)
do $$ begin
  alter table public.pr_pronosticos drop constraint if exists pr_pronosticos_email_fkey;
  alter table public.pr_pronosticos add constraint pr_pronosticos_email_fkey
    foreign key (email) references public.pr_empleados(email) on update cascade;
end $$;

-- 2. Alineación: un indicador puede contribuir a un indicador del jefe (mismo periodo)
alter table public.pr_indicadores add column if not exists alineado_a bigint;
do $$ begin
  alter table public.pr_indicadores add constraint pr_indicadores_alineado_fk
    foreign key (alineado_a) references public.pr_indicadores(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists pr_indicadores_alineado_idx on public.pr_indicadores (alineado_a);

-- Pronóstico del jefe de una persona en el mismo periodo que el pronóstico pid
create or replace function public.pr_pron_jefe(pid bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select pj.id from pr_pronosticos p
    join pr_empleados e on e.email = p.email
    join pr_pronosticos pj on pj.email = e.jefe and pj.anio = p.anio and pj.trimestre = p.trimestre
  where p.id = pid;
$$;

-- Solo se puede alinear a un indicador del pronóstico del jefe en el mismo periodo
create or replace function public.pr_indicadores_valida_alineacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.alineado_a is not null and not exists
     (select 1 from pr_indicadores i where i.id = new.alineado_a and i.pronostico_id = pr_pron_jefe(new.pronostico_id)) then
    raise exception 'Solo puedes alinear a un indicador de tu jefe en el mismo periodo.';
  end if;
  return new;
end $$;
drop trigger if exists pr_indicadores_valida_alineacion on public.pr_indicadores;
create trigger pr_indicadores_valida_alineacion before insert or update of alineado_a, pronostico_id on public.pr_indicadores
  for each row execute function public.pr_indicadores_valida_alineacion();

-- Indicadores del jefe (para elegir la alineación; el colaborador no ve el pronóstico del jefe)
create or replace function public.pr_indicadores_jefe(pid bigint)
returns table (id bigint, nombre text, peso numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pr_puede_pron(pid) then raise exception 'No tienes acceso a ese pronóstico.'; end if;
  return query select i.id, i.nombre, i.peso from pr_indicadores i where i.pronostico_id = pr_pron_jefe(pid) order by i.orden, i.id;
end $$;
revoke all on function public.pr_indicadores_jefe(bigint) from public, anon;
grant execute on function public.pr_indicadores_jefe(bigint) to authenticated;

-- 3. Replicar con alineación automática
--    * Si el destino reporta al dueño del origen: cada indicador se alinea al indicador del jefe
--      con el mismo nombre en el periodo destino.
--    * Si no: conserva la alineación del origen (mismo nombre en el pronóstico del jefe del destino).
create or replace function public.pr_replicar(src bigint, destinos text[], periodos jsonb, copiar_real boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  yo text := public.pr_yo();
  dueno text := (select email from pr_pronosticos where id = src);
  d text; per jsonb; nuevo bigint; pj bigint; ind record; nind bigint; al bigint; nom text;
  creados bigint[] := '{}'; omitidos int := 0;
begin
  if not public.pr_puede_pron(src) then raise exception 'No tienes acceso a ese pronóstico.'; end if;
  if not public.pr_es_admin() and exists (select 1 from unnest(destinos) x where lower(x) <> yo) then
    raise exception 'Solo puedes replicar a tus propios pronósticos.';
  end if;
  foreach d in array destinos loop
    for per in select * from jsonb_array_elements(periodos) loop
      if exists (select 1 from pr_pronosticos where email = lower(d)
                 and anio = (per->>'anio')::smallint and trimestre = (per->>'trimestre')::smallint) then
        omitidos := omitidos + 1; continue;
      end if;
      insert into pr_pronosticos (email, anio, trimestre, creado_por)
        values (lower(d), (per->>'anio')::smallint, (per->>'trimestre')::smallint, yo) returning id into nuevo;
      pj := pr_pron_jefe(nuevo);
      for ind in select * from pr_indicadores where pronostico_id = src order by orden, id loop
        al := null;
        if pj is not null then
          nom := case when (select jefe from pr_empleados where email = lower(d)) = dueno then ind.nombre
                      else (select nombre from pr_indicadores where id = ind.alineado_a) end;
          if nom is not null then
            select id into al from pr_indicadores where pronostico_id = pj and nombre = nom order by orden, id limit 1;
          end if;
        end if;
        insert into pr_indicadores (pronostico_id, nombre, medible, peso, orden, alineado_a)
          values (nuevo, ind.nombre, ind.medible, ind.peso, ind.orden, al) returning id into nind;
        insert into pr_tareas (indicador_id, nombre, peso, meta, unidad, orden, real)
          select nind, nombre, peso, meta, unidad, orden, case when copiar_real then real end
          from pr_tareas where indicador_id = ind.id;
      end loop;
      creados := creados || nuevo;
    end loop;
  end loop;
  return jsonb_build_object('creados', to_jsonb(creados), 'omitidos', omitidos);
end $$;
revoke all on function public.pr_replicar(bigint, text[], jsonb, boolean) from public, anon;
grant execute on function public.pr_replicar(bigint, text[], jsonb, boolean) to authenticated;
