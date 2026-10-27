// Aviso por Microsoft Teams con Microsoft Graph (chat 1 a 1, mensaje enviado por quien hace la acción).
// Requiere MS_CLIENT_ID y MS_TENANT_ID en config.js (registro de la app en Entra ID).
// Sin eso, o si Graph falla, se usa el respaldo: abrir el chat de Teams con el texto listo y pegar la imagen.
(function(){
  const CFG = window.APP_CONFIG || {};
  const SCOPES = ["User.Read", "Chat.Create", "ChatMessage.Send"];
  const APP_URL = location.origin + location.pathname.replace(/index\.html$/, "");  // debe coincidir con el redirect URI registrado
  let app = null, ready = null;
  const enabled = () => !!(CFG.MS_CLIENT_ID && CFG.MS_TENANT_ID && window.msal);
  function init(){
    if(!enabled()) return Promise.resolve(null);
    if(!ready){
      app = new msal.PublicClientApplication({
        auth: { clientId: CFG.MS_CLIENT_ID, authority: `https://login.microsoftonline.com/${CFG.MS_TENANT_ID}`, redirectUri: APP_URL },
        cache: { cacheLocation: "localStorage" }
      });
      ready = (app.initialize ? app.initialize() : Promise.resolve()).then(()=>app.handleRedirectPromise()).then(()=>app);
    }
    return ready;
  }
  async function token(email){
    await init(); if(!app) return null;
    const acc = app.getAllAccounts().find(a=>(a.username||"").toLowerCase() === (email||"").toLowerCase()) || app.getAllAccounts()[0];
    try{ if(acc) return (await app.acquireTokenSilent({ scopes: SCOPES, account: acc })).accessToken; }catch(e){}
    return (await app.acquireTokenPopup({ scopes: SCOPES, loginHint: email, prompt: acc ? undefined : "select_account" })).accessToken;
  }
  async function graph(tok, method, path, body){
    const r = await fetch("https://graph.microsoft.com/v1.0" + path, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error((j.error && j.error.message) || ("Graph " + r.status));
    return j;
  }
  const member = id => ({ "@odata.type": "#microsoft.graph.aadUserConversationMember", roles: ["owner"], "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${id}')` });
  let tokCache = null;
  // JPEG más ligero para Teams (fondo blanco, ancho máximo 2000 px)
  const toJpeg = src => new Promise((ok, ko)=>{ const im = new Image(); im.onload = ()=>{ const k = Math.min(1, 2000/im.width), c = document.createElement("canvas");
    c.width = Math.round(im.width*k); c.height = Math.round(im.height*k); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0,0,c.width,c.height);
    x.drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL("image/jpeg", 0.85)); }; im.onerror = ko; im.src = src; });
  let pending = null;
  window.Teams = {
    enabled,
    connected(){ try{ return !!(app && app.getAllAccounts().length); }catch(e){ return false; } },
    // conexión de una sola vez (ventana de Microsoft); después los envíos son silenciosos
    async connect(email){ await init(); const r = await app.loginPopup({ scopes: SCOPES, loginHint: email, prompt: "select_account" }); app.setActiveAccount && app.setActiveAccount(r.account); return r.account; },
    // se llama en el instante del clic, antes de cualquier otra espera, para que el navegador no bloquee la ventana
    prepare(email){ pending = enabled() ? token(email).then(t=>(tokCache=t)).catch(e=>{ tokCache = null; this.lastError = e.message; }) : null; return pending; },
    async ready(){ if(pending) await pending; },
    async send({ para, para_nombre, texto, img }){
      const plain = texto.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "");
      const manual = { manual: true, para, para_nombre, texto: plain, img,
        link: `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(para)}&message=${encodeURIComponent(plain + "\n" + APP_URL)}` };
      if(!enabled()) return manual;
      try{
        if(pending) await pending;
        const tok = tokCache || await token();
        if(!tok) throw new Error(this.lastError || "sin sesión de Microsoft");
        const me = await graph(tok, "GET", "/me?$select=id");
        const chat = await graph(tok, "POST", "/chats", { chatType: "oneOnOne", members: [member(me.id), member(para)] });
        const html = `<p>${texto}</p>` + (img ? `<p><img src="../hostedContents/1/$value" alt="Scorecard" style="max-width:100%"></p>` : "") +
          `<p><a href="${APP_URL}">${APP_URL}</a></p>`;
        const body = { body: { contentType: "html", content: html } };
        if(img){ const jpg = await toJpeg(img); body.hostedContents = [{ "@microsoft.graph.temporaryId": "1", contentBytes: jpg.split(",")[1], contentType: "image/jpeg" }]; }
        await graph(tok, "POST", `/chats/${chat.id}/messages`, body);
        return { enviado: true, para, para_nombre };
      }catch(e){ return { ...manual, error: e.message }; }
      finally{ tokCache = null; pending = null; }
    }
  };
  init().catch(()=>{});                                  // listo antes del primer clic
  // respaldo manual: copiar imagen y abrir el chat
  window.showTeamsManual = r => {
    let d = document.getElementById("dlgManual");
    if(!d){ d = document.createElement("dialog"); d.id = "dlgManual"; d.className = "wide"; document.body.appendChild(d); }
    d.innerHTML = `<h2>Enviar aviso por Teams</h2>
      <p class="hint" style="margin:0 0 10px">${r.error ? `No se pudo enviar automáticamente (${r.error}). ` : ""}El estado ya quedó guardado. Para avisar a <b>${r.para_nombre || r.para}</b>: copia la imagen, abre el chat y pégala con <b>Ctrl+V</b> junto al mensaje.</p>
      ${r.img ? `<div class="img-prev" style="max-height:40vh"><img src="${r.img}" alt="Scorecard"></div>` : ""}
      <div class="btns" style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" data-close>Cerrar</button>
        ${r.img ? `<button type="button" id="mCopy">1. Copiar imagen</button>` : ""}
        <a class="btn-a primary" id="mOpen" href="${r.link}" target="_blank" rel="noopener">${r.img ? "2. " : ""}Abrir chat de Teams</a></div>`;
    d.querySelector("[data-close]").onclick = ()=>d.close();
    const c = d.querySelector("#mCopy");
    if(c) c.onclick = async ()=>{ try{ const b = await (await fetch(r.img)).blob(); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); c.textContent = "✓ Imagen copiada"; }catch(e){ c.textContent = "No se pudo copiar"; } };
    d.showModal();
  };
})();
