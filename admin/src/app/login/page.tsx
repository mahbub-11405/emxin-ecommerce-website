'use client';
import {useEffect,useState} from 'react';
import {API} from '@/lib/api';
import Icon from '@/components/Icon';
export default function Login(){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
  const[remember,setRemember]=useState(true);const[show,setShow]=useState(false);
  // the email (never the password) is remembered on this device; the browser's own password manager can save the password
  useEffect(()=>{try{const e=localStorage.getItem('admin_last_email');if(e)setEmail(e);if(localStorage.getItem('admin_remember')==='0')setRemember(false)}catch{}},[]);
  async function go(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg('');try{const r=await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,remember})});const j=await r.json();if(!r.ok)throw new Error(j.detail||'Login failed');localStorage.setItem('admin_token',j.access_token);try{localStorage.setItem('admin_last_email',email.trim().toLowerCase());localStorage.setItem('admin_remember',remember?'1':'0')}catch{}if(j.must_change_password){location.href='/profile?first=1';return}const n=new URLSearchParams(location.search).get('next');location.href=n&&n.startsWith('/')&&!n.startsWith('//')?n:'/dashboard'}catch(x:any){setMsg(x.message)}finally{setBusy(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={go} method="post" action="/login" autoComplete="on"><img src="/branding/emxin-logo-light.png" alt="EMXIN Technologies"/><h1>Admin sign in</h1><p className="muted">Manage orders, products, customers and your storefront.</p>
    <label className="fld"><span>Email</span><input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} autoFocus={!email}/></label>
    <label className="fld"><span>Password</span><div className="pw-in"><input id="password" name="password" type={show?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} autoFocus={!!email}/><button type="button" className="pw-eye" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'}><Icon name="eyeView" size={17}/></button></div></label>
    <label className="tgl-line"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Keep me signed in on this device for 7 days</label>
    {msg&&<div className="alert err">{msg}</div>}<button className="btn btn-block" disabled={busy}>{busy?'Signing in…':<>Sign in <Icon name="arrowRight" size={17}/></>}</button></form></div>;
}
