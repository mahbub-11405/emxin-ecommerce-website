'use client';
import {useEffect,useState} from 'react';
import Shell,{ROLE_LABEL} from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Field,toast} from '@/components/ui';
import {api,postJSON} from '@/lib/api';
export default function Profile(){
  const[me,setMe]=useState<any>(null);const[f,setF]=useState({current_password:'',new_password:'',confirm:''});const[busy,setBusy]=useState(false);const[first,setFirst]=useState(false);
  useEffect(()=>{api('/admin/me').then(setMe).catch(()=>{});setFirst(new URLSearchParams(location.search).get('first')==='1')},[]);
  const strong=f.new_password.length>=10&&/[A-Za-z]/.test(f.new_password)&&/\d/.test(f.new_password);
  async function save(e:React.FormEvent){e.preventDefault();if(f.new_password!==f.confirm)return toast.err('The two new passwords do not match');setBusy(true);
    try{await postJSON('/admin/me/password',{current_password:f.current_password,new_password:f.new_password});toast.ok('Password changed');setF({current_password:'',new_password:'',confirm:''});setTimeout(()=>location.href='/dashboard',800)}catch(x:any){toast.err(x.message)}finally{setBusy(false)}}
  return <Shell><PageHead title="My Profile" sub="Your sign-in details and password."/>
    <div className="two-col"><section className="card"><h2>Account</h2><p><b>{me?.name}</b><br/><span className="muted">{me?.email}</span></p><p>Role: <span className="st st-blue">{ROLE_LABEL[me?.role]||me?.role}</span></p>
      {me?.role==='super_admin'&&<p className="tiny muted">The Super Admin account is created once from INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD in .env. Changing those values later does not change this account — change the password here.</p>}</section>
    <section className="card"><h2>Change password</h2>{first&&<div className="alert warn">Your account was created with a temporary password. Please set your own before continuing.</div>}
      <form className="stack" onSubmit={save}><Field label="Current (or temporary) password"><input type="password" autoComplete="current-password" required value={f.current_password} onChange={e=>setF({...f,current_password:e.target.value})}/></Field>
        <Field label="New password" hint="At least 10 characters, with letters and numbers"><input type="password" autoComplete="new-password" required value={f.new_password} onChange={e=>setF({...f,new_password:e.target.value})}/></Field>
        <Field label="Repeat new password"><input type="password" autoComplete="new-password" required value={f.confirm} onChange={e=>setF({...f,confirm:e.target.value})}/></Field>
        <button className="btn" disabled={busy||!strong}><Icon name="secure" size={17}/>{busy?'Saving…':'Change password'}</button></form></section></div></Shell>;
}
