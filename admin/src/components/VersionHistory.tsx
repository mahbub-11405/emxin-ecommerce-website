'use client';
/** Homepage Builder → Version history: when, who, what changed. Last 7 days; older ones are in the Recycle Bin. */
const BD=(d:any)=>new Date(d).toLocaleString('en-GB',{timeZone:'Asia/Dhaka',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
function ago(d:any){const m=Math.round((Date.now()-new Date(d).getTime())/6e4);if(m<1)return 'just now';if(m<60)return `${m} min ago`;const h=Math.round(m/60);if(h<24)return `${h} h ago`;const n=Math.round(h/24);return n===1?'yesterday':`${n} days ago`}
const ACTION:Record<string,string>={publish:'Published',restore:'Restored',start:'Starting point',before_publish:'Saved before a publish',before_restore:'Saved before a restore'};
export default function VersionHistory({rows,keepDays,onRefresh,onRestore}:{rows:any[];keepDays:number;onRefresh:()=>void;onRestore:(v:any)=>void}){
  return <section className="panel em-history">
    <div className="em-history-heading"><div><h2>Version history</h2><p className="muted tiny">Every Publish is saved with who did it and what changed. Restore puts that exact version live again. Last {keepDays} days are kept here; older versions move to the <a href="/recycle-bin">Recycle Bin</a>.</p></div>
      <button className="btn gray" onClick={onRefresh}>Refresh</button></div>
    {!rows.length?<p className="muted">No versions in the last {keepDays} days.</p>:<ol className="vh">{rows.map(v=>{const old=!v.changes;
      return <li key={v._id} className={v.live?'live':''}>
        <div className="vh-when"><b>{BD(v.created_at)}</b><small>{ago(v.created_at)}</small></div>
        <div className="vh-what"><div className="vh-top"><span className={'vh-act '+(v.action||'')}>{ACTION[v.action]||v.action}</span>{v.by_name&&<span className="vh-by">by <b>{v.by_name}</b></span>}{v.live&&<span className="vh-live">● Live now</span>}</div>
          {v.note&&<small className="muted">{v.note}</small>}
          {old?<small className="muted">Older entry (before this history was improved): the homepage as it was just before a publish.</small>
            :<div className="vh-chips">{v.changes.map((c:string)=><span key={c}>{c}</span>)}</div>}</div>
        {!v.live&&<button className="btn btn-sm btn-outline" onClick={()=>onRestore(v)}>Restore</button>}
      </li>})}</ol>}
  </section>;
}
