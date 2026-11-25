import { after, test } from "node:test";
import { createRelayFixture } from "./cases/node-relay/create-relay-fixture.mjs";
import { cleanupFixture } from "./cases/staged-funding/cleanup-fixture.mjs";
import { testEncryptedRoundtrip } from "./cases/node-relay/test-encrypted-roundtrip.mjs";
import { testReplyMutations } from "./cases/node-relay/test-reply-mutations.mjs";
import { testNativeFences } from "./cases/node-relay/test-native-fences.mjs";
import { testExpiryAndValidation } from "./cases/node-relay/test-expiry-and-validation.mjs";
import { testHttpAuthentication } from "./cases/node-relay/test-http-authentication.mjs";
import { testWatchAndAdmission } from "./cases/node-relay/test-watch-and-admission.mjs";

const fixture = await createRelayFixture();
after(cleanupFixture.bind(null, fixture));
test("relay encrypts private input/replies, claims once and returns the exact signed result", testEncryptedRoundtrip.bind(null, fixture));
test("reply changes and stale/other claims cannot mutate Receiver state", testReplyMutations.bind(null, fixture));
test("native requests retain Cranker generation across enqueue, execution and publication", testNativeFences.bind(null, fixture));
test("expired requests release admission and malformed requests never enter the queue", testExpiryAndValidation.bind(null, fixture));
test("relay sync, claim, renewal and replies require Node authentication", testHttpAuthentication.bind(null, fixture));
test("Firestore watchers close on synchronous completion and admission is bounded", testWatchAndAdmission.bind(null, fixture));
