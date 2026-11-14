'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast,Tabs,Confirm,Drawer} from '@/components/ui';
import {DropZone} from '@/components/Media';
import {api,del,postJSON,dateOnly,fmtMB,mediaFolder} from '@/lib/api';

/** Where a file can be put to work (the "Use on…" drawer). */
const HOME_SLOTS:[string,string][]=[['hero','Homepage hero image'],['promo','“Experience the Future” promo banner'],['product_banner','Product page banner (See More. Do More.)'],['logo','Header logo'],['logo_dark','Footer logo (dark background)'],['favicon','Favicon (browser tab icon)']];
const KIND_ICON:Record<string,string>={product:'box',category:'categories',homepage:'cms'};

export default function MediaLibrary(){
  const[type,setType]=useState('');const[q,setQ]=useState('');const[folder,setFolder]=useState('');const[d,setD]=useState<any>(null);const[page,setPage]=useState(1);
  const[use,setUse]=useState<any>(null);const[org,setOrg]=useState<any>(null);const[orgBusy,setOrgBusy]=useState(false);const[products,setProducts]=useState<any[]>([]);const[cats,setCats]=useState<any[]>([]);
  const load=()=>api(`/admin/media/library?page=${page}${type?'&type='+type:''}${folder?'&folder='+encodeURIComponent(folder):''}${q?'&q='+encodeURIComponent(q):''}`).then(setD).catch(e=>toast.err(e.message));
  useEffect(()=>{const t=setTimeout(load,q?300:0);return()=>clearTimeout(t)},[type,q,page,folder]);
  useEffect(()=>{api('/admin/products').then(r=>setProducts(Array.isArray(r)?r:r?.rows||[])).catch(()=>{});api('/admin/categories').then(setCats).catch(()=>{})},[]);
  const fo=d?.folders;const pid=folder.startsWith('product:')?folder.slice(8):'';
  const pName=pid?(fo?.products?.find((p:any)=>p.id===pid)?.name||products.find(p=>p._id===pid)?.name||'Product'):'';
  const title=pid?pName:{'':'All files',unused:'Not used anywhere',homepage:'Used on the homepage',categories:'Category tiles'}[folder]||'All files';
  const pick=(f:string)=>{setFolder(f);setPage(1)};
  async function shrinkOld(){try{const c=await postJSON('/admin/media/optimize-images',{dry_run:true});
    if(!c.count){toast.ok('All images are already small');return}
    if(!confirm(`${c.count} big image(s), ${c.total_mb} MB in total, were uploaded before automatic compression.\n\nShrink them now? They become WebP (max 2400 px, same quality to the eye) at the SAME address, so nothing on the site breaks.`))return;
    const r=await postJSON('/admin/media/optimize-images',{dry_run:false});toast.ok(`Optimizing ${r.started} image(s) in the background — sizes update in a minute`);setTimeout(load,30000)}catch(e:any){toast.err(e.message)}}
  async function preview(){setOrgBusy(true);try{setOrg(await postJSON('/admin/media/organize',{dry_run:true}))}catch(e:any){toast.err(e.message)}finally{setOrgBusy(false)}}
  async function organize(){setOrgBusy(true);try{const r=await postJSON('/admin/media/organize',{dry_run:false});r.failed?.length?toast.err(`${r.renamed} renamed, ${r.failed.length} failed: ${r.failed[0].error}`):toast.ok(`${r.renamed} file(s) renamed and every page updated`);setOrg(null);load()}catch(e:any){toast.err(e.message)}finally{setOrgBusy(false)}}
  async function apply(target:string,id?:string,url=use?.url){try{const r=await postJSON('/admin/media/use',{url,target,id});toast.ok(r.message||'Done');setUse(null);load()}catch(e:any){toast.err(e.message)}}
  // Uploading while a product folder is open adds the files straight to that product's gallery.
  async function uploaded(items:any[]){if(pid){for(const i of items){try{await postJSON('/admin/media/use',{url:i.url,target:'product',id:pid})}catch{}}toast.ok(`${items.length} file(s) added to ${pName}`)}else toast.ok(`${items.length} file(s) uploaded`);setPage(1);load()}
  const F=({k,icon,label,n,cover}:{k:string;icon:string;label:string;n?:number;cover?:string})=><button type="button" className={'mf'+(folder===k?' on':'')} onClick={()=>pick(k)}>{cover?<img src={cover} alt=""/>:<Icon name={icon} size={16}/>}<span>{label}</span>{n!==undefined&&<em>{n}</em>}</button>;
  return <Shell><PageHead title="Media Library" sub="Every image and video you upload. Folders show where each file is used on the website; use “Use on…” to put a file on a product, a category tile or the homepage."><button type="button" className="btn btn-ghost" onClick={shrinkOld} title="Shrink big images uploaded before automatic compression"><Icon name="download" size={16}/>Optimize old images</button><button type="button" className="btn btn-ghost" disabled={orgBusy} onClick={preview}><Icon name="refresh" size={16}/>{orgBusy&&!org?'Checking…':'Tidy names'}</button></PageHead>
    <div className="ml">
      <aside className="ml-side">
        <F k="" icon="products" label="All files" n={fo?.all}/>
        <F k="unused" icon="info" label="Not used" n={fo?.unused}/>
        <F k="homepage" icon="cms" label="Homepage" n={fo?.homepage}/>
        <F k="categories" icon="categories" label="Category tiles" n={fo?.categories}/>
        <small className="ml-h">Products</small>
        {(fo?.products||[]).map((p:any)=><F key={p.id} k={'product:'+p.id} icon="box" label={p.name} n={p.count} cover={p.cover}/>)}
        {fo&&!fo.products?.length&&<p className="muted tiny pad">No product uses a library file yet.</p>}
      </aside>
      <div className="ml-main">
        <div className="ml-top"><div><h2>{title}</h2>{folder==='unused'&&<small className="muted">Safe to delete if you don’t need them — they are not shown anywhere.</small>}{pid&&<small className="muted">Files uploaded here are added to this product’s gallery. Order and cover are set in <Link href="/products">Products → Media</Link>.</small>}</div>
          <div className="filters"><Tabs value={type} onChange={t=>{setType(t);setPage(1)}} tabs={[{key:'',label:'All'},{key:'image',label:'Images'},{key:'video',label:'Videos'}]}/><div className="search-in"><Icon name="search" size={16}/><input placeholder="Search file name" value={q} onChange={e=>setQ(e.target.value)}/></div></div></div>
        <DropZone compact folder={pid?mediaFolder('product',products.find(p=>p._id===pid)?.slug||pName):'library'} label={pid?`Upload into ${pName}`:'Drag & drop images or videos here, or click to browse'} onUploaded={uploaded}/>
        {!d?<Loading/>:d.rows.length?<div className="lib-grid big">{d.rows.map((m:any)=>{const used:any[]=m.used_in||[];return <div key={m._id} className="lib-card">
          <a className="lib-thumb" href={m.url} target="_blank" rel="noopener" title="Open full size">{m.type==='video'?<video src={m.url} muted preload="metadata"/>:<img src={m.url} alt="" loading="lazy"/>}{m.type==='video'&&<span className="lib-v"><Icon name="play" size={12} fill="currentColor"/></span>}</a>
          <div className="lib-meta"><b title={m.name}>{m.name||m.key.split('/').pop()}</b><small className="muted">{m.type} · {fmtMB(m.size||0)} · {dateOnly(m.created_at)}{m.optimize_status==='done'&&' · optimized'}{['queued','processing'].includes(m.optimize_status)&&' · compressing…'}</small>
            <div className="used">{used.length?used.slice(0,3).map((u,i)=><span key={i} className={'uchip k-'+u.kind} title={u.where}><Icon name={KIND_ICON[u.kind]||'box'} size={12}/>{u.label}</span>):<span className="uchip none">Not used</span>}{used.length>3&&<span className="uchip">+{used.length-3}</span>}</div>
            <div className="row"><button type="button" className="btn btn-sm" onClick={()=>setUse(m)}><Icon name="plus" size={14}/>Use on…</button><button type="button" className="ib" title="Copy URL" onClick={()=>{navigator.clipboard?.writeText(m.url);toast.ok('URL copied')}}><Icon name="copy" size={16}/></button>
              {used.length?<span className="ib dis" title="In use — remove it there first"><Icon name="trash" size={16}/></span>:<Confirm cls="ib danger" text={`Delete ${m.name} permanently from S3? This cannot be undone.`} onYes={async()=>{try{await del(`/admin/media/library/${m._id}`);toast.ok('Deleted');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm>}</div></div></div>})}</div>
          :<Empty text={folder==='unused'?'Every file is in use.':'No files here yet. Drag images or videos into the box above.'} icon="upload"/>}
        {d&&d.total>60&&<div className="pager"><button className="btn btn-sm btn-ghost" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.ceil(d.total/60)}</span><button className="btn btn-sm btn-ghost" disabled={page>=Math.ceil(d.total/60)} onClick={()=>setPage(page+1)}>Next</button></div>}
      </div>
    </div>
    <Drawer open={!!org} title="Tidy file names" width={720} onClose={()=>setOrg(null)} footer={org?.count?<><span className="muted">{org.count} file(s) will be renamed</span><button type="button" className="btn" disabled={orgBusy} onClick={organize}>{orgBusy?'Renaming…':'Rename all'}</button></>:undefined}>{org&&<div className="stack">
      <p className="muted tiny">Every file gets a name from where it is used: <b>product/aimb-g2-pro/aimb-g2-pro-01</b> (01 = cover, then gallery order), <b>-video-01</b> for videos, <b>category/smart-glasses/smart-glasses-tile-01</b>, <b>homepage/hero/hero-01</b>, <b>branding/favicon/favicon-01</b>. Files not used anywhere go to <b>library/unsorted</b>. Products, categories and the homepage are updated to the new addresses automatically.</p>
      {org.count?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Now</th><th>New name</th></tr></thead><tbody>{org.plan.map((x:any)=><tr key={x.id}><td className="ellipsis" title={x.from}>{x.original_name}</td><td className="mono tiny">{x.to.split('/').slice(1).join('/')}</td></tr>)}</tbody></table></div>:<Empty text="All files already follow the naming convention." icon="checkCircle"/>}
    </div>}</Drawer>
    <Drawer open={!!use} title="Use this file on…" onClose={()=>setUse(null)} width={480}>{use&&<UsePanel m={use} products={products} cats={cats} apply={apply}/>}</Drawer>
  </Shell>;
}

function UsePanel({m,products,cats,apply}:{m:any;products:any[];cats:any[];apply:(t:string,id?:string)=>void}){
  const[p,setP]=useState('');const[c,setC]=useState('');const video=m.type==='video';
  return <div className="stack">
    <div className="use-prev">{video?<video src={m.url} muted controls preload="metadata"/>:<img src={m.url} alt=""/>}<small className="muted">{m.name}</small></div>
    {!!m.used_in?.length&&<div className="used">{m.used_in.map((u:any,i:number)=><span key={i} className={'uchip k-'+u.kind}>{u.label} · {u.where}</span>)}</div>}
    <section className="panel"><h3>Product gallery</h3><p className="muted tiny">Adds it at the end of the product’s photos/videos. Change the order or cover in Products → Media.</p>
      <div className="row"><select value={p} onChange={e=>setP(e.target.value)} style={{flex:1}}><option value="">Choose product…</option>{products.map(x=><option key={x._id} value={x._id}>{x.name}{x.status&&x.status!=='active'?` (${x.status})`:''}</option>)}</select><button type="button" className="btn btn-sm" disabled={!p} onClick={()=>apply('product',p)}>Add</button></div></section>
    {!video&&<section className="panel"><h3>Shop by Category tile</h3><p className="muted tiny">Replaces the tile picture. A transparent PNG looks best.</p>
      <div className="row"><select value={c} onChange={e=>setC(e.target.value)} style={{flex:1}}><option value="">Choose category…</option>{cats.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}</select><button type="button" className="btn btn-sm" disabled={!c} onClick={()=>apply('category',c)}>Set</button></div></section>}
    <section className="panel"><h3>Homepage & branding</h3><div className="use-slots">{video?<button type="button" className="btn btn-sm btn-soft" onClick={()=>apply('hero_video')}>Hero “Watch Video”</button>:HOME_SLOTS.map(([k,l])=><button key={k} type="button" className="btn btn-sm btn-soft" onClick={()=>{if(confirm(`Replace the current ${l} with this image?`))apply(k)}}>{l}</button>)}</div></section>
  </div>;
}
