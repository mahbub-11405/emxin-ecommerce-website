import Shop from '../shop/page';
export const metadata={title:'Offers & Discounts on Smart Glasses',description:'Current discounts and deals on smart glasses, sunglasses and gadgets at EMXIN Technologies, Bangladesh. Limited stock.',alternates:{canonical:'/offers'}};
export default async function Offers({searchParams}:{searchParams:Promise<any>}){const sp=await searchParams;return Shop({searchParams:Promise.resolve({...sp,collection:'offers'})})}
