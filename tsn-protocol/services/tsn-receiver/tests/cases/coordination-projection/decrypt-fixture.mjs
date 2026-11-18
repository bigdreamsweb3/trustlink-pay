export function decryptFixture(context, envelope) {
  context.decryptions += 1;
  return structuredClone(envelope.plaintext);
}
