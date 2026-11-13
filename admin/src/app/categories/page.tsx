'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Toggle,Confirm,ImageInput,Status} from '@/components/ui';
import {api,put,del,postJSON,mediaFolder} from '@/lib/api';
const BLANK={name:'',name_bn:'',slug:'',subtitle:'',order:0,visible:true,show_on_home:true,thumbnail_url:'',icon:'',code:''};
export default function Categories(){
  const[rows,setRows]=useState<any[]|null>(null);const[f,setF]=useState<any>(null);const[orig,setOrig]=useState('');const[busy,setBusy]=useState(false);
  const load=()=>api('/admin/categories').then(setRows).catch(e=>toast.err(e.message));useEffect(()=>{load()},[]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);try{const b={...BLANK,...f,order:Number(f.order)||0};['_id','product_count','updated_at'].forEach(k=>delete b[k]);if(orig)await put(`/admin/categories/${orig}`,b);else await postJSON('/admin/categories',b);toast.ok('Category saved');setF(null);load()}catch(x:any){toast.err(x.message)}finally{setBusy(false)}}
  async function move(c:any,d:number){const list=[...(rows||[])];const i=list.indexOf(c),j=i+d;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];try{await Promise.all(list.map((x,k)=>x.order!==k+1?put(`/admin/categories/${x.slug}`,{...BLANK,...x,order:k+1,product_count:undefined,_id:undefined}):null));load()}catch(e:any){toast.err(e.message)}}
  return <Shell><PageHead title="Categories" sub="Controls the header mega-menu, homepage “Shop by Category” tiles, footer links and shop filters."><button className="btn" onClick={()=>{setOrig('');setF({...BLANK,order:(rows?.length||0)+1})}}><Icon name="plus" size={18}/>Add category</button></PageHead>
    <div className="card flush">{!rows?<Loading/>:rows.length?<table className="tbl"><thead><tr><th>Order</th><th>Category</th><th>Subtitle</th><th>Products</th><th>Visibility</th><th className="r">Actions</th></tr></thead><tbody>{rows.map((c,i)=><tr key={c.slug}>
      <td className="nowrap"><button className="ib" disabled={i===0} onClick={()=>move(c,-1)}><Icon name="chevronLeft" size={15} className="rot90"/></button><button className="ib" disabled={i===rows.length-1} onClick={()=>move(c,1)}><Icon name="chevronRight" size={15} className="rot90"/></button></td>
      <td><div className="prod-cell">{c.thumbnail_url?<img src={c.thumbnail_url} alt=""/>:<span className="noimg"><Icon name="categories" size={18}/></span>}<div><b>{c.name}</b><small className="muted">/{c.slug}{c.code&&<> · <b className="mono">{c.code}</b></>}</small></div></div></td><td>{c.subtitle||'—'}</td><td>{c.product_count}</td>
      <td><Status s={c.visible?'Active':'Hidden'}/>{c.show_on_home!==false&&c.visible&&<small className="muted"> · on homepage</small>}</td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>{setOrig(c.slug);setF(c)}}><Icon name="edit" size={15}/>Edit</button><Confirm cls="ib danger" text={`Delete ${c.name}?`} onYes={async()=>{try{await del(`/admin/categories/${c.slug}`);toast.ok('Deleted');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm></td></tr>)}</tbody></table>:<Empty text="No categories yet."/>}</div>
    <Drawer open={!!f} title={orig?'Edit category':'Add category'} onClose={()=>setF(null)}>{f&&<form onSubmit={save} className="stack">
      <Field label="Name *"><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field>
      <Field label="Subtitle" hint="e.g. AI & Camera Enabled"><input value={f.subtitle} onChange={e=>setF({...f,subtitle:e.target.value})}/></Field>
      <Field label="Slug" hint="Changing it updates all products in this category"><input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></Field>
      <Field label="Category code" hint="2–5 letters used in SKUs and stock codes, e.g. SMG (Smart Glasses), SEG (Smart Eye Glasses), SSG (Smart Sun Glasses). Empty = made from the name."><input value={f.code||''} maxLength={5} onChange={e=>setF({...f,code:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')})} placeholder="SMG"/></Field>
      <ImageInput label="Tile image (transparent PNG works best)" folder={mediaFolder('category',f.slug||f.name)} value={f.thumbnail_url} onChange={u=>setF({...f,thumbnail_url:u})}/>
      <Field label="Image style" hint="Cut-out: product floats on the tile (use a PNG with transparent background). Photo: the picture fills the top of the tile (use for normal photos). Auto picks Cut-out for PNG files, Photo for JPG/WebP."><select value={f.image_fit||''} onChange={e=>setF({...f,image_fit:e.target.value})}><option value="">Auto</option><option value="contain">Cut-out (transparent PNG)</option><option value="cover">Photo (fill the tile)</option></select></Field>
      <Toggle checked={f.visible} onChange={v=>setF({...f,visible:v})} label="Visible on storefront"/><Toggle checked={f.show_on_home!==false} onChange={v=>setF({...f,show_on_home:v})} label="Show on homepage tiles"/>
      <button className="btn" disabled={busy}>{busy?'Saving…':'Save category'}</button></form>}</Drawer></Shell>;
}
