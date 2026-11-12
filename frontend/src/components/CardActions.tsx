'use client';
import {useState} from 'react';
import Icon from './Icon';
import {addToCart} from '@/lib/cart';
import {track} from '@/lib/tracking';
export default function AddButton({p}:{p:any}){
  const[done,setDone]=useState(false);
  const out=Number(p.stock)<=0;
  return <button type="button" className={'pc-add'+(done?' done':'')} disabled={out} aria-label={out?'Out of stock':`Add ${p.name} to cart`} title={out?'Out of stock':'Add to cart'}
    onClick={e=>{e.preventDefault();e.stopPropagation();addToCart(p._id,1,p.colors?.[0]||'Black');track('add_to_cart',{product_id:p._id,product_name:p.name,metadata:{qty:1,source:'card'}});setDone(true);location.href='/cart'}}>
    <Icon name={done?'check':'plus'} size={20} stroke={2.4}/>
  </button>;
}
