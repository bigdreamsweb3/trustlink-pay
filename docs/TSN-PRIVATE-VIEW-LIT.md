# TSN Private View: Lit Component Architecture

**Status:** Active SDK architecture; authorization-service extraction remains in progress  
**SDK element:** `<tsn-private-value>`  
**Owner:** Transfer Settlement Network SDK  
**Integrating application responsibility:** Mount the element; do not render or retain plaintext

## Purpose

TSN Private View is the owner-device display boundary for information that a platform integrating TSN must not receive as ordinary application data. Examples include settlement authority, recovery authority, private transaction references, private receipt details, ZK-PRU routing material, and other fields classified as private by the Transfer Identity or settlement protocol.

TrustLink Pay is one integrating application. It does not own the Private View renderer. The renderer is a portable web component shipped by `@trustlink/tsn-sdk`, so another wallet, payment application, agency product, or protocol interface can mount the same audited boundary without rewriting its authorization, decryption, rendering, or cleanup behavior.

## Why Lit

[Lit](https://lit.dev/) builds standards-based custom elements and uses Shadow DOM as its default render root. Lit documents three relevant encapsulation properties: DOM scoping, style scoping, and separation between the component's internal tree and the host page. Ordinary document queries do not traverse the component's shadow tree. Lit also exposes `shadowRootOptions`, allowing TSN to request a closed root. [Lit: Working with Shadow DOM](https://lit.dev/docs/components/shadow-dom/)

TSN sets:

```ts
static shadowRootOptions: ShadowRootInit = { mode: "closed" };
```

For a closed root, the host element's `shadowRoot` property returns `null`. This behavior is defined by the platform, not invented by TSN. [MDN: `Element.attachShadow()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow), [MDN: `ShadowRoot.mode`](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/mode)

Lit lifecycle hooks also let the SDK invalidate an outstanding resolution and clear decrypted component state when the element disconnects. [Lit: Component lifecycle](https://lit.dev/docs/components/lifecycle/)

## Security composition

Closed Shadow DOM is one layer, not the complete privacy system.

| Layer | Protection |
|---|---|
| Wallet ownership proof | Establishes that the authorizing wallet controls the TIN owner authority |
| Device signing key | Proves possession for private sessions and sensitive requests |
| Device encryption key | Restricts envelope decryption to the authorized device credential |
| Authenticated encryption | Protects private payload confidentiality and integrity before rendering |
| TSN-owned Lit element | Prevents the platform from receiving plaintext as a normal React property or application state |
| Canvas pixel rendering | Keeps revealed text out of DOM text nodes, attributes, slots, and accessibility labels |
| Closed Shadow DOM | Hides the internal tree from `host.shadowRoot` and ordinary document selectors |
| Lifecycle cleanup | Clears SDK component state when disconnected, expired, revoked, or replaced |

No single row provides the entire guarantee. The guarantee comes from their composition.

## Rendering contract

An integrating application uses the SDK element:

```html
<tsn-private-value
  tin="1000000008"
  field="settlementWallet"
  fallback="Privately verified"
></tsn-private-value>
```

The application supplies only a field identifier, a TIN identifier, and privacy-safe fallback text. It must not supply decrypted text as an attribute, child node, React property, serialized page payload, or application-store value.

The TSN SDK owns the following sequence:

1. Detect the device credential associated with the TIN.
2. Confirm or create an active device-signed private session.
3. Obtain the encrypted field payload and the envelope addressed to the device encryption-key fingerprint.
4. Decrypt locally using the non-exportable device credential.
5. Draw the value as pixels on an HTML canvas inside the TSN component's closed shadow tree.
6. Clear the value when the component disconnects or authorization becomes invalid.

An unauthorized device receives only the fallback. An authorized device renders automatically; there is no redundant eye button or second wallet signature.

## Canvas rendering and copy contract

The authorized value is drawn with the Canvas 2D API. The SDK never inserts that value into a text node, attribute, ARIA label, slot, hidden input, or framework state. The ordinary DOM therefore contains a canvas element and privacy-safe controls, but not the revealed text. The HTML standard defines canvas as a scriptable bitmap surface. [HTML Standard: The canvas element](https://html.spec.whatwg.org/multipage/canvas.html)

Canvas text is not ordinary selectable DOM text. The SDK therefore supplies a **Copy** button. A copy action performs a fresh authorized resolution and writes the returned value directly to the system clipboard; it does not create a temporary input or dispatch a plaintext-bearing application event. Clipboard writes require a secure context and may require transient user activation, which the explicit button click provides. [MDN: Clipboard `writeText()`](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText), [MDN: Clipboard API security considerations](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations)

The canvas uses a descriptive ARIA label that never contains the private value. This deliberately means assistive technology cannot read the secret itself in the default mode. Canvas content is not exposed to accessibility tools like semantic HTML, so an explicitly authorized accessible-reveal mode will require a separate, carefully designed threat model; it must remain disabled by default. [MDN: Canvas accessibility](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Drawing_graphics#accessibility_concerns)

Canvas is an exposure-reduction layer, not encryption. Authorized or compromised code that obtains the canvas can read its pixels with `getImageData()`, instrument drawing or clipboard APIs, intercept the resolver before rendering, or capture the screen. [MDN: Canvas `getImageData()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData) Device authorization, authenticated encryption, XSS prevention, dependency integrity, CSP, and browser/OS security remain mandatory.

## Platform boundary

The platform frontend may mount the custom element, position it, and apply explicitly supported theme tokens or CSS parts. It must not own the internal plaintext node, decryption routine, private-session state, or device private keys.

The platform backend must not act as the Private View data path. It must not receive:

- decrypted private fields;
- device private keys;
- unwrapped data-encryption keys;
- private values copied from the SDK element;
- private payloads for server-side rendering;
- analytics or logs containing revealed values.

TSN authorization infrastructure may process challenges, commitments, public device keys, signed proofs, ciphertext, envelopes, revocation state, and replay-protection nonces. That infrastructure is a TSN service boundary, not a TrustLink application-data boundary.

### Current extraction status

The SDK-owned Lit renderer and local encrypted device container are active. Some challenge, device-registry, and private-session transport adapters are still physically hosted in the TrustLink backend process. They do not own the Lit renderer or locally decrypted value, but their location does not satisfy the final platform-independent deployment boundary. They must move to a TSN-owned authorization service and be addressed directly through a TSN SDK service URL.

The legacy `/api/identity` contract and legacy on-chain binding reader can still carry raw settlement or recovery authority fields for older flows. Private View does not make that legacy delivery private. Those fields must be removed from the ordinary application response after the encrypted TSN identity-envelope migration is complete. Until then, the final checklist item prohibiting application API plaintext is a required exit criterion, not a completed guarantee.

This limitation is documented explicitly so that current deployment topology is not confused with the final protocol guarantee.

## What closed Shadow DOM does and does not prove

### It does

- make `element.shadowRoot` return `null` for normal page JavaScript;
- keep the internal nodes outside ordinary `document.querySelector` traversal;
- isolate internal styles and DOM structure from accidental application interference;
- keep ordinary `innerHTML`/`getHTML()` serialization from including shadow roots by default;
- make the TSN component a portable, framework-independent integration boundary.

The HTML platform documents that `Element.getHTML()` does not serialize child shadow roots unless specifically requested through shadow-root options and references. [MDN: `Element.getHTML()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getHTML)

### It does not

- make plaintext invisible to the authorized user who is looking at it;
- prevent screenshots, screen capture, accessibility output, browser extensions with elevated privileges, or operating-system compromise;
- prevent authorized or compromised page code from reading canvas pixels or instrumenting Canvas and Clipboard APIs;
- defeat malicious code that intercepted `attachShadow()` before component construction and retained the returned root;
- protect a device after its browser or execution environment is fully compromised;
- replace encryption, device authorization, Content Security Policy, dependency integrity, or XSS prevention.

MDN notes that JavaScript holding the `ShadowRoot` returned by `attachShadow()` can still access a closed root. Browser extension APIs may also expose open or closed roots under their own privileged model. [MDN: `Element.attachShadow()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow), [MDN: extension `openOrClosedShadowRoot()`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot)

Therefore TSN describes closed Shadow DOM as **encapsulation and exposure reduction**, not as a cryptographic security boundary.

## Serialization policy

TSN Private View roots must not be created with `serializable: true`. Integrations must not retain a root reference and pass it to serialization APIs. Private View must not participate in server-side rendering, static HTML export, page snapshots, analytics DOM capture, session replay, or error-reporting DOM capture.

The host HTML may contain:

```html
<tsn-private-value tin="1000000008" field="settlementWallet"></tsn-private-value>
```

It must not contain the revealed value. Downloading or serializing ordinary light DOM should capture the host element and privacy-safe attributes, not its internal decrypted tree.

## Styling and extension

The default component intentionally owns its internal structure and requires no platform CSS classes. Future customization must use a narrow, documented contract:

- inherited design tokens for typography and color;
- explicitly exported CSS custom properties;
- carefully selected `part` names for presentation only;
- no slot that accepts private plaintext;
- no callback that returns decrypted plaintext to the platform;
- no reflected attribute containing private state.

This allows agencies to match their product design without replacing the security implementation.

## Verification checklist

- `customElements.get("tsn-private-value")` resolves to the SDK class.
- The class is built and exported from `tsn-protocol/tsn-sdk`, not `frontend/`.
- `element.shadowRoot === null` after mounting.
- The host element has no plaintext child text node or private-value attribute.
- The closed tree has no plaintext text node, attribute, ARIA label, slot, or hidden form control.
- The authorized value is drawn only as canvas pixels and cleared when disconnected or replaced.
- Copy performs a fresh authorized resolution and never creates a plaintext DOM node.
- Ordinary `document.querySelector` cannot select the internal value node.
- Ordinary `innerHTML` and default `getHTML()` do not include the internal value.
- Unauthorized devices render only the configured fallback.
- Authorized devices decrypt automatically without another wallet signature.
- Disconnecting the element invalidates outstanding work and clears component state.
- Logout, device revocation, and private-session expiry return the component to locked state.
- No application API response, React state, log, analytics event, or cache contains the revealed value.
- Content Security Policy and dependency review protect the authorized execution environment.

## Source locations

| Source | Responsibility |
|---|---|
| `tsn-protocol/tsn-sdk/src/private-view/private-value-element.ts` | Lit element, closed root, rendering lifecycle, cleanup |
| `tsn-protocol/tsn-sdk/src/private-view/public.ts` | Public SDK export |
| `tsn-protocol/tsn-sdk/src/device/` | Non-exportable device credentials and fingerprints |
| `tsn-protocol/tsn-sdk/src/authorization/` | Canonical owner-device authorization |
| `tsn-protocol/tsn-sdk/src/sessions/` | Device proof-of-possession private sessions |
| `tsn-protocol/tsn-sdk/src/receipts/` | Authenticated encryption and key envelopes |

## References

- [Lit documentation](https://lit.dev/docs/)
- [Lit: Working with Shadow DOM](https://lit.dev/docs/components/shadow-dom/)
- [Lit: Lifecycle](https://lit.dev/docs/components/lifecycle/)
- [LitElement API: `shadowRootOptions`](https://lit.dev/docs/v2/api/LitElement/)
- [MDN: `Element.attachShadow()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow)
- [MDN: `ShadowRoot.mode`](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/mode)
- [MDN: `Element.getHTML()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/getHTML)
