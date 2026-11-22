'use client';
import {useEffect,useState} from 'react';
import Stars from '@/components/Stars';
import Icon from '@/components/Icon';
import {API,postJSON} from '@/lib/api';
const tok=()=>{try{return localStorage.getItem('customer_token')||''}catch{return ''}};
export function Reviews({product:p}:{product:any}){
  const[d,setD]=useState<any>({reviews:[],distribution:{}});const[f,setF]=useState({rating:5,title:'',body:''});const[msg,setMsg]=useState('');const[logged,setLogged]=useState(false);
  const[photos,setPhotos]=useState<string[]>([]);const[up,setUp]=useState(0);const[big,setBig]=useState('');const MAX=3;
  useEffect(()=>{if(!big)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setBig('')};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[big]);
  /** each photo goes to the server first (it is checked, shrunk and its location data removed), the review then carries the links */
  async function addPhotos(files:FileList|null){if(!files)return;setMsg('');const list=[...files].slice(0,MAX-photos.length);
    for(const file of list){if(!file.type.startsWith('image/')){setMsg('Only photos can be added.');continue}if(file.size>10*1024*1024){setMsg(`${file.name} is larger than 10 MB.`);continue}
      setUp(n=>n+1);try{const fd=new FormData();fd.append('product_id',p._id);fd.append('file',file);const r=await fetch(`${API}/reviews/photo`,{method:'POST',headers:{Authorization:'Bearer '+tok()},body:fd});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||'Photo upload failed');setPhotos(l=>l.length<MAX?[...l,j.url]:l)}catch(e:any){setMsg(e.message)}finally{setUp(n=>n-1)}}}
  useEffect(()=>{setLogged(!!tok());fetch(`${API}/products/${p._id}/reviews`).then(r=>r.ok?r.json():null).then(x=>x&&setD(x)).catch(()=>{})},[p._id]);
  const total=Object.values(d.distribution||{}).reduce((a:any,b:any)=>a+b,0) as number;
  async function send(e:React.FormEvent){e.preventDefault();try{const r=await postJSON('/reviews',{...f,photos,product_id:p._id},tok());setMsg(r.message);setF({rating:5,title:'',body:''});setPhotos([])}catch(err:any){setMsg(err.message)}}
  return <div className="rv">
    <div className="rv-sum"><div className="rv-score"><b>{Number(p.rating||0).toFixed(1)}</b><Stars value={p.rating} size={18}/><small>{p.review_count||0} verified reviews</small></div>
      <div className="rv-bars">{[5,4,3,2,1].map(n=>{const c=d.distribution?.[n]||0;return <div key={n}><span>{n}★</span><i><em style={{width:total?`${c/total*100}%`:'0%'}}/></i><small>{c}</small></div>})}</div></div>
    <div className="rv-list">{d.reviews.length?d.reviews.map((r:any)=><article key={r._id}><header><Stars value={r.rating} size={14}/><b>{r.title}</b></header><p>{r.body}</p>{r.photos?.length>0&&<div className="rv-photos">{r.photos.map((u:string)=><button type="button" key={u} onClick={()=>setBig(u)} aria-label="Open photo"><img src={u} alt={`Customer photo of ${p.name}`} loading="lazy"/></button>)}</div>}<footer>{r.customer_name}{r.verified_purchase&&<span className="vp"><Icon name="badgeCheck" size={13}/> Verified purchase</span>} · {new Date(r.created_at).toLocaleDateString('en-GB')}</footer>{r.reply&&<blockquote><b>EMXIN:</b> {r.reply}</blockquote>}</article>):<p className="muted">No reviews yet. Be the first to share your experience.</p>}</div>
    {logged?<form className="rv-form" onSubmit={send}><h3>Write a review</h3><div className="rv-pick">{[1,2,3,4,5].map(n=><button type="button" key={n} aria-label={`${n} stars`} onClick={()=>setF({...f,rating:n})}><Icon name="star" size={26} stroke={1.2} fill={n<=f.rating?'#fbbf24':'#e5e7eb'}/></button>)}</div><input placeholder="Title (optional)" maxLength={120} value={f.title} onChange={e=>setF({...f,title:e.target.value})}/><textarea required minLength={3} rows={3} placeholder="How was the product?" value={f.body} onChange={e=>setF({...f,body:e.target.value})}/>
      <div className="rv-up">{photos.map(u=><span key={u}><img src={u} alt=""/><button type="button" aria-label="Remove photo" onClick={()=>setPhotos(l=>l.filter(x=>x!==u))}><Icon name="close" size={13}/></button></span>)}
        {Array.from({length:up}).map((_,i)=><span key={'u'+i} className="busy"><i/></span>)}
        {photos.length+up<MAX&&<label className="rv-add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{addPhotos(e.target.files);e.target.value=''}}/><Icon name="camera" size={22}/><small>Add photo</small></label>}
        <small className="muted">Up to {MAX} photos of the product (optional)</small></div>
      <button className="btn" disabled={up>0}>{up>0?'Uploading photo…':'Submit review'}</button>{msg&&<p className="summary">{msg}</p>}</form>:<p className="muted"><a href={`/login?next=${encodeURIComponent('/product/'+p.slug)}`}>Sign in</a> to write a review.</p>}
    {big&&<div className="rv-big" role="dialog" aria-modal="true" onClick={()=>setBig('')}><img src={big} alt="Customer photo"/><button type="button" aria-label="Close"><Icon name="close" size={20}/></button></div>}
  </div>;
}
export function Questions({product:p}:{product:any}){
  const[rows,setRows]=useState<any[]>([]);const[q,setQ]=useState('');const[msg,setMsg]=useState('');
  useEffect(()=>{fetch(`${API}/products/${p._id}/questions`).then(r=>r.ok?r.json():[]).then(setRows).catch(()=>{})},[p._id]);
  const faq=[...(p.faq||[]).map((x:any)=>({question:x.question,answer:x.answer})),...rows];
  async function send(e:React.FormEvent){e.preventDefault();try{const r=await postJSON('/questions',{product_id:p._id,question:q},tok());setMsg(r.message);setQ('')}catch(err:any){setMsg(err.message)}}
  return <div className="qa"><h2>Questions &amp; Answers</h2>{faq.length?faq.map((x:any,i:number)=><details key={i} open={i===0}><summary>{x.question}</summary><p>{x.answer}</p></details>):<p className="muted">No questions have been answered yet.</p>}
    <form onSubmit={send} className="qa-form"><input required minLength={5} maxLength={500} placeholder="Ask a question about this product" value={q} onChange={e=>setQ(e.target.value)}/><button className="btn">Ask</button></form>{msg&&<p className="summary">{msg}</p>}</div>;
}
