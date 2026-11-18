import { NextResponse } from "./next-response.mjs";
export function nextResponseJson(data,options={}){const response=new NextResponse(null,options);response.data=data;return response;}
