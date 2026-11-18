import { invokeHttpPort } from "./invoke-http-port.mjs";
export async function fakeHttpFetch(state,...args){invokeHttpPort(state,"fetch",...args);const value=state.fetchResult;return new Response(JSON.stringify(value.body),{status:value.status,headers:{"content-type":"application/json"}});}
