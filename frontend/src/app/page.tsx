import Link from 'next/link';
import {safeJSON,isHttp,firstImage} from '@/lib/api';
import ProductCard from '@/components/ProductCard';
import Icon from '@/components/Icon';
import GlassesArt from '@/components/GlassesArt';
import HeroVideo from '@/components/HeroVideo';
import PromoArt from '@/components/PromoArt';

const TRUST=[
  {icon:'truck',title:'Fast Delivery',text:'Across Bangladesh',href:'/delivery'},
  {icon:'shieldPlain',title:'Secure Payment',text:'bKash, Nagad, Card & Bank',href:'/payments'},
  {icon:'badgeCheck',title:'Genuine Products',text:'100% Original',href:'/contact'},
  {icon:'handshake',title:'Cash on Delivery',text:'Pay when you receive',href:'/payments'},
];
// Legacy section keys from earlier Homepage Builder versions map onto the new blocks.
const ALIAS:Record<string,string>={new_collection:'featured',best_sellers:'smart_products',hero:'',};
const DEFAULT_ORDER=['categories','featured','smart_products','promo'];
// Older saved trust rows promised "7 Days Return"; returns are conditional, so that item is swapped for COD.
const fixTrust=(t:any)=>/\d+\s*days?\s*return/i.test(t?.title||'')?TRUST[3]:t;

export default async function Home(){
  const d=await safeJSON<any>('/home',{});
  const hp=d.homepage||{};const h=hp.hero||{};
  const cats=(d.categories||[]).filter((c:any)=>c.show_on_home!==false);
  const featured:any[]=(d.featured?.length?d.featured:d.new_collection)||[];
  const all:any[]=d.products||featured;
  const heroImg=isHttp(h.image)?h.image:'';
  // Floating tag: the chosen product, else the product whose photo is the hero image, else (only when no hero image was uploaded) the first product.
  const pool=[...all,...featured];const hasImg=(p:any)=>[...(p.images||[]),...(p.media||[]).map((m:any)=>m?.url)].includes(heroImg);
  const heroProduct=(h.product_slug&&pool.find((p:any)=>p.slug===h.product_slug))||(heroImg?pool.find(hasImg):all[0]);
  let order:string[]=(Array.isArray(hp.sections)&&hp.sections.length?hp.sections:DEFAULT_ORDER).map((k:string)=>ALIAS[k]??k).filter(Boolean);
  // Fixed top of the page: hero → trust row → Shop by Category. The rest follows the Homepage Builder order.
  order=['categories',...order.filter((k,i)=>k!=='trust'&&k!=='categories'&&order.indexOf(k)===i)];
  const hidden:string[]=hp.hidden_sections||[];
  const trust=(hp.trust?.items?.length?hp.trust.items:TRUST).map(fixTrust);
  const soon=hp.coming_soon||{};
  const promo=hp.promo||{};

  const blocks:Record<string,React.ReactNode>={
    trust:<div className="wrap" key="trust"><section className="trust" aria-label="Why shop with EMXIN">{trust.map((t:any)=><Link href={t.href||'#'} key={t.title}><span className="trust-ico"><Icon name={t.icon||'badgeCheck'} size={24} stroke={1.7}/></span><span><b>{t.title}</b><small>{t.text}</small></span></Link>)}</section></div>,
    categories:cats.length?<section className="wrap block" key="categories"><div className="block-head"><h2 className="bar-title">{hp.category_section?.title||'Shop by Category'}</h2><Link className="view-all" href="/shop">View All <Icon name="arrowRight" size={18} stroke={2.2}/></Link></div>
      <div className="cat-grid">{cats.slice(0,hp.category_section?.limit||3).map((c:any)=>{const img=isHttp(c.thumbnail_url);const fit=c.image_fit||(/\.(png|svg|gif)(\?|$)/i.test(c.thumbnail_url||'')?'contain':'cover');return <Link className={'cat-tile'+(img&&fit==='cover'?' fit-cover':'')} key={c.slug} href={`/shop?category=${c.slug}`}>
        <div className="cat-img">{isHttp(c.thumbnail_url)?<img src={c.thumbnail_url} alt="" loading="lazy" decoding="async"/>:<GlassesArt variant={c.slug.includes('sun')?'sun':c.slug.includes('frame')?'frame':'camera'}/>}</div>
        <span className="cat-txt"><b>{c.name}</b><small>{c.subtitle||'Explore collection'}</small><em>Shop now <Icon name="arrowRight" size={15} stroke={2.2}/></em></span></Link>})}</div></section>:null,
    featured:featured.length?<section className="wrap block" key="featured"><div className="block-head"><h2 className="bar-title">{hp.featured_section?.title||'Featured Products / New Collection'}</h2><Link className="view-all" href="/new-collection">View All <Icon name="arrowRight" size={18} stroke={2.2}/></Link></div>
      <div className="pc-grid">{featured.slice(0,hp.featured_section?.limit||4).map((p:any)=><ProductCard key={p._id} p={p}/>)}</div></section>:null,
    smart_products:all.length?<section className="wrap block" key="smart"><div className="block-head"><div><h2>{hp.smart_section?.title||'Our Smart Products'}</h2><p className="muted">{hp.smart_section?.subtitle||'Innovative gadgets for a smarter tomorrow.'}</p></div><Link className="view-all sm" href="/shop">View All <Icon name="arrowRight" size={16}/></Link></div>
      <div className="smart-grid">{all.filter((p:any)=>p.category_slug==='smart-glasses'||p.has_camera!==undefined).slice(0,soon.enabled===false?3:2).map((p:any)=><ProductCard key={p._id} p={p} tag={p.has_camera?'With Camera':'Without Camera'}/>)}
        {soon.enabled!==false&&<Link href={soon.href||'/new-collection'} className="soon-card" style={isHttp(soon.image)?{backgroundImage:`linear-gradient(180deg,rgba(6,16,43,.15),rgba(6,16,43,.85)),url(${soon.image})`}:undefined}>
          <h3>{soon.title||'More Gadgets Coming Soon'}</h3><p>{soon.text||"Stay tuned. We're bringing more smart devices to make your life easier."}</p><span className="soon-btn">{soon.cta||'See Our Vision'} <Icon name="arrowRight" size={15}/></span>
          {!isHttp(soon.image)&&<div className="soon-art" aria-hidden="true"><Icon name="watch" size={92} stroke={1.1}/><Icon name="earbuds" size={56} stroke={1.2}/></div>}
        </Link>}</div></section>:null,
    promo:<section className="wrap block" key="promo"><Link href={promo.href||'/new-collection'} className="promo" style={isHttp(promo.image)?{backgroundImage:`linear-gradient(90deg,rgba(4,12,36,.92) 0%,rgba(4,12,36,.55) 55%,rgba(4,12,36,.1)),url(${promo.image})`}:undefined}>
      <div><h2>{promo.title&&promo.title!=='New Collection'?promo.title:<>Experience the Future<br/>with <span>EMXIN</span></>}</h2><p>{promo.subtitle&&promo.subtitle!=='Fresh arrivals from EMXIN'?promo.subtitle:'Innovation  |  Quality  |  Your Everyday Companion'}</p></div>
      {!isHttp(promo.image)&&<PromoArt/>}
    </Link></section>,
  };

  return <main className="home">
    <section className="hero-shell wrap"><div className="hero">
      <div className="hero-copy">
        <span className="pill">{h.eyebrow||'SMART GLASSES'}</span>
        <h1>{h.title&&h.title!=='Smart Gadgets. Smarter Living.'?h.title:<>Smart Gadgets.<br/><span>Smarter Living.</span></>}</h1>
        <p>{h.subtitle&&h.subtitle!=='Discover smart eyewear, sunglasses and frames.'?h.subtitle:'AI-powered smart glasses, earbuds, smart watch and more. Stay connected, productive and free — anywhere, anytime.'}</p>
        <div className="hero-cta"><Link className="btn btn-lg" href={h.cta_href||'/shop'}>{h.cta||'Shop Now'} <Icon name="arrowRight" size={18} stroke={2.2}/></Link>{h.secondary_cta&&<Link className="btn btn-lg btn-ghost" href={h.secondary_href||'/new-collection'}>{h.secondary_cta}</Link>}</div>
      </div>
      <div className={'hero-media fit-'+(['contain','cover'].includes(h.fit_mode)?h.fit_mode:'contain')}>
        {heroImg?<img src={heroImg} alt={h.image_alt||heroProduct?.name||'EMXIN smart glasses'} fetchPriority="high" decoding="async"/>:firstImage(heroProduct)?<img src={firstImage(heroProduct)} alt={heroProduct.name}/>:<GlassesArt variant="camera"/>}
        {heroProduct&&h.show_tag!==false&&<Link href={`/product/${heroProduct.slug}`} className="hero-tag"><b>{h.tag_title||heroProduct.name}</b><small>{h.tag_text||(heroProduct.has_camera?'With Camera':heroProduct.subtitle||'')}</small></Link>}
        {isHttp(h.video_url)&&<HeroVideo src={h.video_url}/>}
      </div>
    </div></section>
    {!hidden.includes('trust')&&blocks.trust}
    {order.filter(k=>!hidden.includes(k)).map(k=>blocks[k]??null)}
  </main>;
}
