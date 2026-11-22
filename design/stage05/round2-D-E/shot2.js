const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:2000,height:1200},deviceScaleFactor:1.25});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
await p.goto('file://'+process.cwd()+'/plate.html');await p.waitForTimeout(1500);
const names={sys:'D0-system-board',s1:'D1-frames-01-04',s2:'D2-frames-05-08',s3:'D3-qa-frames',s4:'D4-compact-320x568',s5:'E-the-cut'};
for(const [id,n] of Object.entries(names)){const el=await p.$('#'+id);if(!el){console.log('missing',id);continue;}await el.screenshot({path:n+'.png'});}
await b.close();})();
