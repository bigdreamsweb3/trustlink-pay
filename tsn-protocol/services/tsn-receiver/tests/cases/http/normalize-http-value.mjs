export function normalizeHttpValue(value){
  if(value instanceof Error)return {name:value.name,message:value.message,...(value.code?{code:value.code}:{})};
  if(value instanceof Headers)return Object.fromEntries([...value]);
  if(value instanceof Response)return {status:value.status,headers:normalizeHttpValue(value.headers)};
  if(typeof value==="function")return "<function>";
  if(value===undefined)return "<undefined>";
  if(Array.isArray(value))return value.map(normalizeHttpValue);
  if(value&&typeof value==="object"){const result={};for(const[key,entry]of Object.entries(value))result[key]=normalizeHttpValue(entry);return result;}
  return value;
}
