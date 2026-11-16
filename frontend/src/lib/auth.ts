'use client';
export const DRAFT='emxin_checkout_draft';
export const getToken=()=>{try{return localStorage.getItem('customer_token')||''}catch{return ''}};
export const setToken=(t:string)=>{try{localStorage.setItem('customer_token',t);localStorage.removeItem('customer_profile')}catch{}window.dispatchEvent(new Event('emxin:auth'))};
export const logout=()=>{try{localStorage.removeItem('customer_token');localStorage.removeItem('customer_profile')}catch{}window.dispatchEvent(new Event('emxin:auth'))};
export function readDraft():any{try{return JSON.parse(sessionStorage.getItem(DRAFT)||'null')}catch{return null}}
export function saveDraft(d:any){try{sessionStorage.setItem(DRAFT,JSON.stringify(d))}catch{}}
export const safeNext=(n:string|null,fallback='/account')=>n&&n.startsWith('/')&&!n.startsWith('//')?n:fallback;
export const digitsBD=(s:string)=>s.replace(/\D/g,'').replace(/^880/,'').replace(/^0/,'');
/** What the customer sees and types: 01XXXXXXXXX (11 digits). Accepts +880…, 880…, 1… and spaces, and always gives back 01…. */
export const localBD=(s:string)=>{let d=s.replace(/\D/g,'');if(d.startsWith('880'))d=d.slice(2);else if(d.startsWith('1'))d='0'+d;return d.replace(/^0{2,}/,'0').slice(0,11)};
export const validBD=(s:string)=>/^01[3-9]\d{8}$/.test(localBD(s));

/** Remembered device: after one OTP this browser can log in to that number for 30 days without a new code (saves SMS).
 *  Kept on Log out on purpose — only the 30 days ending (or the server saying no) removes it. */
const DEV='emxin_devices';
type Dev={t:string;exp:string};
function devs():Record<string,Dev>{try{return JSON.parse(localStorage.getItem(DEV)||'{}')||{}}catch{return {}}}
export function rememberDevice(phone:string,t?:string,exp?:string){if(!t||!exp)return;try{const d=devs();d[localBD(phone)]={t,exp};localStorage.setItem(DEV,JSON.stringify(d))}catch{}}
export function deviceFor(phone:string):Dev|null{const d=devs()[localBD(phone)];return d&&new Date(d.exp).getTime()>Date.now()?d:null}
export function forgetDevice(phone:string){try{const d=devs();delete d[localBD(phone)];localStorage.setItem(DEV,JSON.stringify(d))}catch{}}
