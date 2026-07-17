import type React from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "tsn-private-value": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        tin?: string;
        field?: "settlementWallet";
        fallback?: string;
      };
    }
  }
}

export {};
