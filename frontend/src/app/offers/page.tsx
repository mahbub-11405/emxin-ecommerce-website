import Shop from '../shop/page';
export const metadata={title:'Offers'};
export default async function Offers({searchParams}:{searchParams:Promise<any>}){const sp=await searchParams;return Shop({searchParams:Promise.resolve({...sp,collection:'offers'})})}
