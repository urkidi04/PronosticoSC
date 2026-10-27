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

## Liberación
- Estados: **Borrador → Por liberar → Liberado**. El colaborador envía su pronóstico a liberación; el administrador lo libera, lo devuelve con comentario o lo reabre ([`supabase/06_liberacion.sql`](supabase/06_liberacion.sql)).
- Mientras está por liberar o liberado, el colaborador no puede cambiar estructura, metas ni pesos (sí captura el real). No se puede enviar ni liberar si los pesos no suman 100.
- Aviso por **Microsoft Teams** con la imagen del scorecard, en el chat 1 a 1 entre las personas, mediante **Microsoft Graph** (`teams.js`, MSAL). Requiere registrar la app en Entra ID y poner `MS_CLIENT_ID` / `MS_TENANT_ID` en `config.js`. Sin eso, la página abre el chat de Teams con el texto listo para pegar la imagen.

### Registro en Entra ID (una vez)
1. **Entra ID → App registrations → New registration**: nombre *Pronóstico SC*, *Single tenant*.
2. **Authentication → Add a platform → Single-page application**: redirect URI `https://urkidi04.github.io/PronosticoSC/`.
3. **API permissions → Microsoft Graph → Delegated**: `User.Read`, `Chat.Create`, `ChatMessage.Send` → *Grant admin consent*.
4. Copia *Application (client) ID* y *Directory (tenant) ID* a `config.js`.

## App instalable (PWA)
- Se instala con el botón **⤓ Instalar app** (Chrome/Edge en Android, Windows o Mac) o, en iPhone/iPad, desde Safari con **Compartir → Agregar a pantalla de inicio**.
- `manifest.webmanifest`, `sw.js` (red primero; los datos de Supabase nunca se guardan en caché) e `icons/`.
- Entrada con **código de 6 dígitos**: en la app instalada el enlace del correo abre el navegador, así que se puede escribir el código. Requiere que la plantilla de correo de Supabase incluya `{{ .Token }}`.

## Tablero del administrador
- **Estructura y alineación**: indicadores del equipo, organigrama con cumplimiento (▲ ≥95 %, ● 80–95 %, ▼ <80 %), cascada de cada indicador del gerente hacia líderes y consultores, y matriz de alineación.
- **Evaluación de alineación**: cobertura de cada indicador del gerente, indicadores sin alinear o con cadena rota, y estado por persona.
- **Equipo**: alta y edición de personas (correo, núm. empleado, posición, puesto, nivel, área, a quién reporta). Las personas pueden registrarse con correo pendiente y capturarlo después; sus pronósticos se conservan.
- Cada indicador puede alinearse a un indicador de su jefe en el mismo periodo. Al replicar a un colaborador directo, la alineación se asigna sola.

## Puesta en marcha (Supabase, mismo proyecto que HubInnovacion)
1. **SQL Editor**: ejecuta, en orden, [`schema.sql`](supabase/schema.sql), [`03_pronosticos.sql`](supabase/03_pronosticos.sql), [`04_estructura.sql`](supabase/04_estructura.sql) , [`05_posicion.sql`](supabase/05_posicion.sql) y [`06_liberacion.sql`](supabase/06_liberacion.sql).
2. Ejecuta los archivos privados con el administrador inicial y la estructura del equipo (se comparte por fuera, no está en el repo).
3. **Authentication → URL Configuration → Redirect URLs**: `https://urkidi04.github.io/PronosticoSC/`.
4. **Settings → Pages**: `main` / `(root)`.

[`config.js`](config.js) usa la *anon key*, pública por diseño; los datos los protegen las políticas RLS. **Nunca** pongas aquí la *service_role key*.

> `02_editar_tareas.sql` y las tablas `sc_*` corresponden a la versión anterior (un solo scorecard); ya no las usa la página.
