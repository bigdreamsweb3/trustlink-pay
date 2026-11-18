import { promises as native } from "node:fs";
import { filesystemPortGet } from "./filesystem-port-get.mjs";
export function filesystemPort(state) { return new Proxy(native,{get:filesystemPortGet.bind(null,state)}); }
