import {notFound} from 'next/navigation';
import {policyContent,policySlugs} from '../../../lib/policies';
import {settings} from '../../../lib/store-server';
import {store} from '../../../lib/store-types';
import {commerceSettings,readiness} from '../../../lib/commerce-server';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const name=policySlugs[slug];if(!name)notFound();const s=await settings(),config=await commerceSettings(),r=await readiness();const sections=policyContent(name,s,config,r.enabled&&r.mode==='live');return <><header className="simple-header"><a className="logo" href="/">LIANG NÜ ZHUANG<span>靓 女 装</span></a><a href="/">← Return to the store</a></header><main className="policy-page"><p className="eyebrow">CUSTOMER CARE</p><h1>{name}</h1><p className="policy-date">Last updated November 10, 2026</p>{sections.map(p=><section key={p.title}><h2>{p.title}</h2><p>{p.body}</p></section>)}<a className="button outline" href={`mailto:${store.email}`}>Email customer service ↗</a><nav>{Object.entries(policySlugs).map(([s,n])=><a key={s} href={`/policies/${s}`} aria-current={name===n?'page':undefined}>{n}</a>)}</nav></main></>}
