/** Private storage boundary only. It does not receive Node/Mother keys or decide chain settlement. */
async function authorized(request,token) {
  if(typeof token!=="string"||token.length<32)return false;
  const presented=request.headers.get("authorization")??"";
  const encoder=new TextEncoder();
  const left=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(presented)));
  const right=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode("Bearer "+token)));
  let difference=0;for(let i=0;i<left.length;i++)difference|=left[i]^right[i];return difference===0;
}
function validKey(key) { return typeof key==="string"&&/^\{[A-Za-z0-9_-]{1,64}\}:(metadata|record:[0-9a-f]{64})$/.test(key); }
function metadata(raw) {
  if(typeof raw!=="string"||new TextEncoder().encode(raw).length>768*1024)throw new Error("TSN_STORE_METADATA_INVALID");
  const value=JSON.parse(raw);
  if(!value||value.format!=="TSN_RECEIVER_RECORD_STORE"||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0
      ||!value.collections||typeof value.collections!=="object"||Array.isArray(value.collections))throw new Error("TSN_STORE_METADATA_INVALID");
  return value;
}
export async function handleStoreRequest(request,env) {
  const reply=(result,status=200)=>Response.json({result},{status,headers:{"cache-control":"no-store"}});
  if(!await authorized(request,env.STORE_TOKEN))return reply(null,401);
  if(request.method!=="POST")return reply(null,405);
  try {
    const text=await request.text();if(new TextEncoder().encode(text).length>8*1024*1024)return reply(null,413);
    const body=JSON.parse(text);
    if(body.operation==="read"){
      if(!Array.isArray(body.keys)||body.keys.length<1||body.keys.length>64||!body.keys.every(validKey))return reply(null,400);
      const result=await env.DB.prepare("SELECT key,value FROM records WHERE key IN ("+body.keys.map(()=>"?").join(",")+")").bind(...body.keys).all();
      const rows=new Map(result.results.map(row=>[row.key,row.value]));
      return reply(body.keys.map(key=>rows.get(key)??null));
    }
    if(body.operation!=="commit"||!validKey(body.metadataKey)||!body.metadataKey.endsWith(":metadata")
        ||!Array.isArray(body.records)||body.records.length<1||body.records.length>1000)return reply(null,400);
    const before=metadata(body.expected),after=metadata(body.metadata);
    if(after.revision!==before.revision+1)return reply(null,400);
    const prefix=body.metadataKey.slice(0,-"metadata".length);
    const unique=new Set();
    for(const record of body.records){
      if(!validKey(record.key)||!record.key.startsWith(prefix+"record:")||unique.has(record.key))return reply(null,400);
      unique.add(record.key);
      if(record.value!==null){
        if(typeof record.value!=="string"||new TextEncoder().encode(record.value).length>1024*1024)return reply(null,400);
        const row=JSON.parse(record.value);if(!row||typeof row!=="object"||Array.isArray(row))return reply(null,400);
      }
    }
    const statements=[env.DB.prepare("INSERT INTO commit_guard(metadata_key,expected) VALUES (?,?) ON CONFLICT(metadata_key) DO UPDATE SET expected=excluded.expected").bind(body.metadataKey,body.expected),
      env.DB.prepare("UPDATE records SET value=? WHERE key=?").bind(body.metadata,body.metadataKey)];
    const writes=body.records.filter(record=>record.value!==null),deletes=body.records.filter(record=>record.value===null);
    for(let start=0;start<writes.length;start+=40){
      const page=writes.slice(start,start+40);
      statements.push(env.DB.prepare("INSERT INTO records(key,value) VALUES "+page.map(()=>"(?,?)").join(",")+" ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(...page.flatMap(record=>[record.key,record.value])));
    }
    for(let start=0;start<deletes.length;start+=40){const page=deletes.slice(start,start+40);statements.push(env.DB.prepare("DELETE FROM records WHERE key IN ("+page.map(()=>"?").join(",")+")").bind(...page.map(record=>record.key)));}
    if(statements.length>50)return reply(null,413);
    await env.DB.batch(statements);
    return reply(true);
  }catch(error){
    if(String(error).includes("TSN_STORE_CONFLICT"))return reply(false);
    return reply(null,503);
  }
}
export default {fetch:handleStoreRequest};
