'use client';
/** EMXIN staff browsers are left out of visitor / cart / checkout counts and Facebook ads data.
 *  A browser is "staff" when it has logged in to the admin panel (the admin sets the emxin_staff cookie for the store's
 *  domain), or after opening the store once with ?staff=1 (?staff=0 undoes it) — useful for staff phones. */
const KEY='emxin_staff';
export function isStaff():boolean{
  if(typeof window==='undefined')return false;
  try{
    const q=new URLSearchParams(location.search).get('staff');
    if(q==='1')localStorage.setItem(KEY,'1');else if(q==='0'){localStorage.removeItem(KEY);document.cookie=`${KEY}=; path=/; max-age=0`}
    if(q==='0')return false;
    return localStorage.getItem(KEY)==='1'||/(?:^|; )emxin_staff=1/.test(document.cookie);
  }catch{return false}
}
