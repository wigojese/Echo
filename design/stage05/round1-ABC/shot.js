const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1.5});
p.on('pageerror',e=>console.log('ERR',e.message));p.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});
await p.goto('file://'+process.cwd()+'/proto.html');await p.waitForTimeout(800);
for(const k of ['A','B','C'])await (await p.$('#row'+k)).screenshot({path:`direction-${k}.png`});
await b.close();})();
