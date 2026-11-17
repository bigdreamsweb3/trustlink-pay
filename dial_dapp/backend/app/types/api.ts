export interface ApiError {
  error: string;
  details?: unknown;
}

export interface CreatePaymentRequest {
  paymentId?: string;
  phoneNumber: string;
  senderPhoneNumber: string;
  amount: number;
  tokenMintAddress: string;
  senderWallet: string;
  fundingSignature?: string;
}

export interface AcceptPaymentRequest {
  paymentId: string;
  phoneNumber: string;
  otp: string;
  walletAddress?: string;
  receiverWalletId?: string;
}

export interface SendOtpRequest {
  phoneNumber: string;
  purpose?: "generic" | "register" | "login";
}

export interface VerifyOtpRequest {
  phoneNumber: string;
  otp: string;
  purpose?: "generic" | "register" | "login";
}

export interface RegisterRequest {
  phoneNumber: string;
  otp: string;
  displayName: string;
  handle: string;
  walletAddress?: string;
}

export interface LoginRequest {
  phoneNumber: string;
  otp: string;
}

export interface AddReceiverWalletRequest {
  walletName: string;
  walletAddress: string;
}
