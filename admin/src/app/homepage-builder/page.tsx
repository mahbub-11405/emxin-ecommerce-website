'use client';
import {useEffect,useRef,useState} from 'react';
import {api} from '@/lib/api';
import Shell from '@/components/Shell';

type Notice={kind:'success'|'error'|'info';text:string};
const validUrl=(s:unknown)=>typeof s==='string'&&/^https:\/\/[^\s]+$/i.test(s);
const DEFAULT={hero:{title:'Smart Gadgets. Smarter Living.',subtitle:'Discover smart eyewear, sunglasses and frames.',cta:'Shop Now',image:''},promo:{title:'New Collection',subtitle:'Fresh arrivals from EMXIN',cta:'Explore Collection',image:''},sections:[],branding:{},links:{},policies:{}};
export default function HomepageBuilder(){
 const [data,setData]=useState<any>(DEFAULT),[notice,setNotice]=useState<Notice|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState<string|null>(null),[versions,setVersions]=useState<any[]>([]),[tab,setTab]=useState<'hero'|'promo'|'pages'|'sections'|'branding'>('hero');
 const [localPreview,setLocalPreview]=useState<Record<string,string>>({});const inputRefs=useRef<Record<string,HTMLInputElement|null>>({});
 const notify=(kind:Notice['kind'],text:string)=>setNotice({kind,text});
 const change=(section:string,key:string,value:any)=>setData((old:any)=>({...old,[section]:{...(old[section]||{}),[key]:value}}));
 async function refresh(){const result=await api('/admin/cms');setData({...DEFAULT,...(result.homepage||{}),hero:{...DEFAULT.hero,...(result.homepage?.hero||{})},promo:{...DEFAULT.promo,...(result.homepage?.promo||{})}});}
 useEffect(()=>{refresh().catch(e=>notify('error',`Unable to load saved homepage: ${e.message}`));},[]);
 useEffect(()=>()=>{Object.values(localPreview).forEach(url=>URL.revokeObjectURL(url));},[localPreview]);
 async function upload(section:'hero'|'promo'|'branding',file:File){
  if(!file.type.startsWith('image/')){notify('error','Choose a PNG, JPG, WebP or SVG image.');return;}
  if(file.size>12*1024*1024){notify('error','Image must be 12 MB or smaller.');return;}
  setUploading(section);notify('info','Uploading image to S3…');
  try{
   const signed=await api('/admin/media/presign',{method:'POST',body:JSON.stringify({filename:file.name,content_type:file.type,folder:section==='branding'?'branding':section})});
   if(!signed?.upload?.url||!signed?.upload?.fields||!validUrl(signed.public_url))throw Error('Upload service returned an invalid response.');
   const fd=new FormData();Object.entries(signed.upload.fields).forEach(([k,v])=>fd.append(k,String(v)));fd.append('file',file);
   const response=await fetch(signed.upload.url,{method:'POST',body:fd});
   if(!response.ok)throw Error(`S3 upload failed (HTTP ${response.status}). Check bucket CORS and presigned upload permissions.`);
   change(section,section==='branding'?'logo_url':'image',signed.public_url);
   setLocalPreview(old=>({...old,[section]:URL.createObjectURL(file)}));
   notify('success','Image uploaded. Review the preview, then click Publish Homepage.');
  }catch(e:any){notify('error',e?.message||'Upload failed. Check API connectivity and S3 CORS.');}finally{setUploading(null);}
 }
 async function publish(){setBusy(true);notify('info','Publishing homepage…');try{
  for(const key of ['hero','promo'])if(data[key]?.image&&!validUrl(data[key].image))throw Error(`${key} image URL is invalid. Upload the image again.`);
  const response=await api('/admin/cms/homepage',{method:'PUT',body:JSON.stringify(data)});if(!response?.ok)throw Error('CMS did not confirm the publish.');
  const saved=await api('/admin/cms');if((saved.homepage?.hero?.image||'')!==(data.hero?.image||''))throw Error('Saved hero image differs from published image.');
  notify('success','Homepage published successfully. Open the storefront to see your changes.');
 }catch(e:any){notify('error',e.message||'Publish failed.');}finally{setBusy(false);}}
 async function loadVersions(){try{const list=await api('/admin/cms/versions');setVersions(Array.isArray(list)?list:[]);}catch(e:any){notify('error',e.message);}}
 async function restore(id:string){if(!window.confirm('Restore this homepage version?'))return;try{await api('/admin/cms/restore/'+id,{method:'POST'});await refresh();notify('success','Version restored. Refresh the storefront to review.');}catch(e:any){notify('error',e.message);}}
 function media(section:'hero'|'promo'|'branding'){
  const url=section==='branding'?data.branding?.logo_url:data[section]?.image;const preview=localPreview[section]||url;
  return <div className="em-media"><div className="em-media-preview">{preview?<img key={preview} src={preview} alt={`${section} preview`} onError={()=>notify('error','Image could not load from CloudFront. Check the URL and access permissions.')}/>:<div className="em-empty">No image uploaded yet<br/><small>Select a file from your computer</small></div>}</div><div className="em-media-actions"><input ref={el=>{inputRefs.current[section]=el;}} className="em-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>{const f=e.target.files?.[0];if(f)upload(section,f);e.target.value='';}}/><button className="btn" disabled={!!uploading||busy} onClick={()=>inputRefs.current[section]?.click()}>{uploading===section?'Uploading…':preview?'Replace image':'Upload image'}</button><span className="muted">Automatic S3 upload & CloudFront URL. No link copying.</span></div></div>;
 }
 return <Shell><div className="em-builder"><header className="em-heading"><div><span className="badge">EMXIN CONTENT STUDIO</span><h1>Homepage Builder</h1><p className="muted">Edit, preview and publish without handling S3 links or JSON.</p></div><button className="btn" disabled={busy||!!uploading} onClick={publish}>{busy?'Publishing…':'Publish Homepage'}</button></header>
 {notice&&<div role={notice.kind==='error'?'alert':'status'} className={`em-notice ${notice.kind}`}>{notice.text}</div>}
 <nav className="em-tabs" aria-label="Homepage editor sections">{([['hero','Hero Banner'],['promo','Promotion'],['branding','Branding'],['pages','Policy Pages'],['sections','Section Order']] as const).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 {tab==='hero'&&<div className="em-editor-grid"><section className="panel"><h2>Hero content</h2><p className="muted">Left-side text and buttons remain in their existing positions.</p><label className="field">Headline<input value={data.hero?.title||''} onChange={e=>change('hero','title',e.target.value)}/></label><label className="field">Description<textarea rows={3} value={data.hero?.subtitle||''} onChange={e=>change('hero','subtitle',e.target.value)}/></label><label className="field">Primary button label<input value={data.hero?.cta||''} onChange={e=>change('hero','cta',e.target.value)}/></label><h3>Right-side product image</h3>{media('hero')}</section><section className="panel em-live"><h2>Live hero preview</h2><div className="em-hero-preview"><div className="em-preview-copy"><span className="em-eyebrow">SMART GADGETS</span><h2>{data.hero?.title||'Smart Gadgets. Smarter Living.'}</h2><p>{data.hero?.subtitle||''}</p><div className="em-buttons"><span>{data.hero?.cta||'Shop Now'} →</span><span>New Collection</span></div></div><div className="em-preview-visual">{(localPreview.hero||data.hero?.image)?<img src={localPreview.hero||data.hero.image} alt="Hero preview"/>:<div className="em-empty">Upload your product artwork</div>}</div></div><p className="muted">The product artwork blends into the existing hero background. For a fully seamless result, use a transparent PNG/WebP.</p></section></div>}
 {tab==='promo'&&<section className="panel"><h2>Promotional Banner</h2>{(['title','subtitle','cta'] as const).map(k=><label className="field" key={k}>{k}<input value={data.promo?.[k]||''} onChange={e=>change('promo',k,e.target.value)}/></label>)}{media('promo')}</section>}
 {tab==='branding'&&<section className="panel"><h2>Company Branding</h2>{media('branding')}<label className="field">Messenger / Support URL<input value={data.links?.support_url||''} onChange={e=>change('links','support_url',e.target.value)}/></label></section>}
 {tab==='pages'&&<section className="panel"><h2>Customer information & policies</h2>{[['privacy-policy','Privacy Policy'],['return-policy','Return Policy'],['terms','Terms'],['delivery','Delivery'],['payments','Payments'],['contact','Contact']].map(([key,label])=><label className="field" key={key}>{label}<textarea rows={5} value={data.policies?.[key]||''} onChange={e=>change('policies',key,e.target.value)}/></label>)}</section>}
 {tab==='sections'&&<section className="panel"><h2>Homepage section order</h2>{(data.sections||[]).map((section:string,i:number)=><div className="em-section" key={`${section}-${i}`}><strong>{section.replaceAll('_',' ')}</strong><button disabled={i===0} onClick={()=>setData((v:any)=>{const a=[...v.sections];[a[i-1],a[i]]=[a[i],a[i-1]];return {...v,sections:a};})}>↑</button><button disabled={i===data.sections.length-1} onClick={()=>setData((v:any)=>{const a=[...v.sections];[a[i+1],a[i]]=[a[i],a[i+1]];return {...v,sections:a};})}>↓</button></div>)}</section>}
 <div className="em-footer-actions"><button className="btn" disabled={busy||!!uploading} onClick={publish}>{busy?'Publishing…':'Publish Homepage'}</button><a href="https://emxin-dev.duckdns.org" target="_blank" rel="noopener noreferrer">Open storefront ↗</a></div>
 <section className="panel em-history"><div className="em-history-heading"><h2>Version history</h2><button className="btn gray" onClick={loadVersions}>Refresh versions</button></div>{versions.map(v=><div className="em-section" key={v._id}><span>{new Date(v.created_at).toLocaleString()} · {v.action}</span><button onClick={()=>restore(v._id)}>Restore</button></div>)}</section></div></Shell>;
}
