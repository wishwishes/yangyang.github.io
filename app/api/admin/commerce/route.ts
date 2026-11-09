import {z} from 'zod';
import {isAdmin,readBody,sameOrigin,log} from '../../../../lib/store-server';
import {commerceDb,commerce,commerceSettings,allInventory,readiness,writeInventory,commerceResponse,commerceFailure} from '../../../../lib/commerce-server';
import {commerceSettingsSchema,type OrderRow} from '../../../../lib/commerce-types';
import {CommerceError} from '../../../../lib/commerce-core';
export const dynamic='force-dynamic';
export async function GET(){if(!await isAdmin())return commerceResponse({error:'Store owner sign-in required.'},403);try{return commerceResponse({settings:await commerceSettings(),readiness:await readiness(),inventory:await allInventory(),orders:(await commerceDb().prepare('SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 250').all<OrderRow>()).results.map(({session_hash,request_hash,request_digest,checkout_key,...order})=>order)});}catch(e){return commerceFailure(e);}}
export async function POST(req:Request){if(!await isAdmin())return commerceResponse({error:'Store owner sign-in required.'},403);try{
 sameOrigin(req);const body=await readBody(req);
 if(body.action==='settings'){const config=commerceSettingsSchema.parse(body.settings);await commerceDb().prepare("INSERT INTO store_settings (id,data,updated_at) VALUES ('commerce',?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").bind(JSON.stringify(config),new Date().toISOString()).run();await log('commerce.settings_saved','commerce');return commerceResponse({ok:true});}
 if(body.action==='inventory'){const v=z.object({productId:z.string().max(80),size:z.string().max(30),quantity:z.number().int().min(0).max(100000)}).parse(body);await writeInventory(v.productId,v.size,v.quantity);await log('inventory.saved',v.productId+'::'+v.size);return commerceResponse({ok:true});}
 const id=z.string().regex(/^LNZ-[A-F0-9]{24}$/).parse(body.id),order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE id=?').bind(id).first<OrderRow>();if(!order)throw new CommerceError('Order not found.',404);
 const service=commerce(order.mode);
 if(body.action==='refresh'){await service.synchronize(order);return commerceResponse({ok:true});}
 if(body.action==='expire'){await service.expire();return commerceResponse({ok:true});}
 if(body.action==='refund'){if(body.confirmTotal!==order.total)throw new CommerceError('Confirm the exact full refund amount.');await service.refund(order);return commerceResponse({ok:true});}
 if(body.action==='shipping'){
  const info=z.object({carrier:z.string().trim().min(2).max(100),tracking:z.string().trim().min(4).max(100)}).parse(body);const fresh=await service.synchronize(order);
  if(fresh.payment_status!=='paid'||fresh.reservation_status!=='consumed')throw new CommerceError('Only confirmed, fully paid orders may be marked shipped.',409);
  await commerceDb().prepare("UPDATE sales_orders SET fulfillment_status='shipped',tracking_carrier=?,tracking_number=?,updated_at=? WHERE id=? AND payment_status='paid'").bind(info.carrier,info.tracking,new Date().toISOString(),id).run();await log('order.shipped',id);return commerceResponse({ok:true});
 }
 throw new CommerceError('Unknown action.');
 }catch(e){return commerceFailure(e);}}
