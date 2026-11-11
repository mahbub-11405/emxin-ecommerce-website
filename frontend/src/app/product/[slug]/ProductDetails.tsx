'use client';
import {useMemo,useState} from 'react';
import PurchaseOptions from './PurchaseOptions';
import QuantityRequest from './QuantityRequest';

const tabs=['Product Details','Specifications',"What's in the Box",'Reviews','Q&A'];
const featureIcons=['◉','✧','⌁','♩','▣','⌖','⌁'];
export default function ProductDetails({product:p}:{product:any}){
 const media=useMemo(()=>p.media?.length?p.media:[...(p.images||[]).map((url:string)=>({url,type:'image'})),...(p.video_url?[{url:p.video_url,type:'video'}]:[])],[p]);
 const [selected,setSelected]=useState(()=>Math.max(0,media.findIndex((m:any)=>m.type==='image'))),[tab,setTab]=useState(tabs[0]);
 const active=media[selected];
 const price=Number(p.sale_price||p.price||0);
 return <div className="emxin-product">
  <nav className="emxin-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span><a href="/shop">Shop</a><span>›</span><a href={`/shop?category=${p.category_slug}`}>{p.category_slug?.replaceAll('-',' ')}</a><span>›</span><b>{p.name}</b></nav>
  <div className="emxin-product-top">
   <section className="emxin-gallery" aria-label="Product media gallery">
    <div className="emxin-thumbs">{media.map((m:any,i:number)=><button type="button" aria-label={`View ${m.type} ${i+1}`} aria-pressed={selected===i} className={selected===i?'selected':''} key={`${m.url}-${i}`} onClick={()=>setSelected(i)}>{m.type==='video'?<span className="emxin-video-thumb">▶</span>:<img src={m.url} alt={`${p.name} thumbnail ${i+1}`} loading="lazy"/>}</button>)}</div>
    <div className="emxin-gallery-stage">{active?.type==='video'?<video key={active.url} src={active.url} controls playsInline preload="metadata"/>:active?<img key={active.url} src={active.url} alt={p.name} fetchPriority="high"/>:<div className="emxin-no-image">Product image not uploaded yet</div>}
     {(p.new_collection||p.featured)&&<span className="emxin-photo-badge">{p.new_collection?'New Collection':'Featured'}</span>}
    </div>
    {media.length>1&&<div className="emxin-gallery-count">{String(selected+1).padStart(2,'0')} <span>/ {String(media.length).padStart(2,'0')}</span></div>}
   </section>
   <section className="emxin-product-info">
    <div className="emxin-category-label">{p.category_slug?.replaceAll('-',' ').toUpperCase()}</div>
    <h1>{p.name}</h1>
    {Number(p.review_count)>0&&<div className="emxin-rating"><span>★★★★★</span> <b>{p.rating||'4.9'}</b> ({p.review_count} Reviews){p.sold_count?<>　|　{p.sold_count} Sold</>:null}</div>}
    {(p.brand_slug||p.model||p.sku)&&<div className="emxin-product-meta">{p.brand_slug&&<>Brand: <b>{p.brand_name||p.brand_slug.toUpperCase()}</b></>}{p.model&&<>　|　Model: <b>{p.model}</b></>}{p.sku&&<>　|　SKU: <b>{p.sku}</b></>}</div>}
    <div className="emxin-price">৳ {price.toLocaleString('en-BD')}{p.sale_price&&<><del>৳ {Number(p.price).toLocaleString('en-BD')}</del><span className="emxin-discount">{Math.max(1,Math.round((1-price/Number(p.price))*100))}% OFF</span></>}</div>
    <div className={`emxin-stock ${p.stock>0?'':'out'}`}><span>{p.stock>0?'✓':'!'}</span>{p.stock>0?`In Stock: ${p.stock} pcs`:'Currently unavailable'}</div>
    {(p.features||[]).length>0&&<div className="emxin-feature-grid">{p.features.slice(0,5).map((x:string,i:number)=><div className="emxin-feature-card" key={`${x}-${i}`}><span>{featureIcons[i%featureIcons.length]}</span><b>{x}</b></div>)}</div>}
    <PurchaseOptions product={p}/>
    <QuantityRequest product={p}/>
    <div className="emxin-assurance"><span>♧ <b>Product Support</b></span><span>↻ <b>Easy Return*</b></span><span>▱ <b>Fast Delivery</b></span><span>▣ <b>Secure Payment</b></span></div>
   </section>
  </div>
  <div className="emxin-tabs" role="tablist" aria-label="Product information">{tabs.map(x=><button type="button" role="tab" aria-selected={tab===x} className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x}{x==='Reviews'&&Number(p.review_count)>0?` (${p.review_count})`:''}</button>)}</div>
  <section className="emxin-tab-panel" role="tabpanel">
   {tab==='Product Details'&&<div className="emxin-overview"><div><h2>Product Overview</h2><p>{p.description||'Product description will be added soon.'}</p>{(p.features||[]).length>0&&<ul className="emxin-check-list">{p.features.map((f:string,i:number)=><li key={i}><span>✓</span>{f}</li>)}</ul>}</div><img className="emxin-promo-image" src="/branding/emxin-see-more-do-more.png" alt="See More. Do More. Hands-Free. — EMXIN Smart Living" loading="lazy"/></div>}
   {tab==='Specifications'&&<><h2>Specifications</h2>{p.specifications?.length?<dl className="emxin-spec-list">{p.specifications.map((x:string,i:number)=>{const [k,...v]=x.split(':');return <div key={i}><dt>{v.length?k:'Specification'}</dt><dd>{v.length?v.join(':').trim():k}</dd></div>})}</dl>:<p>Specifications will be updated by EMXIN.</p>}</>}
   {tab==="What's in the Box"&&<><h2>What's in the Box</h2>{p.box_contents?.length?<ul className="emxin-box-list">{p.box_contents.map((x:string,i:number)=><li key={i}>✓ {x}</li>)}</ul>:<p>Package contents will be updated by EMXIN.</p>}</>}
   {tab==='Reviews'&&<><h2>Customer Reviews</h2><p>{p.review_count||0} reviews. Verified customer reviews will appear here when available.</p></>}
   {tab==='Q&A'&&<><h2>Questions & Answers</h2>{p.faq?.length?p.faq.map((x:any,i:number)=><details key={i}><summary>{x.question}</summary><p>{x.answer}</p></details>):<p>No questions have been published yet.</p>}</>}
  </section>
 </div>
}
