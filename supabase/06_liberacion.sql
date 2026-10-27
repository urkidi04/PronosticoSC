-- Pronóstico SC — flujo de liberación: borrador → por_liberar → liberado.
-- Ejecutar después de 05_posicion.sql. Se puede ejecutar más de una vez.
--
--   * El colaborador envía SU pronóstico a liberación (solo desde borrador).
--   * El administrador libera, devuelve (con comentario) o reabre.
--   * Mientras está por liberar o liberado, el colaborador ya no puede cambiar indicadores,
--     tareas, metas ni pesos; sí puede seguir capturando el valor real.
--   * El aviso por Teams lo envía la página con Microsoft Graph (chat 1 a 1 entre las personas).

alter table public.pr_pronosticos add column if not exists estado        text not null default 'borrador';
alter table public.pr_pronosticos add column if not exists solicitado_en timestamptz;
alter table public.pr_pronosticos add column if not exists liberado_en   timestamptz;
alter table public.pr_pronosticos add column if not exists liberado_por  text;
alter table public.pr_pronosticos add column if not exists comentario    text;
do $$ begin
  alter table public.pr_pronosticos add constraint pr_pronosticos_estado_chk check (estado in ('borrador','por_liberar','liberado'));
exception when duplicate_object then null; end $$;

-- 1. Cambio de estado (única vía para el colaborador; el admin también la usa para quedar registrado)
create or replace function public.pr_liberacion(pid bigint, accion text, coment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p pr_pronosticos; yo text := public.pr_yo(); adm boolean := public.pr_es_admin();
  para text; para_nombre text; de_nombre text;
begin
  select * into p from pr_pronosticos where id = pid;
  if p.id is null or not public.pr_puede_pron(pid) then raise exception 'No tienes acceso a ese pronóstico.'; end if;
  if accion = 'solicitar' then
    if p.email <> yo then raise exception 'Solo puedes enviar a liberación tu propio pronóstico.'; end if;
    if p.estado <> 'borrador' then raise exception 'Este pronóstico ya fue enviado a liberación.'; end if;
    update pr_pronosticos set estado = 'por_liberar', solicitado_en = now(), comentario = null where id = pid;
    select email into para from pr_admins order by email limit 1;        -- aviso al administrador
  elsif accion in ('liberar','devolver','reabrir') then
    if not adm then raise exception 'Solo el administrador puede %.', accion; end if;
    if accion = 'liberar' then
      update pr_pronosticos set estado = 'liberado', liberado_en = now(), liberado_por = yo, comentario = null where id = pid;
    elsif accion = 'devolver' then
      if p.estado <> 'por_liberar' then raise exception 'Solo se puede devolver un pronóstico por liberar.'; end if;
      if coalesce(trim(coment),'') = '' then raise exception 'Escribe qué debe corregir.'; end if;
      update pr_pronosticos set estado = 'borrador', comentario = left(trim(coment), 500) where id = pid;
    else
      update pr_pronosticos set estado = 'borrador', liberado_en = null, liberado_por = null where id = pid;
    end if;
    para := p.email;                                                    -- aviso al colaborador
  else
    raise exception 'Acción no válida.';
  end if;
  select nombre into para_nombre from pr_empleados where email = para;
  select nombre into de_nombre from pr_empleados where email = yo;
  return jsonb_build_object('para', para, 'para_nombre', coalesce(para_nombre, para), 'de_nombre', coalesce(de_nombre, yo),
                            'anio', p.anio, 'trimestre', p.trimestre, 'accion', accion);
end $$;
revoke all on function public.pr_liberacion(bigint, text, text) from public, anon;
grant execute on function public.pr_liberacion(bigint, text, text) to authenticated;

-- 2. Candado de estructura cuando el pronóstico no está en borrador (el admin siempre puede)
create or replace function public.pr_estado_de(pid bigint) returns text
language sql stable security definer set search_path = public as $$ select estado from pr_pronosticos where id = pid $$;

create or replace function public.pr_candado_indicadores() returns trigger
language plpgsql as $$
declare pid bigint := case when tg_op = 'DELETE' then old.pronostico_id else new.pronostico_id end;
begin
  if not public.pr_es_admin() and coalesce(public.pr_estado_de(pid), 'borrador') <> 'borrador'
     and public.pr_yo() is not null then
    raise exception 'El pronóstico está en liberación o liberado: no se puede modificar su estructura.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists pr_candado_indicadores on public.pr_indicadores;
create trigger pr_candado_indicadores before insert or update or delete on public.pr_indicadores
  for each row execute function public.pr_candado_indicadores();

create or replace function public.pr_candado_tareas() returns trigger
language plpgsql as $$
declare iid bigint := case when tg_op = 'DELETE' then old.indicador_id else new.indicador_id end;
        est text;
begin
  if public.pr_es_admin() or public.pr_yo() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  est := coalesce(public.pr_estado_de((select pronostico_id from public.pr_indicadores where id = iid)), 'borrador');
  if est <> 'borrador' and (tg_op <> 'UPDATE' or
     (new.nombre, new.peso, new.meta, new.unidad, new.orden, new.indicador_id) is distinct from
     (old.nombre, old.peso, old.meta, old.unidad, old.orden, old.indicador_id)) then
    raise exception 'El pronóstico está en liberación o liberado: solo puedes capturar el valor real.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists pr_candado_tareas on public.pr_tareas;
create trigger pr_candado_tareas before insert or update or delete on public.pr_tareas
  for each row execute function public.pr_candado_tareas();
