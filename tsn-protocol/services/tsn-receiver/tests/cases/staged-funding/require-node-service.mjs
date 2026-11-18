/** Route-only credential stub records and enforces the declared Node service boundary. */
export function requireNodeService(state, request, service) {
  state.push(service);
  if (service !== "node" || request.credential !== "synthetic-node-credential") throw new Error("UNAUTHORIZED_SERVICE");
}
