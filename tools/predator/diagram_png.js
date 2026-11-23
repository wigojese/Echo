const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:820,height:520},deviceScaleFactor:2});
 await p.goto('file://'+require('path').resolve(__dirname,'../..')+'/reference/evidence/predator/transitions.svg'); await p.screenshot({path:''+require('path').resolve(__dirname,'../..')+'/reference/evidence/predator/transitions.png'}); await b.close(); })();
