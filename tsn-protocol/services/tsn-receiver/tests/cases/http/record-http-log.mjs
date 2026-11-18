import { normalizeHttpValue } from "./normalize-http-value.mjs";
export function recordHttpLog(logs,...args){logs.push(normalizeHttpValue(args));}
