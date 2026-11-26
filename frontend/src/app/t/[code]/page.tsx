import {redirect} from 'next/navigation';
/** Short link from the SMS: tech.emxin.com/t/261125-FCBF36 → Track order with the order ID filled in. */
export default async function Short({params}:{params:Promise<{code:string}>}){
  const {code}=await params;const c=String(code||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,40);
  redirect(`/track-order?order_id=${encodeURIComponent('EMX-'+c.replace(/^EMX-?/,''))}`);
}
