'use client';
import {useState} from 'react';
import {postJSON} from '@/lib/api';

const T:any={
 en:{title:'Become a Dealer',sub:'Create your dealer profile in a few simple steps. You can log in and see your application status.',name:'Your Name',shop:'Shop / Business Name',phone:'Mobile Number',email:'Email (optional)',address:'Business Address',password:'Create Password',otp:'OTP Code',send:'Send OTP',verify:'Verify OTP',submit:'Submit Dealer Application',pending:'After submission your status will show Pending Review until EMXIN approves it.'},
 bn:{title:'ডিলার হোন',sub:'কয়েকটি সহজ ধাপে ডিলার প্রোফাইল তৈরি করুন। লগইন করে আবেদন স্ট্যাটাস দেখতে পারবেন।',name:'আপনার নাম',shop:'দোকান / ব্যবসার নাম',phone:'মোবাইল নম্বর',email:'ইমেইল (ঐচ্ছিক)',address:'ব্যবসার ঠিকানা',password:'পাসওয়ার্ড তৈরি করুন',otp:'OTP কোড',send:'OTP পাঠান',verify:'OTP যাচাই করুন',submit:'ডিলার আবেদন জমা দিন',pending:'আবেদন জমা দেওয়ার পর EMXIN অনুমোদন না করা পর্যন্ত Pending Review দেখাবে।'}
};
export default function Page(){
 const[lang,setLang]=useState<'en'|'bn'>('bn'); const t=T[lang];
 const[msg,setMsg]=useState(''); const[challenge,setChallenge]=useState(''); const[verification,setVerification]=useState(''); const[otp,setOtp]=useState('');
 const[f,setF]=useState({name:'',shop_name:'',phone:'',email:'',address:'',password:'',business_type:'Retailer'});
 async function sendOtp(){try{const r=await postJSON('/auth/otp/request',{phone:f.phone,purpose:'dealer_register',language:lang});setChallenge(r.challenge_id);setMsg(r.test_code?`Test OTP: ${r.test_code}`:'OTP sent to your phone.')}catch(e:any){setMsg(e.message)}}
 async function verifyOtp(){try{const r=await postJSON('/auth/otp/verify',{phone:f.phone,purpose:'dealer_register',code:otp});setVerification(r.verification_id);setMsg(lang==='bn'?'মোবাইল নম্বর যাচাই হয়েছে।':'Phone verified.')}catch(e:any){setMsg(e.message)}}
 async function go(e:any){e.preventDefault();try{const r=await postJSON('/dealers/apply',{...f,otp_verification_id:verification||null,preferred_language:lang});setMsg(`${t.pending} (${r.status})`)}catch(e:any){setMsg(e.message)}}
 return <main className="container section"><div style={{display:'flex',justifyContent:'flex-end'}}><button className="btn secondary" onClick={()=>setLang(lang==='bn'?'en':'bn')}>{lang==='bn'?'English':'বাংলা'}</button></div><div className="two"><div><div className="eyebrow">EMXIN DEALER</div><h1>{t.title}</h1><p className="muted">{t.sub}</p><div className="panel"><b>{lang==='bn'?'সহজ প্রক্রিয়া':'Simple process'}</b><p>1. {lang==='bn'?'মোবাইল OTP যাচাই':'Verify mobile OTP'}</p><p>2. {lang==='bn'?'দোকানের তথ্য দিন':'Add shop information'}</p><p>3. {lang==='bn'?'আবেদন জমা দিন':'Submit application'}</p><p>4. {lang==='bn'?'স্ট্যাটাস দেখুন':'Track approval status'}</p></div></div><form className="panel" onSubmit={go}><h2>{t.title}</h2>
 {[['name',t.name],['shop_name',t.shop],['phone',t.phone],['email',t.email],['address',t.address],['password',t.password]].map(([k,l])=><div className="field" key={k}><label>{l}</label><input type={k==='password'?'password':'text'} required={!['email'].includes(k)} value={(f as any)[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></div>)}
 <div className="field"><label>{t.otp}</label><div style={{display:'flex',gap:8}}><input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="6 digit"/><button type="button" className="btn secondary" onClick={sendOtp}>{t.send}</button><button type="button" className="btn secondary" disabled={!challenge} onClick={verifyOtp}>{t.verify}</button></div></div>
 <button className="btn" disabled={!!challenge&&!verification}>{t.submit}</button>{msg&&<p className="summary">{msg}</p>}</form></div></main>
}
