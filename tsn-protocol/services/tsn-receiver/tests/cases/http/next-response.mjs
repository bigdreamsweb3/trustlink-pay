import { nextResponseJson } from "./next-response-json.mjs";
export class NextResponse {
  static json=nextResponseJson;
  constructor(body,options={}){this.body=body;this.status=options.status??200;this.headers=new Headers(options.headers);}
}
