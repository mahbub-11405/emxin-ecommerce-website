'use client';
export const DRAFT='emxin_checkout_draft';
export const getToken=()=>{try{return localStorage.getItem('customer_token')||''}catch{return ''}};
export const setToken=(t:string)=>{try{localStorage.setItem('customer_token',t)}catch{}window.dispatchEvent(new Event('emxin:auth'))};
export const logout=()=>{try{localStorage.removeItem('customer_token')}catch{}window.dispatchEvent(new Event('emxin:auth'))};
export function readDraft():any{try{return JSON.parse(sessionStorage.getItem(DRAFT)||'null')}catch{return null}}
export function saveDraft(d:any){try{sessionStorage.setItem(DRAFT,JSON.stringify(d))}catch{}}
export const safeNext=(n:string|null,fallback='/account')=>n&&n.startsWith('/')&&!n.startsWith('//')?n:fallback;
export const digitsBD=(s:string)=>s.replace(/\D/g,'').replace(/^880/,'').replace(/^0/,'');
