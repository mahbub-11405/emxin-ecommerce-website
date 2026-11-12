'use client';
import {useEffect,useRef,useState} from 'react';
import Icon from './Icon';
import {api,uploadMedia,isVideoUrl} from '@/lib/api';

type Job={name:string;pct:number;err?:string;done?:boolean};
/** Drag & drop (or click) zone that uploads many images/videos from the desktop to S3 in parallel. */
export function DropZone({folder,accept='image/*,video/*',onUploaded,label='Drag & drop images or videos here, or click to browse',compact=false}:{folder:string;accept?:string;onUploaded:(items:{url:string;type:'image'|'video';name:string}[])=>void;label?:string;compact?:boolean}){
  const[jobs,setJobs]=useState<Job[]>([]);const[over,setOver]=useState(false);const input=useRef<HTMLInputElement>(null);
  async function run(files:File[]){
    if(!files.length)return;const start=jobs.length;setJobs(j=>[...j,...files.map(f=>({name:f.name,pct:0}))]);
    const out:{url:string;type:'image'|'video';name:string}[]=[];
    let next=0;const worker=async()=>{while(next<files.length){const i=next++;const f=files[i];
      try{const url=await uploadMedia(f,folder,pct=>setJobs(j=>j.map((x,k)=>k===start+i?{...x,pct}:x)));out[i]={url,type:f.type.startsWith('video/')?'video':'image',name:f.name};setJobs(j=>j.map((x,k)=>k===start+i?{...x,pct:100,done:true}:x))}
      catch(e:any){setJobs(j=>j.map((x,k)=>k===start+i?{...x,err:e.message}:x))}}};
    await Promise.all([worker(),worker(),worker()]); // 3 parallel uploads
    const ok=out.filter(Boolean);if(ok.length)onUploaded(ok);
    setTimeout(()=>setJobs(j=>j.filter(x=>x.err)),2500);
  }
  return <div><div className={'drop'+(over?' over':'')+(compact?' compact':'')} role="button" tabIndex={0} onClick={()=>input.current?.click()} onKeyDown={e=>e.key==='Enter'&&input.current?.click()}
    onDragOver={e=>{e.preventDefault();setOver(true)}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);run(Array.from(e.dataTransfer.files))}}>
    <Icon name="upload" size={compact?20:30}/><b>{label}</b>{!compact&&<small>Multiple files at once · images up to 15 MB, videos up to 300 MB · stored in S3, served via CloudFront</small>}
    <input ref={input} hidden multiple type="file" accept={accept} onChange={e=>{run(Array.from(e.target.files||[]));e.target.value=''}}/></div>
    {jobs.length>0&&<ul className="jobs">{jobs.map((j,i)=><li key={i} className={j.err?'err':j.done?'ok':''}><span>{j.name}</span>{j.err?<small>{j.err}</small>:<i><em style={{width:j.pct+'%'}}/></i>}<b>{j.err?'Failed':j.done?'Done':j.pct+'%'}</b></li>)}</ul>}</div>;
}

/** Modal to reuse files that were already uploaded to S3. */
export function MediaPicker({open,onClose,onPick,multiple=true,type}:{open:boolean;onClose:()=>void;onPick:(items:{url:string;type:'image'|'video';name:string}[])=>void;multiple?:boolean;type?:'image'|'video'}){
  const[rows,setRows]=useState<any[]>([]);const[sel,setSel]=useState<string[]>([]);const[q,setQ]=useState('');
  const load=()=>api('/admin/media/library?'+(type?'type='+type+'&':'')+(q?'q='+encodeURIComponent(q):'')).then(r=>setRows(r.rows)).catch(()=>{});
  useEffect(()=>{if(open){setSel([]);load()}},[open,q]);
  if(!open)return null;
  const toggle=(u:string)=>setSel(s=>s.includes(u)?s.filter(x=>x!==u):multiple?[...s,u]:[u]);
  return <div className="drw" role="dialog" aria-modal="true"><div className="drw-bg" onClick={onClose}/><div className="picker">
    <header><h2>Media Library</h2><div className="search-in"><Icon name="search" size={16}/><input placeholder="Search file name" value={q} onChange={e=>setQ(e.target.value)}/></div><button className="ib" onClick={onClose}><Icon name="close"/></button></header>
    <DropZone compact folder="library" accept={type==='video'?'video/*':type==='image'?'image/*':'image/*,video/*'} label="Upload new files" onUploaded={items=>{load();setSel(s=>multiple?[...s,...items.map(i=>i.url)]:[items[0].url])}}/>
    <div className="lib-grid">{rows.map(m=><button key={m._id} type="button" className={'lib-it'+(sel.includes(m.url)?' on':'')} onClick={()=>toggle(m.url)}>{m.type==='video'?<video src={m.url} muted preload="metadata"/>:<img src={m.url} alt="" loading="lazy"/>}{sel.includes(m.url)&&<span className="lib-tick"><Icon name="check" size={14} stroke={3}/></span>}{m.type==='video'&&<span className="lib-v"><Icon name="play" size={12} fill="currentColor"/></span>}<small>{m.name}</small></button>)}{!rows.length&&<p className="muted pad">No files yet — upload above.</p>}</div>
    <footer><span className="muted">{sel.length} selected</span><button className="btn" disabled={!sel.length} onClick={()=>{onPick(sel.map(u=>({url:u,type:(rows.find(r=>r.url===u)?.type||(isVideoUrl(u)?'video':'image')) as 'image'|'video',name:rows.find(r=>r.url===u)?.name||''})));onClose()}}>Use selected</button></footer>
  </div></div>;
}
