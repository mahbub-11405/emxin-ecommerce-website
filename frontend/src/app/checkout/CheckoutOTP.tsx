'use client';
import {useEffect,useRef,useState} from 'react';
import Icon from '@/components/Icon';
import {postJSON} from '@/lib/api';
import {setToken,localBD,rememberDevice,deviceFor,forgetDevice} from '@/lib/auth';
import {listenWebOTP} from '@/lib/webotp';
import {track} from '@/lib/tracking';

/** Confirms the mobile number right on the checkout page (no separate register page).
 *  New number → account is created; known number → logged in; a device remembered from an earlier OTP needs no code.
 *  onDone(token) then places the order straight away. */
export default function CheckoutOTP({phone,name,email,district,thana='',address,onDone,onClose}:{phone:string;name:string;email:string;district:string;thana?:string;address:string;onDone:(token:string)=>void;onClose:()=>void}){
  const num=localBD(phone);
  const[mode,setMode]=useState<'register'|'login'>('register');const[code,setCode]=useState('');const[wait,setWait]=useState(0);
  const[step,setStep]=useState<'sending'|'code'|'checking'|'done'>('sending');const[msg,setMsg]=useState<{k:'ok'|'err';t:string}|null>(null);
  const box=useRef<HTMLInputElement>(null);const stopOtp=useRef<()=>void>(()=>{});const once=useRef(false);
  function finish(r:any){try{localStorage.setItem('customer_last_phone',num)}catch{}rememberDevice(num,r.device_token,r.device_expires_at);setToken(r.access_token);setStep('done');onDone(r.access_token)}
  async function send(m:'register'|'login'=mode){
    setStep('sending');setMsg(null);setCode('');
    try{const r=await postJSON('/auth/otp/request',{phone:num,purpose:m==='login'?'login':'customer_register',language:'en'});
      setMode(m);setWait(Number(r.resend_in)||60);setStep('code');track('otp_sent',{metadata:{mode:m}});
      stopOtp.current();stopOtp.current=listenWebOTP(c=>{setCode(c);setTimeout(()=>verify(c,m),50)});
      setMsg({k:'ok',t:r.test_code?`Test code: ${r.test_code}`:`${num}-এ SMS-এ ৬ সংখ্যার কোড পাঠানো হয়েছে।`});setTimeout(()=>box.current?.focus(),60)}
    catch(e:any){
      if(m==='register'&&/already registered/i.test(e.message))return send('login'); // has an account already → log in with the same code flow
      setStep('code');setMsg({k:'err',t:e.message||'Could not send the code. Please try again.'})}
  }
  async function verify(c=code,m=mode){
    const d=c.replace(/\D/g,'');if(d.length!==6){setMsg({k:'err',t:'SMS-এ আসা ৬ সংখ্যার কোডটা লিখুন।'});return}
    setStep('checking');setMsg(null);
    try{const v=await postJSON('/auth/otp/verify',{phone:num,purpose:m==='login'?'login':'customer_register',code:d});
      track('otp_verified',{metadata:{mode:m}});
      const r=m==='login'?await postJSON('/customers/phone-login',{phone:num,verification_id:v.verification_id})
        :await postJSON('/customers/register-phone',{phone:num,name:name.trim(),email:email.trim()||null,verification_id:v.verification_id,district,thana,address});
      stopOtp.current();finish(r)}
    catch(e:any){setStep('code');setMsg({k:'err',t:e.message||'Incorrect code'});setTimeout(()=>box.current?.select(),30)}
  }
  useEffect(()=>{if(once.current)return;once.current=true;
    // this phone already verified this number before (30 days): no SMS needed
    const known=deviceFor(num);
    if(known)postJSON('/customers/device-login',{phone:num,device_token:known.t}).then(finish).catch(()=>{forgetDevice(num);send()});
    else send();
    return()=>stopOtp.current()},[]);
  useEffect(()=>{if(wait<=0)return;const t=setTimeout(()=>setWait(w=>w-1),1000);return()=>clearTimeout(t)},[wait]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&step!=='checking')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[step,onClose]);
  return <div className="co-modal" role="dialog" aria-modal="true" aria-labelledby="otp-title">
    <button type="button" className="co-modal-bg" aria-label="Close" onClick={()=>{if(step!=='checking')onClose()}}/>
    <div className="co-modal-box co-otp">
      <div className="co-modal-head"><h3 id="otp-title">মোবাইল নম্বর নিশ্চিত করুন</h3><button type="button" className="co-x" aria-label="Close" disabled={step==='checking'} onClick={onClose}>×</button></div>
      {step==='sending'?<p className="co-otp-wait"><span className="spinner"/> {deviceFor(num)?'এই ফোনটা যাচাই হচ্ছে…':`${num}-এ কোড পাঠানো হচ্ছে…`}</p>:
      step==='done'?<p className="co-otp-wait"><span className="spinner"/> নম্বর নিশ্চিত হয়েছে। অর্ডার হচ্ছে…</p>:<>
        <p className="muted">শেষ ধাপ: <b>{num}</b>-এ পাঠানো <b>৬ সংখ্যার কোড</b> লিখুন। কোড দিলেই অর্ডার হয়ে যাবে{mode==='register'?' (পাসওয়ার্ড লাগবে না)':''}।</p>
        <div className="co-otp-form">
          <input ref={box} className="co-otp-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••" aria-label="6-digit code"
            value={code} onChange={e=>{const v=e.target.value.replace(/\D/g,'').slice(0,6);setCode(v);if(v.length===6)verify(v)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();verify()}}} disabled={step==='checking'}/>
          <button type="button" className="btn btn-lg btn-block" onClick={()=>verify()} disabled={step==='checking'||code.length!==6}>{step==='checking'?'যাচাই হচ্ছে…':<><Icon name="check" size={18}/>কনফার্ম করে অর্ডার দিন</>}</button>
        </div>
        {msg&&<p className={msg.k==='ok'?'qr-okline':'form-err'} role="status">{msg.t}</p>}
        <div className="co-otp-links">
          <button type="button" className="linkish" disabled={wait>0} onClick={()=>send()}>{wait>0?`আবার পাঠান (${wait}s)`:'কোড আসেনি? আবার পাঠান'}</button>
          <button type="button" className="linkish" onClick={onClose}>নম্বর বদলান</button>
        </div>
        <small className="muted">আপনার দেওয়া তথ্য ঠিক থাকবে। এই ফোন থেকে পরের বার আর কোড লাগবে না।</small>
      </>}
    </div></div>;
}
