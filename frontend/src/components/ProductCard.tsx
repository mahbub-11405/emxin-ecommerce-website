import Link from 'next/link';
import WishlistHeart from './WishlistHeart';
import AddButton from './CardActions';
import Stars from './Stars';
import GlassesArt from './GlassesArt';
import {firstImage,priceOf,discountPct} from '@/lib/api';
import {sameText} from '@/lib/productText';
import Icon from './Icon';

const BADGE:Record<string,string>={Featured:'b-featured',New:'b-new',Hot:'b-hot',Sale:'b-sale',Limited:'b-limited'};
export default function ProductCard({p,tag}:{p:any;tag?:string}){
  const img=firstImage(p);
  const off=discountPct(p);const save=off?Number(p.price)-priceOf(p):0;
  const cat=(p.category_name||p.category_slug||'').replaceAll('-',' ');
  const sub=p.subtitle||(sameText(cat,p.name)?'':cat); // don't repeat the product name in small letters
  const badge=tag||p.badge||(p.stock<=0?'':p.featured?'Featured':p.new_collection?'New':'');
  const low=p.stock>0&&p.stock<=(p.low_stock_threshold??5);
  const fill=!!img&&p.image_fit!=='contain'; // photos fill the card top; cut-outs float on a light background
  return <article className={'pc'+(fill?' pc-fill':'')}>
    <Link href={`/product/${p.slug}`} className="pc-link" aria-label={p.name}>
      <div className="pc-media">
        {badge&&<span className={'pc-badge '+(BADGE[badge]||'b-info')}>{badge}</span>}
        {p.stock<=0&&<span className="pc-badge b-out">Stock Out</span>}
        {off>0&&<span className="pc-save">Save ৳ {save.toLocaleString('en-IN')}</span>}
        {img?<img src={img} alt={p.name} loading="lazy"/>:<GlassesArt variant={p.category_slug==='sunglasses'?'sun':p.category_slug==='frames'?'frame':p.has_camera?'camera':'smart'}/>}
      </div>
      <h3>{p.name}</h3>
      {sub&&<p className="pc-sub">{sub}</p>}
      <div className="pc-price">৳ {priceOf(p).toLocaleString('en-IN')}/-{off>0&&<><del>৳ {Number(p.price).toLocaleString('en-IN')}</del><span className="pc-off"><Icon name="flame" size={13} stroke={2.4}/>{off}% OFF</span></>}</div>
    </Link>
    {(low||p.stock<=0)&&<p className={'pc-stock'+(p.stock<=0?' out':'')}>{p.stock<=0?'Restocking soon':`Only ${p.stock} left`}</p>}
    <div className="pc-foot"><Stars value={p.rating} count={Number(p.review_count)||0}/><AddButton p={p}/></div>
    <div className="pc-heart"><WishlistHeart productId={p._id}/></div>
  </article>;
}
