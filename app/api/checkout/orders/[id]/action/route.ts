import {customerOrder,publicOrder,commerce,commerceSettings,checkoutAccess,commerceResponse,commerceFailure} from '../../../../../../lib/commerce-server';
import {CommerceError} from '../../../../../../lib/commerce-core';
import {catalog,readBody,sameOrigin} from '../../../../../../lib/store-server';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 sameOrigin(req);const order=await customerOrder((await params).id),body=await readBody(req),service=commerce(order.mode,new URL(req.url).origin);
 if(body.action==='cancel'){await service.release(order.id,'cancelled');return commerceResponse(publicOrder((await service.order(order.id))!));}
 if(body.action==='refresh')return commerceResponse(publicOrder(await service.synchronize(order)));
 if(body.action==='capture'){const access=await checkoutAccess();if(!access.enabled||access.mode!==order.mode)throw new CommerceError('Checkout is temporarily unavailable. Contact customer service.',503);return commerceResponse(publicOrder(await service.capture(order,await catalog(),await commerceSettings())));}
 throw new CommerceError('Unknown order action.');
 }catch(e){return commerceFailure(e);}}
