/** Delivery time shown to customers (Admin → Commerce Settings → Delivery). */
export function deliveryDays(settings:any={}){
  return {dhaka:String(settings?.delivery_days_dhaka||'1–2'),outside:String(settings?.delivery_days_outside||'2–3')};
}
export const daysFor=(district:string,settings:any={})=>{const d=deliveryDays(settings);return String(district||'').toLowerCase()==='dhaka'?d.dhaka:d.outside};
