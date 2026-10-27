// Capa de datos real: Supabase (sesión con enlace mágico, RLS en la base).
(function(){
const $ = id => document.getElementById(id);
const CFG = window.APP_CONFIG || {};
const DOMAIN = (CFG.ALLOWED_DOMAIN || "").toLowerCase();
let sb = null, me = null, channel = null, started = false;

function friendly(e){
  const m = String(e && e.message || e || "");
  if(e && e.code === "23505"){
    if(m.includes("num_empleado")) return "Ese número de empleado ya está asignado a otra persona.";
    if(m.includes("pr_pronosticos")) return "Esa persona ya tiene pronóstico en ese año y trimestre.";
    return "Ya existe un registro igual.";
  }
  if(e && e.code === "23503") return "El colaborador no está dado de alta.";
  if(e && e.code === "42501" || /row-level security|permission denied/i.test(m)) return "No tienes permiso para esta acción.";
  return m || "Error inesperado";
}
const chk = ({ data, error }) => { if(error) throw new Error(friendly(error)); return data; };
const chkRows = r => { const d = chk(r); if(Array.isArray(d) && !d.length) throw new Error("No tienes permiso para esta acción."); return d; };

window.API = {
  async list(){
    return chk(await sb.from("pr_pronosticos")
      .select("*, empleado:pr_empleados(*), indicadores:pr_indicadores(*, tareas:pr_tareas(*))"))
      .map(p=>({ ...p, indicadores: (p.indicadores||[]).map(i=>({ ...i, tareas: i.tareas||[] })) }));
  },
  async empleados(){ return chk(await sb.from("pr_empleados").select("*").order("nombre")); },
  async guardarEmpleado(e){ chk(await sb.from("pr_empleados").upsert(e, { onConflict: "email" })); },
  async actualizarEmpleado(old, e){
    if(e.email !== old && (await sb.from("pr_empleados").select("email").eq("email", e.email)).data?.length) throw new Error("Ese correo ya está registrado.");
    chkRows(await sb.from("pr_empleados").update(e).eq("email", old).select("email"));
  },
  async indicadoresJefe(pid){ return chk(await sb.rpc("pr_indicadores_jefe", { pid })) || []; },
  async crearPronostico({ email, anio, trimestre }){
    return chk(await sb.from("pr_pronosticos").insert({ email, anio, trimestre }).select("id").single()).id;
  },
  async actualizarPronostico(id, { anio, trimestre }){ chkRows(await sb.from("pr_pronosticos").update({ anio, trimestre }).eq("id", id).select("id")); },
  async eliminarPronostico(id){ chkRows(await sb.from("pr_pronosticos").delete().eq("id", id).select("id")); },
  async replicar(src, destinos, periodos, copiar_real){
    return chk(await sb.rpc("pr_replicar", { src, destinos, periodos, copiar_real }));
  },
  async guardarIndicador(pronostico_id, d){
    const row = { nombre: d.nombre, medible: d.medible || null, peso: d.peso, orden: d.orden, alineado_a: d.alineado_a || null };
    if(d.id) chkRows(await sb.from("pr_indicadores").update(row).eq("id", d.id).select("id"));
    else chk(await sb.from("pr_indicadores").insert({ ...row, pronostico_id }));
  },
  async eliminarIndicador(id){ chkRows(await sb.from("pr_indicadores").delete().eq("id", id).select("id")); },
  async guardarTarea(t){
    const row = { indicador_id: t.indicador_id, nombre: t.nombre, peso: t.peso, meta: t.meta, unidad: t.unidad, orden: t.orden };
    if(t.id) chkRows(await sb.from("pr_tareas").update(row).eq("id", t.id).select("id"));
    else chk(await sb.from("pr_tareas").insert(row));
  },
  async eliminarTarea(id){ chkRows(await sb.from("pr_tareas").delete().eq("id", id).select("id")); },
  async capturarReal(id, real){ chkRows(await sb.from("pr_tareas").update({ real }).eq("id", id).select("id")); }
};

// ---------- sesión
function showLogin(){ $("login").hidden = false; $("btnOut").hidden = true; window.App.stop(); }
async function enter(session){
  const email = (session.user.email || "").toLowerCase();
  if(DOMAIN && !email.endsWith("@"+DOMAIN)){ await sb.auth.signOut(); showLogin(); return; }
  if(started && me === email) return;
  me = email; started = true;
  $("login").hidden = true; $("btnOut").hidden = false;
  const adm = await sb.from("pr_admins").select("email").limit(1);
  await window.App.start({ email, isAdmin: !adm.error && adm.data.length > 0 });
  if(!channel){
    channel = sb.channel("pronosticos-cambios");
    ["pr_pronosticos","pr_indicadores","pr_tareas"].forEach(table=>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, ()=>window.App.refreshSoon()));
    channel.subscribe(s=>{ if(s === "SUBSCRIBED") $("status").textContent = "· en vivo"; });
  }
}

$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("loginEmail").value.trim().toLowerCase(), m = $("loginMsg");
  m.className = "hint";
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ m.className = "hint err"; m.textContent = "Escribe un correo válido."; return; }
  if(DOMAIN && !email.endsWith("@"+DOMAIN)){ m.className = "hint err"; m.textContent = `Usa tu correo @${DOMAIN}.`; return; }
  $("btnLogin").disabled = true; m.textContent = "Enviando enlace…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split("#")[0] } });
  $("btnLogin").disabled = false;
  if(error){
    const msg = String(error.message || "").toLowerCase();
    m.className = "hint err";
    m.textContent = (error.status === 429 || msg.includes("rate limit"))
      ? "Se alcanzó el límite de correos por hora. Espera unos minutos e intenta de nuevo."
      : "No se pudo enviar el enlace: " + error.message;
    return;
  }
  m.className = "hint ok"; m.textContent = `Listo. Revisa ${email} y abre el enlace para entrar.`;
});
$("btnOut").addEventListener("click", async ()=>{
  if(channel){ sb.removeChannel(channel); channel = null; }
  await sb.auth.signOut(); me = null; started = false; $("status").textContent = ""; showLogin();
});

document.addEventListener("DOMContentLoaded", async ()=>{
  if(!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)){ $("setup").hidden = false; return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((_ev, session)=>{ session ? setTimeout(()=>enter(session), 0) : (me = null, started = false, showLogin()); });
  const { data } = await sb.auth.getSession();
  if(!data.session) showLogin();
});
})();
