'use client';
import {useEffect,useMemo,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Status,Drawer,Empty,Loading,toast,Field,Toggle,Confirm,Tabs} from '@/components/ui';
import {api,put,del,postJSON,tk,downloadCSV} from '@/lib/api';
import {DropZone,MediaPicker} from '@/components/Media';

const BLANK:any={name:'',name_bn:'',slug:'',subtitle:'',category_slug:'',brand_slug:'',model:'',sku:'',compare_note:'',price:0,sale_price:null,stock:0,low_stock_threshold:5,weight_kg:.3,
  colors:['Black'],color_hex:{Black:'#111111'},features:[],highlights:[],features_bn:[],specifications:[],box_contents:[],faq:[],description:'',description_bn:'',images:[],video_url:'',media:[],promo_image_url:'',
  status:'draft',featured:false,new_collection:false,badge:'',has_camera:false,sort_order:0};
const lines=(a:string[])=>(a||[]).join('\n');const toLines=(s:string)=>s.split('\n').map(x=>x.trim()).filter(Boolean);

function ProductForm({initial,cats,brands,onSaved}:{initial:any;cats:any[];brands:any[];onSaved:()=>void}){
  const[f,setF]=useState<any>(()=>{const media=initial.media?.length?initial.media:[...(initial.images||[]).map((url:string)=>({url,type:'image'})),...(initial.video_url?[{url:initial.video_url,type:'video'}]:[])];return {...BLANK,...initial,media}});
  const[tab,setTab]=useState('basic');const[busy,setBusy]=useState(false);const[pick,setPick]=useState(false);
  const set=(k:string,v:any)=>setF((o:any)=>({...o,[k]:v}));
  const setMedia=(m:any[])=>setF((o:any)=>({...o,media:m,images:m.filter(x=>x.type==='image').map(x=>x.url),video_url:m.find(x=>x.type==='video')?.url||''}));
  const addMedia=(items:any[])=>{setF((o:any)=>{const seen=new Set(o.media.map((m:any)=>m.url));const m=[...o.media,...items.filter(x=>!seen.has(x.url))];return {...o,media:m,images:m.filter((x:any)=>x.type==='image').map((x:any)=>x.url),video_url:m.find((x:any)=>x.type==='video')?.url||''}});toast.ok(`${items.length} file(s) added — save the product to publish`)};
  function move(i:number,d:number){const m=[...f.media];const j=i+d;if(j<0||j>=m.length)return;[m[i],m[j]]=[m[j],m[i]];setMedia(m)}
  async function save(e?:React.FormEvent){e?.preventDefault();setBusy(true);try{
    const body={...f,price:Number(f.price),sale_price:f.sale_price?Number(f.sale_price):null,stock:Number(f.stock),weight_kg:Number(f.weight_kg)||.3,sort_order:Number(f.sort_order)||0,low_stock_threshold:Number(f.low_stock_threshold)||0,faq:(f.faq||[]).filter((x:any)=>x.question&&x.answer)};
    ['_id','created_at','updated_at','reserved','sold_count','rating','review_count','brand_name','category_name'].forEach(k=>delete body[k]);
    if(body.sale_price&&body.sale_price>=body.price)throw new Error('Sale price must be lower than the regular price');
    if(initial._id)await put(`/admin/products/${initial._id}`,body);else await postJSON('/admin/products',body);
    toast.ok('Product saved');onSaved()}catch(e:any){toast.err(e.message)}finally{setBusy(false)}}
  const off=f.sale_price&&Number(f.price)>Number(f.sale_price)?Math.round((1-f.sale_price/f.price)*100):0;
  return <form onSubmit={save} className="pform">
    <Tabs value={tab} onChange={setTab} tabs={[{key:'basic',label:'Basics'},{key:'media',label:`Media (${f.media.length})`},{key:'content',label:'Content'},{key:'display',label:'Display & Variants'}]}/>
    {tab==='basic'&&<div className="fgrid">
      <Field label="Product name *"><input required value={f.name} onChange={e=>set('name',e.target.value)}/></Field>
      <Field label="Subtitle" hint="Shown under the name on cards, e.g. AI Smart Glasses (With Camera)"><input value={f.subtitle} onChange={e=>set('subtitle',e.target.value)}/></Field>
      <Field label="Category *"><select required value={f.category_slug} onChange={e=>set('category_slug',e.target.value)}><option value="">Select…</option>{cats.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
      <Field label="Brand *"><select required value={f.brand_slug} onChange={e=>set('brand_slug',e.target.value)}><option value="">Select…</option>{brands.map(b=><option key={b.slug} value={b.slug}>{b.name}</option>)}</select></Field>
      <Field label="Model"><input value={f.model} onChange={e=>set('model',e.target.value)}/></Field>
      <Field label="SKU"><input value={f.sku} onChange={e=>set('sku',e.target.value)}/></Field>
      <Field label="Regular price (৳) *"><input required type="number" min="1" value={f.price} onChange={e=>set('price',e.target.value)}/></Field>
      <Field label="Sale price (৳)" hint={off?`Shows ${off}% OFF badge`:'Leave empty for no discount'}><input type="number" min="0" value={f.sale_price??''} onChange={e=>set('sale_price',e.target.value?Number(e.target.value):null)}/></Field>
      <Field label="Stock (pcs) *"><input required type="number" min="0" value={f.stock} onChange={e=>set('stock',e.target.value)}/></Field>
      <Field label="Low-stock alert at"><input type="number" min="0" value={f.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/></Field>
      <Field label="Weight (kg)" hint="Used for estimated shipping on 6+ pcs"><input type="number" step="0.01" min="0.01" value={f.weight_kg} onChange={e=>set('weight_kg',e.target.value)}/></Field>
      <Field label="URL slug" hint="Auto-generated from the name when empty"><input value={f.slug} onChange={e=>set('slug',e.target.value)} placeholder="aimb-g2-pro"/></Field>
      <Field label="Stock bar code / label" hint="Right side of the green stock bar, e.g. EMXIN-001"><input value={f.compare_note} onChange={e=>set('compare_note',e.target.value)}/></Field>
      <Field label="বাংলা নাম"><input value={f.name_bn} onChange={e=>set('name_bn',e.target.value)}/></Field>
    </div>}
    {tab==='media'&&<div>
      <DropZone folder="product" onUploaded={addMedia}/>
      <div className="row" style={{marginTop:10}}><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setPick(true)}><Icon name="cms" size={15}/>Choose from Media Library</button><span className="muted tiny">Drag thumbnails' arrows to reorder · first image is the cover</span></div>
      <MediaPicker open={pick} onClose={()=>setPick(false)} onPick={addMedia}/>
      <div className="media-grid">{f.media.map((m:any,i:number)=><div key={m.url+i} className="media-it">{m.type==='video'?<video src={m.url} muted/>:<img src={m.url} alt=""/>}{i===0&&<span className="cover">Cover</span>}<div className="media-ops"><button type="button" onClick={()=>move(i,-1)} aria-label="Move left"><Icon name="chevronLeft" size={15}/></button><button type="button" onClick={()=>move(i,1)} aria-label="Move right"><Icon name="chevronRight" size={15}/></button><button type="button" onClick={()=>setMedia(f.media.filter((_:any,j:number)=>j!==i))} aria-label="Remove"><Icon name="trash" size={15}/></button></div></div>)}</div>
      <Field label="Add media by URL"><div className="row"><input id="mu" placeholder="https://d123.cloudfront.net/…"/><button type="button" className="btn btn-soft btn-sm" onClick={()=>{const el=document.getElementById('mu') as HTMLInputElement;const u=el.value.trim();if(!/^https:\/\//.test(u))return toast.err('Use an https URL');setMedia([...f.media,{url:u,type:/\.(mp4|webm|mov)(\?|$)/i.test(u)?'video':'image'}]);el.value=''}}>Add</button></div></Field>
      <Field label="Overview banner image URL" hint="Right side of Product Details tab. Empty = default “See More. Do More.” banner"><input value={f.promo_image_url} onChange={e=>set('promo_image_url',e.target.value)}/></Field>
    </div>}
    {tab==='content'&&<div className="fgrid">
      <Field label="Description" span><textarea rows={5} value={f.description} onChange={e=>set('description',e.target.value)}/></Field>
      <Field label="Key features (one per line, first 5 become icon cards)" hint="Icons are picked automatically: camera, AI, Wi-Fi, voice, battery, bluetooth, UV…"><textarea rows={6} value={lines(f.features)} onChange={e=>set('features',toLines(e.target.value))}/></Field>
      <Field label="Overview checklist (one per line)" hint="Blue tick list under Product Overview. Empty = uses features"><textarea rows={6} value={lines(f.highlights)} onChange={e=>set('highlights',toLines(e.target.value))}/></Field>
      <Field label="Specifications (Label: Value, one per line)"><textarea rows={6} value={lines(f.specifications)} onChange={e=>set('specifications',toLines(e.target.value))} placeholder={'Camera: 8MP\nBattery: 8 hours'}/></Field>
      <Field label="What's in the box (one per line)"><textarea rows={6} value={lines(f.box_contents)} onChange={e=>set('box_contents',toLines(e.target.value))}/></Field>
      <Field label="FAQ" span><div className="faq-ed">{(f.faq||[]).map((x:any,i:number)=><div key={i} className="row"><input placeholder="Question" value={x.question} onChange={e=>set('faq',f.faq.map((y:any,j:number)=>j===i?{...y,question:e.target.value}:y))}/><input placeholder="Answer" value={x.answer} onChange={e=>set('faq',f.faq.map((y:any,j:number)=>j===i?{...y,answer:e.target.value}:y))}/><button type="button" className="ib" onClick={()=>set('faq',f.faq.filter((_:any,j:number)=>j!==i))}><Icon name="trash" size={16}/></button></div>)}<button type="button" className="btn btn-sm btn-soft" onClick={()=>set('faq',[...(f.faq||[]),{question:'',answer:''}])}><Icon name="plus" size={15}/>Add FAQ</button></div></Field>
      <Field label="বাংলা বিবরণ" span><textarea rows={3} value={f.description_bn} onChange={e=>set('description_bn',e.target.value)}/></Field>
    </div>}
    {tab==='display'&&<div className="fgrid">
      <Field label="Status"><select value={f.status} onChange={e=>set('status',e.target.value)}><option value="active">Active (visible)</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></Field>
      <Field label="Card badge"><select value={f.badge} onChange={e=>set('badge',e.target.value)}>{['','Featured','New','Hot','Sale','Limited'].map(b=><option key={b} value={b}>{b||'None'}</option>)}</select></Field>
      <Field label="Sort order" hint="Lower numbers appear first on homepage & shop"><input type="number" value={f.sort_order} onChange={e=>set('sort_order',e.target.value)}/></Field>
      <div className="fld"><span>Placement</span><Toggle checked={f.featured} onChange={v=>set('featured',v)} label="Featured on homepage"/><Toggle checked={f.new_collection} onChange={v=>set('new_collection',v)} label="New Collection"/><Toggle checked={f.has_camera} onChange={v=>set('has_camera',v)} label="Has camera (shop filter)"/></div>
      <Field label="Frame colours" span hint="Each colour appears as a swatch and in the Quantity Request drawer"><div className="colors-ed">{f.colors.map((c:string,i:number)=><div key={i} className="row"><input type="color" value={f.color_hex?.[c]||'#111111'} onChange={e=>set('color_hex',{...f.color_hex,[c]:e.target.value})}/><input value={c} onChange={e=>{const n=e.target.value;const hex={...f.color_hex};hex[n]=hex[c];delete hex[c];set('colors',f.colors.map((x:string,j:number)=>j===i?n:x));set('color_hex',hex)}}/>{f.colors.length>1&&<button type="button" className="ib" onClick={()=>set('colors',f.colors.filter((_:any,j:number)=>j!==i))}><Icon name="trash" size={16}/></button>}</div>)}<button type="button" className="btn btn-sm btn-soft" onClick={()=>set('colors',[...f.colors,'White'])}><Icon name="plus" size={15}/>Add colour</button></div></Field>
    </div>}
    <div className="pform-foot"><button className="btn" disabled={busy}>{busy?'Saving…':initial._id?'Save changes':'Create product'}</button>{initial._id&&f.status==='active'&&<a className="btn btn-ghost" target="_blank" rel="noopener" href={`${process.env.NEXT_PUBLIC_STORE_URL||'https://emxin-dev.duckdns.org'}/product/${f.slug}`}><Icon name="eyeView" size={16}/>View on store</a>}</div>
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
      <button className="btn" onClick={()=>setEdit({...BLANK})}><Icon name="plus" size={18}/>Add product</button></PageHead>
    <div className="filters"><div className="search-in"><Icon name="search" size={17}/><input placeholder="Search name, SKU, model" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select value={cat} onChange={e=>setCat(e.target.value)}><option value="">All categories</option>{cats.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select>
      <select value={st} onChange={e=>setSt(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="low">Low stock</option></select></div>
    <div className="card flush">{!rows?<Loading/>:list.length?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Sold</th><th>Rating</th><th>Status</th><th className="r">Actions</th></tr></thead><tbody>{list.map(p=>{const img=p.images?.[0]||p.media?.find((m:any)=>m.type==='image')?.url;return <tr key={p._id}>
      <td><div className="prod-cell">{img?<img src={img} alt=""/>:<span className="noimg"><Icon name="products" size={18}/></span>}<div><b>{p.name}</b><small className="muted">{p.sku||p.slug}{p.badge&&<> · <span className="st st-purple">{p.badge}</span></>}{p.featured&&<> · Featured</>}{p.new_collection&&<> · New</>}</small></div></div></td>
      <td>{cats.find(c=>c.slug===p.category_slug)?.name||p.category_slug}</td><td><b>{tk(p.sale_price||p.price)}</b>{p.sale_price&&<><br/><del className="muted">{tk(p.price)}</del></>}</td>
      <td><button className={'stock-chip'+(p.stock<=0?' out':p.stock<=(p.low_stock_threshold??5)?' low':'')} onClick={()=>stock(p)} title="Adjust stock">{p.stock}</button>{p.reserved>0&&<small className="muted"> ({p.reserved} reserved)</small>}</td>
      <td>{p.sold_count||0}</td><td>{p.review_count?`${p.rating}★ (${p.review_count})`:'—'}</td><td><Status s={p.status}/></td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>setEdit(p)}><Icon name="edit" size={15}/>Edit</button> <button className="ib" title="Duplicate" onClick={async()=>{try{await postJSON(`/admin/products/${p._id}/duplicate`,{});toast.ok('Duplicated as draft');load()}catch(e:any){toast.err(e.message)}}}><Icon name="copy" size={16}/></button><Confirm cls="ib danger" text={`Delete ${p.name}? Products with orders are hidden instead.`} onYes={async()=>{try{const r=await del(`/admin/products/${p._id}`);toast.ok(r.message||'Deleted');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm></td></tr>})}</tbody></table></div>:<Empty text="No products yet. Add your first product." icon="products"/>}</div>
    <Drawer open={!!edit} width={760} title={edit?._id?`Edit · ${edit.name}`:'Add product'} onClose={()=>{setEdit(null);history.replaceState(null,'','/products')}}>{edit&&<ProductForm key={edit._id||'new'} initial={edit} cats={cats} brands={brands} onSaved={()=>{setEdit(null);load()}}/>}</Drawer>
  </Shell>;
}
