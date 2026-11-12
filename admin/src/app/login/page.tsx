'use client';
import {useState} from 'react';
import {API} from '@/lib/api';
import Icon from '@/components/Icon';
export default function Login(){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg('');try{const r=await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Login failed');localStorage.setItem('admin_token',j.access_token);if(j.must_change_password){location.href='/profile?first=1';return}const n=new URLSearchParams(location.search).get('next');location.href=n&&n.startsWith('/')&&!n.startsWith('//')?n:'/dashboard'}catch(x:any){setMsg(x.message)}finally{setBusy(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={go}><img src="/branding/emxin-logo-light.png" alt="EMXIN Technologies"/><h1>Admin sign in</h1><p className="muted">Manage orders, products, customers and your storefront.</p>
    <label className="fld"><span>Email</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label className="fld"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {msg&&<div className="alert err">{msg}</div>}<button className="btn btn-block" disabled={busy}>{busy?'Signing in…':<>Sign in <Icon name="arrowRight" size={17}/></>}</button></form></div>;
}
