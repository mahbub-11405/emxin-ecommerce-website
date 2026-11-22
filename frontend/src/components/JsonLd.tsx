/** Structured data for Google (products, breadcrumbs, FAQ, business). Invisible on the page. */
export default function JsonLd({data}:{data:any}){
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(data).replace(/</g,'\\u003c')}}/>;
}
