import { LitElement, css, html } from "lit";

export type TsnPrivateField = "settlementWallet";
export type TsnPrivateValueResolver = (request: {
  tin: string;
  field: TsnPrivateField;
}) => Promise<string | null>;

let resolver: TsnPrivateValueResolver | null = null;

export function configureTsnPrivateValueResolver(next: TsnPrivateValueResolver) {
  resolver = next;
}

export class TsnPrivateValueElement extends LitElement {
  static properties = {
    tin: { type: String },
    field: { type: String },
    fallback: { type: String },
    ready: { state: true },
    loading: { state: true },
    copyStatus: { state: true },
  };

  static shadowRootOptions: ShadowRootInit = { mode: "closed" };

  static styles = css`
    :host {
      display: block;
      width: 100%;
      max-width: 100%;
      -webkit-user-select: none;
      user-select: none;
    }
    .private-value { display: flex; width: 100%; max-width: 100%; align-items: center; gap: 0.4rem; }
    canvas {
      display: block;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      height: 1.2rem;
      -webkit-user-select: none;
      user-select: none;
    }
    button {
      border: 0;
      border-radius: 0.5rem;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 0.64rem;
      padding: 0.2rem 0.35rem;
      white-space: nowrap;
    }
    button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .fallback { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;

  tin = "";
  field: TsnPrivateField = "settlementWallet";
  fallback = "Privately verified";
  private ready = false;
  private loading = false;
  private copyStatus = "Copy";
  private generation = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private observedWidth = 0;

  connectedCallback() {
    super.connectedCallback();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(([entry]) => {
        const width = entry?.contentRect.width ?? 0;
        if (!width || Math.abs(width - this.observedWidth) < 1) return;
        this.observedWidth = width;
        if (!this.ready) return;
        if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
          this.resizeTimer = null;
          if (this.isConnected) void this.resolvePrivateValue();
        }, 100);
      });
      this.resizeObserver.observe(this);
    }
    void this.resolvePrivateValue();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("tin") || changed.has("field")) void this.resolvePrivateValue();
  }

  disconnectedCallback() {
    this.generation += 1;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    this.observedWidth = 0;
    this.clearCanvas();
    this.ready = false;
    this.loading = false;
    super.disconnectedCallback();
  }

  private async resolvePrivateValue() {
    const generation = ++this.generation;
    this.clearCanvas();
    this.ready = false;
    if (!this.tin || !resolver) return;
    this.loading = true;
    let privateValue: string | null = null;
    try {
      privateValue = await resolver({ tin: this.tin, field: this.field });
      if (generation === this.generation && this.isConnected && privateValue) {
        this.ready = true;
        this.loading = false;
        await this.updateComplete;
        this.drawPrivateValue(privateValue);
      }
    } catch {
      if (generation === this.generation) this.ready = false;
    } finally {
      privateValue = null;
      if (generation === this.generation) this.loading = false;
    }
  }

  private drawPrivateValue(value: string) {
    const canvas = this.renderRoot.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const button = this.renderRoot.querySelector("button");
    const hostWidth = this.getBoundingClientRect().width || 320;
    const buttonWidth = button instanceof HTMLButtonElement ? button.getBoundingClientRect().width : 0;
    const cssWidth = Math.max(48, hostWidth - buttonWidth - 7);
    const hostStyle = getComputedStyle(this);
    const fontSize = Number.parseFloat(hostStyle.fontSize || "11") || 11;
    const cssHeight = Math.max(20, Math.ceil(fontSize * 1.5));
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.font = `${hostStyle.fontWeight || "400"} ${hostStyle.fontSize || "11px"} ${hostStyle.fontFamily || "sans-serif"}`;
    context.fillStyle = hostStyle.color || "#ffffff";
    context.textBaseline = "middle";
    let display = value;
    while (display.length > 5 && context.measureText(display).width > cssWidth) {
      display = `${display.slice(0, -2)}\u2026`;
    }
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillText(display, 0, cssHeight / 2, cssWidth);
  }

  private clearCanvas() {
    const canvas = this.renderRoot?.querySelector?.("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }

  private async copyPrivateValue() {
    if (!resolver || !this.tin) return;
    let privateValue: string | null = null;
    try {
      privateValue = await resolver({ tin: this.tin, field: this.field });
      if (!privateValue) throw new Error("Private value is unavailable");
      await navigator.clipboard.writeText(privateValue);
      this.copyStatus = "Copied";
      window.setTimeout(() => {
        if (this.isConnected) this.copyStatus = "Copy";
      }, 1500);
    } catch {
      this.copyStatus = "Copy failed";
    } finally {
      privateValue = null;
    }
  }

  render() {
    if (!this.ready) {
      return html`<span class="fallback" part="fallback">${this.loading ? "" : this.fallback}</span>`;
    }
    return html`
      <span class="private-value" part="container">
        <canvas part="canvas" role="img" aria-label="Private value displayed on this authorized device"></canvas>
        <button part="copy-button" type="button" @click=${() => void this.copyPrivateValue()}>${this.copyStatus}</button>
      </span>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("tsn-private-value")) {
  customElements.define("tsn-private-value", TsnPrivateValueElement);
}

declare global {
  interface HTMLElementTagNameMap {
    "tsn-private-value": TsnPrivateValueElement;
  }
}
