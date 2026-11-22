import Shop from '../shop/page';
export const metadata={title:'New Collection – Latest Smart Glasses & Gadgets',description:'The newest smart glasses, sunglasses and gadgets at EMXIN Technologies, Bangladesh. Cash on delivery and fast delivery.',alternates:{canonical:'/new-collection'}};
export default async function NewCollection({searchParams}:{searchParams:Promise<any>}){const sp=await searchParams;return Shop({searchParams:Promise.resolve({...sp,collection:'new'})})}
