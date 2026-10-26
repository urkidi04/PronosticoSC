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
const filt = { anio:"", q:0, txt:"" };

function toast(m){const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),2600)}
async function run(fn, ok){
  try{ const r = await fn(); if(ok) toast(ok); return r; }
  catch(e){ toast(e.message || String(e)); throw e; }
}
const pron = id => PRONS.find(p=>p.id===id);
const canEdit = p => ME.isAdmin || p.email === ME.email;
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
function render(){ curId ? renderDetail() : renderList(); }

// ---------- lista
function renderList(){
  const years = [...new Set(PRONS.map(p=>p.anio))].sort((a,b)=>b-a);
  let rows = PRONS.filter(p=>(!filt.anio || p.anio==filt.anio) && (!filt.q || p.trimestre==filt.q) &&
    (!filt.txt || (p.email+" "+(empOf(p).nombre||"")+" "+(empOf(p).num_empleado||"")).toLowerCase().includes(filt.txt.toLowerCase())));
  rows.sort((a,b)=> b.anio-a.anio || b.trimestre-a.trimestre || (empOf(a).nombre||a.email).localeCompare(empOf(b).nombre||b.email));
  $("main").innerHTML = `
    <div class="bar">
      <div>
        <h2 class="h">${ME.isAdmin ? "Pronósticos del equipo" : "Mis pronósticos"}</h2>
        <div class="sub">${PRONS.length} pronóstico${PRONS.length===1?"":"s"}${ME.isAdmin?" · "+new Set(PRONS.map(p=>p.email)).size+" personas":""}</div>
      </div>
      ${ME.isAdmin?`<button class="primary" id="btnNew">+ Nuevo pronóstico</button>`:""}
    </div>
    <div class="filters">
      <select id="fAnio" aria-label="Año"><option value="">Todos los años</option>${years.map(y=>`<option ${filt.anio==y?"selected":""}>${y}</option>`).join("")}</select>
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
          <td><span class="per">${Q(p.trimestre)} ${p.anio}</span></td>
          <td class="mono hide-sm">${sc.cap}/${sc.n}</td>
          <td class="score-td" style="min-width:140px"><div class="cell-score"><div class="prog"><div style="width:${sc.total}%;background:${sc.cap?statusColor(sc.total):"var(--track)"}"></div></div><span class="mono st">${nf.format(sc.total)}%</span></div></td>
          <td class="act"><button class="ib" data-img="${p.id}" title="Generar imagen" aria-label="Generar imagen">🖼</button><button class="ib" data-rep="${p.id}" title="Replicar" aria-label="Replicar">⧉</button>${ME.isAdmin?`<button class="ib del" data-delp="${p.id}" title="Eliminar" aria-label="Eliminar">🗑</button>`:""}</td>
        </tr>`; }).join("")}</tbody></table>`
      : `<div class="empty big-empty">${PRONS.length ? "No hay pronósticos con estos filtros." : ME.isAdmin ? "Aún no hay pronósticos. Crea el primero con «+ Nuevo pronóstico»." : "Todavía no tienes pronósticos asignados."}</div>`}
    </section>`;
  if($("btnNew")) $("btnNew").onclick = ()=>openPron(null);
  $("fAnio").onchange = e=>{ filt.anio = e.target.value; renderList(); };
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
    <button class="back" id="btnBack">← ${ME.isAdmin?"Pronósticos del equipo":"Mis pronósticos"}</button>
    <section class="card head-card">
      <div>
        <div class="per big-per">${Q(p.trimestre)} ${p.anio}</div>
        <h2 class="h">${esc(e.nombre||p.email)}</h2>
        <div class="sub">${esc(p.email)} · Núm. empleado <span class="mono">${esc(e.num_empleado||"—")}</span></div>
      </div>
      <div class="tools">
        <button id="btnImg">🖼 Imagen</button><button id="btnRep">⧉ Replicar</button>
        ${ME.isAdmin?`<button id="btnEditP">Editar datos</button><button class="danger-ghost" id="btnDelP">Eliminar</button>`:""}
      </div>
    </section>
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
        <h3>${esc(ind.nombre)}</h3><span class="tag">Peso ${nf.format(ind.peso)}</span>
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
  $("iMsg").textContent = ""; $("dlgInd").showModal(); $("iNombre").focus();
}
$("iForm").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const row = { id: editInd||undefined, nombre: $("iNombre").value.trim(), medible: $("iMedible").value.trim(), peso: Number($("iPeso").value), orden: Number($("iOrden").value)||99 };
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
    { k:"pts",  t:"Aporte\n(pts)",   w:76, a:"c" }
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
  txt("Cumplimiento ponderado "+nf.format(sc.total)+"%", col("med").x+col("med").w-10, Y+RH/2, { s:12.5, w:600, a:"right", c:"#fff" });
  Y += RH;
  const hoy = new Date();
  txt(`Cumplimiento por tarea = Real ÷ Meta (tope 100%). Aporte = peso del indicador × cumplimiento del indicador.`, PAD, Y+24, { s:11.5, c:C.muted });
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
    ME = me; curId = null; filt.anio = ""; filt.q = 0; filt.txt = "";
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
