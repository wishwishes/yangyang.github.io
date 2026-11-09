export type PayPalMode = 'sandbox' | 'live';
export type PayPalCredentials = {mode: PayPalMode; clientId: string; secret: string; merchantId: string; webhookId: string};
export type PayPalMoney = {currency_code: string; value: string};
export type PayPalCapture = {id: string; status: string; amount: PayPalMoney; final_capture?: boolean};
export type PayPalOrder = {
  id: string; status: string; intent?: string;
  links?: {rel: string; href: string}[];
  purchase_units?: {custom_id?: string; invoice_id?: string; payee?: {merchant_id?: string}; amount?: PayPalMoney;
    shipping?: {name?: {full_name: string}; address?: Record<string, string>}; payments?: {captures?: PayPalCapture[]}}[];
};
export class PayPalError extends Error {
  status: number; code: string;
  constructor(status: number, code: string) {super('PayPal could not complete this request.'); this.status=status; this.code=code;}
}
export class PayPalClient {
  private token = ''; private tokenUntil = 0;
  credentials: PayPalCredentials; request: typeof fetch;
  constructor(credentials: PayPalCredentials, request: typeof fetch = fetch) {this.credentials=credentials; this.request=request;}
  get base() {return this.credentials.mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';}
  async accessToken() {
    if(this.token && this.tokenUntil>Date.now()) return this.token;
    const r=await this.request(this.base+'/v1/oauth2/token', {method:'POST', headers:{Authorization:'Basic '+btoa(this.credentials.clientId+':'+this.credentials.secret),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new PayPalError(r.status,'AUTHENTICATION_FAILED');
    const d=await r.json() as {access_token?: string; expires_in?: number};
    if(!d.access_token) throw new PayPalError(502,'INVALID_TOKEN_RESPONSE');
    this.token=d.access_token; this.tokenUntil=Date.now()+Math.max(0,(d.expires_in||0)-60)*1000; return this.token;
  }
  async call<T>(path: string, method='GET', body?: unknown, requestId?: string): Promise<T> {
    if(!path.startsWith('/v')) throw new Error('Invalid PayPal path.');
    const token=await this.accessToken();
    const r=await this.request(this.base+path, {method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
    if(!r.ok) {const d=await r.json().catch(()=>({})) as {name?: string}; throw new PayPalError(r.status,d.name||'PROVIDER_ERROR');}
    return await r.json() as T;
  }
  getOrder(id: string) {return this.call<PayPalOrder>('/v2/checkout/orders/'+encodeURIComponent(id));}
  createOrder(body: unknown, key: string) {return this.call<PayPalOrder>('/v2/checkout/orders','POST',body,key);}
  captureOrder(id: string, key: string) {return this.call<PayPalOrder>('/v2/checkout/orders/'+encodeURIComponent(id)+'/capture','POST',{},key);}
  getCapture(id: string) {return this.call<PayPalCapture>('/v2/payments/captures/'+encodeURIComponent(id));}
  refundCapture(id: string, key: string) {return this.call<{id: string; status: string; amount?: PayPalMoney}>('/v2/payments/captures/'+encodeURIComponent(id)+'/refund','POST',{},key);}
  getRefund(id: string) {return this.call<{id: string; status: string; amount?: PayPalMoney}>('/v2/payments/refunds/'+encodeURIComponent(id));}
  async verifyWebhook(headers: Headers, event: unknown) {
    const fields=['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];
    if(fields.some(k=>!headers.get(k))) return false;
    const cert=new URL(headers.get('paypal-cert-url')!);
    const hosts=this.credentials.mode==='live'?['api.paypal.com','api-m.paypal.com']:['api.sandbox.paypal.com','api-m.sandbox.paypal.com'];
    if(cert.protocol!=='https:' || !hosts.includes(cert.hostname) || !cert.pathname.startsWith('/v1/notifications/certs/')) return false;
    const d=await this.call<{verification_status: string}>('/v1/notifications/verify-webhook-signature','POST',{
      auth_algo:headers.get(fields[0]),cert_url:cert.href,transmission_id:headers.get(fields[2]),transmission_sig:headers.get(fields[3]),transmission_time:headers.get(fields[4]),webhook_id:this.credentials.webhookId,webhook_event:event
    });
    return d.verification_status==='SUCCESS';
  }
  approvalUrl(order: PayPalOrder) {
    const link=order.links?.find(x=>x.rel==='payer-action'||x.rel==='approve')?.href;
    if(!link) throw new PayPalError(502,'APPROVAL_LINK_MISSING');
    const url=new URL(link), hosts=this.credentials.mode==='live'?['www.paypal.com','paypal.com']:['www.sandbox.paypal.com','sandbox.paypal.com'];
    if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.searchParams.get('token')!==order.id) throw new PayPalError(502,'APPROVAL_LINK_INVALID');
    return url.href;
  }
}
export const decimal = (cents: number) => (cents/100).toFixed(2);
export function amountMatches(amount: PayPalMoney|undefined, cents: number) {
  return !!amount && amount.currency_code==='USD' && /^\d+\.\d{2}$/.test(amount.value) && Math.round(Number(amount.value)*100)===cents;
}
