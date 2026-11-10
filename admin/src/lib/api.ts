export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8430/api/v1';
export function token(){if(typeof window==='undefined')return'';return localStorage.getItem('admin_token')||''}
export async function api(path:string,opts:any={}){const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`,...opts.headers}});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Request failed');return j}

export async function postJSON(path:string,body:any){return api(path,{method:'POST',body:JSON.stringify(body)})}
