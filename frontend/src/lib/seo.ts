// Search engines & sharing: the store's public address and helpers for structured data (JSON-LD).
// SITE_URL is set on the server (docker-compose → SITE_URL=${FRONTEND_URL}); the fallback is the dev store.
export const SITE_URL=(process.env.SITE_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://tech.emxin.com').replace(/\/+$/,'');
export const SITE_NAME=process.env.NEXT_PUBLIC_SITE_NAME||'EMXIN Technologies';
export const abs=(path:string)=>/^https?:\/\//i.test(path)?path:SITE_URL+(path.startsWith('/')?path:'/'+path);
/** All product pictures (cover first), never videos. */
export const productImages=(p:any):string[]=>[...(p?.images||[]),...((p?.media||[]).filter((m:any)=>m?.type==='image').map((m:any)=>m.url))].filter((u:any,i:number,a:any[])=>typeof u==='string'&&/^https?:\/\//.test(u)&&a.indexOf(u)===i);
/** Plain text for meta descriptions: no line breaks or extra spaces, cut at a word near the limit. */
export function clip(s:any,max=158){const t=String(s||'').replace(/\s+/g,' ').trim();if(t.length<=max)return t;const c=t.slice(0,max-1);return c.slice(0,Math.max(c.lastIndexOf(' '),max-25)).replace(/[,.;:\s]+$/,'')+'…'}
export const price=(p:any)=>Number(p?.sale_price||p?.price||0);
