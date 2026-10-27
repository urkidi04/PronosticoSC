-- Pronóstico SC — número de posición (SAP HCM) por colaborador. Ejecutar después de 04_estructura.sql.
alter table public.pr_empleados add column if not exists posicion text;
