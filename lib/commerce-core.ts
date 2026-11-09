import {PayPalClient,PayPalError,amountMatches,decimal,type PayPalOrder,type PayPalCapture} from './paypal.ts';
import {checkoutInputSchema,type CheckoutInput,type CommerceSettings,type DeliveryAddress,type InventoryRow,type OrderItem,type OrderRow} from './commerce-types.ts';
import type {Product} from './store-types';

export class CommerceError extends Error {status:number; constructor(message:string,status=400){super(message);this.status=status;}}
export const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(v=>v.toString(16).padStart(2,'0')).join('');
export const skuFor=(id:string,size:string)=>id+'::'+size;
const now=()=>new Date().toISOString();
const normal=(s:string|undefined)=>(s||'').trim().replace(/\s+/g,' ').toUpperCase();
export function productReady(p:Product){return p.published&&p.verified&&p.imageRightsConfirmed&&p.fulfillmentConfirmed&&Number.isInteger(p.price)&&Number(p.price)>0;}
export function configurationReady(c:CommerceSettings){return c.salesRequested&&c.policiesConfirmed&&c.sellerName.length>=2&&c.shippingPolicy.length>=30&&c.returnsPolicy.length>=30&&c.deliveryRules.length>0;}
export function quote(input:CheckoutInput,products:Product[],settings:CommerceSettings){
 const rule=settings.deliveryRules.find(r=>r.state===input.address.state);
 if(!rule)throw new CommerceError('Delivery is not available to this state.');
 const seen=new Set<string>();
 const items:OrderItem[]=input.items.map(i=>{const p=products.find(p=>p.id===i.id),sku=skuFor(i.id,i.size);if(!p||!productReady(p)||!p.sizes.includes(i.size)||seen.has(sku))throw new CommerceError('A selected style or size is not ready to purchase.');seen.add(sku);return {...i,sku,name:p.name,price:p.price!};});
 const subtotal=items.reduce((n,i)=>n+i.price*i.quantity,0),shipping=rule.shippingCents;
 // Merchant-configured tax rate applies to merchandise and shipping. No tax exemption is inferred.
 const tax=Math.round((subtotal+shipping)*rule.taxBasisPoints/10000),total=subtotal+shipping+tax;
 if(total<100||total>1000000)throw new CommerceError('This order amount cannot be processed online.');
 return {items,subtotal,shipping,tax,total};
}
export function validateRemote(order:OrderRow,remote:PayPalOrder,merchantId:string){
 const unit=remote.purchase_units?.[0];
 if(remote.id!==order.paypal_order_id||remote.intent!=='CAPTURE'||remote.purchase_units?.length!==1||unit?.custom_id!==order.id||unit.invoice_id!==order.id||unit.payee?.merchant_id!==merchantId||!amountMatches(unit.amount,order.total))throw new CommerceError('Payment details need review. No fulfillment is authorized.',409);
 const expected=JSON.parse(order.address) as DeliveryAddress,address=unit.shipping?.address;
 if(!address||address.country_code!=='US'||normal(address.address_line_1)!==normal(expected.line1)||normal(address.address_line_2)!==normal(expected.line2)||normal(address.admin_area_2)!==normal(expected.city)||normal(address.admin_area_1)!==normal(expected.state)||normal(address.postal_code)!==normal(expected.zip)||normal(unit.shipping?.name?.full_name)!==normal(expected.name))throw new CommerceError('The delivery address needs review before payment.',409);
}
export async function releaseHeldStock(db:D1Database,id:string,status:'cancelled'|'expired'|'failed'){
  const allowed="('creating','awaiting_approval','failed')";
  await db.batch([
   db.prepare(`UPDATE inventory SET quantity=quantity+COALESCE((SELECT quantity FROM order_reservations WHERE sku=inventory.sku AND order_id=? AND status='held'),0),updated_at=? WHERE sku IN (SELECT sku FROM order_reservations WHERE order_id=? AND status='held') AND EXISTS (SELECT 1 FROM sales_orders WHERE id=? AND payment_status IN ${allowed} AND reservation_status='held')`).bind(id,now(),id,id),
   db.prepare(`UPDATE order_reservations SET status='released' WHERE order_id=? AND status='held' AND EXISTS (SELECT 1 FROM sales_orders WHERE id=? AND payment_status IN ${allowed} AND reservation_status='held')`).bind(id,id),
   db.prepare(`UPDATE sales_orders SET payment_status=?,reservation_status='released',updated_at=? WHERE id=? AND payment_status IN ${allowed} AND reservation_status='held'`).bind(status,now(),id)
  ]);
 }
export async function expireStock(db:D1Database){const rows=(await db.prepare("SELECT id FROM sales_orders WHERE payment_status IN ('creating','awaiting_approval') AND reservation_status='held' AND expires_at<? LIMIT 100").bind(Date.now()).all<{id:string}>()).results;for(const row of rows)await releaseHeldStock(db,row.id,'expired');}

export class Commerce {
 db:D1Database; paypal:PayPalClient; origin:string;
 constructor(db:D1Database,paypal:PayPalClient,origin:string){this.db=db;this.paypal=paypal;this.origin=origin;}
 async order(id:string){return this.db.prepare('SELECT * FROM sales_orders WHERE id=?').bind(id).first<OrderRow>();}
 async inventory(){return (await this.db.prepare('SELECT * FROM inventory ORDER BY product_id,size').all<InventoryRow>()).results;}
 async orders(){return (await this.db.prepare('SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 250').all<OrderRow>()).results;}
 async audit(action:string,id:string){await this.db.prepare('INSERT INTO audit_log (id,action,target,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),action,id,now()).run();}
 async release(id:string,status:'cancelled'|'expired'|'failed'){return releaseHeldStock(this.db,id,status);}
 async expire(){return expireStock(this.db);}
 async create(raw:unknown,products:Product[],settings:CommerceSettings,sessionHash:string,requestHash:string){
  if(!configurationReady(settings))throw new CommerceError('Checkout is not open yet.',503);
  const input=checkoutInputSchema.parse(raw),digest=await hash(JSON.stringify(input));
  await this.expire();
  let previous=await this.db.prepare('SELECT * FROM sales_orders WHERE checkout_key=?').bind(input.key).first<OrderRow>();
  if(previous){if(previous.session_hash!==sessionHash||previous.request_digest!==digest)throw new CommerceError('This checkout attempt does not match your selection.',409);return this.ensurePayPal(previous);}
  const window=Math.floor(Date.now()/3600000),count=await this.db.prepare('SELECT COUNT(*) AS n FROM sales_orders WHERE request_hash=? AND request_window=?').bind(requestHash,window).first<{n:number}>();
  if((count?.n||0)>=5)throw new CommerceError('Please wait before starting another checkout.',429);
  const q=quote(input,products,settings),id='LNZ-'+crypto.randomUUID().replaceAll('-','').slice(0,24).toUpperCase(),stamp=now();
  if(q.total!==input.expectedTotal)throw new CommerceError('The price or delivery charge changed. Refresh checkout and review the new total.',409);
  const order:OrderRow={id,checkout_key:input.key,session_hash:sessionHash,request_digest:digest,request_hash:requestHash,request_window:window,mode:this.paypal.credentials.mode,email:input.email,address:JSON.stringify(input.address),items:JSON.stringify(q.items),subtotal:q.subtotal,shipping:q.shipping,tax:q.tax,total:q.total,payment_status:'creating',reservation_status:'held',paypal_order_id:null,capture_id:null,refund_id:null,approval_url:null,fulfillment_status:'unfulfilled',tracking_carrier:'',tracking_number:'',created_at:stamp,updated_at:stamp,expires_at:Date.now()+30*60*1000,issue:''};
  const keys=Object.keys(order),values=Object.values(order);
  try{await this.db.batch([
   this.db.prepare(`INSERT INTO sales_orders (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...values),
   ...q.items.flatMap(i=>[
    this.db.prepare('UPDATE inventory SET quantity=quantity-?,updated_at=? WHERE sku=?').bind(i.quantity,stamp,i.sku),
    this.db.prepare("INSERT INTO order_reservations (order_id,sku,quantity,status) VALUES (?,?,?,'held')").bind(id,i.sku,i.quantity)
   ])]);}catch{
   previous=await this.db.prepare('SELECT * FROM sales_orders WHERE checkout_key=?').bind(input.key).first<OrderRow>();
   if(previous&&previous.session_hash===sessionHash&&previous.request_digest===digest)return this.ensurePayPal(previous);
   throw new CommerceError('A selected size has sold out. Please update your bag.',409);
  }
  return this.ensurePayPal(order);
 }
 async ensurePayPal(order:OrderRow){
  if(order.mode!==this.paypal.credentials.mode)throw new CommerceError('This checkout belongs to a different payment environment.',409);
  if(order.payment_status!=='creating')return order;
  if(order.expires_at<Date.now()){await this.release(order.id,'expired');return (await this.order(order.id))!;}
  const a=JSON.parse(order.address) as DeliveryAddress,items=JSON.parse(order.items) as OrderItem[];
  try{
   const remote=await this.paypal.createOrder({intent:'CAPTURE',purchase_units:[{custom_id:order.id,invoice_id:order.id,payee:{merchant_id:this.paypal.credentials.merchantId},description:'Liang Nü Zhuang dress order',amount:{currency_code:'USD',value:decimal(order.total),breakdown:{item_total:{currency_code:'USD',value:decimal(order.subtotal)},shipping:{currency_code:'USD',value:decimal(order.shipping)},tax_total:{currency_code:'USD',value:decimal(order.tax)}}},items:items.map(i=>({name:i.name.slice(0,127),sku:i.sku.slice(0,127),description:'Size '+i.size,quantity:String(i.quantity),category:'PHYSICAL_GOODS',unit_amount:{currency_code:'USD',value:decimal(i.price)}})),shipping:{name:{full_name:a.name},address:{address_line_1:a.line1,...(a.line2?{address_line_2:a.line2}:{}),admin_area_2:a.city,admin_area_1:a.state,postal_code:a.zip,country_code:'US'}}}],payment_source:{paypal:{experience_context:{brand_name:'Liang Nü Zhuang',shipping_preference:'SET_PROVIDED_ADDRESS',user_action:'PAY_NOW',return_url:this.origin+'/checkout/return?order='+order.id,cancel_url:this.origin+'/checkout/cancel?order='+order.id}}}},'create-'+order.id);
   if(!/^[A-Z0-9]{10,40}$/.test(remote.id))throw new PayPalError(502,'INVALID_ORDER_ID');
   const url=this.paypal.approvalUrl(remote);
   await this.db.prepare("UPDATE sales_orders SET paypal_order_id=?,approval_url=?,payment_status='awaiting_approval',updated_at=? WHERE id=? AND payment_status='creating'").bind(remote.id,url,now(),order.id).run();
   return (await this.order(order.id))!;
  }catch(e){
   // A network failure is ambiguous: keep the hold and retry with the same PayPal request ID.
   if(e instanceof PayPalError&&e.status>=400&&e.status<500&&![408,409,429].includes(e.status)){await this.db.prepare("UPDATE sales_orders SET issue='PayPal rejected order creation.',updated_at=? WHERE id=? AND payment_status='creating'").bind(now(),order.id).run();await this.release(order.id,'failed');}
   throw new CommerceError('Payment could not start. Retry this checkout; your card has not been charged by this step.',502);
  }
 }
 async applyRemote(order:OrderRow,remote:PayPalOrder){
  try{validateRemote(order,remote,this.paypal.credentials.merchantId);}catch(e){await this.db.prepare("UPDATE sales_orders SET issue='PayPal amount, merchant or delivery details do not match.',updated_at=? WHERE id=?").bind(now(),order.id).run();throw e;}
  const captures=remote.purchase_units?.[0].payments?.captures||[];
  if(!captures.length)return (await this.order(order.id))!;
  if(captures.length!==1||!amountMatches(captures[0].amount,order.total)||captures[0].final_capture===false)throw new CommerceError('Unexpected payment capture. Contact customer service.',409);
  const c=captures[0]; let status='';
  if(c.status==='COMPLETED')status='paid';
  else if(c.status==='PENDING')status='payment_pending';
  else if(c.status==='REFUNDED')status='refunded';
  else if(c.status==='PARTIALLY_REFUNDED')status='partially_refunded';
  else if(c.status==='REVERSED')status='reversed';
  else if(['DECLINED','DENIED','FAILED'].includes(c.status))status='failed';
  if(!status)return (await this.order(order.id))!;
  const current=(await this.order(order.id))!;
  if(['refunded','partially_refunded','reversed'].includes(current.payment_status)&&['paid','payment_pending'].includes(status))return current;
  if(current.payment_status==='refunding'&&['paid','payment_pending'].includes(status))return current;
  if(status==='payment_pending'&&current.payment_status==='paid')return current;
  if(status==='paid'&&current.reservation_status==='released')status='review_required';
  const consume=['paid','refunded','partially_refunded','reversed','review_required'].includes(status);
  await this.db.batch([
   this.db.prepare("UPDATE sales_orders SET payment_status=CASE WHEN payment_status IN ('refunded','partially_refunded','reversed','refunding') AND ? IN ('paid','payment_pending') THEN payment_status WHEN ?='paid' AND reservation_status='released' THEN 'review_required' ELSE ? END,capture_id=?,reservation_status=CASE WHEN ?=1 AND reservation_status='held' THEN 'consumed' ELSE reservation_status END,updated_at=?,issue=CASE WHEN ?='paid' AND reservation_status='released' THEN 'Payment arrived after stock was released. Resolve before shipment.' ELSE ? END WHERE id=?").bind(status,status,status,c.id,consume?1:0,now(),status,status==='review_required'?'Payment arrived after stock was released. Resolve before shipment.':'',order.id),
   this.db.prepare("UPDATE order_reservations SET status='consumed' WHERE order_id=? AND status='held' AND ?=1").bind(order.id,consume?1:0)
  ]);
  if(status==='failed')await this.release(order.id,'failed');
  return (await this.order(order.id))!;
 }
 async synchronize(order:OrderRow){
  if(!order.paypal_order_id)return order;
  const remote=await this.paypal.getOrder(order.paypal_order_id),capture=remote.purchase_units?.[0].payments?.captures?.[0];
  if(capture){const latest=await this.paypal.getCapture(capture.id);remote.purchase_units![0].payments!.captures=[latest];}
  let result=await this.applyRemote(order,remote);
  if(order.refund_id&&order.payment_status==='refunding'){
   const refund=await this.paypal.getRefund(order.refund_id);
   if(refund.status==='COMPLETED'&&amountMatches(refund.amount,order.total)){await this.db.prepare("UPDATE sales_orders SET payment_status='refunded',updated_at=? WHERE id=?").bind(now(),order.id).run();result=(await this.order(order.id))!;}
   else if(refund.status==='PENDING'&&result.payment_status==='paid'){await this.db.prepare("UPDATE sales_orders SET payment_status='refunding' WHERE id=?").bind(order.id).run();result=(await this.order(order.id))!;}
  }
  return result;
 }
 async capture(order:OrderRow,products:Product[],settings:CommerceSettings){
  if(['paid','refunded','partially_refunded','reversed','review_required'].includes(order.payment_status))return order;
  if(!configurationReady(settings))throw new CommerceError('Payment is temporarily unavailable. Contact customer service.',503);
  if(!['awaiting_approval','capturing','payment_pending'].includes(order.payment_status)||!order.paypal_order_id)throw new CommerceError('This checkout is no longer payable.',409);
  if(order.payment_status==='awaiting_approval'){
   if(order.expires_at<Date.now()){await this.release(order.id,'expired');throw new CommerceError('This checkout has expired. No payment was captured.',409);}
   if((JSON.parse(order.items) as OrderItem[]).some(i=>{const p=products.find(p=>p.id===i.id);return !p||!productReady(p);})){await this.release(order.id,'cancelled');throw new CommerceError('A style is no longer available. No payment was captured.',409);}
  }
  const remote=await this.paypal.getOrder(order.paypal_order_id);validateRemote(order,remote,this.paypal.credentials.merchantId);
  if(remote.purchase_units?.[0].payments?.captures?.length)return this.synchronize(order);
  if(remote.status!=='APPROVED')throw new CommerceError('Please approve this payment in PayPal first.',409);
  await this.db.prepare("UPDATE sales_orders SET payment_status='capturing',updated_at=? WHERE id=? AND payment_status='awaiting_approval' AND reservation_status='held'").bind(now(),order.id).run();
  const claimed=(await this.order(order.id))!;
  if(!['capturing','payment_pending'].includes(claimed.payment_status)||claimed.reservation_status!=='held')throw new CommerceError('The payment attempt is no longer active.',409);
  try{await this.paypal.captureOrder(order.paypal_order_id,'capture-'+order.id);return this.synchronize(claimed);}
  catch(e){
   // Never release inventory or report failure after an uncertain capture. A retry first reads PayPal.
   await this.db.prepare("UPDATE sales_orders SET issue='Capture result is being verified. Do not ship yet.',updated_at=? WHERE id=? AND payment_status IN ('capturing','payment_pending')").bind(now(),order.id).run();
   if(e instanceof CommerceError)throw e;
   throw new CommerceError('Your payment result is being verified. Refresh the order status; do not start a second payment.',502);
  }
 }
 async refund(order:OrderRow){
  if(!order.capture_id)throw new CommerceError('No captured payment exists.',409);
  const refreshed=await this.synchronize(order);
  if(refreshed.payment_status==='refunded')return refreshed;
  if(!['paid','refunding'].includes(refreshed.payment_status))throw new CommerceError('This order needs manual payment review before refunding.',409);
  if(refreshed.payment_status==='refunding')return refreshed;
  await this.db.prepare("UPDATE sales_orders SET payment_status='refunding',updated_at=? WHERE id=?").bind(now(),order.id).run();
  try{const refund=await this.paypal.refundCapture(order.capture_id,'refund-'+order.id);if(refund.amount&&!amountMatches(refund.amount,order.total))throw new CommerceError('Unexpected refund amount. Review in PayPal.',409);
   const status=refund.status==='COMPLETED'?'refunded':refund.status==='PENDING'?'refunding':'review_required';
   await this.db.prepare('UPDATE sales_orders SET payment_status=?,refund_id=?,updated_at=?,issue=? WHERE id=?').bind(status,refund.id,now(),status==='review_required'?'Refund needs review in PayPal.':'',order.id).run();await this.audit('order.refund_requested',order.id);return (await this.order(order.id))!;
  }catch{throw new CommerceError('Refund result is uncertain. Refresh its status before any further refund action.',502);}
 }
}
