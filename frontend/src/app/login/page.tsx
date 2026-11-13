'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import {postJSON} from '@/lib/api';
import {listenWebOTP} from '@/lib/webotp';
import {setToken,readDraft,safeNext,digitsBD} from '@/lib/auth';

type Mode='login'|'register';
export default function AuthPage(){
  const[mode,setMode]=useState<Mode>('login');const[next,setNext]=useState('/account');const[fromCheckout,setFromCheckout]=useState(false);
  const[phone,setPhone]=useState('');const[name,setName]=useState('');const[email,setEmail]=useState('');
  const[code,setCode]=useState('');const[sent,setSent]=useState(false);const[wait,setWait]=useState(0);
  const[msg,setMsg]=useState<{k:'ok'|'err';t:string}|null>(null);const[busy,setBusy]=useState(false);
  const codeRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{const q=new URLSearchParams(location.search);const t=q.get('tab');if(t==='register'||t==='login')setMode(t);const n=safeNext(q.get('next'));setNext(n);
    const d=readDraft();if(d?.f){setFromCheckout(n.startsWith('/checkout'));if(d.f.phone)setPhone(d.f.phone);if(d.f.customer_name)setName(d.f.customer_name);if(d.f.email)setEmail(d.f.email)}},[]);
  useEffect(()=>{if(wait<=0)return;const t=setTimeout(()=>setWait(wait-1),1000);return()=>clearTimeout(t)},[wait]);
  const purpose=mode==='login'?'login':'customer_register';
  const full=()=>'+880'+digitsBD(phone);
  function switchTo(m:Mode,keep=true){setMode(m);setSent(false);setCode('');if(!keep)setMsg(null)}
  async function send(e?:React.FormEvent){e?.preventDefault();setMsg(null);
    if(!/^1[3-9]\d{8}$/.test(digitsBD(phone)))return setMsg({k:'err',t:'Enter a valid Bangladesh mobile number, e.g. 01712 345678.'});
    if(mode==='register'&&name.trim().length<2)return setMsg({k:'err',t:'Please enter your name.'});
    setBusy(true);
    try{const r=await postJSON('/auth/otp/request',{phone:full(),purpose,language:'en'});setSent(true);setWait(Number(r.resend_in)||60);listenWebOTP(c=>setCode(c));setMsg({k:'ok',t:r.test_code?`Test OTP: ${r.test_code}`:`We sent a 6-digit code to ${full()}.`});setTimeout(()=>codeRef.current?.focus(),50)}
    catch(err:any){const t=err.message||'';if(/already registered/i.test(t)){switchTo('login');setMsg({k:'ok',t:'This number already has an account — log in with OTP instead.'})}else if(/register first/i.test(t)){switchTo('register');setMsg({k:'ok',t:'No account yet for this number — create one in a few seconds.'})}else setMsg({k:'err',t})}
    finally{setBusy(false)}}
  async function verify(e:React.FormEvent){e.preventDefault();setBusy(true);setMsg(null);
    try{const v=await postJSON('/auth/otp/verify',{phone:full(),purpose,code});
      const r=mode==='login'?await postJSON('/customers/phone-login',{phone:full(),verification_id:v.verification_id}):await postJSON('/customers/register-phone',{phone:full(),name:name.trim(),email:email.trim()||null,verification_id:v.verification_id,district:readDraft()?.f?.district,address:readDraft()?.f?.address});
      setToken(r.access_token);location.href=next;
    }catch(err:any){setMsg({k:'err',t:err.message})}finally{setBusy(false)}}
  return <main className="wrap section-sm"><div className="auth">
    <aside className="auth-side"><span className="pill">EMXIN ACCOUNT</span><h1>{mode==='login'?'Welcome back':'Create your account'}</h1><p>{fromCheckout?'One quick step: verify your mobile number and you will return to checkout with your details already filled in.':mode==='login'?'Log in with your mobile number — no password. We send a one-time code (OTP) by SMS. You stay logged in on this device for 30 days, so you won’t need a new code every time.':'Just your mobile number — no password to remember. We verify it once with a one-time code (OTP) by SMS, and you stay logged in on this device for 30 days.'}</p>
      <ul className="checks"><li><i><Icon name="check" size={13} stroke={3.2}/></i>Track orders and payments</li><li><i><Icon name="check" size={13} stroke={3.2}/></i>Faster checkout next time</li><li><i><Icon name="check" size={13} stroke={3.2}/></i>Save products to your wishlist</li></ul></aside>
    <section className="panel auth-card">
      <div className="auth-tabs" role="tablist"><button role="tab" aria-selected={mode==='login'} className={mode==='login'?'on':''} onClick={()=>switchTo('login',false)}>Login</button><button role="tab" aria-selected={mode==='register'} className={mode==='register'?'on':''} onClick={()=>switchTo('register',false)}>Register</button></div>
      {fromCheckout&&<p className="note-good"><Icon name="cart" size={16}/> Your cart and delivery details are saved.</p>}
      <form onSubmit={sent?verify:send} className="auth-form">
        {mode==='register'&&<label className="qr-field"><span>Full name <em>*</em></span><input required autoComplete="name" value={name} disabled={sent} onChange={e=>setName(e.target.value)} placeholder="Your name"/></label>}
        <label className="qr-field"><span>Mobile number <em>*</em></span><div className="qr-phone"><span className="qr-cc"><i className="flag-bd" aria-hidden="true"/></span><span className="qr-code">+880</span><input required type="tel" inputMode="tel" autoComplete="tel-national" value={phone} disabled={sent} onChange={e=>setPhone(e.target.value.replace(/[^\d ]/g,'').replace(/^\s*(880|0)+/,''))} placeholder="1712 345678" maxLength={11}/></div><small className="muted">Start with 1 — e.g. <b>1712 345678</b> (no 0 needed after +880)</small></label>
        {mode==='register'&&<label className="qr-field"><span>Email <small className="muted">(optional, for receipts)</small></span><input type="email" autoComplete="email" value={email} disabled={sent} onChange={e=>setEmail(e.target.value)}/></label>}
        {sent&&<label className="qr-field"><span>Verification code</span><input ref={codeRef} className="otp-in" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="••••••"/></label>}
        {msg&&<p className={msg.k==='err'?'form-err':'note-good'} role="status">{msg.t}</p>}
        <button className="btn btn-lg btn-block" disabled={busy||(sent&&code.length<4)}>{busy?'Please wait…':sent?(mode==='login'?'Verify & Login':'Verify & Create Account'):'Send OTP'}</button>
        {sent&&<div className="auth-links"><button type="button" className="link-btn" onClick={()=>{setSent(false);setCode('');setMsg(null)}}>Change number</button><button type="button" className="link-btn" disabled={wait>0||busy} onClick={()=>send()}>{wait>0?`Resend in ${wait}s`:'Resend code'}</button></div>}
      </form>
      <p className="auth-switch">{mode==='login'?<>New to EMXIN? <button className="link-btn" onClick={()=>switchTo('register')}>Create an account</button></>:<>Already have an account? <button className="link-btn" onClick={()=>switchTo('login')}>Log in</button></>}</p>
      <p className="tiny muted">By continuing you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.</p>
    </section></div></main>;
}
