'use client';
import {useEffect,useMemo,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Status,Drawer,Empty,Loading,toast,Field,Toggle,Confirm,Tabs} from '@/components/ui';
import {parseSpecs} from '@/lib/productText';
import {api,put,del,postJSON,tk,downloadCSV,mediaFolder} from '@/lib/api';
import {DropZone,MediaPicker} from '@/components/Media';

const BLANK:any={name:'',name_bn:'',slug:'',subtitle:'',category_slug:'',brand_slug:'',model:'',sku:'',compare_note:'',price:0,sale_price:null,stock:0,low_stock_threshold:5,weight_kg:.3,
  colors:['Black'],color_hex:{Black:'#111111'},features:[],highlights:[],features_bn:[],specifications:[],box_contents:[],faq:[],description:'',description_bn:'',images:[],video_url:'',media:[],promo_image_url:'',
  status:'draft',featured:false,new_collection:false,badge:'',has_camera:false,sort_order:0};
const lines=(a:string[])=>(a||[]).join('\n');const toLines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

/** Specifications as a Label / Value table. Saved as "Label: Value" lines, so the website shows a clean two-column table. */
function SpecEditor({value,onChange}:{value:string[];onChange:(v:string[])=>void}){
  const[rows,setRows]=useState<{label:string;value:string}[]>(()=>{const r=parseSpecs(value);return r.length?r:[{label:'',value:''}]});
  const[paste,setPaste]=useState('');const[showPaste,setShowPaste]=useState(false);
  const commit=(r:{label:string;value:string}[])=>{setRows(r);onChange(r.filter(x=>x.value.trim()).map(x=>x.label.trim()?`${x.label.trim()}: ${x.value.trim()}`:x.value.trim()))};
  const upd=(i:number,k:'label'|'value',v:string)=>commit(rows.map((x,j)=>j===i?{...x,[k]:v}:x));
  const mv=(i:number,d:number)=>{const r=[...rows];const j=i+d;if(j<0||j>=r.length)return;[r[i],r[j]]=[r[j],r[i]];commit(r)};
  return <div className="spec-ed">
    <div className="spec-row spec-head"><span>Label</span><span>Value</span><span/></div>
    {rows.map((x,i)=><div className="spec-row" key={i}>
      <input placeholder="e.g. Camera" value={x.label} onChange={e=>upd(i,'label',e.target.value)}/>
      <input placeholder="e.g. 8MP, 1080p video" value={x.value} onChange={e=>upd(i,'value',e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(i===rows.length-1)commit([...rows,{label:'',value:''}])}}}/>
      <span className="row nowrap"><button type="button" className="ib" aria-label="Move up" onClick={()=>mv(i,-1)}>↑</button><button type="button" className="ib" aria-label="Move down" onClick={()=>mv(i,1)}>↓</button><button type="button" className="ib danger" aria-label="Remove row" onClick={()=>commit(rows.length>1?rows.filter((_,j)=>j!==i):[{label:'',value:''}])}><Icon name="trash" size={15}/></button></span>
    </div>)}
    <div className="row" style={{marginTop:8}}><button type="button" className="btn btn-sm btn-soft" onClick={()=>commit([...rows,{label:'',value:''}])}><Icon name="plus" size={15}/>Add row</button><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setShowPaste(v=>!v)}>Paste from Excel / Word</button></div>
    {showPaste&&<div className="spec-paste"><textarea rows={6} value={paste} onChange={e=>setPaste(e.target.value)} placeholder={'Paste a 2-column table or lines like:\nCamera: 8MP\nBattery Life\tUp to 8 hours'}/><button type="button" className="btn btn-sm" onClick={()=>{const add=parseSpecs(paste.split('\n'));if(!add.length)return toast.err('Nothing to add');commit([...rows.filter(x=>x.label||x.value),...add]);setPaste('');setShowPaste(false);toast.ok(`${add.length} row(s) added`)}}>Add these rows</button></div>}
  </div>;
}

function ProductForm({initial,cats,brands,onSaved}:{initial:any;cats:any[];brands:any[];onSaved:()=>void}){
  const[f,setF]=useState<any>(()=>{const media=initial.media?.length?initial.media:[...(initial.images||[]).map((url:string)=>({url,type:'image'})),...(initial.video_url?[{url:initial.video_url,type:'video'}]:[])];return {...BLANK,...initial,media}});
  const[tab,setTab]=useState('basic');const[busy,setBusy]=useState(false);const[pick,setPick]=useState(false);
  const[pid,setPid]=useState<string>(initial._id||''); // set after the first create, so later saves update the same product
  const set=(k:string,v:any)=>setF((o:any)=>({...o,[k]:v}));
  const setMedia=(m:any[])=>setF((o:any)=>({...o,media:m,images:m.filter(x=>x.type==='image').map(x=>x.url),video_url:m.find(x=>x.type==='video')?.url||''}));
  const addMedia=(items:any[])=>{setF((o:any)=>{const seen=new Set(o.media.map((m:any)=>m.url));const m=[...o.media,...items.filter(x=>!seen.has(x.url))];return {...o,media:m,images:m.filter((x:any)=>x.type==='image').map((x:any)=>x.url),video_url:m.find((x:any)=>x.type==='video')?.url||''}});toast.ok(`${items.length} file(s) added — save the product to publish`)};
  function move(i:number,d:number){const m=[...f.media];const j=i+d;if(j<0||j>=m.length)return;[m[i],m[j]]=[m[j],m[i]];setMedia(m)}
  function moveTo(from:number,to:number){if(from===to||from<0)return;const m=[...f.media];const[x]=m.splice(from,1);m.splice(to,0,x);setMedia(m)}
  const[drag,setDrag]=useState(-1);const[over,setOver]=useState(-1);
  const coverIdx=f.media.findIndex((m:any)=>m.type==='image');
  async function save(e?:React.FormEvent){e?.preventDefault();setBusy(true);try{
    const body={...f,price:Number(f.price),sale_price:f.sale_price?Number(f.sale_price):null,stock:Number(f.stock),weight_kg:Number(f.weight_kg)||.3,sort_order:Number(f.sort_order)||0,low_stock_threshold:Number(f.low_stock_threshold)||0,faq:(f.faq||[]).filter((x:any)=>x.question&&x.answer)};
    ['_id','created_at','updated_at','reserved','sold_count','rating','review_count','brand_name','category_name'].forEach(k=>delete body[k]);
    if(body.sale_price&&body.sale_price>=body.price)throw new Error('Sale price must be lower than the regular price');
    if(pid)await put(`/admin/products/${pid}`,body);
    else{const r=await postJSON('/admin/products',body);setPid(r.id);if(r.slug)set('slug',r.slug)}
    toast.ok(pid?'Changes saved':'Product created — you can keep editing');onSaved()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  const off=f.sale_price&&Number(f.price)>Number(f.sale_price)?Math.round((1-f.sale_price/f.price)*100):0;
  return <form onSubmit={save} className="pform">
    <Tabs value={tab} onChange={setTab} tabs={[{key:'basic',label:'Basics'},{key:'media',label:`Media (${f.media.length})`},{key:'content',label:'Content'},{key:'display',label:'Display & Variants'}]}/>
    {tab==='basic'&&<div className="fgrid">
      <Field label="Product name *"><input required value={f.name} onChange={e=>set('name',e.target.value)}/></Field>
      <Field label="Subtitle" hint="Shown under the name on cards, e.g. AI Smart Glasses (With Camera)"><input value={f.subtitle} onChange={e=>set('subtitle',e.target.value)}/></Field>
      <Field label="Category *"><select required value={f.category_slug} onChange={e=>set('category_slug',e.target.value)}><option value="">Select…</option>{cats.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
      <Field label="Brand *"><select required value={f.brand_slug} onChange={e=>set('brand_slug',e.target.value)}><option value="">Select…</option>{brands.map(b=><option key={b.slug} value={b.slug}>{b.name}</option>)}</select></Field>
      <Field label="Model"><input value={f.model} onChange={e=>set('model',e.target.value)}/></Field>
      <Field label="SKU" hint="Auto-numbered for new products (e.g. EMXIN-0002). You can change it."><input value={f.sku} onChange={e=>set('sku',e.target.value)}/></Field>
      <Field label="Regular price (৳) *"><input required type="number" min="1" value={f.price} onChange={e=>set('price',e.target.value)}/></Field>
      <Field label="Sale price (৳)" hint={off?`Shows ${off}% OFF badge`:'Leave empty for no discount'}><input type="number" min="0" value={f.sale_price??''} onChange={e=>set('sale_price',e.target.value?Number(e.target.value):null)}/></Field>
      <Field label="Stock (pcs) *"><input required type="number" min="0" value={f.stock} onChange={e=>set('stock',e.target.value)}/></Field>
      <Field label="Low-stock alert at"><input type="number" min="0" value={f.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/></Field>
      <Field label="Weight (kg)" hint="Used for estimated shipping on 6+ pcs"><input type="number" step="0.01" min="0.01" value={f.weight_kg} onChange={e=>set('weight_kg',e.target.value)}/></Field>
      <Field label="URL slug" hint="Only used in the web address (…/product/aimb-g2-pro). It is not shown on the page. Auto-made from the name when empty."><input value={f.slug} onChange={e=>set('slug',e.target.value)} placeholder="aimb-g2-pro"/></Field>
      <Field label="Stock bar code / label" hint="Right side of the green stock bar. New products get the next number automatically (EMXIN-SMG-00001 → 00002). You can change it."><input value={f.compare_note} onChange={e=>set('compare_note',e.target.value)}/></Field>
    </div>}
    {tab==='media'&&<div>
      <DropZone folder={mediaFolder('product',f.slug||f.name)} onUploaded={addMedia}/>
      <div className="row" style={{marginTop:10}}><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setPick(true)}><Icon name="cms" size={15}/>Choose from Media Library</button><span className="muted tiny">Drag pictures to change the order · click ★ to make a picture the cover</span></div>
      <MediaPicker open={pick} onClose={()=>setPick(false)} onPick={addMedia}/>
      <div className="media-grid">{f.media.map((m:any,i:number)=><div key={m.url+i} className={'media-it'+(drag===i?' dragging':'')+(over===i&&drag!==i?' over':'')} draggable onDragStart={e=>{setDrag(i);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>{e.preventDefault();setOver(i)}} onDragLeave={()=>setOver(-1)} onDrop={e=>{e.preventDefault();moveTo(drag,i);setDrag(-1);setOver(-1)}} onDragEnd={()=>{setDrag(-1);setOver(-1)}}>{m.type==='video'?<video src={m.url} muted/>:<img src={m.url} alt="" draggable={false}/>}<span className="media-no">{i+1}</span>{i===coverIdx?<span className="cover">★ Cover</span>:m.type==='video'?<span className="cover vid">Video</span>:null}<div className="media-ops">{m.type==='image'&&i!==coverIdx&&<button type="button" onClick={()=>moveTo(i,0)} aria-label="Make cover" title="Make cover">★</button>}<button type="button" onClick={()=>move(i,-1)} aria-label="Move left"><Icon name="chevronLeft" size={15}/></button><button type="button" onClick={()=>move(i,1)} aria-label="Move right"><Icon name="chevronRight" size={15}/></button><button type="button" onClick={()=>setMedia(f.media.filter((_:any,j:number)=>j!==i))} aria-label="Remove"><Icon name="trash" size={15}/></button></div></div>)}</div>
      <Field label="Add media by URL"><div className="row"><input id="mu" placeholder="https://d123.cloudfront.net/…"/><button type="button" className="btn btn-soft btn-sm" onClick={()=>{const el=document.getElementById('mu') as HTMLInputElement;const u=el.value.trim();if(!/^https:\/\//.test(u))return toast.err('Use an https URL');setMedia([...f.media,{url:u,type:/\.(mp4|webm|mov)(\?|$)/i.test(u)?'video':'image'}]);el.value=''}}>Add</button></div></Field>
      <Field label="Overview banner image URL" hint="Right side of Product Details tab. Empty = default “See More. Do More.” banner"><input value={f.promo_image_url} onChange={e=>set('promo_image_url',e.target.value)}/></Field>
    </div>}
    {tab==='content'&&<div className="fgrid">
      <Field label="Description" span><textarea rows={5} value={f.description} onChange={e=>set('description',e.target.value)}/></Field>
      <Field label="Key features (one per line, first 5 become icon cards)" hint="Write “Short title: details”, e.g. “8MP Camera: Sharp photos and 1080p anti-shake video”. The card shows the title; customers tap/hover it to see the details. Icons are picked automatically."><textarea rows={6} value={lines(f.features)} onChange={e=>set('features',toLines(e.target.value))}/></Field>
      <Field label="Overview checklist (one per line)" hint="Blue tick list under Product Overview. Empty = uses features"><textarea rows={6} value={lines(f.highlights)} onChange={e=>set('highlights',toLines(e.target.value))}/></Field>
      <Field label="Specifications" span hint="Each row becomes one line of the Specifications table on the website. Don't add a header row like “Feature / Item Detail”."><SpecEditor value={f.specifications||[]} onChange={v=>set('specifications',v)}/></Field>
      <Field label="What's in the box (one per line)"><textarea rows={6} value={lines(f.box_contents)} onChange={e=>set('box_contents',toLines(e.target.value))}/></Field>
      <Field label="FAQ" span><div className="faq-ed">{(f.faq||[]).map((x:any,i:number)=><div key={i} className="row"><input placeholder="Question" value={x.question} onChange={e=>set('faq',f.faq.map((y:any,j:number)=>j===i?{...y,question:e.target.value}:y))}/><input placeholder="Answer" value={x.answer} onChange={e=>set('faq',f.faq.map((y:any,j:number)=>j===i?{...y,answer:e.target.value}:y))}/><button type="button" className="ib" onClick={()=>set('faq',f.faq.filter((_:any,j:number)=>j!==i))}><Icon name="trash" size={16}/></button></div>)}<button type="button" className="btn btn-sm btn-soft" onClick={()=>set('faq',[...(f.faq||[]),{question:'',answer:''}])}><Icon name="plus" size={15}/>Add FAQ</button></div></Field>
    </div>}
    {tab==='display'&&<div className="fgrid">
      <Field label="Status"><select value={f.status} onChange={e=>set('status',e.target.value)}><option value="active">Active (visible)</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></Field>
      <Field label="Card badge"><select value={f.badge} onChange={e=>set('badge',e.target.value)}>{['','Featured','New','Hot','Sale','Limited'].map(b=><option key={b} value={b}>{b||'None'}</option>)}</select></Field>
      <Field label="Card picture style" hint="Fill = photo covers the whole top of the product card (best for normal photos). Cut-out = whole product shown on a light background (best for transparent PNGs)."><select value={f.image_fit||''} onChange={e=>set('image_fit',e.target.value)}><option value="">Fill (default)</option><option value="contain">Cut-out (transparent PNG)</option></select></Field>
      <Field label="Sort order" hint="Position in lists: 1 shows first, 2 second, and so on. Products with the same number are ordered newest first. Leave 0 if you don't care."><input type="number" value={f.sort_order} onChange={e=>set('sort_order',e.target.value)}/></Field>
      <div className="fld"><span>Placement</span><Toggle checked={f.featured} onChange={v=>set('featured',v)} label="Featured on homepage"/><Toggle checked={f.new_collection} onChange={v=>set('new_collection',v)} label="New Collection"/><Toggle checked={f.has_camera} onChange={v=>set('has_camera',v)} label="Has camera (shop filter)"/></div>
      <Field label="Frame colours" span hint="Each colour appears as a swatch and in the Quantity Request drawer"><div className="colors-ed">{f.colors.map((c:string,i:number)=><div key={i} className="row"><input type="color" value={f.color_hex?.[c]||'#111111'} onChange={e=>set('color_hex',{...f.color_hex,[c]:e.target.value})}/><input value={c} onChange={e=>{const n=e.target.value;const hex={...f.color_hex};hex[n]=hex[c];delete hex[c];set('colors',f.colors.map((x:string,j:number)=>j===i?n:x));set('color_hex',hex)}}/>{f.colors.length>1&&<button type="button" className="ib" onClick={()=>set('colors',f.colors.filter((_:any,j:number)=>j!==i))}><Icon name="trash" size={16}/></button>}</div>)}<button type="button" className="btn btn-sm btn-soft" onClick={()=>set('colors',[...f.colors,'White'])}><Icon name="plus" size={15}/>Add colour</button></div></Field>
    </div>}
    <div className="pform-foot"><button type="submit" className="btn" disabled={busy}>{busy?'Saving…':pid?'Save changes':'Create product'}</button>{pid&&f.status==='active'&&<a className="btn btn-ghost" target="_blank" rel="noopener" href={`${process.env.NEXT_PUBLIC_STORE_URL||'https://emxin-dev.duckdns.org'}/product/${f.slug}`}><Icon name="eyeView" size={16}/>View on store</a>}</div>
  </form>;
}

export default function Products(){
  const[rows,setRows]=useState<any[]|null>(null);const[cats,setCats]=useState<any[]>([]);const[brands,setBrands]=useState<any[]>([]);
  const[edit,setEdit]=useState<any>(null);const[q,setQ]=useState('');const[cat,setCat]=useState('');const[st,setSt]=useState('');
  const load=()=>api('/admin/products').then(setRows).catch(e=>toast.err(e.message));
  useEffect(()=>{load();api('/admin/categories').then(setCats).catch(()=>{});api('/admin/brands').then(setBrands).catch(()=>{})},[]);
  useEffect(()=>{const id=new URLSearchParams(location.search).get('edit');if(id&&rows){const p=rows.find(x=>x._id===id);if(p)setEdit(p)}},[rows]);
  const list=useMemo(()=>(rows||[]).filter(p=>(!q||(p.name+p.sku+p.model).toLowerCase().includes(q.toLowerCase()))&&(!cat||p.category_slug===cat)&&(!st||(st==='low'?p.stock<=(p.low_stock_threshold??5):p.status===st))),[rows,q,cat,st]);
  async function stock(p:any){const v=prompt(`Adjust stock for ${p.name} (current ${p.stock}). Enter + or − amount, e.g. 10 or -2:`);if(!v)return;const delta=parseInt(v,10);if(!delta)return;const reason=prompt('Reason (e.g. new shipment, damaged):')||'';try{await put(`/admin/products/${p._id}/stock`,{delta,reason});toast.ok('Stock updated');load()}catch(e:any){toast.err(e.message)}}
  return <Shell>
    <PageHead title="Products" sub="Create, edit and publish products. Media uploads go to S3 and are served via CloudFront.">
      <button className="btn btn-ghost" onClick={()=>rows&&downloadCSV('emxin-products.csv',rows,[['Name','name'],['SKU','sku'],['Category','category_slug'],['Price','price'],['Sale','sale_price'],['Stock','stock'],['Reserved','reserved'],['Sold','sold_count'],['Status','status']])}><Icon name="download" size={17}/>Export</button>
      <button className="btn" onClick={async()=>{const c=await api('/admin/product-next-codes').catch(()=>({}));setEdit({...BLANK,sku:c.sku||'',compare_note:c.compare_note||''})}}><Icon name="plus" size={18}/>Add product</button></PageHead>
    <div className="filters"><div className="search-in"><Icon name="search" size={17}/><input placeholder="Search name, SKU, model" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select value={cat} onChange={e=>setCat(e.target.value)}><option value="">All categories</option>{cats.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
      <select value={st} onChange={e=>setSt(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="low">Low stock</option></select></div>
    <div className="card flush">{!rows?<Loading/>:list.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Sold</th><th>Rating</th><th>Status</th><th className="r">Actions</th></tr></thead><tbody>{list.map(p=>{const img=p.images?.[0]||p.media?.find((m:any)=>m.type==='image')?.url;return <tr key={p._id}>
      <td><div className="prod-cell">{img?<img src={img} alt=""/>:<span className="noimg"><Icon name="products" size={18}/></span>}<div><b>{p.name}</b><small className="muted">{p.sku||p.slug}{p.badge&&<> · <span className="st st-purple">{p.badge}</span></>}{p.featured&&<> · Featured</>}{p.new_collection&&<> · New</>}</small></div></div></td>
      <td>{cats.find(c=>c.slug===p.category_slug)?.name||p.category_slug}</td><td><b>{tk(p.sale_price||p.price)}</b>{p.sale_price&&<><br/><del className="muted">{tk(p.price)}</del></>}</td>
      <td><button className={'stock-chip'+(p.stock<=0?' out':p.stock<=(p.low_stock_threshold??5)?' low':'')} onClick={()=>stock(p)} title="Adjust stock">{p.stock}</button>{p.reserved>0&&<small className="muted"> ({p.reserved} reserved)</small>}</td>
      <td>{p.sold_count||0}</td><td>{p.review_count?`${p.rating}★ (${p.review_count})`:'—'}</td><td><Status s={p.status}/></td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>setEdit(p)}><Icon name="edit" size={15}/>Edit</button> <button className="ib" title="Duplicate" onClick={async()=>{try{await postJSON(`/admin/products/${p._id}/duplicate`,{});toast.ok('Duplicated as draft');load()}catch(e:any){toast.err(e.message)}}}><Icon name="copy" size={16}/></button><Confirm cls="ib danger" text={`Delete ${p.name}? Products with orders are hidden instead.`} onYes={async()=>{try{const r=await del(`/admin/products/${p._id}`);toast.ok(r.message||'Deleted');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm></td></tr>})}</tbody></table></div>:<Empty text="No products yet. Add your first product." icon="products"/>}</div>
    <Drawer open={!!edit} width={760} title={edit?._id?`Edit · ${edit.name}`:'Add product'} onClose={()=>{setEdit(null);history.replaceState(null,'','/products')}}>{edit&&<ProductForm key={edit._id||'new'} initial={edit} cats={cats} brands={brands} onSaved={load}/>}</Drawer>
  </Shell>;
}
