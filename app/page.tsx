import Storefront from './storefront';
import {catalog,settings,publicProduct} from '../lib/store-server';
export const dynamic='force-dynamic';
export default async function Home(){return <Storefront initialProducts={(await catalog()).map(publicProduct)} initialSettings={await settings()}/>;}
