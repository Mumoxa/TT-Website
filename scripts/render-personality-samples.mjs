// Synthetic-only visual QA. Start Vite first, then run with CHROMIUM_PATH set.
// No candidate data is read or written. Outputs are intentionally synthetic.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {samples} from '../tests/fixtures/personality-report-samples.mjs';
const base=process.env.PREVIEW_BASE || 'http://127.0.0.1:5173';
const output=resolve(process.env.REPORT_OUTPUT || 'deliverables/personality-report');
const executablePath=process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH to an installed Chromium executable.');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  for (const name of Object.keys(samples)) {
    await page.goto(`${base}/tests/fixtures/personality-preview.html?sample=${name}`,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    await page.emulateMedia({media:'print'});
    const overflow=await page.locator('.pi-page').evaluateAll(pages=>pages.map((p,i)=>({page:i+1,content:p.querySelector('.pi-content').scrollHeight,available:p.querySelector('.pi-content').clientHeight,scroll:p.scrollHeight,height:p.clientHeight})).filter(x=>x.content>x.available+1 || x.scroll>x.height+1));
    if (overflow.length) throw new Error(`Layout overflow for ${name}: ${JSON.stringify(overflow)}`);
    const factors=samples[name].personality.factors;
    const positions=await page.locator('.pi-spectrum').evaluateAll(scales=>scales.map(s=>{const axis=s.querySelector('.pi-spectrum-scale').getBoundingClientRect(), mark=s.querySelector('.pi-marker')?.getBoundingClientRect(); return mark ? ((mark.left+mark.width/2-axis.left)/axis.width) : null;}));
    for (let i=0;i<10;i++) {
      const f=factors?.[i%5], expected=f && f.answered===f.total ? (f.mean-1)/4 : null;
      if (expected===null ? positions[i]!==null : Math.abs(positions[i]-expected)>0.001) throw new Error(`${name}: marker ${i+1} differs from independently calculated position`);
    }
    const bytes=await page.pdf({printBackground:true,preferCSSPageSize:true});
    await writeFile(`${output}/${name}.pdf`,bytes);
    const render=await browser.newPage({viewport:{width:900,height:1250}});
    await render.goto(`${base}/tests/fixtures/personality-preview.html`,{waitUntil:'networkidle'});
    const pages=await render.evaluate(async data=>{
      const pdfjs=await import('/node_modules/pdfjs-dist/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';
      const pdf=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;
      const counts=[]; document.body.innerHTML=''; document.body.style.cssText='margin:0;background:white';
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n), viewport=page.getViewport({scale:1.35});
        if (Math.abs(page.view[2]-595.28)>1 || Math.abs(page.view[3]-841.89)>1) throw new Error(`Page ${n} is not A4 portrait`);
        const content=await page.getTextContent();
        for (const item of content.items) if (item.str.trim() && (item.transform[4]<0 || item.transform[5]<0 || item.transform[4]+item.width>page.view[2]+1 || item.transform[5]>page.view[3]+1)) throw new Error(`Text outside page ${n}`);
        const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);document.body.append(canvas);
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
        counts.push(content.items.map(i=>i.str).join(' '));
      }
      return counts;
    },Array.from(bytes));
    if (pages.length!==4) throw new Error(`${name}: expected 4 pages, got ${pages.length}`);
    for (const [i,text] of pages.entries()) {
      if (text.trim().length<250) throw new Error(`${name} page ${i+1}: insufficient searchable text`);
      await render.locator('canvas').nth(i).screenshot({path:`${output}/${name}-page-${i+1}.png`});
    }
    const text=pages.join(' ');
    for (const secret of ['not-for-report@example.invalid','***9876','***1111','private transport','synthetic-attempt-001']) if (text.includes(secret)) throw new Error('Private fixture data appeared in PDF.');
    for (let i=0;i<5;i++) {
      const factor=factors?.[i];
      if (factor && factor.answered===factor.total && !pages[0].includes(factor.mean.toFixed(2))) throw new Error(`${name}: missing displayed score for dimension ${i+1}`);
    }
    for (let i=0;i<4;i++) if (!pages[i].includes(`0${i+1} / 04`)) throw new Error(`${name}: missing page number ${i+1}`);
    await render.close();
    console.log(`${name}: 4 pages; selectable text; no detected overflow`);
  }
  await page.goto(`${base}/tests/fixtures/personality-preview.html?sample=invalid`,{waitUntil:'networkidle'});
  if ((await page.locator('[role=alert]').count())!==1 || await page.locator('.pi-page').count()) throw new Error('Invalid score was not refused.');
  console.log('invalid: refused');
} finally {await browser.close();}
