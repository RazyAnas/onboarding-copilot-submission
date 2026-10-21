import { chromium } from "../bench/node/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
const SITES = ["python.org","w3.org","apache.org","debian.org","ubuntu.com","mozilla.org","gnu.org","arxiv.org","bbc.com","npr.org","theguardian.com","nature.com","nasa.gov","who.int","un.org","europa.eu","harvard.edu","mit.edu","stanford.edu","ox.ac.uk","cam.ac.uk","mysql.com","postgresql.org","nginx.org","golang.org","rust-lang.org","kernel.org","openstreetmap.org"];
const VERS = [["old","20210101"],["new","20250601"]];
const EXTRACT = () => {
  document.querySelectorAll("#wm-ipp-base,#wm-ipp,#donato").forEach(e=>e.remove());
  const norm=s=>(s||"").replace(/\s+/g," ").trim();
  const xp=el=>{const p=[];while(el&&el.nodeType===1&&el!==document.documentElement){let i=1,s=el.previousElementSibling;while(s){if(s.tagName===el.tagName)i++;s=s.previousElementSibling}p.unshift(el.tagName.toLowerCase()+"["+i+"]");el=el.parentElement}return "/html[1]/"+p.join("/")};
  const idx=el=>{let c=el,rel=[];while(c&&c!==document.documentElement){if(c.id)return "//*[@id='"+c.id+"']"+(rel.length?"/"+rel.join("/"):"");let i=1,s=c.previousElementSibling;while(s){if(s.tagName===c.tagName)i++;s=s.previousElementSibling}rel.unshift(c.tagName.toLowerCase()+"["+i+"]");c=c.parentElement}return xp(el)};
  const nb=(x,y,self)=>{const e=document.elementFromPoint(Math.max(0,x),Math.max(0,y));if(!e||e===self||self.contains(e)||e.contains(self))return "";return norm(e.textContent).slice(0,60)};
  const out=[];
  for(const e of document.querySelectorAll("a,button,input,select,textarea")){
    const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue; const cs=getComputedStyle(e); if(cs.visibility==="hidden"||cs.display==="none") continue;
    const ax=r.x+scrollX, ay=r.y+scrollY; if(r.top>5000) continue;
    out.push({tag:e.tagName,class:e.getAttribute("class")||"",id:e.id||"",name:e.getAttribute("name")||"",href:e.getAttribute("href")||"",alt:e.getAttribute("alt")||"",title:e.getAttribute("title")||"",value:e.getAttribute("value")||"",text:norm(e.textContent).slice(0,100),visible_text:norm(e.innerText).slice(0,100),xpath:xp(e),idxpath:idx(e),is_button:(e.tagName==="BUTTON"||e.getAttribute("type")==="submit"||e.getAttribute("role")==="button")?"yes":"no",x:Math.round(ax),y:Math.round(ay),width:Math.round(r.width),height:Math.round(r.height),area:Math.round(r.width*r.height),shape:Math.round(100*r.width/Math.max(1,r.height)),
      neighbor_text_above:nb(r.x+r.width/2,r.y-12,e),neighbor_text_below:nb(r.x+r.width/2,r.y+r.height+12,e),neighbor_text_left:nb(r.x-12,r.y+r.height/2,e),neighbor_text_right:nb(r.x+r.width+12,r.y+r.height/2,e)});
    if(out.length>=400)break;
  }
  return out;
};
const b = await chromium.launch({ channel: "chrome", headless: true });
fs.mkdirSync("raw",{recursive:true});
const jobs=[]; for(const s of SITES) for(const [v,ts] of VERS) jobs.push([s,v,ts]);
async function work(){ while(jobs.length){ const [s,v,ts]=jobs.shift(); const f=`raw/${s}_${v}.json`; if(fs.existsSync(f)) continue;
  const ctx=await b.newContext({viewport:{width:1280,height:900},javaScriptEnabled:false}); const p=await ctx.newPage();
  try{ await p.goto(`https://web.archive.org/web/${ts}/https://${s.includes("/")?s:"www."+s}/`,{waitUntil:"domcontentloaded",timeout:60000}); await p.waitForTimeout(2500);
    await p.evaluate("window.__x=1"); const els=await p.evaluate(`(${EXTRACT.toString()})()`); fs.writeFileSync(f,JSON.stringify({url:p.url(),els})); console.log("OK",s,v,els.length,p.url().slice(0,70)); }
  catch(e){ console.log("FAIL",s,v,String(e).slice(0,80)); } await ctx.close(); await new Promise(r=>setTimeout(r,6000)); } }
await Promise.all(Array.from({length:2},work)); await b.close();
