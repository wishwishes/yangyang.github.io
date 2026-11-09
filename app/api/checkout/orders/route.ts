import {checkoutAccess,commerce,commerceSettings,session,publicOrder,commerceResponse,commerceFailure} from '../../../../lib/commerce-server';
import {CommerceError,hash} from '../../../../lib/commerce-core';
import {catalog,readBody,sameOrigin} from '../../../../lib/store-server';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{sameOrigin(req);const access=await checkoutAccess();if(!access.enabled||!access.mode)throw new CommerceError('Checkout is not open yet. You can still send an availability request.',503);const sessionHash=(await session(true))!,fingerprint=req.headers.get('cf-connecting-ip')||sessionHash;const result=await commerce(access.mode,new URL(req.url).origin).create(await readBody(req),await catalog(),await commerceSettings(),sessionHash,await hash(fingerprint));return commerceResponse(publicOrder(result),201);}catch(e){return commerceFailure(e);}}
