const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('C:/Users/codepara/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const root = 'C:/Users/codepara/Desktop/trust-link';
  const out = path.join(root, 'tmp/pdfs');
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:1600,height:1000}, reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(pathToFileURL(path.join(root,'pitch-deck/index.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>Promise.race([document.fonts.ready, new Promise(resolve=>setTimeout(resolve,5000))]));
  await page.addStyleTag({content:'.deck-top,.nav-btn,.dots,.tape{display:none!important} *,*::before,*::after{animation:none!important;transition:none!important}.rv{opacity:1!important;transform:none!important}.paper-chips .chip{color:var(--paper)!important;border-color:rgba(241,234,216,.4)!important}'});
  await page.emulateMedia({media:'screen'});
  const slides=await page.locator('.slide').evaluateAll(nodes=>nodes.map(node=>node.id));
  const results=[];
  for(let i=0;i<slides.length;i++){
    if(process.argv.includes('--repair') && i!==13)continue;
    await page.locator('.dot-btn').nth(i).evaluate(node=>node.click());
    await page.evaluate(()=>{
      for(const node of document.querySelectorAll('[data-count]'))node.textContent=node.getAttribute('data-count');
      const typed=document.getElementById('typed');if(typed)typed.textContent='081-234-5678';
      const receipt=document.getElementById('receipt');if(receipt)receipt.hidden=false;
    });
    const content=await page.locator('.slide.active').evaluate(node=>{
      const rects=[...node.querySelectorAll('.pad > *, .cover-inner > *')].map(child=>({tag:child.tagName,top:child.getBoundingClientRect().top,bottom:child.getBoundingClientRect().bottom}));
      return {id:node.id,text:node.innerText,rects};
    });
    await page.screenshot({path:path.join(out,`${String(i+1).padStart(2,'0')}-${slides[i]}.png`)});
    await page.pdf({path:path.join(out,`${String(i+1).padStart(2,'0')}-${slides[i]}.pdf`),width:'1600px',height:'1000px',printBackground:true,displayHeaderFooter:false,margin:{top:0,bottom:0,left:0,right:0}});
    results.push(content);
    console.log(`Rendered slide ${i+1}: ${slides[i]}`);
  }
  await page.setViewportSize({width:1200,height:1600});
  await page.goto(pathToFileURL(path.join(root,'resume/daniel-matthew-resume-2026-updated.html')).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>Promise.race([document.fonts.ready, new Promise(resolve=>setTimeout(resolve,5000))]));
  await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(root,'resume/daniel-matthew-resume-2026-updated1.pdf'),format:'A4',printBackground:true,displayHeaderFooter:false,margin:{top:'10mm',bottom:'10mm',left:'8mm',right:'8mm'}});
  fs.writeFileSync(path.join(out,'export-validation.json'),JSON.stringify({slides:results,errors},null,2));
  await browser.close();
  console.log(`Rendered ${slides.length} deck pages and refreshed resume PDF; page errors=${errors.length}`);
})().catch(error=>{console.error(error);process.exitCode=1;});
