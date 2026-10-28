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
  async catalogo(){ return chk(await sb.from("pr_catalogo").select("*").order("nombre")); },
  async guardarCatalogo(c){
    const row = { nombre: c.nombre, meta: c.meta, unidad: c.unidad, descripcion: c.descripcion };
    if(c.id){ chkRows(await sb.from("pr_catalogo").update(row).eq("id", c.id).select("id")); return c.id; }
    return chk(await sb.from("pr_catalogo").insert(row).select("id").single()).id;
  },
  async eliminarCatalogo(id){ chkRows(await sb.from("pr_catalogo").delete().eq("id", id).select("id")); },
  async asignarTarea(a){ return chk(await sb.rpc("pr_asignar_tarea", { cat: a.cat, destinos: a.destinos, anio: a.anio, trimestre: a.trimestre,
    indicador: a.indicador, meta: a.meta, unidad: a.unidad, repartir: a.repartir, incluir_liberados: a.incluir_liberados })); },
  async quitarTarea(tid, repartir){ chk(await sb.rpc("pr_quitar_tarea", { tid, repartir })); },
  async fusionarCatalogo(origen, destino){ return chk(await sb.rpc("pr_fusionar_catalogo", { origen, destino })); },
  async capturarReal(id, real){ chkRows(await sb.from("pr_tareas").update({ real }).eq("id", id).select("id")); },
  async solicitarLiberacion(pid, img){ return liberacion(pid, "solicitar", null, img); },
  async liberar(pid, img){ return liberacion(pid, "liberar", null, img); },
  async devolver(pid, comentario){ return liberacion(pid, "devolver", comentario, null); },
  prepararTeams(){ if(window.Teams) window.Teams.prepare(me); },
  teams(){ return window.Teams && window.Teams.enabled() ? { conectado: window.Teams.connected(), conectar: ()=>window.Teams.connect(me) } : null; },
  async reabrir(pid){ chk(await sb.rpc("pr_liberacion", { pid, accion: "reabrir", coment: null })); }
};

// ---------- liberación + aviso por Teams
async function liberacion(pid, accion, coment, img){
  await window.Teams.ready();                         // el token se pidió en el instante del clic
  const d = chk(await sb.rpc("pr_liberacion", { pid, accion, coment }));
  const per = `Q${d.trimestre} ${d.anio}`;
  const texto = accion === "solicitar" ? `<b>${d.de_nombre}</b> envió su pronóstico <b>${per}</b> para que lo liberes.`
    : accion === "liberar" ? `Tu pronóstico <b>${per}</b> fue <b>liberado</b>. Ya puedes capturar en <a href="https://bafar.csod.com/">Corner</a>.`
    : `Tu pronóstico <b>${per}</b> fue <b>devuelto</b> para corrección:<br>«${String(coment).replace(/[<>&]/g,"")}»`;
  return window.Teams.send({ para: d.para, para_nombre: d.para_nombre, texto, img });
}

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
  if(window.Teams && window.Teams.enabled()) window.Teams.silent(email).then(ok=>{ if(ok && window.App.refreshSoon) window.App.refreshSoon(); });
  if(!channel){
    channel = sb.channel("pronosticos-cambios");
    ["pr_pronosticos","pr_indicadores","pr_tareas","pr_catalogo"].forEach(table=>
      channel.on("postgres_changes", { event: "*", schema: "public", table }, ()=>window.App.refreshSoon()));
    channel.subscribe(s=>{ if(s === "SUBSCRIBED") $("status").textContent = "· en vivo"; });
  }
}

// Entrar con Microsoft (Supabase → proveedor Azure; solo el tenant de Bafar)
$("btnMs").addEventListener("click", async ()=>{
  const m = $("msMsg"); m.className = "hint"; m.textContent = "Abriendo Microsoft…"; $("btnMs").disabled = true;
  const { error } = await sb.auth.signInWithOAuth({ provider: "azure",
    options: { scopes: "email profile offline_access", queryParams: { prompt: "select_account" }, redirectTo: location.origin + location.pathname.replace(/index\.html$/, "") } });
  if(error){ $("btnMs").disabled = false; m.className = "hint err"; m.textContent = "No se pudo iniciar con Microsoft: " + error.message; console.error("[login ms]", error); }
});
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
      : (error.status >= 500 || !error.message || error.message === "{}")
        ? `El servidor de correo no pudo enviar el enlace (código ${error.status || "?"}${error.code ? " · " + error.code : ""}). Avisa al administrador.`
        : "No se pudo enviar el enlace: " + error.message + (error.status ? ` (código ${error.status})` : "");
    console.error("[login]", error);
    return;
  }
  m.className = "hint ok"; m.textContent = `Listo. Revisa ${email} y abre el enlace para entrar.`;
  $("codeForm").hidden = false;
});
$("codeForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("loginEmail").value.trim().toLowerCase(), token = $("loginCode").value.replace(/\D/g,""), m = $("codeMsg");
  if(token.length < 6){ m.className = "hint err"; m.textContent = "Escribe el código que llegó a tu correo."; return; }
  $("btnCode").disabled = true; m.className = "hint"; m.textContent = "Verificando…";
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  $("btnCode").disabled = false;
  if(error){ m.className = "hint err"; m.textContent = "Código incorrecto o vencido. Pide un enlace nuevo."; return; }
  m.textContent = "";
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
