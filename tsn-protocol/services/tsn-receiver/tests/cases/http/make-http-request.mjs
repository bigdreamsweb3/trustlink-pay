import { httpRequestJson } from "./http-request-json.mjs";
import { httpRequestText } from "./http-request-text.mjs";
export function makeHttpRequest(body,emptyQuery=false,raw){return {url:"https://receiver.test/synthetic",headers:new Headers({"x-synthetic":"fixture"}),nextUrl:new URL("https://receiver.test/synthetic"+(emptyQuery?"":"?id=SYNTHETIC_WORK&after=SYNTHETIC_CURSOR")),json:httpRequestJson.bind(null,body,raw),text:httpRequestText.bind(null,body,raw)};}
