'use client';
// Payment provider badge: bKash / Nagad / COD / Bank. Put official logo files at admin/public/pay/bkash.png and
// admin/public/pay/nagad.png to show the real logos; until then a coloured wordmark is shown.
import {useState} from 'react';
import Icon from './Icon';

export function payKey(o:any):string{
  if(o?.payment_method==='manual')return o?.manual_payment?.channel||o?.payment_channel||'bkash';
  if(o?.payment_method==='cod')return 'cod';
  return o?.payment_channel||o?.payment_method||'other';
}
const NAME:Record<string,string>={bkash:'bKash',nagad:'Nagad',cod:'COD',bank:'Bank',rocket:'Rocket',upay:'Upay',card:'Card',paystation:'Online',other:'Other'};
const LOGO=new Set(['bkash','nagad']);

export default function PayBadge({k,o,label=true,sub}:{k?:string;o?:any;label?:boolean;sub?:string}){
  const key=k||payKey(o);const[img,setImg]=useState(LOGO.has(key));
  return <span className={'pb pb-'+key}>
    {img?<img src={`/pay/${key}.png`} alt={NAME[key]} onError={()=>setImg(false)}/>
      :key==='cod'?<span className="pb-ic"><Icon name="truck" size={14}/></span>
      :key==='bank'?<span className="pb-ic"><Icon name="ledger" size={14}/></span>
      :<span className="pb-word">{NAME[key]||key}</span>}
    {label&&<span className="pb-name">{key==='cod'?'Cash on Delivery':NAME[key]||key}{sub&&<small>{sub}</small>}</span>}
  </span>;
}
