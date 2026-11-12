'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import Icon,{featureIcon} from '@/components/Icon';
import Stars from '@/components/Stars';
import GlassesArt from '@/components/GlassesArt';
import PurchaseOptions from './PurchaseOptions';
import QuantityRequest from './QuantityRequest';
import {Reviews,Questions} from './Community';

const TABS=['Product Details','Specifications',"What's in the Box",'Reviews','Q&A'] as const;
export default function ProductDetails({product:p,bulkThreshold=20,dealerPercent=5,defaultBanner=''}:{product:any;bulkThreshold?:number;dealerPercent?:number;defaultBanner?:string}){
  const media=useMemo(()=>{const m=p.media?.length?p.media:[...(p.images||[]).map((url:string)=>({url,type:'image'})),...(p.video_url?[{url:p.video_url,type:'video'}]:[])];return m.filter((x:any)=>x?.url)},[p]);
  const[sel,setSel]=useState(()=>Math.max(0,media.findIndex((m:any)=>m.type==='image')));
  const[tab,setTab]=useState<typeof TABS[number]>('Product Details');
  const[zoom,setZoom]=useState(false);
  const[drawer,setDrawer]=useState(false);
  const active=media[sel];
  const price=Number(p.sale_price||p.price||0);
  const off=p.sale_price&&Number(p.price)>price?Math.round((1-price/Number(p.price))*100):0;
  const catLabel=[(p.category_name||p.category_slug||'').replaceAll('-',' '),p.has_camera?'with camera':''].filter(Boolean).join(' • ').toUpperCase();
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
        <div className="pd-cat">{catLabel}</div>
        <h1>{p.name}</h1>
        <div className="pd-rate">{Number(p.review_count)>0&&<><Stars value={p.rating} size={18}/><span><b>{p.rating}</b> ({p.review_count} Reviews)</span></>}{Number(p.sold_count)>0&&<span className="pd-sold">{p.sold_count} Sold</span>}</div>
        <div className="pd-meta">{p.brand_name&&<span>Brand: {p.brand_name}</span>}{p.model&&<span>Model: {p.model}</span>}{p.sku&&<span>SKU: {p.sku}</span>}</div>
        <div className="pd-price"><b>৳ {price.toLocaleString('en-IN')}</b>{off>0&&<><del>৳ {Number(p.price).toLocaleString('en-IN')}</del><span className="off">{off}% OFF</span></>}</div>
        <div className={'pd-stock'+(p.stock>0?'':' out')}><span><i><Icon name={p.stock>0?'check':'info'} size={14} stroke={3}/></i>{p.stock>0?<>In Stock: {p.stock} pcs</>:'Currently out of stock'}</span>{p.sku&&<small>{p.compare_note||p.sku}</small>}</div>
        {(p.features||[]).length>0&&<div className="pd-feats">{p.features.slice(0,5).map((f:string,i:number)=><div key={i}><Icon name={featureIcon(f)} size={24} stroke={1.6}/><span>{f}</span></div>)}</div>}
        <PurchaseOptions product={p}/>
        <button type="button" className="dealer-cta" onClick={()=>setDrawer(true)}>
          <span className="dealer-cta-ico"><Icon name="percent" size={22} stroke={2.4}/></span>
          <span><b>Order {bulkThreshold}+ pcs?</b><small>Become a Dealer & Get Extra {dealerPercent}% Discount</small></span>
          <Icon name="chevronRight" size={22} stroke={2.2}/>
        </button>
        <div className="pd-assure"><span><Icon name="shieldPlain" size={22} stroke={1.6}/><b>Product<br/>Support</b></span><Link href="/return-policy"><Icon name="returnArrow" size={22} stroke={1.6}/><b>Easy<br/>Return*</b></Link><Link href="/delivery"><Icon name="truck" size={22} stroke={1.6}/><b>Fast<br/>Delivery</b></Link><Link href="/payments"><Icon name="secure" size={22} stroke={1.6}/><b>Secure<br/>Payment</b></Link></div>
      </section>
    </div>
    <div className="pd-tabs" role="tablist">{TABS.map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}{t==='Reviews'?` (${Number(p.review_count)||0})`:''}</button>)}</div>
    <section className="pd-panel" role="tabpanel">
      {tab==='Product Details'&&<div className="pd-overview"><div><h2>Product Overview</h2><p>{p.description||'Product description will be added soon.'}</p>{(p.features||[]).length>0&&<ul className="checks">{(p.highlights?.length?p.highlights:p.features).map((f:string,i:number)=><li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{f}</li>)}</ul>}</div>
        <img className="pd-promo" src={p.promo_image_url||defaultBanner||'/branding/emxin-see-more-do-more.png'} alt="See More. Do More. Hands-Free." loading="lazy"/></div>}
      {tab==='Specifications'&&<><h2>Specifications</h2>{p.specifications?.length?<dl className="spec">{p.specifications.map((x:string,i:number)=>{const[k,...v]=x.split(':');return <div key={i}><dt>{v.length?k.trim():'Feature'}</dt><dd>{v.length?v.join(':').trim():k}</dd></div>})}</dl>:<p className="muted">Specifications will be updated by EMXIN.</p>}</>}
      {tab==="What's in the Box"&&<><h2>What's in the Box</h2>{p.box_contents?.length?<ul className="checks">{p.box_contents.map((x:string,i:number)=><li key={i}><i><Icon name="check" size={13} stroke={3.2}/></i>{x}</li>)}</ul>:<p className="muted">Package contents will be updated by EMXIN.</p>}</>}
      {tab==='Reviews'&&<Reviews product={p}/>}
      {tab==='Q&A'&&<Questions product={p}/>}
    </section>
    {zoom&&active&&<div className="modal-bg" role="dialog" aria-modal="true" onClick={()=>setZoom(false)}><button className="modal-x" aria-label="Close"><Icon name="close"/></button><img className="zoom-img" src={active.url} alt={p.name}/></div>}
    <QuantityRequest product={p} open={drawer} onClose={()=>setDrawer(false)} dealerPercent={dealerPercent} bulkThreshold={bulkThreshold}/>
  </div>;
}
