export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-10 text-center">
      <h1 className="mb-6 text-3xl font-bold">Support</h1>
      <p className="max-w-2xl text-lg text-gray-600">
        Need help with TrustLink Pay? Our support team is here to assist you with any questions regarding our payment infrastructure or verification process.
      </p>
      <p className="mt-4 text-gray-600">Contact us at: support@trustlinklabs.io</p>
      <a href="/" className="mt-8 text-blue-500 hover:underline">Return to Home</a>
    </div>
  );
}
