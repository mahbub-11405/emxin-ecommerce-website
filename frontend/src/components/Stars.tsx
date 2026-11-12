import Icon from './Icon';
export default function Stars({value=0,count,size=16}:{value?:number;count?:number;size?:number}){
  const v=Math.max(0,Math.min(5,Number(value)||0));
  return <span className="stars" aria-label={`${v} out of 5 stars`}>
    {[1,2,3,4,5].map(i=><span key={i} className="star-wrap" style={{width:size,height:size}}>
      <Icon name="star" size={size} stroke={1.2} fill="#e5e7eb" className="star-bg"/>
      <span className="star-fg" style={{width:`${Math.max(0,Math.min(1,v-i+1))*100}%`}}><Icon name="star" size={size} stroke={1.2} fill="#fbbf24"/></span>
    </span>)}
    {count!==undefined&&<span className="star-count">({count})</span>}
  </span>;
}
