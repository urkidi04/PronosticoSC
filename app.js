// Pronóstico SC — interfaz. Usa window.API (demo en memoria o Supabase), misma interfaz.
(function(){
const $ = id => document.getElementById(id);
const API = new Proxy({}, { get: (_, k) => window.API[k] });
const nf  = new Intl.NumberFormat("es-MX",{maximumFractionDigits:1});
const nf0 = new Intl.NumberFormat("es-MX");
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const statusColor = p => p>=95 ? "var(--good)" : p>=80 ? "var(--warn)" : "var(--bad)";
const COLORS = ["--c1","--c2","--c3","--c4","--c5"];
const color = i => COLORS[i % COLORS.length];
const Q = n => "Q"+n;
const THIS_YEAR = new Date().getFullYear();

let ME = null, PRONS = [], EMPS = [], curId = null;
const filt = { anio:"", q:0, txt:"", est:"" };

function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),2600)}
async function run(fn, ok){
  try{ const r = await fn(); if(ok) toast(ok); return r; }
  catch(e){ toast(e.message || String(e)); throw e; }
}
const pron = id => PRONS.find(p=>p.id===id);
const canEdit = p => ME.isAdmin || (p.email === ME.email && (p.estado || "borrador") === "borrador");
const empOf = p => p.empleado || {};
const label = p => `${empOf(p).nombre || p.email} · ${Q(p.trimestre)} ${p.anio}`;

// ---------- cálculo
const pctOf = t => (t.real===null || t.real===undefined || t.real==="") ? null
  : Math.max(0, Math.min(100, Number(t.real) / Number(t.meta) * 100));
function score(p){
  let total = 0, cap = 0, n = 0; const inds = [];
  p.indicadores.forEach(ind=>{
    let s = 0;
    ind.tareas.forEach(t=>{ n++; const v = pctOf(t); if(v!==null) cap++; s += Number(t.peso) * (v||0) / 100; });
    const pts = Number(ind.peso) * s / 100; total += pts; inds.push({s, pts});
  });
  return { total, cap, n, inds };
}
const sortInds = p => p.indicadores.sort((a,b)=>a.orden-b.orden||a.id-b.id).forEach(i=>i.tareas.sort((a,b)=>a.orden-b.orden||a.id-b.id));

// ---------- carga
async function refresh(){
  PRONS = await API.list();
  PRONS.forEach(sortInds);
  EMPS = await API.empleados();
  if(curId && !pron(curId)) curId = null;
  render();
}
function render(){ curId ? renderDetail() : view==="dash" ? renderDash() : view==="team" ? renderTeam() : renderList(); }

// ---------- lista
function renderList(){
  const years = [...new Set(PRONS.map(p=>p.anio))].sort((a,b)=>b-a);
  let rows = PRONS.filter(p=>(!filt.est || (p.estado||"borrador")===filt.est) && (!filt.anio || p.anio==filt.anio) && (!filt.q || p.trimestre==filt.q) &&
    (!filt.txt || (p.email+" "+(empOf(p).nombre||"")+" "+(empOf(p).num_empleado||"")).toLowerCase().includes(filt.txt.toLowerCase())));
  rows.sort((a,b)=> b.anio-a.anio || b.trimestre-a.trimestre || (empOf(a).nombre||a.email).localeCompare(empOf(b).nombre||b.email));
  $("main").innerHTML = navHtml() + `
    <div class="bar">
      <div>
        <h2 class="h">${ME.isAdmin ? "Pronósticos del equipo" : "Mis pronósticos"}</h2>
        <div class="sub">${PRONS.length} pronóstico${PRONS.length===1?"":"s"}${ME.isAdmin?" · "+new Set(PRONS.map(p=>p.email)).size+" personas":""}${(n=>n?` · <a href="#" id="lnkPor" class="por-lib">⏳ ${n} por liberar</a>`:"")(PRONS.filter(p=>p.estado==="por_liberar").length)}</div>
      </div>
      ${ME.isAdmin?`<button class="primary" id="btnNew">+ Nuevo pronóstico</button>`:""}
    </div>
    <div class="filters">
      <select id="fAnio" aria-label="Año"><option value="">Todos los años</option>${years.map(y=>`<option ${filt.anio==y?"selected":""}>${y}</option>`).join("")}</select>
      <select id="fEst" aria-label="Estado"><option value="">Todos los estados</option>${Object.entries({borrador:"Borrador",por_liberar:"Por liberar",liberado:"Liberado"}).map(([k,l])=>`<option value="${k}" ${filt.est===k?"selected":""}>${l}</option>`).join("")}</select>
      <div class="chips" role="group" aria-label="Trimestre">${[0,1,2,3,4].map(q=>`<button class="chip ${filt.q===q?"on":""}" data-q="${q}">${q?Q(q):"Todos"}</button>`).join("")}</div>
      ${ME.isAdmin?`<input id="fTxt" type="search" placeholder="Buscar nombre, correo o núm. empleado" value="${esc(filt.txt)}">`:""}
    </div>
    <section class="card flush">
    ${rows.length ? `<table class="list">
      <thead><tr>${ME.isAdmin?`<th>Empleado</th><th class="hide-sm">Núm. emp.</th>`:""}<th>Periodo</th><th class="hide-sm">Captura</th><th>Cumplimiento</th><th></th></tr></thead>
      <tbody>${rows.map(p=>{ const sc = score(p), e = empOf(p); return `
        <tr class="click" data-open="${p.id}">
          ${ME.isAdmin?`<td><b>${esc(e.nombre||"—")}</b><div class="by">${esc(p.email)}</div></td>
          <td class="mono hide-sm">${esc(e.num_empleado||"—")}</td>`:""}
          <td><span class="per">${Q(p.trimestre)} ${p.anio}</span> ${estBadge(p)}</td>
          <td class="mono hide-sm">${sc.cap}/${sc.n}</td>
          <td class="score-td" style="min-width:140px"><div class="cell-score"><div class="prog"><div style="width:${sc.total}%;background:${sc.cap?statusColor(sc.total):"var(--track)"}"></div></div><span class="mono st">${nf.format(sc.total)}%</span></div></td>
          <td class="act"><button class="ib" data-img="${p.id}" title="Generar imagen" aria-label="Generar imagen">🖼</button><button class="ib" data-rep="${p.id}" title="Replicar" aria-label="Replicar">⧉</button>${ME.isAdmin?`<button class="ib del" data-delp="${p.id}" title="Eliminar" aria-label="Eliminar">🗑</button>`:""}</td>
        </tr>`; }).join("")}</tbody></table>`
      : `<div class="empty big-empty">${PRONS.length ? "No hay pronósticos con estos filtros." : ME.isAdmin ? "Aún no hay pronósticos. Crea el primero con «+ Nuevo pronóstico»." : "Todavía no tienes pronósticos asignados."}</div>`}
    </section>`;
  bindNav();
  if($("btnNew")) $("btnNew").onclick = ()=>openPron(null);
  $("fAnio").onchange = e=>{ filt.anio = e.target.value; renderList(); };
  $("fEst").onchange = e=>{ filt.est = e.target.value; renderList(); };
  if($("lnkPor")) $("lnkPor").onclick = e=>{ e.preventDefault(); filt.est = "por_liberar"; renderList(); };
  document.querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{ filt.q = Number(b.dataset.q); renderList(); });
  if($("fTxt")) $("fTxt").oninput = e=>{ filt.txt = e.target.value; const pos=e.target.selectionStart; renderList(); const el=$("fTxt"); el.focus(); el.setSelectionRange(pos,pos); };
  document.querySelectorAll("[data-open]").forEach(tr=>tr.onclick=e=>{ if(e.target.closest("button")) return; curId = Number(tr.dataset.open); window.scrollTo(0,0); render(); });
  document.querySelectorAll("[data-rep]").forEach(b=>b.onclick=()=>openRep(Number(b.dataset.rep)));
  document.querySelectorAll("[data-img]").forEach(b=>b.onclick=()=>openImage(pron(Number(b.dataset.img))).catch(()=>{ $("dlgImg").close(); toast("No se pudo generar la imagen"); }));
  document.querySelectorAll("[data-delp]").forEach(b=>b.onclick=()=>askDelPron(Number(b.dataset.delp)));
}

// ---------- detalle
function renderDetail(){
  const p = pron(curId), e = empOf(p), sc = score(p), ED = canEdit(p);
  const sumInd = p.indicadores.reduce((a,i)=>a+Number(i.peso),0);
  $("main").innerHTML = `
    <button class="back" id="btnBack">← ${view==="dash"?"Estructura y alineación":ME.isAdmin?"Pronósticos del equipo":"Mis pronósticos"}</button>
    <section class="card head-card">
      <div>
        <div class="per big-per">${Q(p.trimestre)} ${p.anio}</div> ${estBadge(p)}
        <h2 class="h">${esc(e.nombre||p.email)}</h2>
        <div class="sub">${esc(p.email)} · Núm. empleado <span class="mono">${esc(e.num_empleado||"—")}</span></div>
      </div>
      <div class="tools">
        <button id="btnImg">🖼 Imagen</button><button id="btnRep">⧉ Replicar</button>
        ${ME.isAdmin?`<button id="btnEditP">Editar datos</button><button class="danger-ghost" id="btnDelP">Eliminar</button>`:""}
      </div>
    </section>
    ${relHtml(p)}
    <div class="grid">
      <section class="card">
        <h2>Cumplimiento ponderado</h2>
        <div class="score">
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--track)" stroke-width="12"/>
            <circle id="ringArc" cx="60" cy="60" r="50" fill="none" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)"/>
          </svg>
          <div><div class="big" id="total"></div><div class="sub" id="totalNote"></div></div>
        </div>
        <div class="kpis">
          <div class="kpi"><b class="mono">${p.indicadores.length}</b><span>Indicadores</span></div>
          <div class="kpi"><b class="mono">${sc.n}</b><span>Tareas</span></div>
          <div class="kpi"><b class="mono" id="captured"></b><span>Con real capturado</span></div>
        </div>
      </section>
      <section class="card">
        <h2>Peso por indicador</h2>
        ${p.indicadores.length?`<div class="wbar">${p.indicadores.map((d,i)=>`<div style="flex:${Number(d.peso)||0.0001};background:var(${color(i)})" title="${esc(d.nombre)}: ${d.peso}">${nf.format(d.peso)}</div>`).join("")}</div>
        <div class="legend">${p.indicadores.map((d,i)=>`<div><i style="background:var(${color(i)})"></i>${esc(d.nombre)} <span class="mono" style="color:var(--muted)">· ${nf.format(d.peso)}</span></div>`).join("")}</div>`
        :`<div class="empty">Sin indicadores todavía.</div>`}
        ${p.indicadores.length && Math.abs(sumInd-100)>0.01?`<div class="warn" style="margin-top:12px">⚠ Los pesos de los indicadores suman ${nf.format(sumInd)} (deben sumar 100).${ED?` <button id="evenInd">Repartir parejo</button>`:""}</div>`:""}
      </section>
    </div>
    <div id="inds">${p.indicadores.map((ind,i)=>indHtml(p, ind, i)).join("")}</div>
    ${ED?`<button class="addrow addind" id="btnAddInd">+ Agregar indicador</button>`:""}
    <p class="note">Cumplimiento de cada tarea = Real ÷ Meta (tope 100%). Indicador = Σ(peso tarea × cumplimiento). Total = Σ(peso indicador × cumplimiento del indicador).</p>`;
  $("btnBack").onclick = ()=>{ curId = null; render(); };
  $("btnRep").onclick = ()=>openRep(p.id);
  bindRel(p);
  $("btnImg").onclick = ()=>openImage(p).catch(e=>{ $("dlgImg").close(); toast("No se pudo generar la imagen"); });
  if(ME.isAdmin){
    $("btnEditP").onclick = ()=>openPron(p.id);
    $("btnDelP").onclick = ()=>askDelPron(p.id);
  }
  if(ED){
    $("btnAddInd").onclick = ()=>openInd(null);
    if($("evenInd")) $("evenInd").onclick = ()=>run(async()=>{ const w=100/p.indicadores.length; for(const d of p.indicadores) await API.guardarIndicador(p.id,{...strip(d),peso:w}); await refresh(); },"Pesos repartidos");
    document.querySelectorAll("[data-edi]").forEach(b=>b.onclick=()=>openInd(Number(b.dataset.edi)));
    document.querySelectorAll("[data-deli]").forEach(b=>b.onclick=()=>askDelInd(Number(b.dataset.deli)));
    document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>openTask(null, Number(b.dataset.add)));
    document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openTask(Number(b.dataset.edit)));
    document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>askDelTask(Number(b.dataset.del)));
    document.querySelectorAll("[data-even]").forEach(b=>b.onclick=()=>run(async()=>{ const ind=p.indicadores.find(x=>x.id==b.dataset.even), w=100/ind.tareas.length; for(const t of ind.tareas) await API.guardarTarea({...strip(t),peso:w}); await refresh(); },"Pesos repartidos"));
  }
  document.querySelectorAll("input[data-real]").forEach(inp=>{
    const t = findTask(Number(inp.dataset.real));
    inp.oninput = ()=>{ t.real = inp.value===""?null:Number(inp.value); compute(); };
    inp.onchange = ()=>{
      const v = inp.value===""?null:Number(inp.value);
      if(v!==null && (isNaN(v)||v<0)){ toast("Valor no válido"); return; }
      run(()=>API.capturarReal(t.id, v), "Guardado").catch(()=>{});
    };
  });
  compute();
  fillAlign(p);
}
let jefeInds = [];
async function fillAlign(p){
  try{ jefeInds = await API.indicadoresJefe(p.id); }catch(e){ jefeInds = []; }
  if(!pron(curId) || curId !== p.id) return;
  const hasJefe = jefeInds.length > 0;
  document.querySelectorAll("[data-al]").forEach(el=>{
    const j = jefeInds.find(x=>String(x.id)===el.dataset.al);
    if(j){ el.textContent = "↑ " + j.nombre; el.title = "Alineado al indicador de su jefe"; el.className = "ind-al"; el.hidden = false; }
    else if(hasJefe){ el.textContent = "Sin alinear"; el.title = "No contribuye a un indicador de su jefe"; el.className = "ind-al none"; el.hidden = false; }
  });
}
const strip = o => { const r = {...o}; delete r.tareas; return r; };
function findTask(id){ for(const d of pron(curId).indicadores) for(const t of d.tareas) if(t.id===id) return t; }
function indHtml(p, ind, i){
  const ED = canEdit(p);
  const pct = !ind.tareas[0] || ind.tareas[0].unidad==="%";
  const sum = ind.tareas.reduce((a,t)=>a+Number(t.peso),0);
  return `<section class="card ind">
    <div class="ind-head">
      <div class="ind-title"><span class="dot" style="background:var(${color(i)})"></span>
        <h3>${esc(ind.nombre)}</h3><span class="tag">Peso ${nf.format(ind.peso)}</span><span class="ind-al" data-al="${ind.alineado_a||""}" hidden></span>
        ${ED?`<button class="ib" data-edi="${ind.id}" title="Editar indicador" aria-label="Editar indicador">✎</button><button class="ib del" data-deli="${ind.id}" title="Eliminar indicador" aria-label="Eliminar indicador">🗑</button>`:""}</div>
      <div class="ind-score"><b class="mono" id="is-${ind.id}"></b><span id="ip-${ind.id}"></span></div>
    </div>
    ${ind.medible?`<div class="by" style="margin:-6px 0 8px 22px">${esc(ind.medible)}</div>`:""}
    ${ind.tareas.length && Math.abs(sum-100)>0.01?`<div class="warn">⚠ Los pesos de las tareas suman ${nf.format(sum)} (deben sumar 100).${ED?` <button data-even="${ind.id}">Repartir parejo</button>`:""}</div>`:""}
    ${ind.tareas.length?`<table>
      <thead><tr><th>Tarea</th><th class="num hide-sm">Peso</th><th class="num">Meta${pct?"":" ("+esc(ind.tareas[0].unidad)+")"}</th><th class="num">Real</th><th class="hide-sm"></th><th class="num">Cumpl.</th>${ED?"<th></th>":""}</tr></thead>
      <tbody>${ind.tareas.map(t=>`<tr>
        <td>${esc(t.nombre)}${t.actualizado_por?`<div class="by">${esc(t.actualizado_por)} · ${new Date(t.actualizado_en).toLocaleString("es-MX",{dateStyle:"short",timeStyle:"short"})}</div>`:""}</td>
        <td class="num mono hide-sm">${nf.format(t.peso)}</td>
        <td class="num mono">${nf0.format(t.meta)}<span class="unit">${t.unidad==="%"?"%":""}</span></td>
        <td class="num"><input type="number" min="0" step="any" data-real="${t.id}" aria-label="Real ${esc(t.nombre)}" placeholder="—" value="${t.real??""}"></td>
        <td class="hide-sm" style="width:20%"><div class="prog"><div id="p-${t.id}"></div></div></td>
        <td class="num mono st" id="v-${t.id}">—</td>
        ${ED?`<td class="act"><button class="ib" data-edit="${t.id}" title="Editar" aria-label="Editar ${esc(t.nombre)}">✎</button><button class="ib del" data-del="${t.id}" title="Eliminar" aria-label="Eliminar ${esc(t.nombre)}">🗑</button></td>`:""}
      </tr>`).join("")}</tbody></table>`:`<div class="empty">Sin tareas.</div>`}
    ${ED?`<button class="addrow" data-add="${ind.id}">+ Agregar tarea</button>`:""}
  </section>`;
}
function compute(){
  const p = pron(curId); if(!p) return;
  const sc = score(p);
  p.indicadores.forEach((ind,i)=>{
    ind.tareas.forEach(t=>{
      const v = pctOf(t), pEl = $("p-"+t.id), vEl = $("v-"+t.id);
      if(v!==null){ pEl.style.width=v+"%"; pEl.style.background=statusColor(v); vEl.textContent=nf.format(v)+"%"; vEl.style.color=statusColor(v); }
      else { pEl.style.width="0"; vEl.textContent="—"; vEl.style.color=""; }
    });
    $("is-"+ind.id).textContent = nf.format(sc.inds[i].s)+"%";
    $("ip-"+ind.id).textContent = `aporta ${nf.format(sc.inds[i].pts)} de ${nf.format(ind.peso)} pts`;
  });
  $("total").textContent = nf.format(sc.total)+"%";
  $("captured").textContent = sc.cap;
  $("totalNote").textContent = sc.cap ? `${sc.cap} de ${sc.n} tareas capturadas` : "Captura el avance real para pronosticar";
  const arc = $("ringArc"), C = 2*Math.PI*50;
  arc.setAttribute("stroke-dasharray", `${C*sc.total/100} ${C}`);
  arc.setAttribute("stroke", sc.cap ? statusColor(sc.total) : "var(--accent)");
  arc.style.opacity = sc.total>0 ? 1 : 0;
}

// ---------- diálogos genéricos
function confirmDlg(title, text, okLabel, fn){
  $("cfTitle").textContent = title; $("cfText").textContent = text; $("cfOk").textContent = okLabel;
  $("cfOk").onclick = async ()=>{ $("cfOk").disabled = true; try{ await fn(); $("dlgConfirm").close(); } catch(e){} $("cfOk").disabled = false; };
  $("dlgConfirm").showModal();
}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
const qOpts = sel => [1,2,3,4].map(q=>`<option value="${q}" ${sel==q?"selected":""}>${Q(q)}</option>`).join("");

// ---------- alta / edición de pronóstico (admin)
let editP = null;
function openPron(id){
  editP = id; const p = id ? pron(id) : null, e = p ? empOf(p) : {};
  $("pTitle").textContent = p ? "Editar datos del pronóstico" : "Nuevo pronóstico";
  $("pEmail").value = p ? p.email : ""; $("pEmail").readOnly = !!p;
  $("pNum").value = e.num_empleado || ""; $("pNombre").value = e.nombre || "";
  $("pAnio").value = p ? p.anio : THIS_YEAR; $("pQ").innerHTML = qOpts(p ? p.trimestre : Math.floor(new Date().getMonth()/3)+1);
  $("pFromWrap").hidden = !!p;
  $("pFrom").innerHTML = `<option value="">En blanco</option>` + PRONS.map(x=>`<option value="${x.id}">Copiar de: ${esc(label(x))}</option>`).join("");
  if(!p && curId) $("pFrom").value = curId;
  $("empList").innerHTML = EMPS.map(x=>`<option value="${esc(x.email)}">${esc(x.nombre||"")} · ${esc(x.num_empleado||"")}</option>`).join("");
  $("pMsg").textContent = ""; $("dlgPron").showModal(); (p ? $("pNum") : $("pEmail")).focus();
}
$("pEmail").addEventListener("input", ()=>{
  const e = EMPS.find(x=>x.email===$("pEmail").value.trim().toLowerCase());
  if(e){ $("pNum").value = e.num_empleado||""; $("pNombre").value = e.nombre||""; }
});
$("pForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const email = $("pEmail").value.trim().toLowerCase(), num = $("pNum").value.trim(), nombre = $("pNombre").value.trim();
  const anio = Number($("pAnio").value), trimestre = Number($("pQ").value), from = Number($("pFrom").value)||null;
  const m = $("pMsg");
  if(!/^[^@\s]+@bafar\.com\.mx$/.test(email)){ m.textContent = "Usa un correo @bafar.com.mx."; return; }
  if(!num){ m.textContent = "Escribe el número de empleado."; return; }
  if(!(anio>=2000 && anio<=2100)){ m.textContent = "Año no válido."; return; }
  $("pSave").disabled = true;
  try{
    await API.guardarEmpleado({ email, num_empleado:num, nombre });
    if(editP){ await API.actualizarPronostico(editP, { anio, trimestre }); }
    else if(from){
      const r = await API.replicar(from, [email], [{anio, trimestre}], false);
      if(!r.creados.length) throw new Error(`${email} ya tiene pronóstico en ${Q(trimestre)} ${anio}.`);
      curId = r.creados[0];
    } else { curId = await API.crearPronostico({ email, anio, trimestre }); }
    $("dlgPron").close(); toast(editP ? "Datos actualizados" : "Pronóstico creado"); await refresh();
  } catch(e){ m.textContent = e.message; }
  $("pSave").disabled = false;
});
function askDelPron(id){
  const p = pron(id);
  confirmDlg("Eliminar pronóstico", `¿Eliminar el pronóstico de ${label(p)} con todos sus indicadores, tareas y valores reales? No se puede deshacer.`, "Eliminar",
    ()=>run(async()=>{ await API.eliminarPronostico(id); if(curId===id) curId=null; await refresh(); }, "Pronóstico eliminado"));
}

// ---------- replicar
let repSrc = null; const repSel = new Set();
function openRep(id){
  repSrc = id; repSel.clear(); const p = pron(id);
  $("rTitle").textContent = `Replicar «${label(p)}»`;
  $("rPeopleWrap").hidden = !ME.isAdmin; $("rSelf").hidden = ME.isAdmin;
  if(!ME.isAdmin) repSel.add(ME.email);
  $("rAnio").value = p.anio;
  document.querySelectorAll("[name=rq]").forEach(c=>c.checked=false);
  $("rReal").checked = false; $("rSearch").value = ""; $("rMsg").textContent = "";
  $("rNew").hidden = true;
  renderRepPeople(); repSummary(); $("dlgRep").showModal();
}
function renderRepPeople(){
  const txt = $("rSearch").value.toLowerCase();
  const list = EMPS.filter(e=>!txt || (e.email+" "+(e.nombre||"")+" "+(e.num_empleado||"")).toLowerCase().includes(txt));
  $("rPeople").innerHTML = list.length ? list.map(e=>`<label class="person"><input type="checkbox" value="${esc(e.email)}" ${repSel.has(e.email)?"checked":""}>
    <span><b>${esc(e.nombre||e.email)}</b><span class="by">${esc(e.email)} · ${esc(e.num_empleado||"")}</span></span></label>`).join("")
    : `<div class="empty">Sin coincidencias.</div>`;
  $("rPeople").querySelectorAll("input").forEach(c=>c.onchange=()=>{ c.checked?repSel.add(c.value):repSel.delete(c.value); repSummary(); });
}
function repTargets(){
  const anio = Number($("rAnio").value);
  const qs = [...document.querySelectorAll("[name=rq]:checked")].map(c=>Number(c.value));
  const periodos = qs.map(q=>({anio, trimestre:q}));
  let nuevos = 0, existen = 0;
  repSel.forEach(email=>periodos.forEach(pr=>{
    PRONS.some(p=>p.email===email && p.anio===pr.anio && p.trimestre===pr.trimestre) ? existen++ : nuevos++;
  }));
  return { periodos, nuevos, existen };
}
function repSummary(){
  const t = repTargets();
  $("rCount").textContent = ME.isAdmin ? `${repSel.size} persona${repSel.size===1?"":"s"} seleccionada${repSel.size===1?"":"s"}` : "";
  $("rSum").textContent = !repSel.size || !t.periodos.length ? "Elige " + (ME.isAdmin?"personas y ":"") + "al menos un trimestre."
    : `Se crearán ${t.nuevos} pronóstico${t.nuevos===1?"":"s"}` + (t.existen?` · ${t.existen} ya existe${t.existen===1?"":"n"} y se omitirá${t.existen===1?"":"n"}`:"") + ".";
  $("rGo").disabled = !t.nuevos;
}
$("rSearch").oninput = renderRepPeople;
$("rAnio").oninput = repSummary;
document.querySelectorAll("[name=rq]").forEach(c=>c.onchange=repSummary);
$("rAll").onclick = ()=>{ const shown=[...$("rPeople").querySelectorAll("input")]; const all=shown.every(c=>c.checked); shown.forEach(c=>{ c.checked=!all; c.checked?repSel.add(c.value):repSel.delete(c.value); }); repSummary(); };
$("rAddBtn").onclick = ()=>{ $("rNew").hidden = false; $("nEmail").focus(); };
$("nAdd").onclick = async ()=>{
  const email = $("nEmail").value.trim().toLowerCase(), num = $("nNum").value.trim(), nombre = $("nNombre").value.trim();
  if(!/^[^@\s]+@bafar\.com\.mx$/.test(email)){ $("rMsg").textContent = "Usa un correo @bafar.com.mx."; return; }
  if(!num){ $("rMsg").textContent = "Escribe el número de empleado."; return; }
  try{
    await API.guardarEmpleado({ email, num_empleado:num, nombre });
    EMPS = await API.empleados(); repSel.add(email);
    $("nEmail").value = $("nNum").value = $("nNombre").value = ""; $("rNew").hidden = true; $("rMsg").textContent = "";
    renderRepPeople(); repSummary();
  } catch(e){ $("rMsg").textContent = e.message; }
};
$("rGo").onclick = async ()=>{
  const t = repTargets(); $("rGo").disabled = true;
  try{
    const r = await API.replicar(repSrc, [...repSel], t.periodos, $("rReal").checked);
    $("dlgRep").close();
    toast(`${r.creados.length} pronóstico${r.creados.length===1?"":"s"} creado${r.creados.length===1?"":"s"}` + (r.omitidos?` · ${r.omitidos} omitido${r.omitidos===1?"":"s"}`:""));
    await refresh();
  } catch(e){ $("rMsg").textContent = e.message; repSummary(); }
};

// ---------- indicadores (admin)
let editInd = null;
function openInd(id){
  editInd = id; const p = pron(curId), d = id ? p.indicadores.find(x=>x.id===id) : null;
  $("iTitle").textContent = d ? "Editar indicador" : "Agregar indicador";
  $("iNombre").value = d ? d.nombre : ""; $("iMedible").value = d ? (d.medible||"") : "";
  $("iPeso").value = d ? Number(d.peso) : Math.max(0, Math.round((100 - p.indicadores.reduce((a,x)=>a+Number(x.peso),0))*100)/100);
  $("iOrden").value = d ? d.orden : p.indicadores.reduce((a,x)=>Math.max(a,x.orden),0)+1;
  $("iAl").innerHTML = `<option value="">Sin alinear</option>` + jefeInds.map(j=>`<option value="${j.id}">${esc(j.nombre)} (peso ${nf.format(j.peso)})</option>`).join("");
  $("iAl").value = d && d.alineado_a ? d.alineado_a : ""; $("iAlWrap").hidden = !jefeInds.length;
  $("iMsg").textContent = ""; $("dlgInd").showModal(); $("iNombre").focus();
}
$("iForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const row = { id: editInd||undefined, nombre: $("iNombre").value.trim(), medible: $("iMedible").value.trim(), peso: Number($("iPeso").value), orden: Number($("iOrden").value)||99, alineado_a: Number($("iAl").value)||null };
  if(!row.nombre){ $("iMsg").textContent = "Escribe el nombre."; return; }
  if(!(row.peso>=0)){ $("iMsg").textContent = "Peso no válido."; return; }
  try{ await API.guardarIndicador(curId, row); $("dlgInd").close(); toast(editInd?"Indicador actualizado":"Indicador agregado"); await refresh(); }
  catch(e){ $("iMsg").textContent = e.message; }
});
function askDelInd(id){
  const d = pron(curId).indicadores.find(x=>x.id===id);
  confirmDlg("Eliminar indicador", `¿Eliminar «${d.nombre}» y sus ${d.tareas.length} tarea(s)? No se puede deshacer.`, "Eliminar",
    ()=>run(async()=>{ await API.eliminarIndicador(id); await refresh(); }, "Indicador eliminado"));
}

// ---------- tareas (admin)
let editT = null;
function openTask(id, indId){
  editT = id; const p = pron(curId);
  const t = id ? findTask(id) : null, ind = p.indicadores.find(d=>d.id===(t?t.indicador_id:indId));
  $("tTitle").textContent = t ? "Editar tarea" : "Agregar tarea";
  $("tInd").innerHTML = p.indicadores.map(d=>`<option value="${d.id}">${esc(d.nombre)}</option>`).join(""); $("tInd").value = ind.id;
  $("tNombre").value = t ? t.nombre : "";
  $("tPeso").value = t ? Math.round(Number(t.peso)*1000)/1000 : Math.round(100/(ind.tareas.length+1)*1000)/1000;
  $("tMeta").value = t ? Number(t.meta) : 100;
  $("tUnidad").value = t ? t.unidad : (ind.tareas[0] ? ind.tareas[0].unidad : "%");
  $("tOrden").value = t ? t.orden : ind.tareas.reduce((a,x)=>Math.max(a,x.orden),0)+1;
  $("tMsg").textContent = ""; $("dlgTask").showModal(); $("tNombre").focus();
}
$("tForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const row = { id: editT||undefined, indicador_id: Number($("tInd").value), nombre: $("tNombre").value.trim(), peso: Number($("tPeso").value),
    meta: Number($("tMeta").value), unidad: $("tUnidad").value.trim()||"%", orden: Number($("tOrden").value)||99 };
  if(!row.nombre){ $("tMsg").textContent = "Escribe el nombre."; return; }
  if(!(row.meta>0)){ $("tMsg").textContent = "La meta debe ser mayor a 0."; return; }
  if(!(row.peso>=0)){ $("tMsg").textContent = "Peso no válido."; return; }
  try{ await API.guardarTarea(row); $("dlgTask").close(); toast(editT?"Tarea actualizada":"Tarea agregada"); await refresh(); }
  catch(e){ $("tMsg").textContent = e.message; }
});
function askDelTask(id){
  const t = findTask(id);
  confirmDlg("Eliminar tarea", `¿Eliminar «${t.nombre}»? Se borra también su valor real.`, "Eliminar",
    ()=>run(async()=>{ await API.eliminarTarea(id); await refresh(); }, "Tarea eliminada"));
}

// ---------- imagen ejecutiva del scorecard (PNG)
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fmtD = d => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
const qRange = (anio, q) => [new Date(anio, (q-1)*3, 1), new Date(anio, q*3, 0)];
async function scImage(p){
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  const e = empOf(p), sc = score(p), [d0, d1] = qRange(p.anio, p.trimestre);
  const F = '"IBM Plex Sans", system-ui, sans-serif', M = '"IBM Plex Mono", ui-monospace, monospace';
  const C = { ink:"#1c1d1f", muted:"#6b6d72", line:"#e3e1dc", band:"#f6f5f2", navy:"#14284b", pend:"#fdf3d6",
    good:"#1a7f4b", warn:"#b7791f", bad:"#c0392b", track:"#ecebe7", ind:["#1f5fbf","#0f8b8d","#7a4fbf","#d0752a","#b03a6f"] };
  const st = v => v>=95 ? C.good : v>=80 ? C.warn : C.bad;
  const cols = [
    { k:"ind",  t:"Indicador",       w:250 }, { k:"pi", t:"Peso\nindicador", w:78, a:"c" },
    { k:"tar",  t:"Tarea",           w:310 }, { k:"pt", t:"Peso\ntarea", w:70, a:"c" },
    { k:"meta", t:"Meta",            w:112, a:"r" }, { k:"real", t:"Real", w:112, a:"r" },
    { k:"cum",  t:"Cumplimiento",    w:150 }, { k:"med", t:"Medible", w:220 },
    { k:"pts",  t:"Aporte\n(pts)",   w:76, a:"c" }, { k:"val", t:"Suma peso\ntareas", w:104, a:"c" }
  ];
  const PAD = 32, RH = 32, HH = 46, TOP = 150, W = cols.reduce((a,c)=>a+c.w,0) + PAD*2;
  const GMIN = 52, gH = i => Math.max(Math.max(1,i.tareas.length)*RH, GMIN);
  const H = TOP + HH + p.indicadores.reduce((a,i)=>a+gH(i),0) + RH + 64;
  const S = 2, cv = document.createElement("canvas"); cv.width = W*S; cv.height = H*S;
  const x = cv.getContext("2d"); x.scale(S,S); x.textBaseline = "middle";
  const txt = (s, X, Y, o={}) => { x.font = `${o.w||400} ${o.s||13}px ${o.m?M:F}`; x.fillStyle = o.c||C.ink; x.textAlign = o.a||"left";
    let t = String(s); if(o.max){ while(x.measureText(t).width > o.max && t.length>1) t = t.slice(0,-2)+"…"; } x.fillText(t, X, Y); };
  const wrap = (s, max, font) => { x.font = font; const out=[]; let line="";
    String(s).split(/\s+/).forEach(w=>{ const tt = line?line+" "+w:w; if(x.measureText(tt).width>max && line){ out.push(line); line=w; } else line=tt; }); if(line) out.push(line); return out; };
  const rect = (X,Y,w,h,c) => { x.fillStyle=c; x.fillRect(X,Y,w,h); };

  // fondo + encabezado
  rect(0,0,W,H,"#ffffff");
  rect(0,0,W,118,C.navy);
  txt(`Scorecard ${Q(p.trimestre)} ${p.anio}`, PAD, 38, { s:26, w:600, c:"#fff" });
  txt(`${e.nombre || p.email}  ·  Núm. empleado ${e.num_empleado || "—"}  ·  ${p.email}`, PAD, 70, { s:14, c:"#c9d3e6" });
  txt(`Periodo ${fmtD(d0)} – ${fmtD(d1)}`, PAD, 94, { s:13, c:"#9fb0cf" });
  { const e2 = p.estado || "borrador", lbl = e2==="liberado" ? `✓ LIBERADO · ${fmtD(new Date(p.liberado_en||Date.now()))}${p.liberado_por?" · "+p.liberado_por:""}` : e2==="por_liberar" ? "⏳ POR LIBERAR" : "BORRADOR";
    x.font = `600 12px ${F}`; const tw = x.measureText(lbl).width + 22, bxx = PAD + 330, byy = 82;
    x.fillStyle = e2==="liberado" ? "#1a7f4b" : e2==="por_liberar" ? "#b7791f" : "rgba(255,255,255,.18)";
    x.beginPath(); x.roundRect ? x.roundRect(bxx, byy, tw, 24, 12) : x.rect(bxx, byy, tw, 24); x.fill();
    txt(lbl, bxx+11, byy+12, { s:12, w:600, c:"#fff" }); }
  // total
  const tc = sc.cap ? st(sc.total) : "#9fb0cf";
  const bx = W - PAD - 250;
  txt("Cumplimiento ponderado", bx, 30, { s:12, w:600, c:"#9fb0cf" });
  txt(nf.format(sc.total)+"%", bx, 66, { s:38, w:600, c:"#fff", m:true });
  txt(`${sc.cap} de ${sc.n} tareas con real`, bx, 98, { s:12, c:"#c9d3e6" });
  rect(bx+150, 58, 100, 10, "rgba(255,255,255,.15)"); rect(bx+150, 58, sc.total, 10, tc);

  // tabla: encabezado
  let X = PAD, Y = TOP;
  rect(PAD, Y, W-PAD*2, HH, C.band);
  cols.forEach(c=>{ c.x = X; const ls = c.t.split("\n");
    ls.forEach((l,i)=>txt(l, c.a==="c"?X+c.w/2: c.a==="r"?X+c.w-10:X+10, Y+HH/2+(i-(ls.length-1)/2)*15, { s:12, w:600, c:C.muted, a:c.a==="c"?"center":c.a==="r"?"right":"left" }));
    X += c.w; });
  Y += HH;
  const col = k => cols.find(c=>c.k===k);
  // filas
  p.indicadores.forEach((ind, ii)=>{
    const n = Math.max(1, ind.tareas.length), gh = gH(ind), off = (gh - n*RH)/2, s = sc.inds[ii];
    rect(PAD, Y, W-PAD*2, gh, ii%2 ? "#ffffff" : "#fafaf8");
    rect(PAD, Y, 4, gh, C.ind[ii % C.ind.length]);
    // celdas agrupadas
    const ci = col("ind"), lines = wrap(ind.nombre, ci.w-24, `600 13px ${F}`).slice(0, Math.max(1, Math.floor(gh/17)-1));
    const blockH = lines.length*17 + 16, y0 = Y + gh/2 - blockH/2 + 8;
    lines.forEach((l,i)=>txt(l, ci.x+14, y0+i*17, { s:13, w:600, max:ci.w-24 }));
    txt(`${nf.format(s.s)}% cumplido`, ci.x+14, y0+lines.length*17, { s:11.5, c:C.muted });
    txt(nf.format(ind.peso), col("pi").x+col("pi").w/2, Y+gh/2, { s:15, w:600, a:"center", m:true });
    const cm = col("med"), ml = wrap(ind.medible||"—", cm.w-20, `400 12px ${F}`).slice(0, Math.max(1, Math.floor(gh/16)));
    ml.forEach((l,i)=>txt(l, cm.x+10, Y+gh/2+(i-(ml.length-1)/2)*16, { s:12, c:C.muted, max:cm.w-20 }));
    const cp = col("pts"); txt(nf.format(s.pts), cp.x+cp.w/2, Y+gh/2, { s:14, w:600, a:"center", m:true, c: sc.cap?st(s.s):C.muted });
    // validación: los pesos de las tareas del indicador deben sumar 100
    const cv2 = col("val"), suma = ind.tareas.reduce((a,t)=>a+Number(t.peso),0), ok = Math.abs(suma-100) <= 0.01;
    rect(cv2.x+1, Y+1, cv2.w-2, gh-2, ok ? "#e3f3e8" : "#fbe3e0");
    txt((ok ? "✓ " : "✗ ") + nf.format(suma), cv2.x+cv2.w/2, Y+gh/2 - (ok?0:8), { s:14, w:600, a:"center", m:true, c: ok ? C.good : C.bad });
    if(!ok) txt(suma>100 ? `sobra ${nf.format(suma-100)}` : `falta ${nf.format(100-suma)}`, cv2.x+cv2.w/2, Y+gh/2+11, { s:11, a:"center", c:C.bad });
    // tareas
    ind.tareas.forEach((t, ti)=>{
      const ry = Y + off + ti*RH, cy = ry + RH/2, v = pctOf(t), pct = t.unidad === "%";
      if(ti) { x.fillStyle = C.line; x.fillRect(col("tar").x, ry, col("cum").x+col("cum").w-col("tar").x, 1); }
      txt(t.nombre, col("tar").x+10, cy, { s:13, max:col("tar").w-20 });
      txt(nf.format(t.peso), col("pt").x+col("pt").w/2, cy, { s:12.5, a:"center", m:true, c:C.muted });
      txt(nf0.format(t.meta)+(pct?" %":""), col("meta").x+col("meta").w-10, cy, { s:13, a:"right", m:true });
      const cr = col("real");
      if(v===null){ rect(cr.x+4, ry+4, cr.w-8, RH-8, C.pend); txt("pendiente", cr.x+cr.w-12, cy, { s:11.5, a:"right", c:C.warn }); }
      else txt(nf0.format(t.real)+(pct?" %":""), cr.x+cr.w-10, cy, { s:13, a:"right", m:true, w:600 });
      const cc = col("cum");
      rect(cc.x+10, cy-4, 76, 8, C.track);
      if(v!==null){ rect(cc.x+10, cy-4, 76*v/100, 8, st(v)); txt(nf.format(v)+"%", cc.x+cc.w-10, cy, { s:12.5, a:"right", m:true, w:600, c:st(v) }); }
      else txt("—", cc.x+cc.w-10, cy, { s:12.5, a:"right", c:C.muted });
    });
    if(!ind.tareas.length) txt("Sin tareas", col("tar").x+10, Y+RH/2, { s:12.5, c:C.muted });
    Y += gh; rect(PAD, Y-1, W-PAD*2, 1, "#d6d3cc");
  });
  // total
  rect(PAD, Y, W-PAD*2, RH, C.navy);
  txt("Total", col("ind").x+14, Y+RH/2, { s:13, w:600, c:"#fff" });
  txt(nf.format(p.indicadores.reduce((a,i)=>a+Number(i.peso),0)), col("pi").x+col("pi").w/2, Y+RH/2, { s:14, w:600, a:"center", m:true, c:"#fff" });
  txt(nf.format(sc.total), col("pts").x+col("pts").w/2, Y+RH/2, { s:14, w:600, a:"center", m:true, c:"#fff" });
  const okG = p.indicadores.filter(i=>Math.abs(i.tareas.reduce((a,t)=>a+Number(t.peso),0)-100)<=0.01).length;
  const okAll = okG === p.indicadores.length && Math.abs(p.indicadores.reduce((a,i)=>a+Number(i.peso),0)-100) <= 0.01;
  rect(col("val").x+1, Y+1, col("val").w-2, RH-2, okAll ? C.good : C.bad);
  txt(`${okAll?"✓":"✗"} ${okG}/${p.indicadores.length}`, col("val").x+col("val").w/2, Y+RH/2, { s:13, w:600, a:"center", c:"#fff" });
  txt("Cumplimiento ponderado "+nf.format(sc.total)+"%", col("med").x+col("med").w-10, Y+RH/2, { s:12.5, w:600, a:"right", c:"#fff" });
  Y += RH;
  const hoy = new Date();
  txt(`Cumplimiento por tarea = Real ÷ Meta (tope 100%). Aporte = peso del indicador × cumplimiento del indicador. Suma peso tareas: debe dar 100 por indicador.`, PAD, Y+24, { s:11.5, c:C.muted });
  txt(`Generado ${hoy.getDate()} ${MESES[hoy.getMonth()]} ${hoy.getFullYear()} · Pronóstico SC`, W-PAD, Y+24, { s:11.5, c:C.muted, a:"right" });
  return cv;
}
let imgBlob = null, imgName = "";
async function openImage(p){
  $("imgPrev").innerHTML = `<div class="empty">Generando…</div>`; $("dlgImg").showModal();
  const cv = await scImage(p);
  imgBlob = await new Promise(r=>cv.toBlob(r, "image/png"));
  imgName = `Scorecard_${(empOf(p).nombre||p.email.split("@")[0]).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"")}_${Q(p.trimestre)}_${p.anio}.png`;
  const url = URL.createObjectURL(imgBlob);
  $("imgPrev").innerHTML = `<img src="${url}" alt="Scorecard ${esc(label(p))}">`;
}
$("imgDown").onclick = ()=>{
  if(!imgBlob) return;
  const a = document.createElement("a"); a.href = URL.createObjectURL(imgBlob); a.download = imgName;
  document.body.appendChild(a); a.click(); a.remove(); toast("Imagen descargada");
};
$("imgCopy").onclick = async ()=>{
  try{ await navigator.clipboard.write([new ClipboardItem({ "image/png": imgBlob })]); toast("Imagen copiada: pégala en correo o Teams"); }
  catch(e){ toast("Tu navegador no permite copiar imágenes; usa Descargar"); }
};

// ---------- tablero: estructura y alineación (administrador)
let view = "list", dashPer = null, dashInd = null, dashSel = null;
const perKey = p => p.anio*10 + p.trimestre;
const perLbl = k => `${Q(k%10)} ${Math.floor(k/10)}`;
const stLbl = v => v>=95 ? ["▲","En meta"] : v>=80 ? ["●","En riesgo"] : ["▼","Bajo"];
function navHtml(){
  return ME.isAdmin ? `<div class="tabs" role="tablist">
    <button role="tab" class="tab ${view==="list"?"on":""}" data-view="list" aria-selected="${view==="list"}">Pronósticos</button>
    <button role="tab" class="tab ${view==="dash"?"on":""}" data-view="dash" aria-selected="${view==="dash"}">Estructura y alineación</button>
    <button role="tab" class="tab ${view==="team"?"on":""}" data-view="team" aria-selected="${view==="team"}">Equipo</button></div>` : "";
}
function bindNav(){ document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{ view=b.dataset.view; curId=null; render(); }); }

function orgModel(k){
  const emps = EMPS.slice();
  const byEmail = Object.fromEntries(emps.map(e=>[e.email,e]));
  const prons = PRONS.filter(p=>perKey(p)===k);
  const pOf = Object.fromEntries(prons.map(p=>[p.email,p]));
  const indById = {}; prons.forEach(p=>p.indicadores.forEach((i,ix)=>{ indById[i.id] = { ind:i, p, ix }; }));
  const kids = em => emps.filter(e=>e.jefe===em).sort((a,b)=>(b.nivel||0)-(a.nivel||0) || (a.nombre||"").localeCompare(b.nombre||""));
  const below = em => kids(em).flatMap(k=>[k, ...below(k.email)]);
  const root = emps.filter(e=>!e.jefe).sort((a,b)=>below(b.email).length-below(a.email).length || (pOf[b.email]?1:0)-(pOf[a.email]?1:0))[0];
  // raíz de cascada: sube por alineado_a hasta un indicador sin alinear
  const rootOf = id => { let x = indById[id], g = 0; while(x && x.ind.alineado_a && indById[x.ind.alineado_a] && g++<10) x = indById[x.ind.alineado_a]; return x; };
  const person = e => {
    const p = pOf[e.email]; if(!p) return { e, p:null };
    const sc = score(p), tot = p.indicadores.reduce((a,i)=>a+Number(i.peso),0)||1;
    const alPeso = p.indicadores.filter(i=>i.alineado_a && indById[i.alineado_a]).reduce((a,i)=>a+Number(i.peso),0);
    const badW = p.indicadores.some(i=>i.tareas.length && Math.abs(i.tareas.reduce((a,t)=>a+Number(t.peso),0)-100)>0.01) || Math.abs(tot-100)>0.01;
    return { e, p, sc, alin: e.jefe ? alPeso/tot*100 : null, badW };
  };
  const team = root ? [root, ...below(root.email)] : [];
  return { emps, byEmail, prons, pOf, indById, root, kids, rootOf, person, team };
}

function renderDash(){
  const keys = [...new Set(PRONS.map(perKey))].sort((a,b)=>b-a);
  if(!keys.length){ $("main").innerHTML = navHtml() + `<div class="empty big-empty">Aún no hay pronósticos.</div>`; bindNav(); return; }
  if(!dashPer || !keys.includes(dashPer)) dashPer = keys[0];
  const M = orgModel(dashPer), rootP = M.root && M.pOf[M.root.email];
  if(rootP && (!dashInd || !rootP.indicadores.some(i=>i.id===dashInd))){
    // por defecto: el indicador del gerente que más baja al equipo
    const n = id => { let c = 0; const w = x => Object.values(M.indById).filter(y=>y.ind.alineado_a===x).forEach(y=>{ c++; w(y.ind.id); }); w(id); return c; };
    const best = rootP.indicadores.slice().sort((a,b)=>n(b.id)-n(a.id))[0]; dashInd = best && best.id;
  }
  const people = M.team.map(M.person), withP = people.filter(x=>x.p);
  const conCap = withP.filter(x=>x.sc.cap>0), avg = conCap.length ? conCap.reduce((a,x)=>a+x.sc.total,0)/conCap.length : null;
  const nonRoot = withP.filter(x=>x.alin!==null), alinAvg = nonRoot.length ? nonRoot.reduce((a,x)=>a+x.alin,0)/nonRoot.length : 0;
  const tasks = withP.reduce((a,x)=>[a[0]+x.sc.cap, a[1]+x.sc.n],[0,0]);
  const bad = withP.filter(x=>x.badW).length;
  const tile = (lbl, val, sub, cls="") => `<div class="tile ${cls}"><span>${lbl}</span><b class="mono">${val}</b><small>${sub}</small></div>`;
  $("main").innerHTML = navHtml() + `
    <div class="bar">
      <div><h2 class="h">Estructura y alineación</h2><div class="sub">Cómo bajan tus indicadores a líderes y consultores</div></div>
      <select id="dPer" aria-label="Periodo">${keys.map(k=>`<option value="${k}" ${k===dashPer?"selected":""}>${perLbl(k)}</option>`).join("")}</select>
    </div>
    <div class="tiles">
      ${tile("Cumplimiento promedio", avg===null ? "—" : nf.format(avg)+"%", avg===null ? "aún sin reales capturados" : `de ${conCap.length} con captura`)}
      ${tile("Personas con pronóstico", `${withP.length}/${M.team.length}`, M.team.length-withP.length ? `${M.team.length-withP.length} sin pronóstico` : "Todo el equipo")}
      ${tile("Alineación promedio", nf.format(alinAvg)+"%", "peso alineado a su jefe")}
      ${tile("Captura de reales", tasks[1] ? nf.format(tasks[0]/tasks[1]*100)+"%" : "—", `${tasks[0]} de ${tasks[1]} tareas`)}
      ${tile("Pesos por validar", bad, bad ? "pronósticos que no suman 100" : "Todo suma 100", bad?"t-bad":"")}
    </div>

    ${M.root ? evalHtml(M) : ""}

    <section class="card org-card">
      <h2>Estructura · ${perLbl(dashPer)}</h2>
      <div class="legend-st"><span>▲ En meta ≥95%</span><span>● En riesgo 80–95%</span><span>▼ Bajo &lt;80%</span><span>↑ % del peso alineado a su jefe</span></div>
      ${M.root ? orgHtml(M) : `<div class="empty">Sin estructura registrada.</div>`}
    </section>

    ${rootP ? `<section class="card">
      <h2>Cascada de indicadores</h2>
      <div class="chips wrap" role="group" aria-label="Indicador del gerente">${rootP.indicadores.map((i,ix)=>`<button class="chip ${i.id===dashInd?"on":""}" data-ci="${i.id}"><i class="dot" style="background:var(${color(ix)})"></i>${esc(i.nombre)} · ${nf.format(i.peso)}</button>`).join("")}</div>
      <div id="cascade">${cascadeHtml(M, dashInd)}</div>
    </section>

    <section class="card">
      <h2>Matriz de alineación</h2>
      <p class="hint" style="margin:-4px 0 12px">Peso de cada persona (de 100) que, directa o indirectamente, contribuye a cada indicador del gerente. Entre más intenso, más peso.</p>
      <div class="mx-wrap">${matrixHtml(M, rootP)}</div>
    </section>` : ""}`;
  bindNav();
  $("dPer").onchange = e=>{ dashPer = Number(e.target.value); renderDash(); };
  document.querySelectorAll("[data-ci]").forEach(b=>b.onclick=()=>{ dashInd = Number(b.dataset.ci); renderDash(); });
  document.querySelectorAll("[data-op]").forEach(c=>c.onclick=()=>{ const p = M.pOf[c.dataset.op]; if(p){ curId = p.id; window.scrollTo(0,0); render(); } });
}

function cardHtml(M, e, kind){
  const x = M.person(e), dashed = /proy\./i.test(e.puesto||"");
  let m = `<div class="oc-none">Sin pronóstico ${perLbl(dashPer)}</div>`;
  if(x.p){
    const v = x.sc.total, [ic, lb] = stLbl(v), col = x.sc.cap ? st2(v) : "var(--muted)";
    m = `<div class="oc-m"><span class="oc-st" style="color:${col}">${x.sc.cap?ic:"○"}</span><b class="mono">${nf.format(v)}%</b><span class="oc-l">${x.sc.cap?lb:"sin captura"}</span>
      ${x.alin!==null?`<span class="oc-al" title="Peso alineado a su jefe">↑ ${nf.format(x.alin)}%</span>`:""}${x.badW?`<span class="oc-warn" title="Pesos que no suman 100">⚠</span>`:""}</div>
      <div class="oc-bar"><div style="width:${v}%;background:${col}"></div></div>`;
  }
  return `<div class="oc ${kind} ${dashed?"dashed":""} ${x.p?"click":""}" ${x.p?`data-op="${esc(e.email)}" tabindex="0" role="button" aria-label="Abrir pronóstico de ${esc(e.nombre)}"`:""}>
    <div class="oc-role">${esc(e.puesto||"")}</div>
    <div class="oc-name">${esc(e.nombre||e.email)} · <span class="mono">${esc(e.num_empleado||"")}</span></div>
    <div class="oc-lvl">${e.nivel?`Nivel ${e.nivel}`:""}</div>${m}</div>`;
}
const st2 = v => v>=95 ? "var(--good)" : v>=80 ? "var(--warn)" : "var(--bad)";
function orgHtml(M){
  const leads = M.kids(M.root.email);
  return `<div class="org">
    <div class="org-top">${cardHtml(M, M.root, "oc-root")}</div>
    <div class="org-cols" style="--n:${Math.max(1,leads.length)}">${leads.map(l=>`
      <div class="org-col">
        <div class="org-area">${esc(l.area||"")}</div>
        ${cardHtml(M, l, "oc-lead")}
        <div class="org-kids">${M.kids(l.email).map(k=>cardHtml(M, k, "oc-kid")).join("")}</div>
      </div>`).join("")}</div></div>`;
}

function cascadeHtml(M, indId){
  const node = M.indById[indId]; if(!node) return "";
  const childrenOf = id => Object.values(M.indById).filter(x=>x.ind.alineado_a===id);
  const sOf = x => score(x.p).inds[x.ix].s;
  const all = []; const walk = id => childrenOf(id).forEach(c=>{ all.push(c); walk(c.ind.id); }); walk(indId);
  const capd = all.filter(c=>c.ind.tareas.some(t=>pctOf(t)!==null));
  const roll = capd.length ? capd.reduce((a,c)=>a+sOf(c),0)/capd.length : null;
  const people = new Set(all.map(c=>c.p.email));
  const row = (x, lvl) => {
    const e = M.byEmail[x.p.email] || {}, s = sOf(x), cap = x.ind.tareas.some(t=>pctOf(t)!==null);
    const [ic] = stLbl(s);
    return `<div class="cs-row lvl${lvl}">
      <div class="cs-who"><b>${esc(e.nombre||x.p.email)}</b><span>${esc(e.puesto||"")}</span></div>
      <div class="cs-ind">${esc(x.ind.nombre)}</div>
      <div class="cs-w mono" title="Peso dentro del scorecard de la persona">peso ${nf.format(x.ind.peso)}</div>
      <div class="cs-s"><div class="prog"><div style="width:${s}%;background:${cap?st2(s):"var(--track)"}"></div></div><span class="mono" style="color:${cap?st2(s):"var(--muted)"}">${cap?ic+" ":""}${nf.format(s)}%</span></div>
    </div>`;
  };
  const tree = (id, lvl) => childrenOf(id).map(c=>row(c,lvl) + `<div class="cs-kids">${tree(c.ind.id, lvl+1)}</div>`).join("");
  const kidsHtml = tree(indId, 1);
  return `<div class="cs-head">
      ${row(node, 0)}
      <div class="cs-sum">${all.length ? `Baja a <b>${people.size}</b> persona${people.size===1?"":"s"} en <b>${all.length}</b> indicador${all.length===1?"":"es"} · ${roll===null ? "aún sin reales capturados" : `cumplimiento promedio de la cascada <b class="mono" style="color:${st2(roll)}">${stLbl(roll)[0]} ${nf.format(roll)}%</b>`}` : `<span class="hint err">⚠ Ningún indicador del equipo está alineado a este.</span>`}</div>
    </div>
    <div class="cs-tree">${kidsHtml}</div>`;
}

function matrixHtml(M, rootP){
  const cols = rootP.indicadores;
  const order = []; const visit = (em, d) => { const e = M.byEmail[em]; if(!e) return; if(em!==M.root.email) order.push([e,d]); M.kids(em).forEach(k=>visit(k.email, d+1)); };
  visit(M.root.email, 0);
  const head = `<tr><th>Persona</th>${cols.map((c,ix)=>`<th class="num"><i class="dot" style="background:var(${color(ix)})"></i>${esc(c.nombre)}</th>`).join("")}<th class="num">Sin alinear</th><th class="num">Cumpl.</th></tr>`;
  const body = order.map(([e,d])=>{
    const p = M.pOf[e.email];
    if(!p) return `<tr class="${d===1?"mx-lead":""}"><td style="padding-left:${8+(d-1)*16}px">${esc(e.nombre)}</td><td colspan="${cols.length+2}" class="hint">Sin pronóstico</td></tr>`;
    const w = Object.fromEntries(cols.map(c=>[c.id,0])); let none = 0;
    p.indicadores.forEach(i=>{ const r = i.alineado_a ? M.rootOf(i.id) : null; (r && r.p.email===M.root.email && w[r.ind.id]!==undefined) ? w[r.ind.id]+=Number(i.peso) : none+=Number(i.peso); });
    const sc = score(p);
    const cell = v => `<td class="num mx" style="--a:${Math.min(1,v/100)}" title="${nf.format(v)} de 100">${v?nf.format(v):"·"}</td>`;
    return `<tr class="${d===1?"mx-lead":""}"><td style="padding-left:${8+(d-1)*16}px"><b>${esc(e.nombre)}</b> <span class="by" style="display:inline">${esc(e.puesto||"")}</span></td>
      ${cols.map(c=>cell(w[c.id])).join("")}
      <td class="num ${none?"mx-none":""}" title="Peso no alineado">${none?nf.format(none):"·"}</td>
      <td class="num mono" style="color:${sc.cap?st2(sc.total):"var(--muted)"}">${nf.format(sc.total)}%</td></tr>`;
  }).join("");
  return `<table class="mx-t"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ---------- equipo (administrador): estructura y correos
const pend = em => /^pendiente\./i.test(em||"");
function treeOrder(){
  const out = [], seen = new Set();
  const kids = em => EMPS.filter(e=>e.jefe===em).sort((a,b)=>(b.nivel||0)-(a.nivel||0)||(a.nombre||"").localeCompare(b.nombre||""));
  const visit = (e,d) => { if(seen.has(e.email)) return; seen.add(e.email); out.push([e,d]); kids(e.email).forEach(k=>visit(k,d+1)); };
  EMPS.filter(e=>!e.jefe || !EMPS.some(x=>x.email===e.jefe)).sort((a,b)=>(b.nivel||0)-(a.nivel||0)).forEach(e=>visit(e,0));
  return out;
}
function renderTeam(){
  const rows = treeOrder(), np = rows.filter(([e])=>pend(e.email)).length;
  $("main").innerHTML = navHtml() + `
    <div class="bar">
      <div><h2 class="h">Equipo</h2><div class="sub">${rows.length} personas${np?` · <span style="color:var(--warn)">${np} con correo pendiente</span>`:""}</div></div>
      <button class="primary" id="btnNewEmp">+ Agregar persona</button>
    </div>
    ${np?`<p class="setup" style="margin:0 0 14px">Captura el correo real de cada persona para que pueda entrar a ver y capturar su pronóstico. Al cambiarlo, sus pronósticos se conservan.</p>`:""}
    <section class="card flush"><table class="list">
      <thead><tr><th>Nombre</th><th>Núm. emp.</th><th class="hide-sm">Posición</th><th class="hide-sm">Puesto</th><th class="hide-sm">Nivel</th><th>Correo</th><th class="hide-sm">Pronósticos</th><th></th></tr></thead>
      <tbody>${rows.map(([e,d])=>`<tr>
        <td style="padding-left:${8+d*18}px"><b>${esc(e.nombre||"—")}</b>${e.area&&d===1?`<div class="by">${esc(e.area)}</div>`:""}</td>
        <td class="mono">${esc(e.num_empleado)}</td>
        <td class="mono hide-sm">${esc(e.posicion||"")}</td>
        <td class="hide-sm">${esc(e.puesto||"")}${!e.jefe && d===0 && rows.length>1 && EMPS.some(x=>x.jefe===e.email)===false ? ` <span class="ind-al none">Sin jefe asignado</span>` : ""}</td>
        <td class="hide-sm mono">${e.nivel??""}</td>
        <td>${pend(e.email)?`<span class="ind-al none">Correo pendiente</span>`:`<span class="by" style="display:inline">${esc(e.email)}</span>`}</td>
        <td class="hide-sm mono">${PRONS.filter(p=>p.email===e.email).length}</td>
        <td class="act"><button class="ib" data-emp="${esc(e.email)}" title="Editar" aria-label="Editar ${esc(e.nombre||"")}">✎</button></td>
      </tr>`).join("")}</tbody></table></section>`;
  bindNav();
  $("btnNewEmp").onclick = ()=>openEmp(null);
  document.querySelectorAll("[data-emp]").forEach(b=>b.onclick=()=>openEmp(b.dataset.emp));
}
let editEmp = null;
function openEmp(email){
  editEmp = email; const e = email ? EMPS.find(x=>x.email===email) : {};
  $("eTitle").textContent = email ? "Editar persona" : "Agregar persona";
  $("eEmail").value = email && !pend(email) ? email : ""; $("eEmail").placeholder = pend(email) ? "Correo pendiente — escríbelo aquí" : "nombre@bafar.com.mx";
  $("eNum").value = e.num_empleado || ""; $("eNombre").value = e.nombre || ""; $("ePuesto").value = e.puesto || "";
  $("eNivel").value = e.nivel ?? ""; $("eArea").value = e.area || ""; $("ePos").value = e.posicion || "";
  $("areas").innerHTML = [...new Set(EMPS.map(x=>x.area).filter(Boolean))].map(a=>`<option value="${esc(a)}">`).join("");
  // no puede reportar a sí mismo ni a alguien de su propio equipo
  const below = new Set(); const walk = em => EMPS.filter(x=>x.jefe===em).forEach(x=>{ below.add(x.email); walk(x.email); }); if(email) walk(email);
  $("eJefe").innerHTML = `<option value="">— Nadie (nivel superior) —</option>` + EMPS.filter(x=>x.email!==email && !below.has(x.email))
    .sort((a,b)=>(b.nivel||0)-(a.nivel||0)).map(x=>`<option value="${esc(x.email)}">${esc(x.nombre||x.email)} · ${esc(x.puesto||"")}</option>`).join("");
  $("eJefe").value = e.jefe || "";
  $("eMsg").textContent = ""; $("dlgEmp").showModal(); (email ? $("eEmail") : $("eNum")).focus();
}
$("eForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const num = $("eNum").value.trim();
  let email = $("eEmail").value.trim().toLowerCase();
  if(!email) email = editEmp && pend(editEmp) ? editEmp : (num ? `pendiente.${num.toLowerCase().replace(/[^a-z0-9-]/g,"")}@bafar.com.mx` : "");
  const row = { email, num_empleado: num, nombre: $("eNombre").value.trim(), puesto: $("ePuesto").value.trim() || null,
    nivel: $("eNivel").value === "" ? null : Number($("eNivel").value), area: $("eArea").value.trim() || null, jefe: $("eJefe").value || null, posicion: $("ePos").value.trim() || null };
  if(!num){ $("eMsg").textContent = "Escribe el número de empleado."; return; }
  if(!/^[^@\s]+@bafar\.com\.mx$/.test(email)){ $("eMsg").textContent = "Usa un correo @bafar.com.mx (o déjalo vacío si aún no lo tienes)."; return; }
  try{
    if(editEmp) await API.actualizarEmpleado(editEmp, row); else await API.guardarEmpleado(row);
    $("dlgEmp").close(); toast(editEmp ? "Persona actualizada" : "Persona agregada"); await refresh();
  } catch(e){ $("eMsg").textContent = e.message; }
});

// ---------- evaluación de alineación
function evalModel(M){
  const rootEm = M.root.email, rootP = M.pOf[rootEm];
  const chain = id => { // estado de un indicador: llega a un indicador del gerente, se queda a medio camino, o sin alinear
    const x = M.indById[id]; if(!x || !x.ind.alineado_a) return "none";
    const r = M.rootOf(id); return r && r.p.email === rootEm && r.ind.id !== id ? "ok" : "broken";
  };
  const people = M.team.filter(e=>e.email!==rootEm).map(e=>{
    const p = M.pOf[e.email];
    if(!p) return { e, p:null, st:"nop" };
    const tot = p.indicadores.reduce((a,i)=>a+Number(i.peso),0) || 1;
    const items = p.indicadores.map(i=>({ i, st: chain(i.id) }));
    const ok = items.filter(x=>x.st==="ok").reduce((a,x)=>a+Number(x.i.peso),0);
    const pct = ok/tot*100;
    return { e, p, items, pct, st: pct>=99.99 ? "full" : pct>=50 ? "part" : "low" };
  });
  const cov = rootP ? rootP.indicadores.map((ri,ix)=>{
    const desc = []; const w = id => Object.values(M.indById).filter(y=>y.ind.alineado_a===id).forEach(y=>{ desc.push(y); w(y.ind.id); }); w(ri.id);
    return { ri, ix, n: new Set(desc.map(d=>d.p.email)).size, k: desc.length };
  }) : [];
  const unal = people.filter(x=>x.p).flatMap(x=>x.items.filter(y=>y.st!=="ok").map(y=>({ ...y, e:x.e, p:x.p })));
  const withP = people.filter(x=>x.p);
  const avg = withP.length ? withP.reduce((a,x)=>a+x.pct,0)/withP.length : 0;
  return { people, cov, unal, avg, withP };
}
const ALST = { full:["✓","Alineado","var(--good)"], part:["●","Parcial","var(--warn)"], low:["✗","Bajo","var(--bad)"], nop:["○","Sin pronóstico","var(--muted)"] };
function evalHtml(M){
  const E = evalModel(M);
  const gaps = E.cov.filter(c=>!c.n), nFull = E.people.filter(x=>x.st==="full").length, nNop = E.people.filter(x=>x.st==="nop").length;
  const unalPts = E.unal.reduce((a,x)=>a+Number(x.i.peso),0);
  const sm = (v, lbl, bad) => `<div class="ev-k ${bad?"bad":""}"><b class="mono">${v}</b><span>${lbl}</span></div>`;
  return `<section class="card ev">
    <h2>Evaluación de alineación · ${perLbl(dashPer)}</h2>
    <div class="ev-ks">
      ${sm(nf.format(E.avg)+"%", "alineación promedio del equipo (peso que llega a tus indicadores)", E.avg<80)}
      ${sm(`${E.cov.length-gaps.length}/${E.cov.length}`, "de tus indicadores tienen cascada", gaps.length)}
      ${sm(`${nFull}/${E.people.length}`, "personas 100% alineadas", nFull<E.people.length)}
      ${sm(E.unal.length, `indicadores que no llegan a los tuyos${E.unal.length?` (${nf.format(unalPts)} pts de peso)`:""}`, E.unal.length)}
      ${sm(nNop, "personas sin pronóstico", nNop)}
    </div>
    <div class="ev-grid">
      <div>
        <h3>Cobertura de tus indicadores</h3>
        ${E.cov.map(c=>`<div class="ev-row"><span><i class="dot" style="background:var(${color(c.ix)})"></i>${esc(c.ri.nombre)}</span>
          ${c.n?`<span class="ok">✓ ${c.n} persona${c.n===1?"":"s"}</span>`:`<span class="no">✗ Sin cascada</span>`}</div>`).join("") || `<div class="empty">Sin pronóstico del gerente en este periodo.</div>`}
      </div>
      <div>
        <h3>No alineado (${E.unal.length})</h3>
        ${E.unal.length ? E.unal.map(x=>`<div class="ev-row click" data-op="${esc(x.p.email)}" title="Abrir pronóstico para alinear">
          <span><b>${esc(x.e.nombre)}</b> · ${esc(x.i.nombre)} <span class="by" style="display:inline">peso ${nf.format(x.i.peso)}</span></span>
          ${x.st==="broken"?`<span class="no" title="Está alineado a su jefe, pero ese indicador no llega a los tuyos">↯ Cadena rota</span>`:`<span class="no">✗ Sin alinear</span>`}</div>`).join("")
          : `<div class="ev-row"><span class="ok">✓ Todo el peso del equipo llega a tus indicadores</span></div>`}
      </div>
    </div>
    <h3 style="margin-top:16px">Por persona</h3>
    <div class="mx-wrap"><table class="ev-t">
      <thead><tr><th>Persona</th><th class="hide-sm">Puesto</th><th>Estado</th><th class="num">% alineado</th><th class="num hide-sm">Indicadores alineados</th><th>Pendiente</th></tr></thead>
      <tbody>${E.people.sort((a,b)=>(a.p?a.pct:-1)-(b.p?b.pct:-1)).map(x=>{ const [ic,lb,col] = ALST[x.st]; return `<tr ${x.p?`class="click" data-op="${esc(x.p.email)}"`:""}>
        <td><b>${esc(x.e.nombre)}</b></td><td class="hide-sm by" style="display:table-cell">${esc(x.e.puesto||"")}</td>
        <td><span style="color:${col};font-weight:600">${ic} ${lb}</span></td>
        <td class="num mono">${x.p?nf.format(x.pct)+"%":"—"}</td>
        <td class="num mono hide-sm">${x.p?`${x.items.filter(y=>y.st==="ok").length}/${x.items.length}`:"—"}</td>
        <td class="by" style="display:table-cell">${!x.p ? "Crear o replicar su pronóstico" : x.items.filter(y=>y.st!=="ok").map(y=>esc(y.i.nombre)+(y.st==="broken"?" (cadena rota)":"")).join(" · ") || "—"}</td>
      </tr>`; }).join("")}</tbody></table></div>
  </section>`;
}

// ---------- liberación: Borrador → Por liberar → Liberado (con aviso por Teams e imagen)
const EST = { borrador:["Borrador","est-b"], por_liberar:["Por liberar","est-p"], liberado:["Liberado","est-l"] };
const estOf = p => p.estado || "borrador";
const estBadge = p => { const [l,c] = EST[estOf(p)]; return `<span class="est ${c}">${estOf(p)==="liberado"?"✓ ":estOf(p)==="por_liberar"?"⏳ ":""}${l}</span>`; };
function pesosOk(p){
  return p.indicadores.length && Math.abs(p.indicadores.reduce((a,i)=>a+Number(i.peso),0)-100)<=0.01 &&
    p.indicadores.every(i=>i.tareas.length && Math.abs(i.tareas.reduce((a,t)=>a+Number(t.peso),0)-100)<=0.01);
}
async function imgData(p){ const cv = await scImage(p); return cv.toDataURL("image/png"); }
function relHtml(p){
  const e = estOf(p), own = p.email === ME.email;
  const btn = [];
  if(e==="borrador" && own && !ME.isAdmin) btn.push(`<button class="primary" id="btnSol">Enviar a liberación</button>`);
  if(ME.isAdmin && e!=="liberado") btn.push(`<button class="primary ok-btn" id="btnLib">✓ Liberar</button>`);
  if(ME.isAdmin && e==="por_liberar") btn.push(`<button id="btnDev">Devolver</button>`);
  if(ME.isAdmin && e==="liberado") btn.push(`<button id="btnReab">Reabrir</button>`);
  const info = e==="liberado" ? `Liberado el ${new Date(p.liberado_en).toLocaleDateString("es-MX",{dateStyle:"medium"})} por ${esc(p.liberado_por||"")}. La estructura queda bloqueada; el valor real se sigue capturando.`
    : e==="por_liberar" ? `Enviado a liberación el ${new Date(p.solicitado_en).toLocaleDateString("es-MX",{dateStyle:"medium"})}. ${ME.isAdmin?"Revísalo y libéralo o devuélvelo.":"Mientras se revisa, la estructura queda bloqueada."}`
    : p.comentario ? `Devuelto con comentario: «${esc(p.comentario)}»` : own && !ME.isAdmin ? "Cuando tus indicadores, tareas y pesos estén listos, envíalo a liberación." : "";
  return `<section class="card rel rel-${e}"><div class="rel-l">${estBadge(p)}<span class="hint">${info}</span></div><div class="tools">${btn.join("")}</div></section>`;
}
function bindRel(p){
  const go = async (b, fn) => { b.disabled = true; try{ await fn(); } catch(e){ toast(e.message); } b.disabled = false; };
  if($("btnSol")) $("btnSol").onclick = e => go(e.target, async ()=>{
    if(!pesosOk(p)) throw new Error("Antes de enviarlo, los pesos de indicadores y de tareas deben sumar 100.");
    const r = await API.solicitarLiberacion(p.id, await imgData({ ...p, estado:"por_liberar", solicitado_en:new Date().toISOString() }));
    await refresh(); teamsSent(r);
  });
  if($("btnLib")) $("btnLib").onclick = e => go(e.target, async ()=>{
    if(!pesosOk(p)) throw new Error("No se puede liberar: los pesos de indicadores y de tareas deben sumar 100.");
    const r = await API.liberar(p.id, await imgData({ ...p, estado:"liberado", liberado_en:new Date().toISOString(), liberado_por:ME.email }));
    await refresh(); teamsSent(r);
  });
  if($("btnDev")) $("btnDev").onclick = ()=>{ $("devTxt").value = ""; $("dlgDev").showModal(); $("devTxt").focus(); };
  $("devOk").onclick = e => go(e.target, async ()=>{
    const c = $("devTxt").value.trim(); if(!c) throw new Error("Escribe qué debe corregir.");
    const r = await API.devolver(curId, c); $("dlgDev").close(); await refresh(); teamsSent(r);
  });
  if($("btnReab")) $("btnReab").onclick = e => go(e.target, async ()=>{ await API.reabrir(p.id); await refresh(); toast("Pronóstico reabierto como borrador"); });
}
function teamsSent(r){
  if(!r) return;
  if(r.preview && window.showTeamsPreview) return window.showTeamsPreview(r);
  if(r.manual && window.showTeamsManual){ toast("Estado actualizado"); return window.showTeamsManual(r); }
  toast(r.enviado ? `Aviso enviado por Teams a ${r.para_nombre || r.para}` : `Estado actualizado. ${r.error ? "No se pudo enviar a Teams: "+r.error : ""}`);
}

// ---------- tema
$("theme").onclick = ()=>{
  const r = document.documentElement;
  const dark = r.dataset.theme ? r.dataset.theme==="dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme = dark ? "light" : "dark";
  try{ localStorage.setItem("pronosticoSC_theme", r.dataset.theme); }catch(e){}
};
try{ const t = localStorage.getItem("pronosticoSC_theme"); if(t) document.documentElement.dataset.theme = t; }catch(e){}

// ---------- arranque (la capa API decide si hay sesión)
window.App = {
  async start(me){
    ME = me; curId = null; view = "list"; filt.anio = ""; filt.q = 0; filt.txt = "";
    $("whoEmail").textContent = me.email; $("roleBadge").textContent = me.isAdmin ? "Administrador" : "Colaborador";
    $("who").hidden = false; $("app").hidden = false;
    await refresh();
  },
  stop(){ ME = null; PRONS = []; $("main").innerHTML = ""; $("app").hidden = true; $("who").hidden = true; },
  refresh, toast,
  // cambios de otros usuarios: refresca sin interrumpir una captura o un diálogo abierto
  refreshSoon(){
    clearTimeout(this._rs);
    this._rs = setTimeout(()=>{
      const busy = document.querySelector("dialog[open]") || (document.activeElement && document.activeElement.matches("input[data-real], #fTxt"));
      if(busy || !ME) return this.refreshSoon();
      refresh().catch(()=>{});
    }, 600);
  }
};
})();
