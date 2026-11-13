'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Icon,{featureIcon} from '@/components/Icon';
import Stars from '@/components/Stars';
import GlassesArt from '@/components/GlassesArt';
import PurchaseOptions from './PurchaseOptions';
import QuantityRequest from './QuantityRequest';
import {Reviews,Questions} from './Community';
import {parseSpecs,parseFeature,sameText} from '@/lib/productText';

const specIcon=(label:string)=>{const l=label.toLowerCase();if(/chip|processor|ram|storage|memory/.test(l))return 'cube';if(/compat|app/.test(l))return 'phone';if(/control|touch/.test(l))return 'bolt';if(/model|brand/.test(l))return 'glasses';const i=featureIcon(l);return i==='badgeCheck'?'info':i};

const TABS=['Product Details','Specifications',"What's in the Box",'Reviews','Q&A'] as const;
export default function ProductDetails({product:p,bulkThreshold=20,dealerPercent=5,dealerTiers=[],defaultBanner=''}:{product:any;bulkThreshold?:number;dealerPercent?:number;dealerTiers?:number[];defaultBanner?:string}){
  const media=useMemo(()=>{const m=p.media?.length?p.media:[...(p.images||[]).map((url:string)=>({url,type:'image'})),...(p.video_url?[{url:p.video_url,type:'video'}]:[])];return m.filter((x:any)=>x?.url)},[p]);
  const[sel,setSel]=useState(()=>Math.max(0,media.findIndex((m:any)=>m.type==='image')));
  const[tab,setTab]=useState<typeof TABS[number]>('Product Details');
  const[zoom,setZoom]=useState(false);
  const[drawer,setDrawer]=useState(false);
  const[feat,setFeat]=useState(0);
  const features=useMemo(()=>(p.features||[]).slice(0,5).map(parseFeature),[p]);
  const specs=useMemo(()=>parseSpecs(p.specifications),[p]);
  const active=media[sel];
  const price=Number(p.sale_price||p.price||0);
  const off=p.sale_price&&Number(p.price)>price?Math.round((1-price/Number(p.price))*100):0;
  const save=off>0?Number(p.price)-price:0;
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
        <div className="pd-rate">{Number(p.review_count)>0&&<><Stars value={p.rating} size={18}/><span><b>{p.rating}</b> ({p.review_count} Reviews)</span></>}{Number(p.sold_count)>0&&<span className="pd-sold">{p.sold_count} Sold</span>}</div>
        <div className="pd-meta">{p.brand_name&&<span>Brand: {p.brand_name}</span>}{p.model&&<span>Model: {p.model}</span>}{p.sku&&<span>SKU: {p.sku}</span>}</div>
        <div className="pd-price"><b>৳ {price.toLocaleString('en-IN')}</b>{off>0&&<><del>৳ {Number(p.price).toLocaleString('en-IN')}</del><span className="off"><Icon name="flame" size={16} stroke={2.2}/>{off}% OFF</span></>}</div>
        {save>0&&<div className="pd-save"><Icon name="percent" size={15} stroke={2.4}/>You save <b>৳ {save.toLocaleString('en-IN')}</b> on this order</div>}
        <div className={'pd-stock'+(p.stock>0?'':' out')}><span><i><Icon name={p.stock>0?'check':'info'} size={14} stroke={3}/></i>{p.stock>0?<>In Stock: {p.stock} pcs</>:'Currently out of stock'}</span>{(p.compare_note||p.sku)&&<small>{p.compare_note||p.sku}</small>}</div>
        {features.length>0&&<div className="pd-feats-wrap">
          <div className="pd-feats" role="tablist" aria-label="Key features">{features.map((f,i)=><button type="button" role="tab" aria-selected={feat===i} key={i} className={feat===i?'on':''} onClick={()=>setFeat(i)} onMouseEnter={()=>setFeat(i)} onFocus={()=>setFeat(i)}><i><Icon name={featureIcon(f.full)} size={22} stroke={1.7}/></i><span>{f.title}</span></button>)}</div>
          {features[feat]?.detail&&<div className="pd-feat-detail" key={feat} role="tabpanel"><Icon name={featureIcon(features[feat].full)} size={18} stroke={2}/><p><b>{features[feat].title}</b><span>{features[feat].detail}</span></p></div>}
        </div>}
        <PurchaseOptions product={p}/>
        <button type="button" className="dealer-cta" onClick={()=>setDrawer(true)}>
          <span className="dealer-cta-ico"><Icon name="percent" size={22} stroke={2.4}/></span>
          <span><b>Order {bulkThreshold}+ pcs?</b><small>Become a Dealer & Get Extra {dealerPercent}% Discount</small></span>
          <Icon name="chevronRight" size={22} stroke={2.2}/>
        </button>
        <div className="pd-assure"><span><Icon name="shieldPlain" size={22} stroke={1.6}/><b>Product<br/>Support</b></span><span><Icon name="badgeCheck" size={22} stroke={1.6}/><b>100%<br/>Genuine</b></span><Link href="/delivery"><Icon name="truck" size={22} stroke={1.6}/><b>Fast<br/>Delivery</b></Link><Link href="/payments"><Icon name="secure" size={22} stroke={1.6}/><b>Secure<br/>Payment</b></Link></div>
      </section>
    </div>
    <div className="pd-tabs" role="tablist">{TABS.map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}{t==='Reviews'?` (${Number(p.review_count)||0})`:''}</button>)}</div>
    <section className="pd-panel" role="tabpanel">
      {tab==='Product Details'&&<div className="pd-overview"><div><h2>Product Overview</h2><p>{p.description||'Product description will be added soon.'}</p>{(p.features||[]).length>0&&<ul className="checks">{(p.highlights?.length?p.highlights:p.features).map((f:string,i:number)=>{const x=parseFeature(f);return <li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{x.detail&&x.detail!==x.full?<span><b>{x.title}</b> — {x.detail}</span>:f}</li>})}</ul>}</div>
        <img className="pd-promo" src={p.promo_image_url||defaultBanner||'/branding/emxin-see-more-do-more.png'} alt="See More. Do More. Hands-Free." loading="lazy"/></div>}
      {tab==='Specifications'&&<><h2>Specifications</h2>{specs.length?<dl className="spec">{specs.map((x,i)=><div key={i} className={x.label?'':'full'}>{x.label&&<dt><i><Icon name={specIcon(x.label)} size={16} stroke={1.8}/></i>{x.label}</dt>}<dd>{x.value}</dd></div>)}</dl>:<p className="muted">Specifications will be updated by EMXIN.</p>}</>}
      {tab==="What's in the Box"&&<><h2>What's in the Box</h2>{p.box_contents?.length?<ul className="checks">{p.box_contents.map((x:string,i:number)=><li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{x}</li>)}</ul>:<p className="muted">Package contents will be updated by EMXIN.</p>}</>}
      {tab==='Reviews'&&<Reviews product={p}/>}
      {tab==='Q&A'&&<Questions product={p}/>}
    </section>
    {zoom&&active&&<div className="modal-bg" role="dialog" aria-modal="true" onClick={()=>setZoom(false)}><button className="modal-x" aria-label="Close"><Icon name="close"/></button><img className="zoom-img" src={active.url} alt={p.name}/></div>}
    <QuantityRequest product={p} open={drawer} onClose={()=>setDrawer(false)} dealerPercent={dealerPercent} dealerTiers={dealerTiers} bulkThreshold={bulkThreshold}/>
  </div>;
}
