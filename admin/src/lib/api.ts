export const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:8430/api/v1';
export function token(){if(typeof window==='undefined')return'';try{return localStorage.getItem('admin_token')||''}catch{return''}}
export async function api(path:string,opts:any={}){
  const r=await fetch(API+path,{...opts,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`,...opts.headers}});
  const j=await r.json().catch(()=>({}));
  if(r.status===401&&typeof window!=='undefined'&&!location.pathname.startsWith('/login')){try{localStorage.removeItem('admin_token')}catch{}location.href='/login?next='+encodeURIComponent(location.pathname)}
  if(!r.ok)throw new Error(typeof j.detail==='string'?j.detail:Array.isArray(j.detail)?j.detail.map((d:any)=>`${d.loc?.slice(-1)[0]}: ${d.msg}`).join('; '):'Request failed');
  return j;
}
export async function postJSON(path:string,body:any){return api(path,{method:'POST',body:JSON.stringify(body)})}
export const put=(path:string,body:any)=>api(path,{method:'PUT',body:JSON.stringify(body)});
export const del=(path:string)=>api(path,{method:'DELETE'});
export const tk=(n:any)=>'৳ '+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
export const num=(n:any)=>Number(n||0).toLocaleString('en-IN');
export const dt=(s:any)=>s?new Date(s).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
export const dateOnly=(s:any)=>s?new Date(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
export const MAX_IMAGE_MB=15, MAX_VIDEO_MB=300;
/** Upload one desktop file straight to S3 (presigned POST) and register it in the Media Library.
 *  Returns the CloudFront URL that the storefront will use. */
export async function uploadMedia(file:File,folder:string,onProgress?:(pct:number)=>void):Promise<string>{
  const isVideo=file.type.startsWith('video/');
  if(!file.type.startsWith('image/')&&!isVideo)throw new Error(`${file.name}: only images and videos are allowed`);
  const max=(isVideo?MAX_VIDEO_MB:MAX_IMAGE_MB)*1024*1024;
  if(file.size>max)throw new Error(`${file.name} is larger than ${isVideo?MAX_VIDEO_MB:MAX_IMAGE_MB} MB`);
  const s=await postJSON('/admin/media/presign',{filename:file.name,content_type:file.type,folder,size:file.size});
  const fd=new FormData();Object.entries(s.upload.fields).forEach(([k,v])=>fd.append(k,String(v)));fd.append('file',file);
  await new Promise<void>((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',s.upload.url);
    x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(Math.round(e.loaded/e.total*100))};
    x.onload=()=>x.status>=200&&x.status<300?resolve():reject(new Error(`S3 upload failed (${x.status}) for ${file.name}`));
    x.onerror=()=>reject(new Error(`Upload blocked for ${file.name}. Check that the S3 bucket CORS allows POST from ${location.origin}.`));x.send(fd)});
  try{await postJSON('/admin/media/library',{url:s.public_url,key:s.key,type:isVideo?'video':'image',name:file.name,size:file.size,folder})}catch{}
  return s.public_url as string;
}
export const isVideoUrl=(u:string)=>/\.(mp4|webm|mov)(\?|$)/i.test(u||'');
export function downloadCSV(name:string,rows:any[],cols:[string,string|((r:any)=>any)][]){
  const esc=(v:any)=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
  const lines=[cols.map(c=>esc(c[0])).join(','),...rows.map(r=>cols.map(([,k])=>esc(typeof k==='function'?k(r):r[k])).join(','))];
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
}
