// Continue: a saved game resumes in 3D with the room where it was left.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const errors=[]; const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); const page=await ctx.newPage();
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
await page.goto((process.env.DA_BASE||'http://localhost:8901')+'/index.html',{waitUntil:'networkidle'}); await page.waitForTimeout(800);
let shown=await page.$eval('#resume',e=>getComputedStyle(e).display); if(shown!=='none')errors.push('resume offered with no save');
await page.evaluate(()=>{window.__DA.jump3d();window.__DA.s2start();window.__DA.s2round(2);window.__DA.setPos(5,-3);});
await page.waitForTimeout(300); await page.evaluate(()=>window.__DA.save());
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800);
shown=await page.$eval('#resume',e=>getComputedStyle(e).display); if(shown==='none')errors.push('resume not offered after save');
await page.tap('#resumeYes'); await page.waitForTimeout(700);
const st=await page.evaluate(()=>({crossed:window.__DA.crossed,dim:window.__DA.dim,s2:window.__DA.s2,pos:window.__DA.pos,hud:document.getElementById('count').textContent}));
console.log('resumed:',JSON.stringify(st));
if(!st.crossed||st.dim<.99)errors.push('resume did not restore 3D'); if(!st.s2.active||st.s2.round!==2)errors.push('resume did not restore the room round');
if(!/PATTERNS/.test(st.hud))errors.push('HUD not restored: '+st.hud);
// start over clears it
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800); await page.tap('#resumeNo'); await page.waitForTimeout(300);
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800);
shown=await page.$eval('#resume',e=>getComputedStyle(e).display); if(shown!=='none')errors.push('start over did not clear the save');
await browser.close();
if(errors.length){console.log('ERRORS');errors.forEach(e=>console.log(' - '+e));process.exit(1);} console.log('SAVE OK');
