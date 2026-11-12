export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8430/api/v1';

export async function getJSON(path:string){
  const r=await fetch(API+path,{cache:'no-store'});
  if(!r.ok)throw new Error(await r.text());
  return r.json();
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
