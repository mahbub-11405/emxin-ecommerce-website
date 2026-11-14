export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8430/api/v1';

// Server-side page rendering talks to the API over the internal Docker network (no public internet / TLS) and keeps
// public data in memory for PAGE_CACHE_SECONDS (default 30), so most page views need no API call at all.
// Admin changes show on the site within that time. Browser-side calls are never cached.
const SERVER_API=process.env.API_INTERNAL_URL||API;
const CACHE_SECONDS=Number(process.env.PAGE_CACHE_SECONDS??30);
const memo=new Map<string,{t:number;v:Promise<any>}>();
async function fetchJSON(url:string){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}
export async function getJSON(path:string){
  if(typeof window!=='undefined')return fetchJSON(API+path);
  if(!(CACHE_SECONDS>0))return fetchJSON(SERVER_API+path);
  const hit=memo.get(path);
  if(!hit||Date.now()-hit.t>CACHE_SECONDS*1000){
    if(memo.size>400)memo.clear();
    const v=fetchJSON(SERVER_API+path).catch(e=>{memo.delete(path);throw e}); // errors are never cached
    memo.set(path,{t:Date.now(),v});
    return v.then(x=>structuredClone(x));
  }
  return hit.v.then(x=>structuredClone(x)); // a copy, so one page can't change another page's data
}
export async function postJSON(path:string,body:any,token?:string){
  const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(typeof j.detail==='string'?j.detail:Array.isArray(j.detail)?j.detail.map((d:any)=>d.msg).join(', '):'Request failed');
  return j;
}
/** Safe server-side fetch: returns fallback instead of throwing so pages always render. */
export async function safeJSON<T=any>(path:string,fallback:T):Promise<T>{try{return await getJSON(path)}catch{return fallback}}

export const taka=(n:any)=>'৳ '+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
export const priceOf=(p:any)=>Number(p?.sale_price||p?.price||0);
export const discountPct=(p:any)=>p?.sale_price&&Number(p.price)>Number(p.sale_price)?Math.round((1-Number(p.sale_price)/Number(p.price))*100):0;
export const firstImage=(p:any)=>p?.images?.[0]||p?.media?.find((m:any)=>m.type==='image')?.url||'';
export const isHttp=(s:any)=>typeof s==='string'&&/^https?:\/\//i.test(s);
