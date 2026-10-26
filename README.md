# Pronóstico SC

Pronósticos de scorecard trimestral por colaborador (Oficina Aplicaciones SAP/POS).

- Sitio estático publicado con GitHub Pages: `index.html` + `app.js` (interfaz) + `supabase-api.js` (datos).
- **Acceso con enlace mágico al correo; solo correos `@bafar.com.mx`** (validado en el navegador y en las políticas RLS de la base).
- Los datos (colaboradores, metas, pesos, valores reales) viven en **Supabase**, no en este repositorio.

## Roles

| | Administrador (`pr_admins`) | Colaborador |
|---|---|---|
| Ver pronósticos | Todos | Solo los suyos |
| Alta / eliminar pronóstico, cambiar año o trimestre | ✔ | — |
| Agregar, editar y eliminar indicadores, tareas y ponderaciones | ✔ | En los suyos |
| Capturar valor real | ✔ | En los suyos |
| Replicar | A cualquier persona y trimestre | Los suyos, a otros trimestres |

Cada pronóstico se asocia a un correo y número de empleado, con año y trimestre (Q1–Q4). Al replicar se copian indicadores y tareas; los valores reales solo si se marca la casilla. Si la persona ya tiene pronóstico en ese periodo, se omite.

## Puesta en marcha (Supabase, mismo proyecto que HubInnovacion)
1. **SQL Editor**: ejecuta [`supabase/schema.sql`](supabase/schema.sql) (función de dominio) y [`supabase/03_pronosticos.sql`](supabase/03_pronosticos.sql).
2. Ejecuta el archivo privado con el administrador inicial (se comparte por fuera, no está en el repo).
3. **Authentication → URL Configuration → Redirect URLs**: `https://urkidi04.github.io/PronosticoSC/`.
4. **Settings → Pages**: `main` / `(root)`.

[`config.js`](config.js) usa la *anon key*, pública por diseño; los datos los protegen las políticas RLS. **Nunca** pongas aquí la *service_role key*.

> `02_editar_tareas.sql` y las tablas `sc_*` corresponden a la versión anterior (un solo scorecard); ya no las usa la página.
