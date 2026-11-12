'use client';
import {useEffect,useState} from 'react';
import Icon from './Icon';
import {uploadMedia,isVideoUrl} from '@/lib/api';
import {MediaPicker} from './Media';

const STATUS_CLS:Record<string,string>={'pending confirmation':'amber','pending':'amber','new':'blue','confirmed':'green','processing':'blue','sent to courier':'sky','delivered':'green','completed':'green','cancelled':'red','returned':'red','rejected':'red','suspended':'red','active':'green','disabled':'gray','draft':'gray','hidden':'gray','paid':'green','cod collected':'green','advance paid':'green','unpaid':'gray','pending payment':'amber','advance required':'amber','pending advance payment':'amber','awaiting advance verification':'amber','refunded':'red','failed':'red','contacted':'sky','quoted':'blue','converted':'green','closed':'gray','approved':'green','answered':'green','hot':'red','warm':'amber','cold':'sky','urgent':'red','priority':'amber','normal':'blue','sent':'green','retry':'amber','sending':'blue'};
export function Status({s}:{s:any}){const k=String(s||'—');return <span className={'st st-'+(STATUS_CLS[k.toLowerCase()]||'gray')}>{k}</span>}
export function PageHead({title,sub,children}:{title:string;sub?:string;children?:React.ReactNode}){return <div className="ph"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{children&&<div className="ph-actions">{children}</div>}</div>}
export function Empty({text='Nothing here yet.',icon='box'}:{text?:string;icon?:string}){return <div className="empty"><Icon name={icon} size={32} stroke={1.4}/><p>{text}</p></div>}
export function Loading(){return <div className="empty"><span className="spin"/><p>Loading…</p></div>}

export function Drawer({open,title,onClose,children,width=560,footer}:{open:boolean;title:React.ReactNode;onClose:()=>void;children:React.ReactNode;width?:number;footer?:React.ReactNode}){
  useEffect(()=>{if(!open)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[open,onClose]);
  if(!open)return null;
  return <div className="drw" role="dialog" aria-modal="true"><div className="drw-bg" onClick={onClose}/><aside className="drw-panel" style={{width:`min(${width}px,100%)`}}><header><h2>{title}</h2><button className="ib" onClick={onClose} aria-label="Close"><Icon name="close"/></button></header><div className="drw-body">{children}</div>{footer&&<footer>{footer}</footer>}</aside></div>;
}

type ToastT={id:number;kind:'ok'|'err';text:string};
let push:(t:Omit<ToastT,'id'>)=>void=()=>{};
export const toast={ok:(text:string)=>push({kind:'ok',text}),err:(text:string)=>push({kind:'err',text})};
export function Toaster(){const[list,setList]=useState<ToastT[]>([]);useEffect(()=>{push=t=>{const id=Date.now()+Math.random();setList(l=>[...l,{...t,id}]);setTimeout(()=>setList(l=>l.filter(x=>x.id!==id)),4200)}},[]);
  return <div className="toasts" aria-live="polite">{list.map(t=><div key={t.id} className={'toast '+t.kind}><Icon name={t.kind==='ok'?'checkCircle':'info'} size={18}/>{t.text}</div>)}</div>}

export function Field({label,hint,children,span}:{label:string;hint?:string;children:React.ReactNode;span?:boolean}){return <label className={'fld'+(span?' span':'')}><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}
export function Toggle({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label:string}){return <label className="tgl"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><i/><span>{label}</span></label>}

export function ImageInput({value,onChange,folder,label='Image',kind='image'}:{value:string;onChange:(url:string)=>void;folder:string;label?:string;kind?:'image'|'video'}){
  const[busy,setBusy]=useState(-1);const[err,setErr]=useState('');const[pick,setPick]=useState(false);const[over,setOver]=useState(false);
  async function up(f?:File|null){if(!f)return;setBusy(0);setErr('');try{onChange(await uploadMedia(f,folder,setBusy))}catch(x:any){setErr(x.message)}finally{setBusy(-1)}}
  return <div className={'imgin'+(over?' over':'')} onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);up(e.dataTransfer.files?.[0])}}>
    <div className="imgin-prev">{value?(kind==='video'||isVideoUrl(value)?<video src={value} muted controls preload="metadata"/>:<img src={value} alt=""/>):<Icon name={kind==='video'?'play':'upload'} size={22}/>}</div><div className="imgin-body">
    <b>{label}</b><input placeholder="Drop a file here, upload, or paste a CloudFront URL" value={value||''} onChange={e=>onChange(e.target.value)}/>
    <div className="row"><label className="btn btn-sm btn-soft">{busy>=0?`Uploading ${busy}%`:`Upload ${kind}`}<input hidden type="file" accept={kind==='video'?'video/*':'image/*'} disabled={busy>=0} onChange={e=>{up(e.target.files?.[0]);e.target.value=''}}/></label><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setPick(true)}>From library</button>{value&&<button type="button" className="btn btn-sm btn-ghost" onClick={()=>onChange('')}>Remove</button>}</div>
    {err&&<small className="err">{err}</small>}</div><MediaPicker open={pick} onClose={()=>setPick(false)} multiple={false} type={kind} onPick={i=>onChange(i[0].url)}/></div>;
}
export function Confirm({text,onYes,children,cls='btn btn-sm btn-ghost danger'}:{text:string;onYes:()=>void;children:React.ReactNode;cls?:string}){return <button type="button" className={cls} onClick={()=>{if(window.confirm(text))onYes()}}>{children}</button>}
export function Tabs({tabs,value,onChange}:{tabs:{key:string;label:string;count?:number}[];value:string;onChange:(k:string)=>void}){return <div className="tabs">{tabs.map(t=><button key={t.key} className={value===t.key?'on':''} onClick={()=>onChange(t.key)}>{t.label}{t.count!==undefined&&<em>{t.count}</em>}</button>)}</div>}
