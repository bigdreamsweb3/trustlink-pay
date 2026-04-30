"use client";

import { useEffect, useRef, useState } from "react";

interface WhatsAppIframeProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (status: "opening" | "opened" | "closed" | "error") => void;
}

export function WhatsAppIframe({ url, isOpen, onClose, onStatusChange }: WhatsAppIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeStatus, setIframeStatus] = useState<"opening" | "opened" | "closed" | "error">("opening");

  useEffect(() => {
    if (isOpen && iframeRef.current) {
      onStatusChange("opening");
      setIframeStatus("opening");

      // Load the WhatsApp URL
      iframeRef.current.src = url;

      // Monitor iframe loading
      const iframe = iframeRef.current;
      
      const handleLoad = () => {
        console.log("[WhatsAppIframe] WhatsApp loaded successfully");
        setIframeStatus("opened");
        onStatusChange("opened");
      };

      const handleError = () => {
        console.error("[WhatsAppIframe] Failed to load WhatsApp");
        setIframeStatus("error");
        onStatusChange("error");
      };

      iframe.addEventListener("load", handleLoad);
      iframe.addEventListener("error", handleError);

      return () => {
        iframe.removeEventListener("load", handleLoad);
        iframe.removeEventListener("error", handleError);
      };
    }
  }, [isOpen, url, onStatusChange]);

  const handleClose = () => {
    setIframeStatus("closed");
    onStatusChange("closed");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative w-full h-full max-w-2xl max-h-[600px] bg-white rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.197.297-.768.967-.941.967-.173.149-.349.149-.67-.149-.322-.149-1.086-.149-1.086-.149-.617 0-1.086.149-1.086.149-.173.173-.322.447-.322.447-.322.768-.322 1.086-.322.322 0 .67.149.67.149.297.149 1.707.867 2.03.967.322.099.471.149.67.149.197 0 .471-.149.941-.967.471-.818.941-1.663.941-1.663.173-.322.322-.447.322-.447.322-.617.149-1.086.149-1.086.149-.617 0-1.086-.149-1.086-.149-.322-.173-.67-.322-1.086-.322-.416 0-.768.149-1.086.322-.322.173-.471.447-.471.447l-.67 1.086c-.322.521-.471.818-.471.818s-.149.471-.149 1.086c0 .617.149 1.086.149 1.086.149.322.322.67.322 1.086.322.416 0 .768-.149 1.086-.322.322-.173.471-.447.471-.447l.67-1.086c.322-.521.471-.818.471-.818s.149-.471.149-1.086c0-.617-.149-1.086-.149-1.086-.149-.322-.322-.67-.322-1.086-.322-.416 0-.768.149-1.086.322z"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">WhatsApp</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status indicator */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {iframeStatus === "opening" && (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent"></div>
                <span className="text-sm text-gray-600">Opening WhatsApp...</span>
              </>
            )}
            {iframeStatus === "opened" && (
              <>
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-600">WhatsApp ready - Send verification message</span>
              </>
            )}
            {iframeStatus === "error" && (
              <>
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-xs">!</span>
                </div>
                <span className="text-sm text-red-600">Failed to load WhatsApp</span>
              </>
            )}
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative" style={{ minHeight: "400px" }}>
          <iframe
            ref={iframeRef}
            className="w-full h-full border-0"
            title="WhatsApp"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
            allow="clipboard-read; clipboard-write; microphone; camera; payment; ambient-light-sensor; accelerometer; gyroscope; magnetometer"
          />
          
          {/* Loading overlay */}
          {iframeStatus === "opening" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent mx-auto mb-4"></div>
                <p className="text-gray-600">Loading WhatsApp...</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {iframeStatus === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-600 mb-4">Failed to load WhatsApp</p>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 text-center">
            Send the verification message in WhatsApp to continue
          </p>
        </div>
      </div>
    </div>
  );
}
