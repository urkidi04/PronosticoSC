# Pronóstico SC Q4 2026

Visualización y pronóstico del Scorecard Q4 2026 (Oficina Aplicaciones SAP/POS).

- Sitio estático (`index.html`) publicado con GitHub Pages.
- **Acceso con enlace mágico al correo; solo correos `@bafar.com.mx`** (validado en el navegador y en las políticas RLS de la base).
- Los datos del scorecard (indicadores, metas, pesos y valores reales) viven en **Supabase**, no en este repositorio. Sin sesión, la página no muestra ninguna cifra.
- Cualquier usuario `@bafar.com.mx` captura la columna *Real*. Solo los **editores** (tabla `sc_editores`) pueden agregar, editar y eliminar tareas, y repartir pesos. Se registra quién hizo cada cambio y todo se ve en vivo.

## Puesta en marcha

### 1. Base en Supabase (mismo proyecto que HubInnovacion)
1. **SQL Editor → New query**: pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql).
2. Ejecuta [`supabase/02_editar_tareas.sql`](supabase/02_editar_tareas.sql) (alta, edición y baja de tareas).
3. Ejecuta los datos base y el editor inicial (archivos que se comparten por fuera, no están en el repo).
4. Para agregar editores: `insert into public.sc_editores (email) values ('nombre@bafar.com.mx') on conflict do nothing;`
5. **Authentication → URL Configuration → Redirect URLs**: agrega `https://urkidi04.github.io/PronosticoSC/`.

### 2. Configuración
[`config.js`](config.js) usa la misma URL y *anon key* que HubInnovacion. La *anon key* es pública por diseño; lo que protege los datos son las políticas RLS. **Nunca** pongas aquí la *service_role key*.

### 3. GitHub Pages
**Settings → Pages → Deploy from a branch → `main` / `(root)`**.
