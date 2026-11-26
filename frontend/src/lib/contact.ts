/** wa.me link for a Bangladeshi number typed any way (017…, +88017…, 88017…); '' when none is set (Admin → CMS → Links → WhatsApp number). */
export function waLink(num:any,text=''):string{
  let d=String(num||'').replace(/\D/g,'');if(d.length<10)return '';
  if(d.startsWith('0'))d='88'+d;else if(d.startsWith('1')&&d.length===10)d='880'+d;
  return `https://wa.me/${d}${text?'?text='+encodeURIComponent(text):''}`;
}
