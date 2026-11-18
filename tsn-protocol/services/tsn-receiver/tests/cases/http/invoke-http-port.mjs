import { NextResponse } from "./next-response.mjs";
export function invokeHttpPort(state,name,...args){
  state.calls.push([name,...args]);
  if(Object.hasOwn(state.errors,name)){const value=state.errors[name];if(value&&typeof value==="object"&&value.nonError)throw value.nonError;const error=new Error(typeof value==="string"?value:value.message);if(value&&value.code)error.code=value.code;throw error;}
  if(Object.hasOwn(state.values,name))return state.values[name];
  if(["receive","getWorkForNode","leaseForNode","leaseForCranker","attachCrankerAuthorization"].includes(name))return state.work;
  if(name==="getWork")return String(args[0]).startsWith("settlement-")?state.related:state.work;
  if(["listKind","listRecent"].includes(name))return state.work?[state.work]:[];
  if(name==="publicIntent")return {id:args[0]?.id,status:args[0]?.status};
  if(name==="publicCoordinationPayload")return {paymentId:args[0]?.payload.paymentId??"SYNTHETIC_PAYMENT"};
  if(name==="verifiedPayloadForWork")return state.work?.verification?.verifiedPayload??null;
  if(name==="crankerExecutionPayload")return {senderSignedFundingTransaction:"SYNTHETIC_EXECUTION_WIRE"};
  if(name==="crankerAuthorizationForWork")return args[1];
  if(name==="authenticateCrankerRequest")return "SYNTHETIC_CRANKER";
  if(name==="assertExternalWorkKind"&&!["AUTHORIZED_FUNDING","TIN_OPERATION"].includes(args[0]))throw new Error(args[0]+"_WORK_INTERNAL_ONLY");
  if(name==="requestNodeAuthorization"){const x=state.nodeAuthorization;return {...x,response:x.response?new Response(JSON.stringify(x.response.body),{status:x.response.status,headers:{"content-type":"application/json"}}):null};}
  if(name==="getAuth")return {createCustomToken:invokeHttpPort.bind(null,state,"createCustomToken")};
  if(name==="createCustomToken")return "SYNTHETIC_CUSTOM_TOKEN";
  if(name==="proxyNode")return NextResponse.json({proxy:args[1]});
  if(name==="storageCollection")return {limit:invokeHttpPort.bind(null,state,"storageLimit")};
  if(name==="storageLimit")return {get:invokeHttpPort.bind(null,state,"storageGet")};
  return {result:name};
}
