'use client';
export default function SortSelect({value}:{value:string}){
  return <label className="sort"><span>Sort by</span><select value={value} onChange={e=>{const u=new URL(location.href);u.searchParams.set('sort',e.target.value);location.href=u.toString()}}>
    <option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: Low to High</option><option value="price_desc">Price: High to Low</option><option value="popular">Best Selling</option><option value="rating">Top Rated</option>
  </select></label>;
}
