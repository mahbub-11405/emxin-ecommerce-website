/** Text chips for channels PayStation supports (no third-party logos). */
const CH=[['bKash','#e2136e'],['Nagad','#f6921e'],['Rocket','#8c3494'],['Upay','#0054a6'],['VISA','#1a1f71'],['Mastercard','#eb001b'],['AMEX','#2e77bc'],['Internet Banking','#0f766e']];
export default function PayMethods({small=false}:{small?:boolean}){return <span className={'pm-chips'+(small?' sm':'')}>{CH.map(([n,c])=><span key={n} style={{color:c,borderColor:c+'40'}}>{n}</span>)}</span>}
