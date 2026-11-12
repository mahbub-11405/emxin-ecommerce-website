'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast,Tabs,Confirm} from '@/components/ui';
import {DropZone} from '@/components/Media';
import {api,del,dateOnly} from '@/lib/api';
const size=(b:number)=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.round(b/1024)+' KB';
export default function MediaLibrary(){
  const[type,setType]=useState('');const[q,setQ]=useState('');const[d,setD]=useState<any>(null);const[page,setPage]=useState(1);
  const load=()=>api(`/admin/media/library?page=${page}${type?'&type='+type:''}${q?'&q='+encodeURIComponent(q):''}`).then(setD).catch(e=>toast.err(e.message));
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[type,q,page]);
  return <Shell><PageHead title="Media Library" sub="Every image and video uploaded from your desktop. Files are stored in S3 and served to the website through CloudFront."/>
    <DropZone folder="library" onUploaded={items=>{toast.ok(`${items.length} file(s) uploaded to S3`);setPage(1);load()}}/>
    <div className="filters" style={{marginTop:16}}><Tabs value={type} onChange={t=>{setType(t);setPage(1)}} tabs={[{key:'',label:'All',count:type?undefined:d?.total},{key:'image',label:'Images'},{key:'video',label:'Videos'}]}/><div className="search-in"><Icon name="search" size={16}/><input placeholder="Search file name" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    {!d?<Loading/>:d.rows.length?<div className="lib-grid big">{d.rows.map((m:any)=><div key={m._id} className="lib-card">
      <div className="lib-thumb">{m.type==='video'?<video src={m.url} muted controls preload="metadata"/>:<img src={m.url} alt="" loading="lazy"/>}</div>
      <div className="lib-meta"><b title={m.name}>{m.name||m.key.split('/').pop()}</b><small className="muted">{m.type} · {size(m.size||0)} · {dateOnly(m.created_at)}</small>
        <div className="row"><button className="btn btn-sm btn-soft" onClick={()=>{navigator.clipboard?.writeText(m.url);toast.ok('CloudFront URL copied')}}><Icon name="copy" size={14}/>Copy URL</button><a className="ib" href={m.url} target="_blank" rel="noopener" title="Open"><Icon name="eyeView" size={16}/></a>
        <Confirm cls="ib danger" text={`Delete ${m.name} from S3? This cannot be undone.`} onYes={async()=>{try{await del(`/admin/media/library/${m._id}`);toast.ok('Deleted from S3');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm></div></div></div>)}</div>:<Empty text="No files yet. Drag images or videos into the box above." icon="upload"/>}
    {d&&d.total>60&&<div className="pager"><button className="btn btn-sm btn-ghost" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(d.total/60)}</span><button className="btn btn-sm btn-ghost" disabled={page>=Math.ceil(d.total/60)} onClick={()=>setPage(page+1)}>Next</button></div>}
  </Shell>;
}
