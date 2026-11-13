'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Toggle,Confirm,ImageInput,Status} from '@/components/ui';
import {api,put,del,postJSON,mediaFolder} from '@/lib/api';
const BLANK={name:'',slug:'',order:0,visible:true,logo_url:''};
export default function Brands(){
  const[rows,setRows]=useState<any[]|null>(null);const[f,setF]=useState<any>(null);const[orig,setOrig]=useState('');
  const load=()=>api('/admin/brands').then(setRows).catch(e=>toast.err(e.message));useEffect(()=>{load()},[]);
  async function save(e:React.FormEvent){e.preventDefault();try{const b={...BLANK,...f,order:Number(f.order)||0};['_id','product_count','updated_at'].forEach(k=>delete b[k]);if(orig)await put(`/admin/brands/${orig}`,b);else await postJSON('/admin/brands',b);toast.ok('Brand saved');setF(null);load()}catch(x:any){toast.err(x.message)}}
  return <Shell><PageHead title="Brands" sub="Brands appear on product pages and as shop filters."><button className="btn" onClick={()=>{setOrig('');setF({...BLANK,order:(rows?.length||0)+1})}}><Icon name="plus" size={18}/>Add brand</button></PageHead>
    <div className="card flush">{!rows?<Loading/>:rows.length?<table className="tbl"><thead><tr><th>Brand</th><th>Order</th><th>Products</th><th>Visibility</th><th className="r">Actions</th></tr></thead><tbody>{rows.map(b=><tr key={b.slug}><td><div className="prod-cell">{b.logo_url?<img src={b.logo_url} alt=""/>:<span className="noimg"><Icon name="brands" size={18}/></span>}<div><b>{b.name}</b><small className="muted">/{b.slug}</small></div></div></td><td>{b.order}</td><td>{b.product_count}</td><td><Status s={b.visible?'Active':'Hidden'}/></td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>{setOrig(b.slug);setF(b)}}><Icon name="edit" size={15}/>Edit</button><Confirm cls="ib danger" text={`Delete ${b.name}?`} onYes={async()=>{try{await del(`/admin/brands/${b.slug}`);toast.ok('Deleted');load()}catch(e:any){toast.err(e.message)}}}><Icon name="trash" size={16}/></Confirm></td></tr>)}</tbody></table>:<Empty text="No brands yet."/>}</div>
    <Drawer open={!!f} title={orig?'Edit brand':'Add brand'} onClose={()=>setF(null)}>{f&&<form onSubmit={save} className="stack">
      <Field label="Name *"><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field><Field label="Slug"><input value={f.slug} onChange={e=>setF({...f,slug:e.target.value})}/></Field><Field label="Sort order"><input type="number" value={f.order} onChange={e=>setF({...f,order:e.target.value})}/></Field>
      <ImageInput label="Logo" folder={mediaFolder('brand',f.slug||f.name)} value={f.logo_url} onChange={u=>setF({...f,logo_url:u})}/><Toggle checked={f.visible} onChange={v=>setF({...f,visible:v})} label="Visible"/><button className="btn">Save brand</button></form>}</Drawer></Shell>;
}
