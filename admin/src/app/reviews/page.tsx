'use client';
import {useEffect,useState} from 'react';
import Shell from '@/components/Shell';
import Icon from '@/components/Icon';
import {PageHead,Empty,Loading,toast,Status,Tabs,Confirm} from '@/components/ui';
import {api,put,del,dt} from '@/lib/api';
export default function Reviews(){
  const[tab,setTab]=useState('pending');const[rv,setRv]=useState<any[]|null>(null);const[qs,setQs]=useState<any[]>([]);
  const load=()=>{api('/admin/reviews').then(setRv).catch(e=>toast.err(e.message));api('/admin/questions').then(setQs).catch(()=>{})};useEffect(()=>{load()},[]);
  const mod=async(id:string,status:string,reply?:string)=>{try{await put(`/admin/reviews/${id}`,{status,...(reply!==undefined?{reply}:{})});toast.ok('Review '+status);load()}catch(e:any){toast.err(e.message)}};
  const list=tab==='questions'?[]:(rv||[]).filter(r=>tab==='all'||r.status===tab);
  return <Shell><PageHead title="Reviews & Q&A" sub="Only approved reviews are shown and counted in product ratings."/>
    <Tabs value={tab} onChange={setTab} tabs={[{key:'pending',label:'Pending',count:(rv||[]).filter(r=>r.status==='pending').length},{key:'approved',label:'Approved'},{key:'rejected',label:'Rejected'},{key:'all',label:'All reviews'},{key:'questions',label:'Questions',count:qs.filter(q=>q.status==='pending').length}]}/>
    {!rv?<Loading/>:tab==='questions'?<div className="cards-list">{qs.length?qs.map(q=><div className="card" key={q._id}><div className="row between"><b>{q.product_name}</b><Status s={q.status}/></div><p className="q">Q: {q.question}</p><small className="muted">{q.name||'Customer'} · {dt(q.created_at)}</small>
      <form className="row" onSubmit={async e=>{e.preventDefault();const a=(e.currentTarget.elements.namedItem('a') as HTMLInputElement).value;try{await put(`/admin/questions/${q._id}`,{answer:a,status:'answered'});toast.ok('Answer published');load()}catch(x:any){toast.err(x.message)}}}><input name="a" defaultValue={q.answer||''} placeholder="Write the answer shown on the product page"/><button className="btn btn-sm">Publish</button><button type="button" className="btn btn-sm btn-ghost" onClick={async()=>{await put(`/admin/questions/${q._id}`,{answer:q.answer||'',status:'hidden'});load()}}>Hide</button></form></div>):<Empty text="No questions yet."/>}</div>
    :<div className="cards-list">{list.length?list.map(r=><div className="card" key={r._id}><div className="row between"><div><b>{r.product_name}</b> <span className="stars-txt">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span></div><Status s={r.status}/></div>{r.title&&<h4>{r.title}</h4>}<p>{r.body}</p><small className="muted">{r.customer_name} · {dt(r.created_at)}{r.verified_purchase&&' · ✓ Verified purchase'}</small>
      <div className="row mt">{r.status!=='approved'&&<button className="btn btn-sm" onClick={()=>mod(r._id,'approved')}><Icon name="check" size={15}/>Approve</button>}{r.status!=='rejected'&&<button className="btn btn-sm btn-ghost" onClick={()=>mod(r._id,'rejected')}>Reject</button>}<button className="btn btn-sm btn-soft" onClick={()=>{const t=prompt('Public reply from EMXIN:',r.reply||'');if(t!==null)mod(r._id,r.status,t)}}>Reply</button><Confirm text="Delete this review permanently?" onYes={async()=>{await del(`/admin/reviews/${r._id}`);load()}}>Delete</Confirm></div>{r.reply&&<blockquote className="quote">EMXIN: {r.reply}</blockquote>}</div>):<Empty text="No reviews in this view." icon="star"/>}</div>}
  </Shell>;
}
