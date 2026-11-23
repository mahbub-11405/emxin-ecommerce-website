'use client';
import {useEffect,useState} from 'react';
import {api,postJSON} from '@/lib/api';
import {NumInput,Toggle,toast} from '@/components/ui';

/** Settings → Telegram alerts: which chats get the team alerts and which events are sent. The bot token stays in the server .env. */
export default function TelegramAlerts(){
  const[d,setD]=useState<any>(null);const[busy,setBusy]=useState('');const[found,setFound]=useState<any[]|null>(null);const[manual,setManual]=useState('');const[res,setRes]=useState<any[]|null>(null);
  const load=()=>api('/admin/telegram').then(setD).catch(e=>toast.err(e.message));useEffect(()=>{load()},[]);
  if(!d)return <p className="muted">Loading…</p>;
  const set=(k:string,v:any)=>setD((x:any)=>({...x,[k]:v}));
  const has=(id:string)=>d.chats.some((c:any)=>String(c.id)===String(id));
  const add=(c:any)=>{if(!has(c.id))set('chats',[...d.chats,{id:String(c.id),title:c.title||String(c.id)}])};
  async function save(){setBusy('save');try{const r=await api('/admin/telegram',{method:'PUT',body:JSON.stringify({chats:d.chats,events:d.events,low_stock:d.low_stock,enabled:d.enabled})});setD((x:any)=>({...x,...r}));toast.ok('Telegram alerts saved')}catch(e:any){toast.err(e.message)}finally{setBusy('')}}
  async function find(){setBusy('find');setFound(null);try{setFound(await postJSON('/admin/telegram/find-chats',{}))}catch(e:any){toast.err(e.message)}finally{setBusy('')}}
  async function test(){setBusy('test');setRes(null);try{setRes(await postJSON('/admin/telegram/test',{chats:d.chats.map((c:any)=>c.id)}))}catch(e:any){toast.err(e.message)}finally{setBusy('')}}
  const bot=d.bot?.username;
  return <div className="tg">
    {!d.token_set?<section className="tg-box warn"><h3>Step 1 · Create the bot (2 minutes)</h3><ol>
        <li>In Telegram open <b>@BotFather</b> → send <code>/newbot</code> → give a name (e.g. <i>EMXIN Alerts</i>) and a username ending in <code>bot</code>.</li>
        <li>BotFather replies with a <b>token</b>. Put it in the <b>server .env</b> as <code>TELEGRAM_BOT_TOKEN=…</code> and restart: <code>docker-compose up --build -d</code>.</li>
        <li>Never paste the token here or send it to anyone.</li></ol></section>
    :d.bot?.error?<section className="tg-box bad"><b>The bot token in .env does not work:</b> {d.bot.error}. Check TELEGRAM_BOT_TOKEN on the server.</section>
    :<section className="tg-box ok">✅ Bot connected: <b>@{bot}</b>{d.bot?.name?` (${d.bot.name})`:''}</section>}

    {d.token_set&&!d.bot?.error&&<>
    <section className="tg-box"><h3>Who gets the alerts</h3>
      <ol className="tiny"><li><b>Only you:</b> open <a href={`https://t.me/${bot}`} target="_blank" rel="noopener">t.me/{bot}</a> and press <b>Start</b>.</li>
        <li><b>Your team:</b> make a Telegram group (e.g. “EMXIN Orders”), add <b>@{bot}</b> to it and write any message in the group.</li>
        <li>Then press <b>Find chats</b> below and <b>Add</b> it.</li></ol>
      <div className="row"><button type="button" className="btn btn-sm btn-outline" disabled={!!busy} onClick={find}>{busy==='find'?'Looking…':'Find chats'}</button>
        <input placeholder="or chat ID, e.g. -1001234567890" value={manual} onChange={e=>setManual(e.target.value.trim())} style={{maxWidth:240}}/>
        <button type="button" className="btn btn-sm btn-ghost" disabled={!/^-?\d{3,20}$/.test(manual)} onClick={()=>{add({id:manual,title:manual});setManual('')}}>Add ID</button></div>
      {found&&(found.length?<ul className="tg-list">{found.map(c=><li key={c.id}><span><b>{c.title}</b><small className="muted">{c.type==='private'?'person':c.type} · {c.id}</small></span>
          {has(c.id)?<em className="muted tiny">added</em>:<button type="button" className="btn btn-sm" onClick={()=>add(c)}>Add</button>}</li>)}</ul>
        :<p className="tiny muted">No chat found yet. Press Start on the bot (or write a message in the group after adding the bot), then try again.</p>)}
      <h4>Receiving alerts ({d.chats.length})</h4>
      {d.chats.length?<ul className="tg-list">{d.chats.map((c:any)=><li key={c.id}><span><b>{c.title}</b><small className="muted">{c.id}</small></span>
          <button type="button" className="btn btn-sm btn-ghost danger" onClick={()=>set('chats',d.chats.filter((x:any)=>x.id!==c.id))}>Remove</button></li>)}</ul>
        :<p className="tiny muted">No chat yet — alerts are not sent.</p>}
    </section>

    <section className="tg-box"><h3>What to send</h3>
      <Toggle checked={d.enabled} onChange={v=>set('enabled',v)} label="Telegram alerts on"/>
      <div className="tg-ev">{Object.entries(d.event_labels as Record<string,string>).map(([k,l])=><Toggle key={k} checked={!!d.events[k]} onChange={v=>set('events',{...d.events,[k]:v})} label={l}/>)}</div>
      <label className="field" style={{maxWidth:280}}>Low stock alert when a product has this many pcs or fewer<NumInput min={0} max={1000} value={d.low_stock} onChange={n=>set('low_stock',n)}/></label>
      <p className="tiny muted">Alerts show the customer's name, phone, district, products and money. The full address is not sent; open the order in Admin for that.</p>
    </section>

    <div className="row"><button type="button" className="btn" disabled={!!busy} onClick={save}>{busy==='save'?'Saving…':'Save Telegram alerts'}</button>
      <button type="button" className="btn btn-outline" disabled={!!busy||!d.chats.length} onClick={test}>{busy==='test'?'Sending…':'Send test message'}</button></div>
    {res&&<ul className="tg-list">{res.map(r=><li key={r.id}><span>{d.chats.find((c:any)=>c.id===r.id)?.title||r.id}</span>{r.ok?<b className="good">✓ sent</b>:<small className="bad">✗ {r.error}</small>}</li>)}</ul>}

    {d.recent?.length>0&&<section className="tg-box"><h3>Recent alerts</h3><ul className="tg-list">{d.recent.map((r:any)=><li key={r.key}><span><b>{d.event_labels[r.event]||r.event}</b><small className="muted">{new Date(r.created_at).toLocaleString('en-GB')}</small></span>
        <small className={r.status==='sent'?'good':r.status==='failed'?'bad':'muted'}>{r.status}{r.error?` · ${r.error}`:''}</small></li>)}</ul></section>}
    </>}
  </div>;
}
