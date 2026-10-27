// Configuración de la base compartida (Supabase).
// Copia estos valores de tu proyecto: Supabase → Project Settings → API.
// La "anon public key" está pensada para ir en el navegador; la seguridad la dan
// las políticas RLS de supabase/schema.sql (solo correos del dominio permitido).
window.APP_CONFIG = {
  SUPABASE_URL: "https://cuwulmaxhlwzbutmhssf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1d3VsbWF4aGx3emJ1dG1oc3NmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjkwNjQsImV4cCI6MjEwODYwNTA2NH0.exEsDjYNnBS8yoOwVpKArbgf-Mo02MX2NnrOaR269Gg",
  ALLOWED_DOMAIN: "bafar.com.mx",
  // Microsoft Graph (avisos por Teams). Entra ID → App registrations → Pronóstico SC.
  // No son secretos: identifican la app. Vacíos = se usa el respaldo (abrir Teams y pegar la imagen).
  MS_CLIENT_ID: "7e28716c-2b6f-42e9-b654-ebec8a418a84",
  MS_TENANT_ID: "3e67a7ed-0ddf-4afa-ba03-f204fad6d749"
};
 
