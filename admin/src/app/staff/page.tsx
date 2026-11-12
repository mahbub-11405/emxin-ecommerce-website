'use client';
import {useEffect,useState} from 'react';
import Shell,{ROLE_LABEL} from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Drawer,Empty,Loading,toast,Field,Status} from '@/components/ui';
import {api,put,postJSON,dt} from '@/lib/api';
const ROLES:[string,string][]=[
  ['admin','Everything except staff accounts and audit log: orders, products, CMS, settings, dealers, reports.'],
  ['sales','Orders (confirm, courier, payments), customers & CRM, quantity requests, dealers, sales reports.'],
  ['marketing','Homepage / banners / CMS, Media Library, coupons, SMS campaigns, reviews, customer lists, reports.'],
  ['inventory','Products, categories, brands, stock, Media Library; can view orders.'],
  ['support','Orders (view & update), customers, quantity requests, reviews & Q&A.'],
];
const genPw=()=>'Emx-'+Math.random().toString(36).slice(2,6)+'-'+Math.floor(1000+Math.random()*9000);
export default function Staff(){
  const[rows,setRows]=useState<any[]|null>(null);const[f,setF]=useState<any>(null);const[edit,setEdit]=useState<any>(null);const[shown,setShown]=useState<{email:string;pw:string}|null>(null);
  const load=()=>api('/admin/staff').then(setRows).catch(e=>{toast.err(e.message);setRows([])});useEffect(()=>{load()},[]);
  async function create(e:React.FormEvent){e.preventDefault();try{await postJSON('/admin/staff',f);setShown({email:f.email,pw:f.password});setF(null);toast.ok('Staff account created');load()}catch(x:any){toast.err(x.message)}}
  async function saveEdit(e:React.FormEvent){e.preventDefault();try{await put(`/admin/staff/${edit._id}`,{name:edit.name,phone:edit.phone,role:edit.role});toast.ok('Saved');setEdit(null);load()}catch(x:any){toast.err(x.message)}}
  async function reset(x:any){const pw=genPw();try{await postJSON(`/admin/staff/${x._id}/reset-password`,{password:pw});setShown({email:x.email,pw});toast.ok('Temporary password set')}catch(e:any){toast.err(e.message)}}
  async function toggle(x:any){try{await put(`/admin/staff/${x._id}/status`,{status:x.status==='active'?'disabled':'active'});toast.ok(x.status==='active'?'Account disabled — they can no longer sign in':'Account enabled');load()}catch(e:any){toast.err(e.message)}}
  return <Shell><PageHead title="Staff Accounts" sub="Only the Super Admin can create staff, change roles, reset passwords or disable access."><button className="btn" onClick={()=>setF({name:'',email:'',phone:'',role:'sales',password:genPw(),status:'active'})}><Icon name="staff" size={18}/>Add staff member</button></PageHead>
    {shown&&<div className="alert ok-box"><b>Share these sign-in details with {shown.email}:</b><div className="row wrap mt0"><code>{shown.email}</code><code>{shown.pw}</code><button className="btn btn-sm btn-soft" onClick={()=>{navigator.clipboard?.writeText(`EMXIN Admin\nEmail: ${shown.email}\nTemporary password: ${shown.pw}`).catch(()=>{});toast.ok('Copied')}}><Icon name="copy" size={14}/>Copy</button><button className="ib" onClick={()=>setShown(null)}><Icon name="close" size={16}/></button></div><small className="muted">They'll be asked to set their own password at first sign-in. This password is not shown again.</small></div>}
    <div className="card flush">{!rows?<Loading/>:rows.length?<table className="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th className="r">Actions</th></tr></thead><tbody>{rows.map(x=><tr key={x._id}>
      <td><b>{x.name}</b><br/><small className="muted">{x.phone}</small></td><td>{x.email}{x.must_change_password&&<><br/><small className="muted">Temporary password</small></>}</td><td><span className="st st-blue">{ROLE_LABEL[x.role]||x.role}</span></td><td><Status s={x.status==='active'?'Active':'Disabled'}/></td><td className="nowrap">{dt(x.created_at)}</td>
      <td className="r nowrap"><button className="btn btn-sm btn-soft" onClick={()=>setEdit({...x})}><Icon name="edit" size={15}/>Edit</button> <button className="btn btn-sm btn-ghost" onClick={()=>reset(x)}>Reset password</button> <button className={'btn btn-sm btn-ghost'+(x.status==='active'?' danger':'')} onClick={()=>toggle(x)}>{x.status==='active'?'Disable':'Enable'}</button></td></tr>)}</tbody></table>:<Empty text="No staff yet. Add your sales, marketing and admin team." icon="staff"/>}</div>
    <section className="card mt"><h2>What each role can do</h2><div className="role-grid">{[['super_admin','Everything, including staff accounts and the audit log. Created from .env.'],...ROLES].map(([r,d])=><div key={r}><b>{ROLE_LABEL[r]}</b><p>{d}</p></div>)}</div></section>
    <Drawer open={!!f} title="Add staff member" onClose={()=>setF(null)}>{f&&<form className="stack" onSubmit={create}>
      <Field label="Full name *"><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field><Field label="Work email *" hint="Used to sign in"><input required type="email" autoComplete="off" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></Field>
      <Field label="Phone"><input type="tel" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></Field>
      <div className="fld"><span>Role *</span><div className="role-pick">{ROLES.map(([r,d])=><label key={r} className={f.role===r?'on':''}><input type="radio" name="role" checked={f.role===r} onChange={()=>setF({...f,role:r})}/><b>{ROLE_LABEL[r]}</b><small>{d}</small></label>)}</div></div>
      <Field label="Temporary password *" hint="They must change it at first sign-in"><div className="row"><input required minLength={8} value={f.password} onChange={e=>setF({...f,password:e.target.value})}/><button type="button" className="btn btn-sm btn-ghost" onClick={()=>setF({...f,password:genPw()})}>New</button></div></Field>
      <button className="btn">Create account</button></form>}</Drawer>
    <Drawer open={!!edit} title={`Edit ${edit?.name||''}`} onClose={()=>setEdit(null)}>{edit&&<form className="stack" onSubmit={saveEdit}>
      <Field label="Full name"><input value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></Field><Field label="Phone"><input value={edit.phone||''} onChange={e=>setEdit({...edit,phone:e.target.value})}/></Field>
      <div className="fld"><span>Role</span><div className="role-pick">{ROLES.map(([r,d])=><label key={r} className={edit.role===r?'on':''}><input type="radio" name="erole" checked={edit.role===r} onChange={()=>setEdit({...edit,role:r})}/><b>{ROLE_LABEL[r]}</b><small>{d}</small></label>)}</div></div>
      <p className="tiny muted">Role changes apply the next time they sign in.</p><button className="btn">Save</button></form>}</Drawer></Shell>;
}
