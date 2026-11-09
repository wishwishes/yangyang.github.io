import {commerceDb,commerce,commerceResponse,commerceFailure} from '../../../../../lib/commerce-server';
import {CommerceError} from '../../../../../lib/commerce-core';
import type {OrderRow} from '../../../../../lib/commerce-types';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{mode:string}>}){try{
 const mode=(await params).mode;if(mode!=='live'&&mode!=='sandbox')throw new CommerceError('Unknown payment environment.',404);
 const text=await req.text();if(text.length>100000)throw new CommerceError('Event too large.',413);
 const event=JSON.parse(text) as {id?:string;event_type?:string;resource?:{id?:string;invoice_id?:string;supplementary_data?:{related_ids?:{order_id?:string;capture_id?:string}};links?:{rel:string;href:string}[]}};
 if(!event.id||event.id.length>100||!event.event_type)throw new CommerceError('Invalid event.');
 const service=commerce(mode);
 if(!await service.paypal.verifyWebhook(req.headers,event))throw new CommerceError('Invalid webhook signature.',401);
 if(await commerceDb().prepare('SELECT id FROM payment_events WHERE id=?').bind(event.id).first())return commerceResponse({received:true});
 const resource=event.resource,related=resource?.supplementary_data?.related_ids;
 let order:OrderRow|null=null;
 if(related?.order_id)order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE paypal_order_id=? AND mode=?').bind(related.order_id,mode).first<OrderRow>();
 if(!order&&resource?.id)order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE (capture_id=? OR refund_id=? OR paypal_order_id=?) AND mode=?').bind(resource.id,resource.id,resource.id,mode).first<OrderRow>();
 if(!order&&related?.capture_id)order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE capture_id=? AND mode=?').bind(related.capture_id,mode).first<OrderRow>();
 if(!order&&resource?.invoice_id)order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE id=? AND mode=?').bind(resource.invoice_id,mode).first<OrderRow>();
 if(!order){const up=resource?.links?.find(l=>l.rel==='up')?.href;if(up){const url=new URL(up),match=url.pathname.match(/^\/v2\/payments\/captures\/([A-Z0-9]+)$/);if(url.origin===service.paypal.base&&match)order=await commerceDb().prepare('SELECT * FROM sales_orders WHERE capture_id=? AND mode=?').bind(match[1],mode).first<OrderRow>();}}
 if(order&&event.event_type==='PAYMENT.CAPTURE.REVERSED'){await commerceDb().prepare("UPDATE sales_orders SET payment_status='reversed',issue='Verified reversal notification received. Do not ship.',updated_at=? WHERE id=?").bind(new Date().toISOString(),order.id).run();order=(await service.order(order.id))!;}
 if(order&&event.event_type.startsWith('PAYMENT.'))await service.synchronize(order);
 await commerceDb().prepare('INSERT OR IGNORE INTO payment_events (id,type,order_id,created_at) VALUES (?,?,?,?)').bind(event.id,event.event_type,order?.id||null,new Date().toISOString()).run();
 return commerceResponse({received:true});
 }catch(e){if(e instanceof CommerceError)return commerceFailure(e);return commerceResponse({error:'Unable to verify or process this event. Retry later.'},503);}}
