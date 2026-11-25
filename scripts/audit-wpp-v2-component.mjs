// Synthetic component-only audit; NOT an end-to-end assessment or release audit.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const executablePath=process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('Set CHROMIUM_PATH.');
const browser=await chromium.launch({executablePath,args:['--no-sandbox'],headless:true});
await mkdir('deliverables/wpp-v2-component-audit',{recursive:true});
try {
 for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height}}), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/tests/fixtures/wpp-v2-preview.html',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Begin',exact:true}).click();
  for(let n=1;n<=14;n++) {
   if (!(await page.getByText(`Screen ${n} of 14`,{exact:false}).isVisible())) throw new Error(`wrong screen ${n} at ${width}`);
   if (!(await page.locator('h1').evaluate(el=>document.activeElement===el))) throw new Error(`focus not on heading ${n} at ${width}`);
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,escaped:[...document.querySelectorAll('.wpp-question')].some(f=>{const a=f.getBoundingClientRect(),b=f.querySelector('legend').getBoundingClientRect();return b.left<a.left || b.right>a.right || b.top<a.top || b.bottom>a.bottom;})}));
   if(layout.overflow || layout.escaped) throw new Error(`layout issue on screen ${n} at ${width}: ${JSON.stringify(layout)}`);
   if(n===1) {await page.getByRole('radio').first().check(); await page.screenshot({path:`deliverables/wpp-v2-component-audit/${width}-statements.png`,fullPage:true});}
   if(n===11) await page.screenshot({path:`deliverables/wpp-v2-component-audit/${width}-reasoning.png`,fullPage:true});
   await page.getByRole('button',{name:n===14?'Review':'Next',exact:true}).click();
  }
  if (!(await page.getByText('1 of 62 items answered. Blanks are allowed.').isVisible())) throw new Error(`wrong review count at ${width}`);
  await page.getByRole('button',{name:'Numeric 2',exact:true}).click();
  if (!(await page.getByText('Screen 11 of 14',{exact:false}).isVisible())) throw new Error('review link did not navigate');
  if(errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(`${width}x${height}: 14 screens, focus, legends, horizontal overflow and review navigation checked`);
  await page.close();
 }
 const legacy=await browser.newPage({viewport:{width:390,height:844}});
 await legacy.goto('http://127.0.0.1:5173/tests/fixtures/wpp-v2-preview.html?version=v1',{waitUntil:'networkidle'});
 await legacy.getByRole('button',{name:'Begin',exact:true}).click();
 if (!(await legacy.getByText('Screen 1 of 10',{exact:false}).isVisible())) throw new Error('Legacy form did not render ten screens');
 console.log('legacy v1: ten-screen component smoke passed');
 await legacy.close();
} finally {await browser.close();}
