import { normalizeHttpValue } from "./normalize-http-value.mjs";
import { makeHttpRequest } from "./make-http-request.mjs";
import { fakeHttpFetch } from "./fake-http-fetch.mjs";
import { recordHttpLog } from "./record-http-log.mjs";
export async function executeHttpScenario(handler,scenario,fixtures,state){
  state.errors=scenario.errors??{};state.values=scenario.values??{};state.calls=[];
  state.work=structuredClone(Object.hasOwn(scenario,"work")?scenario.work:fixtures.work);
  state.related=structuredClone({...fixtures.work,id:"SYNTHETIC_SETTLEMENT",kind:"SETTLEMENT"});
  state.nodeAuthorization=scenario.nodeAuthorization??{configured:true,response:{status:200,body:{kind:"SYNTHETIC_AUTHORIZATION"}}};
  state.fetchResult=scenario.fetchResult??{status:200,body:{idToken:"SYNTHETIC_TOKEN",expiresIn:"3600"}};
  const logs=[],previousError=console.error,previousFetch=globalThis.fetch;
  console.error=recordHttpLog.bind(null,logs);globalThis.fetch=fakeHttpFetch.bind(null,state);
  try{
    const response=await handler(makeHttpRequest(Object.hasOwn(scenario,"body")?scenario.body:fixtures.goodBody,scenario.emptyQuery,scenario.raw),{params:Promise.resolve({id:"SYNTHETIC_WORK",path:["synthetic","path"]})});
    return {response:normalizeHttpValue(response),calls:normalizeHttpValue(state.calls),logs};
  }catch(error){return {thrown:normalizeHttpValue(error),calls:normalizeHttpValue(state.calls),logs};}
  finally{console.error=previousError;globalThis.fetch=previousFetch;}
}
