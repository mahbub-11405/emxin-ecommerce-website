'use client';
import {ImageInput,Field} from './ui';

const STORE=(process.env.NEXT_PUBLIC_STORE_URL||'https://tech.emxin.com').replace(/\/+$/,'');
const host=STORE.replace(/^https?:\/\//,'');
/** Homepage Builder → Branding: every logo in one place, each with a preview of where it shows.
 *  Empty = the built-in EMXIN default (full EMXIN logo in the header, the "E" icon as favicon). */
export default function BrandingEditor({data,setData}:{data:any;setData:(f:(v:any)=>any)=>void}){
  const b=data.branding||{};
  const set=(f:string,v:any)=>setData((x:any)=>({...x,branding:{...(x.branding||{}),[f]:v}}));
  const setLink=(f:string,v:any)=>setData((x:any)=>({...x,links:{...(x.links||{}),[f]:v}}));
  const header=b.logo_url||STORE+'/branding/emxin-logo-light.png';
  const footer=b.logo_dark_url||STORE+'/branding/emxin-logo-dark.png';
  const icon=b.favicon_url||STORE+'/icon-192.png';
  return <div className="brand-ed">
    <section className="panel brand-card">
      <div className="brand-h"><h2>1 · Site icon (favicon)</h2><span className="badge">Google search · browser tab</span></div>
      <p className="muted">The small square icon next to your site in <b>Google search results</b>, on the <b>browser tab</b> and on bookmarks. {b.favicon_url?'Your uploaded icon is used.':<>Now: the EMXIN <b>“E”</b> icon (default).</>}</p>
      <div className="brand-prev">
        <div className="gserp"><span className="gserp-ic"><img src={icon} alt=""/></span><span><b>EMXIN Technologies</b><small>{STORE}</small></span></div>
        <div className="gtab"><img src={icon} alt=""/><span>EMXIN Technologies – Smart…</span><i>×</i></div>
      </div>
      <ImageInput label="Upload a different icon (optional)" folder="branding/favicon" value={b.favicon_url||''} onChange={u=>set('favicon_url',u)}/>
      <ul className="tiny muted brand-tips"><li><b>Square</b> PNG, best 512 × 512 px (at least 48 × 48). Keep a little space around the mark: Google shows it in a small circle.</li>
        <li>Google updates this icon on its own schedule (a few days to 2–3 weeks). Until then it may show a grey globe. After publishing, open Search Console → URL inspection → <code>{STORE}/</code> → <b>Request indexing</b> to speed it up.</li>
        <li>Check it: <a href={STORE+'/favicon.ico'} target="_blank" rel="noopener">{host}/favicon.ico</a> should show just this icon.</li></ul>
      {b.favicon_url&&<button type="button" className="btn btn-sm btn-ghost" onClick={()=>set('favicon_url','')}>Use the default “E” icon again</button>}
    </section>

    <section className="panel brand-card">
      <div className="brand-h"><h2>2 · Header logo</h2><span className="badge">top of every page</span></div>
      <p className="muted">The full logo with the name, on a white background. Use the wide <b>EMXIN TECHNOLOGIES</b> logo here (not the square “E” icon: new visitors need to read the name).</p>
      <div className="brand-prev light"><img src={header} alt="Header logo"/></div>
      <ImageInput label="Upload header logo" folder="branding/header-logo" value={b.logo_url||''} onChange={u=>set('logo_url',u)}/>
      {b.logo_url&&<button type="button" className="btn btn-sm btn-ghost" onClick={()=>set('logo_url','')}>Use the default EMXIN logo again</button>}
    </section>

    <section className="panel brand-card">
      <div className="brand-h"><h2>3 · Footer logo</h2><span className="badge">dark footer</span></div>
      <p className="muted">The same full logo in light colours, for the dark footer.</p>
      <div className="brand-prev dark"><img src={footer} alt="Footer logo"/></div>
      <ImageInput label="Upload footer logo" folder="branding/footer-logo" value={b.logo_dark_url||''} onChange={u=>set('logo_dark_url',u)}/>
      {b.logo_dark_url&&<button type="button" className="btn btn-sm btn-ghost" onClick={()=>set('logo_dark_url','')}>Use the default again</button>}
    </section>

    <section className="panel brand-card">
      <div className="brand-h"><h2>4 · Default product banner</h2><span className="badge">product pages</span></div>
      <ImageInput label="“See More. Do More.” banner" folder="branding/product-banner" value={b.product_banner_url||''} onChange={u=>set('product_banner_url',u)}/>
      <Field label="Messenger / Support URL"><input value={data.links?.support_url||''} onChange={e=>setLink('support_url',e.target.value)}/></Field>
    </section>
    <p className="muted tiny">Changes go live after <b>Publish Homepage</b> (top right).</p>
  </div>;
}
