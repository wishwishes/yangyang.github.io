import {checkoutAccess,commerceSettings,allInventory,commerceResponse,commerceFailure} from '../../../../lib/commerce-server';
import {catalog} from '../../../../lib/store-server';
import {productReady} from '../../../../lib/commerce-core';
export const dynamic='force-dynamic';
export async function GET(){try{const access=await checkoutAccess(),config=await commerceSettings(),products=await catalog(),inventory=await allInventory();return commerceResponse({enabled:access.enabled,mode:access.enabled?access.mode:null,deliveryRules:access.enabled?config.deliveryRules:[],sellerName:access.enabled?config.sellerName:'',shippingPolicy:access.enabled?config.shippingPolicy:'',returnsPolicy:access.enabled?config.returnsPolicy:'',variants:access.enabled?inventory.filter(i=>i.quantity>0&&products.some(p=>p.id===i.product_id&&productReady(p))).map(i=>({productId:i.product_id,size:i.size,quantity:Math.min(i.quantity,5)})):[]});}catch(e){return commerceFailure(e);}}
