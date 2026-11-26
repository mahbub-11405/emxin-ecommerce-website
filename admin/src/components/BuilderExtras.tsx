'use client';
import {Field,Toggle,ImageInput,NumInput} from './ui';
export const SECTION_KEYS=['trust','categories','featured','smart_products','promo'];
const LABEL:Record<string,string>={trust:'Trust row (delivery, payment, genuine, COD)',categories:'Shop by Category tiles',featured:'Featured Products / New Collection',smart_products:'Our Smart Products + Coming Soon card',promo:'“Experience the Future” promo banner'};
const ALIAS:Record<string,string>={new_collection:'featured',best_sellers:'smart_products'};
const STORE=(process.env.NEXT_PUBLIC_STORE_URL||'https://tech.emxin.com').replace(/\/+$/,'');
export function normalizeSections(s:any):string[]{const a=(Array.isArray(s)?s:[]).map((k:string)=>ALIAS[k]||k).filter((k:string)=>SECTION_KEYS.includes(k));const u=a.filter((k:string,i:number)=>a.indexOf(k)===i);return [...u,...SECTION_KEYS.filter(k=>!u.includes(k))]}
const DEFAULT_TRUST=[{icon:'truck',title:'Fast Delivery',text:'Across Bangladesh',href:'/delivery'},{icon:'shieldPlain',title:'Secure Payment',text:'bKash, Nagad, Card & Bank',href:'/payments'},{icon:'badgeCheck',title:'Genuine Products',text:'100% Original',href:'/contact'},{icon:'handshake',title:'Cash on Delivery',text:'Pay when you receive',href:'/payments'}];
const ICONS=['truck','shieldPlain','badgeCheck','returnArrow','headset','handshake','lockCard','secure','bolt','percent'];

export function SectionsEditor({data,setData}:{data:any;setData:(f:(v:any)=>any)=>void}){
  const order=normalizeSections(data.sections).filter(k=>k!=='trust'&&k!=='categories');const hidden:string[]=data.hidden_sections||[];
  const mv=(i:number,d:number)=>{const a=[...order];[a[i],a[i+d]]=[a[i+d],a[i]];setData((v:any)=>({...v,sections:a}))};
  const sub=(k:string,f:string,val:any)=>setData((v:any)=>({...v,[k]:{...(v[k]||{}),[f]:val}}));
  return <section className="panel"><h2>Homepage sections</h2><p className="muted">The top of the page is fixed: Hero → Trust row → Shop by Category. Reorder or hide the blocks below them, then Publish.</p>
    {(['trust','categories'] as const).map(k=><div className="em-section" key={k}><strong>Fixed · {LABEL[k]}</strong><Toggle checked={!hidden.includes(k)} onChange={on=>setData((v:any)=>({...v,hidden_sections:on?(v.hidden_sections||[]).filter((x:string)=>x!==k):[...(v.hidden_sections||[]),k]}))} label="Visible"/></div>)}
    {order.map((k,i)=><div className="em-section" key={k}><strong>{i+1}. {LABEL[k]}</strong><Toggle checked={!hidden.includes(k)} onChange={on=>setData((v:any)=>({...v,sections:order,hidden_sections:on?(v.hidden_sections||[]).filter((x:string)=>x!==k):[...(v.hidden_sections||[]),k]}))} label="Visible"/><button disabled={i===0} onClick={()=>mv(i,-1)}>↑</button><button disabled={i===order.length-1} onClick={()=>mv(i,1)}>↓</button></div>)}
    <h3 style={{marginTop:22}}>Section titles</h3><div className="fgrid">
      <Field label="Category section title"><input value={data.category_section?.title||''} placeholder="Shop by Category" onChange={e=>sub('category_section','title',e.target.value)}/></Field>
      <Field label="Number of category tiles"><NumInput min={1} max={6} empty={3} value={data.category_section?.limit||3} onChange={n=>sub('category_section','limit',n)}/></Field>
      <Field label="Product order (homepage & shop)" hint="Manual uses each product's Sort order (Products → Display): 1 first, 2 second… Products left at 0 come after, cheapest first."><select value={data.product_sort||'price_asc'} onChange={e=>setData((v:any)=>({...v,product_sort:e.target.value}))}><option value="price_asc">Price: low → high</option><option value="price_desc">Price: high → low</option><option value="manual">Manual (Sort order)</option><option value="newest">Newest first</option></select></Field>
      <Field label="Featured section title"><input value={data.featured_section?.title||''} placeholder="Featured Products / New Collection" onChange={e=>sub('featured_section','title',e.target.value)}/></Field>
      <Field label="Featured products shown"><NumInput min={1} max={8} empty={4} value={data.featured_section?.limit||4} onChange={n=>sub('featured_section','limit',n)}/></Field>
      <Field label="Smart products title"><input value={data.smart_section?.title||''} placeholder="Our Smart Products" onChange={e=>sub('smart_section','title',e.target.value)}/></Field>
      <Field label="Smart products subtitle"><input value={data.smart_section?.subtitle||''} placeholder="Innovative gadgets for a smarter tomorrow." onChange={e=>sub('smart_section','subtitle',e.target.value)}/></Field>
    </div><p className="em-hint">Which products appear is controlled per product: tick <b>Featured on homepage</b> and set <b>Sort order</b> in Products.</p></section>;
}

export function ExtrasEditor({data,setData}:{data:any;setData:(f:(v:any)=>any)=>void}){
  const trust=(data.trust?.items?.length?data.trust.items:DEFAULT_TRUST).map((t:any)=>/\d+\s*days?\s*return/i.test(t?.title||'')?DEFAULT_TRUST[3]:t);
  const setTrust=(i:number,f:string,val:string)=>setData((v:any)=>({...v,trust:{...(v.trust||{}),items:trust.map((t:any,j:number)=>j===i?{...t,[f]:val}:t)}}));
  const sub=(k:string,f:string,val:any)=>setData((v:any)=>({...v,[k]:{...(v[k]||{}),[f]:val}}));
  const cs=data.coming_soon||{};const an=data.announcement||{};const h=data.hero||{};
  return <div className="stack">
    <section className="panel"><h2>Hero extras</h2><div className="fgrid">
      <Field label="Small pill text"><input value={h.eyebrow||''} placeholder="SMART GLASSES" onChange={e=>sub('hero','eyebrow',e.target.value)}/></Field>
      <Field label="Button link"><input value={h.cta_href||''} placeholder="/shop" onChange={e=>sub('hero','cta_href',e.target.value)}/></Field>
      <Field label="Second button label (optional)"><input value={h.secondary_cta||''} onChange={e=>sub('hero','secondary_cta',e.target.value)}/></Field>
      <Field label="Second button link"><input value={h.secondary_href||''} placeholder="/new-collection" onChange={e=>sub('hero','secondary_href',e.target.value)}/></Field>
      <div className="span"><ImageInput kind="video" label="“Watch Video” (MP4 uploaded to S3 — empty hides the button)" folder="homepage/hero-video" value={h.video_url||''} onChange={u=>sub('hero','video_url',u)}/></div>
      <Field label="Floating tag product slug" hint="e.g. aimb-g2-pro — empty = the product whose photo is the hero image (new products no longer take over the tag)"><input value={h.product_slug||''} onChange={e=>sub('hero','product_slug',e.target.value)}/></Field>
      <Field label="Tag title"><input value={h.tag_title||''} placeholder="AIMB G2 Pro" onChange={e=>sub('hero','tag_title',e.target.value)}/></Field>
      <Field label="Tag text"><input value={h.tag_text||''} placeholder="With Camera" onChange={e=>sub('hero','tag_text',e.target.value)}/></Field>
      <div className="span"><Toggle checked={h.show_tag!==false} onChange={v=>sub('hero','show_tag',v)} label="Show floating product tag"/></div></div></section>
    <section className="panel"><h2>Trust row</h2><p className="em-hint">Shown directly under the hero. Avoid promises you can't always keep (e.g. unconditional returns).</p>{trust.map((t:any,i:number)=><div className="fgrid" key={i} style={{marginBottom:10}}>
      <Field label={`Item ${i+1} title`}><input value={t.title} onChange={e=>setTrust(i,'title',e.target.value)}/></Field><Field label="Subtitle"><input value={t.text} onChange={e=>setTrust(i,'text',e.target.value)}/></Field>
      <Field label="Icon"><select value={t.icon} onChange={e=>setTrust(i,'icon',e.target.value)}>{ICONS.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Link"><input value={t.href} onChange={e=>setTrust(i,'href',e.target.value)}/></Field></div>)}</section>
    <section className="panel"><h2>“More Gadgets Coming Soon” card</h2><Toggle checked={cs.enabled!==false} onChange={v=>sub('coming_soon','enabled',v)} label="Show card"/><div className="fgrid" style={{marginTop:12}}>
      <Field label="Title"><input value={cs.title||''} placeholder="More Gadgets Coming Soon" onChange={e=>sub('coming_soon','title',e.target.value)}/></Field><Field label="Button label"><input value={cs.cta||''} placeholder="See Our Vision" onChange={e=>sub('coming_soon','cta',e.target.value)}/></Field>
      <Field label="Text" span><input value={cs.text||''} onChange={e=>sub('coming_soon','text',e.target.value)}/></Field><Field label="Link"><input value={cs.href||''} placeholder="/new-collection" onChange={e=>sub('coming_soon','href',e.target.value)}/></Field></div>
      <ImageInput label="Background image" folder="homepage/coming-soon" value={cs.image||''} onChange={u=>sub('coming_soon','image',u)}/></section>
    <section className="panel" id="seo"><h2>Search engines & sharing (SEO)</h2><div className="fgrid"><Field label="Website title" hint="Shown in Google and the browser tab"><input value={data.seo?.title||''} placeholder="EMXIN Technologies — Smart Gadgets. Smarter Living." onChange={e=>sub('seo','title',e.target.value)}/></Field>
      <Field label="Description" hint="About 150 characters"><input value={data.seo?.description||''} maxLength={200} onChange={e=>sub('seo','description',e.target.value)}/></Field></div>
      <div className="fgrid" style={{marginTop:12}}><Field label="Keywords" span hint="Comma separated, e.g. smart glasses bangladesh, AIMB G2 Pro price in BD, camera glasses. Google mostly reads page text, so also use these words in product descriptions."><input value={data.seo?.keywords||''} onChange={e=>sub('seo','keywords',e.target.value)}/></Field>
      <Field label="Google Search Console verification" hint="Search Console → Add property → URL prefix → HTML tag. Paste the code or the whole <meta …> tag."><input value={data.seo?.google_verification||''} placeholder="abc123XYZ…" onChange={e=>sub('seo','google_verification',e.target.value)}/></Field></div>
      <ImageInput label="Share image (Facebook / WhatsApp preview, 1200×630)" folder="branding/share-image" value={data.seo?.image||''} onChange={u=>sub('seo','image',u)}/>
      <p className="em-hint">Submit these in Google Search Console → Sitemaps: <b>{STORE}/sitemap.xml</b>. Every product page already tells Google its price, stock, pictures, brand and FAQ.</p></section>
    <section className="panel" id="facebook-ads"><h2>Facebook ads (Meta Pixel)</h2><p className="em-hint">Counts visits, product views, add to cart, checkout and orders from your Facebook / Instagram ads, so Facebook can show your ads to people who buy. Leave empty to switch it off.</p>
      <div className="fgrid"><Field label="Pixel / Dataset ID" hint="Events Manager → Data sources → your Pixel → the number under its name (numbers only)"><input inputMode="numeric" value={data.tracking?.meta_pixel_id||''} placeholder="123456789012345" onChange={e=>sub('tracking','meta_pixel_id',e.target.value.replace(/\D/g,''))}/></Field>
      <Field label="Domain verification code" hint="Business Settings → Brand safety → Domains → Add → Meta-tag. Paste only the content code."><input value={data.tracking?.facebook_domain_verification||''} onChange={e=>sub('tracking','facebook_domain_verification',e.target.value.replace(/.*content=["']?|["'].*$/g,''))}/></Field></div>
      <p className="em-hint"><b>Conversions API</b> (counts orders even when the browser blocks the Pixel): the access token goes only in the server <b>.env</b> as <code>META_CAPI_TOKEN</code>, never here.<br/>
      <b>Product catalog</b> for dynamic ads and the Facebook / Instagram shop: Commerce Manager → Catalog → Data sources → Data feed → scheduled feed URL <b>{STORE}/product-feed.csv</b> (also works in Google Merchant Center).</p></section>
    <section className="panel"><h2>Announcement bar</h2><Toggle checked={!!an.enabled} onChange={v=>sub('announcement','enabled',v)} label="Show thin bar above the header"/><div className="fgrid" style={{marginTop:12}}><Field label="Text"><input value={an.text||''} placeholder="Free delivery in Dhaka this week!" onChange={e=>sub('announcement','text',e.target.value)}/></Field><Field label="Link (optional)"><input value={an.href||''} onChange={e=>sub('announcement','href',e.target.value)}/></Field></div></section>
    <section className="panel"><h2>Logos, banners, contact & footer</h2><div className="fgrid">
      <Field label="Facebook page URL"><input value={data.links?.facebook_url||''} placeholder="https://www.facebook.com/emxintechnologies" onChange={e=>sub('links','facebook_url',e.target.value)}/></Field><Field label="Messenger link" hint="m.me/ + your page username or ID"><input value={data.links?.messenger_url||''} placeholder="https://m.me/emxintechnologies" onChange={e=>sub('links','messenger_url',e.target.value)}/></Field><Field label="Support phone"><input value={data.links?.support_phone||''} onChange={e=>sub('links','support_phone',e.target.value)}/></Field><Field label="WhatsApp number" hint="e.g. 01XXXXXXXXX · shows “Ask on WhatsApp” on product and checkout pages"><input inputMode="tel" value={data.links?.whatsapp||''} placeholder="01XXXXXXXXX" onChange={e=>sub('links','whatsapp',e.target.value)}/></Field>
      <Field label="Support email"><input value={data.links?.support_email||''} onChange={e=>sub('links','support_email',e.target.value)}/></Field><Field label="Footer tagline"><input value={data.footer?.tagline||''} placeholder="Smart Gadgets. Smarter Living." onChange={e=>sub('footer','tagline',e.target.value)}/></Field></div>
      <p className="tiny muted" style={{marginTop:12}}>Logos, the site icon (favicon) and the product banner are in the <b>Branding</b> tab.</p></section>
  </div>;
}
