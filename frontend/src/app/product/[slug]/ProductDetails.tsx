'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import Icon,{featureIcon} from '@/components/Icon';
import Stars from '@/components/Stars';
import GlassesArt from '@/components/GlassesArt';
import PurchaseOptions from './PurchaseOptions';
import QuantityRequest from './QuantityRequest';
import {Reviews,Questions} from './Community';
import {parseSpecs,parseFeature,sameText} from '@/lib/productText';
import {waLink} from '@/lib/contact';
import {API} from '@/lib/api';
import {MessengerLogo} from '@/components/Social';

const specIcon=(label:string)=>{const l=label.toLowerCase();if(/chip|processor|ram|storage|memory/.test(l))return 'cube';if(/compat|app/.test(l))return 'phone';if(/control|touch/.test(l))return 'bolt';if(/model|brand/.test(l))return 'glasses';const i=featureIcon(l);return i==='badgeCheck'?'info':i};

const TABS=['Product Details','Specifications',"What's in the Box",'Reviews','Q&A'] as const;
/** latest approved review with photo, so a buyer sees real feedback without scrolling down */
function ReviewPeek({p,onAll}:{p:any;onAll:()=>void}){
  const[r,setR]=useState<any>(null);
  useEffect(()=>{fetch(`${API}/products/${p._id}/reviews`).then(x=>x.ok?x.json():null).then(d=>setR((d?.reviews||[]).find((x:any)=>x.photos?.length)||d?.reviews?.[0]||null)).catch(()=>{})},[p._id]);
  return <section className="pd-side-box pd-peek"><h3>Customer reviews</h3>
    <div className="pd-peek-score"><b>{Number(p.rating||0).toFixed(1)}</b><Stars value={p.rating} size={16}/><small>{p.review_count} review{Number(p.review_count)>1?'s':''}</small></div>
    {r&&<article><header><Stars value={r.rating} size={13}/><b>{r.title||''}</b></header><p>{String(r.body||'').slice(0,160)}{String(r.body||'').length>160?'…':''}</p>
      <footer>{r.photos?.[0]&&<img src={r.photos[0]} alt="" loading="lazy"/>}<small>{r.customer_name||'Verified buyer'}</small></footer></article>}
    <button type="button" className="pd-more" onClick={onAll}>See all reviews →</button></section>;
}

export default function ProductDetails({product:p,bulkThreshold=20,retailCap=5,dealerPercent=5,dealerTiers=[],dealerFixed=false,defaultBanner='',offer=null,links={},delivery={dhaka:70,outside:130,dhakaDays:'1–2',outsideDays:'2–3'},digitalPct=0}:{product:any;bulkThreshold?:number;retailCap?:number;dealerPercent?:number;dealerTiers?:number[];dealerFixed?:boolean;defaultBanner?:string;offer?:any;links?:any;delivery?:{dhaka:number;outside:number;dhakaDays?:string;outsideDays?:string};digitalPct?:number}){
  const media=useMemo(()=>{const m=p.media?.length?p.media:[...(p.images||[]).map((url:string)=>({url,type:'image'})),...(p.video_url?[{url:p.video_url,type:'video'}]:[])];return m.filter((x:any)=>x?.url)},[p]);
  const[sel,setSel]=useState(()=>Math.max(0,media.findIndex((m:any)=>m.type==='image')));
  const[tab,setTab]=useState<typeof TABS[number]>('Product Details');
  const[zoom,setZoom]=useState(false);
  const[drawer,setDrawer]=useState(false);
  // from the cart / checkout ("Request 20+ pcs"): open the quantity request straight away
  useEffect(()=>{try{if(new URLSearchParams(location.search).get('request'))setDrawer(true)}catch{}},[]);
  const[feat,setFeat]=useState(0);
  const features=useMemo(()=>(p.features||[]).slice(0,5).map(parseFeature),[p]);
  const specs=useMemo(()=>parseSpecs(p.specifications),[p]);
  const active=media[sel];
  const price=Number(p.sale_price||p.price||0);
  const off=p.sale_price&&Number(p.price)>price?Math.round((1-price/Number(p.price))*100):0;
  const save=off>0?Number(p.price)-price:0;
  // more savings the customer can still get: the promoted coupon (applied by itself at checkout) and paying first by bKash / Nagad
  const cpSave=offer&&!(Number(offer.min_order)>price)?Math.round(Math.min(price,offer.type==='percentage'?Math.min(price*Number(offer.value)/100,Number(offer.max_discount)||Infinity):Number(offer.value)||0)):0;
  const digSave=digitalPct>0?Math.round(price*digitalPct/100):0;
  const tabsRef=useRef<HTMLDivElement>(null);
  const goTab=(t:typeof TABS[number])=>{setTab(t);setTimeout(()=>tabsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),30)};
  const faq=(p.faq||[]).filter((x:any)=>x?.question&&x?.answer).slice(0,3);
  const catName=(p.category_name||p.category_slug||'').replaceAll('-',' ');
  const catLabel=[sameText(catName,p.name)?'':catName,p.has_camera?'with camera':''].filter(Boolean).join(' • ').toUpperCase();
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setZoom(false)};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[]);
  const stage=active?.type==='video'?<video key={active.url} src={active.url} controls playsInline preload="metadata" poster={media.find((m:any)=>m.type==='image')?.url}/>:active?<img key={active.url} src={active.url} alt={p.name}/>:<GlassesArt variant={p.has_camera?'camera':'smart'}/>;
  return <div className="pd">
    <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">Home</Link><Icon name="chevronRight" size={14}/><Link href="/shop">Shop</Link><Icon name="chevronRight" size={14}/><Link href={`/shop?category=${p.category_slug}`}>{p.category_name||p.category_slug}</Link><Icon name="chevronRight" size={14}/><span>{p.name}</span></nav>
    <div className="pd-top">
      <section className="pd-gallery" aria-label="Product media">
        <div className="pd-thumbs">{(media.length?media:[{type:'none'}]).map((m:any,i:number)=><button type="button" key={i} className={sel===i?'on':''} aria-label={`Show ${m.type} ${i+1}`} onClick={()=>setSel(i)}>
          {m.type==='video'?<span className="vthumb">{media.find((x:any)=>x.type==='image')?<img src={media.find((x:any)=>x.type==='image').url} alt=""/>:null}<i><Icon name="play" size={14} fill="currentColor"/></i></span>:m.type==='image'?<img src={m.url} alt="" loading="lazy"/>:<GlassesArt/>}
        </button>)}</div>
        <div className="pd-stage-col">
          <div className="pd-stage">
            {(p.new_collection||p.badge)&&<span className="pd-badge">{p.new_collection?'New Collection':p.badge}</span>}
            {active?.type!=='video'&&active&&<button type="button" className="pd-expand" aria-label="View full screen" onClick={()=>setZoom(true)}><Icon name="expand" size={18}/></button>}
            {stage}
          </div>
          {media.length>1&&<div className="pd-dots">{media.map((_:any,i:number)=><button key={i} aria-label={`Slide ${i+1}`} className={sel===i?'on':''} onClick={()=>setSel(i)}/>)}</div>}
        </div>
      </section>
      <section className="pd-info">
        {catLabel&&<div className="pd-cat">{catLabel}</div>}
        <h1>{p.name}</h1>
        <button type="button" className="pd-rate" onClick={()=>goTab('Reviews')} aria-label="See the reviews">{Number(p.review_count)>0&&<><Stars value={p.rating} size={18}/><span><b>{p.rating}</b> ({p.review_count} Reviews)</span></>}{Number(p.sold_count)>0&&<span className="pd-sold">{p.sold_count} Sold</span>}</button>
        <div className="pd-meta">{p.brand_name&&<span>Brand: {p.brand_name}</span>}{p.model&&<span>Model: {p.model}</span>}{p.sku&&<span>SKU: {p.sku}</span>}</div>
        <div className="pd-price"><b>৳ {price.toLocaleString('en-IN')}</b>{off>0&&<><del>৳ {Number(p.price).toLocaleString('en-IN')}</del><span className="off"><Icon name="flame" size={16} stroke={2.2}/>{off}% OFF</span></>}</div>
        {(save>0||cpSave>0||digSave>0)&&<div className="pd-savebox">
          {save>0&&<p className="pd-sb-now">🎉 এখনই ছাড় <b>৳ {save.toLocaleString('en-IN')}</b></p>}
          {(cpSave>0||digSave>0)&&<><p className="pd-sb-more">আরো কমাতে চান?</p><ul>
            {cpSave>0&&<li><span>🎁 Coupon <small>checkout-এ নিজে থেকে লাগবে</small></span><b>−৳ {cpSave.toLocaleString('en-IN')}</b></li>}
            {digSave>0&&<li><span>💳 বিকাশ / নগদে আগে পেমেন্ট</span><b>−৳ {digSave.toLocaleString('en-IN')}</b></li>}
          </ul><p className="pd-sb-min">সর্বনিম্ন দাম <b>৳ {(price-cpSave-digSave).toLocaleString('en-IN')}</b></p></>}
        </div>}
        <div className={'pd-stock'+(p.stock>0?'':' out')}><span><i><Icon name={p.stock>0?'check':'info'} size={14} stroke={3}/></i>{p.stock>0?<>In Stock: {p.stock} pcs</>:'Currently out of stock'}</span>{(p.compare_note||p.sku)&&<small>{p.compare_note||p.sku}</small>}</div>
        {p.stock>0&&<ul className="pd-trust" aria-label="Why order from EMXIN">
          <li><Icon name="truck" size={17}/><span><b>Cash on Delivery</b> · পণ্য হাতে পেয়ে টাকা দিন</span></li>
          <li><Icon name="badgeCheck" size={17}/><span><b>100% Original</b> · অর্ডার পাওয়ার পর আমরা ফোনে কথা বলে অর্ডার নিশ্চিত করি</span></li>
          <li><Icon name="box" size={17}/><span><b>Fast delivery</b><span className="pd-dl"><span>Inside Dhaka <b>৳ {delivery.dhaka}</b> · {delivery.dhakaDays||'1–2'} days</span><span>Outside Dhaka <b>৳ {delivery.outside}</b> · {delivery.outsideDays||'2–3'} days</span></span></span></li>
        </ul>}
        <PurchaseOptions product={p} cap={retailCap} bulk={bulkThreshold} days={`${String(delivery.dhakaDays||'1–2').split('–')[0]}–${String(delivery.outsideDays||'2–3').split('–').pop()}`}/>
        <div className="pd-ask"><span>প্রশ্ন আছে?</span>
          {waLink(links?.whatsapp)&&<a className="pd-ask-wa" href={waLink(links.whatsapp,`Hi EMXIN, I have a question about ${p.name}: https://tech.emxin.com/product/${p.slug}`)} target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>WhatsApp</a>}
          <a className="pd-ask-msg" href={links?.messenger_url||'https://m.me/emxintechnologies'} target="_blank" rel="noopener"><MessengerLogo size={18}/>Messenger</a>
          {links?.support_phone&&<a className="pd-ask-call" href={'tel:'+links.support_phone}><Icon name="phone" size={17}/>Call</a>}
        </div>
        <button type="button" className="pd-dealer-link" onClick={()=>setDrawer(true)}><Icon name="handshake" size={18}/><span><b>Order {bulkThreshold}+ pcs?</b> {dealerPercent>0?(dealerFixed?`Dealer price: ${dealerPercent}% off`:`Become a dealer & get extra ${dealerPercent}% off`):'Ask for a bulk price'}</span><Icon name="chevronRight" size={16}/></button>
        <div className="pd-assure"><span><Icon name="shieldPlain" size={22} stroke={1.6}/><b>Product<br/>Support</b></span><span><Icon name="badgeCheck" size={22} stroke={1.6}/><b>100%<br/>Genuine</b></span><Link href="/delivery"><Icon name="truck" size={22} stroke={1.6}/><b>Fast<br/>Delivery</b></Link><Link href="/payments"><Icon name="secure" size={22} stroke={1.6}/><b>Secure<br/>Payment</b></Link></div>
      </section>
      {/* left column under the photos on a computer, after the buy box on a phone: what helps to decide */}
      <aside className="pd-side">
        {features.length>0&&<section className="pd-side-box pd-feats-wrap"><h3>Key features</h3>
          <div className="pd-feats" role="tablist" aria-label="Key features">{features.map((f,i)=><button type="button" role="tab" aria-selected={feat===i} key={i} className={feat===i?'on':''} onClick={()=>setFeat(i)} onMouseEnter={()=>setFeat(i)} onFocus={()=>setFeat(i)}><i><Icon name={featureIcon(f.full)} size={22} stroke={1.7}/></i><span>{f.title}</span></button>)}</div>
          {features[feat]?.detail&&<div className="pd-feat-detail" key={feat} role="tabpanel"><Icon name={featureIcon(features[feat].full)} size={18} stroke={2}/><p><b>{features[feat].title}</b><span>{features[feat].detail}</span></p></div>}
        </section>}
        {specs.length>0&&<section className="pd-side-box"><h3>Quick specs</h3><dl className="pd-qspec">{specs.filter(x=>x.label).slice(0,6).map((x,i)=><div key={i}><dt>{x.label}</dt><dd>{x.value}</dd></div>)}</dl>
          <button type="button" className="pd-more" onClick={()=>goTab('Specifications')}>See all specifications →</button></section>}
        {Number(p.review_count)>0&&<ReviewPeek p={p} onAll={()=>goTab('Reviews')}/>}
        {faq.length>0&&<section className="pd-side-box"><h3>Common questions</h3>{faq.map((x:any,i:number)=><details key={i} className="pd-faq"><summary>{x.question}</summary><p>{x.answer}</p></details>)}</section>}
      </aside>
    </div>
    <div className="pd-tabs" role="tablist" ref={tabsRef}>{TABS.map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}{t==='Reviews'?` (${Number(p.review_count)||0})`:''}</button>)}</div>
    <section className="pd-panel" role="tabpanel">
      {tab==='Product Details'&&<div className="pd-overview"><div><h2>Product Overview</h2><p>{p.description||'Product description will be added soon.'}</p>{(p.features||[]).length>0&&<ul className="checks">{(p.highlights?.length?p.highlights:p.features).map((f:string,i:number)=>{const x=parseFeature(f);return <li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{x.detail&&x.detail!==x.full?<span><b>{x.title}</b> — {x.detail}</span>:f}</li>})}</ul>}</div>
        <img className="pd-promo" src={p.promo_image_url||defaultBanner||'/branding/emxin-see-more-do-more.png'} alt={p.promo_image_url||defaultBanner?`${p.name} banner`:'See More. Do More. Hands-Free.'} loading="lazy" decoding="async"/></div>}
      {tab==='Specifications'&&<><h2>Specifications</h2>{specs.length?<dl className="spec">{specs.map((x,i)=><div key={i} className={x.label?'':'full'}>{x.label&&<dt><i><Icon name={specIcon(x.label)} size={16} stroke={1.8}/></i>{x.label}</dt>}<dd>{x.value}</dd></div>)}</dl>:<p className="muted">Specifications will be updated by EMXIN.</p>}</>}
      {tab==="What's in the Box"&&<><h2>What's in the Box</h2>{p.box_contents?.length?<ul className="checks">{p.box_contents.map((x:string,i:number)=><li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{x}</li>)}</ul>:<p className="muted">Package contents will be updated by EMXIN.</p>}</>}
      {tab==='Reviews'&&<Reviews product={p}/>}
      {tab==='Q&A'&&<Questions product={p}/>}
    </section>
    {zoom&&active&&<div className="modal-bg" role="dialog" aria-modal="true" onClick={()=>setZoom(false)}><button className="modal-x" aria-label="Close"><Icon name="close"/></button><img className="zoom-img" src={active.url} alt={p.name}/></div>}
    <QuantityRequest product={p} open={drawer} onClose={()=>setDrawer(false)} dealerPercent={dealerPercent} dealerTiers={dealerTiers} dealerFixed={dealerFixed} bulkThreshold={bulkThreshold}/>
  </div>;
}
