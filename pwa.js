// PWA: instalación y service worker
(function(){
  if("serviceWorker" in navigator) window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
  const btn = document.getElementById("btnInstall");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferred = e; if(!standalone) btn.hidden = false; });
  btn.addEventListener("click", async ()=>{ if(!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true; });
  window.addEventListener("appinstalled", ()=>{ btn.hidden = true; });
  // iPhone/iPad (Safari) no tiene botón de instalación: se muestra la instrucción una vez
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let seen = false; try{ seen = localStorage.getItem("pronosticoSC_iosTip") === "1"; }catch(_){}
  const tip = document.getElementById("iosTip");
  if(ios && !standalone && !seen) tip.hidden = false;
  document.getElementById("iosTipClose").addEventListener("click", ()=>{ tip.hidden = true; try{ localStorage.setItem("pronosticoSC_iosTip","1"); }catch(_){} });
})();
