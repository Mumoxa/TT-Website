const root=document.getElementById("app");
const VERSION="20260901-3";
Promise.all([1,2,3,4].map(i=>fetch(`./fragment-${i}.html?v=${VERSION}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`Fragment ${i} failed: ${r.status}`);return r.text()})))
  .then(parts=>{root.innerHTML=parts.join("\n");return import(`./app.js?v=${VERSION}`)})
  .catch(err=>{console.error(err);root.innerHTML='<main style="max-width:760px;margin:120px auto;padding:24px;font-family:Inter,system-ui;color:#12303d;background:#f4f1ea"><h1>Milkor Sourcing Intelligence</h1><p>The interactive profile could not load. Please refresh the page or return to <a href="/">Talent Tree</a>.</p></main>'});