import assert from "node:assert/strict";
import { createRelayContext } from "./create-relay-context.mjs";

export async function testWatchAndAdmission(fixture) {
  const c = createRelayContext(fixture), d = c.dependencies;
  const pending = {id:"11".repeat(32), requestHash:"22".repeat(32), status:"PENDING"};
  const reply = {status:200, body:'{"ok":true}', contentType:"application/json"};
  const completed = {...pending,status:"COMPLETED",response:d.encrypt(reply)};
  let closed = 0;
  const snapshot = value => ({exists:true,get:name=>value[name],data:()=>value});
  const watched = {...d,jobs:{doc:()=>({get:async()=>snapshot(pending),onSnapshot:callback=>{callback(snapshot(completed));return()=>closed++;}})}};
  assert.equal((await c.waitRelayReply(watched,pending.id,pending.requestHash)).status,200);
  assert.equal(closed,1,"a synchronous completion must still close its watcher");
  closed = 0;
  const activity = {get:async()=>snapshot({epoch:"same",revision:1}),onSnapshot:callback=>{callback(snapshot({epoch:"same",revision:2}));return()=>closed++;}};
  assert.equal((await c.syncLocalNode({activity},"same",1)).cursor,2);
  assert.equal(closed,1);
  await d.activity.set({epoch:"bounded",revision:1,active:{FUNDING:128}});
  await assert.rejects(c.enqueueRelayRequest(d,{method:"GET",path:"/network/recent-blockhash",search:"",headers:{},body:null}),/QUEUE_FULL/);
  assert.equal((await d.jobs.get()).docs.length,0);
}
