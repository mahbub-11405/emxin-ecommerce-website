import Link from 'next/link';
import WishlistHeart from './WishlistHeart';
import AddButton from './CardActions';
import Stars from './Stars';
import GlassesArt from './GlassesArt';
import {firstImage,priceOf} from '@/lib/api';

const BADGE:Record<string,string>={Featured:'b-featured',New:'b-new',Hot:'b-hot',Sale:'b-sale',Limited:'b-limited'};
export default function ProductCard({p,tag}:{p:any;tag?:string}){
  const img=firstImage(p);
  const badge=tag||p.badge||(p.stock<=0?'':p.featured?'':p.new_collection?'New':'');
  return <article className="pc">
    <Link href={`/product/${p.slug}`} className="pc-link" aria-label={p.name}>
      <div className="pc-media">
        {badge&&<span className={'pc-badge '+(BADGE[badge]||'b-info')}>{badge}</span>}
        {p.stock<=0&&<span className="pc-badge b-out">Stock Out</span>}
        {img?<img src={img} alt={p.name} loading="lazy"/>:<GlassesArt variant={p.category_slug==='sunglasses'?'sun':p.category_slug==='frames'?'frame':p.has_camera?'camera':'smart'}/>}
      </div>
      <h3>{p.name}</h3>
      <p className="pc-sub">{p.subtitle||(p.category_name||p.category_slug||'').replaceAll('-',' ')}</p>
      <div className="pc-price">৳ {priceOf(p).toLocaleString('en-IN')}/-{p.sale_price&&<del>৳ {Number(p.price).toLocaleString('en-IN')}</del>}</div>
    </Link>
    <div className="pc-foot">{Number(p.review_count)>0?<Stars value={p.rating} count={p.review_count}/>:<span className="pc-stock">{p.stock>0?`In stock · ${p.stock} pcs`:'Restocking soon'}</span>}<AddButton p={p}/></div>
    <div className="pc-heart"><WishlistHeart productId={p._id}/></div>
  </article>;
}
