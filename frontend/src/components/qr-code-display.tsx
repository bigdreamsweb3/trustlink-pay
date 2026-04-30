"use client";

import { useEffect, useRef } from "react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  logoUrl?: string;
}

export function QRCodeDisplay({ 
  value, 
  size = 256, 
  className = "",
  logoUrl 
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Simple QR code placeholder (in production, use a proper QR library)
    const drawPlaceholderQR = () => {
      const cellSize = size / 25; // 25x25 grid
      const margin = cellSize * 2;
      
      // Draw background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      
      // Draw border
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
      
      // Draw corner squares
      const drawCornerSquare = (x: number, y: number) => {
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, cellSize * 7, cellSize * 7);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + cellSize, y + cellSize, cellSize * 5, cellSize * 5);
        ctx.fillStyle = "#000000";
        ctx.fillRect(x + cellSize * 2, y + cellSize * 2, cellSize * 3, cellSize * 3);
      };
      
      drawCornerSquare(margin, margin);
      drawCornerSquare(size - margin - cellSize * 7, margin);
      drawCornerSquare(margin, size - margin - cellSize * 7);
      
      // Draw random pattern in center
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 50; i++) {
        const x = margin + cellSize * 8 + Math.random() * cellSize * 9;
        const y = margin + cellSize * 8 + Math.random() * cellSize * 9;
        if (Math.random() > 0.5) {
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
      
      // Add logo placeholder if provided
      if (logoUrl) {
        const img = new Image();
        img.onload = () => {
          const logoSize = cellSize * 4;
          const logoX = (size - logoSize) / 2;
          const logoY = (size - logoSize) / 2;
          
          // White background for logo
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);
          
          // Draw logo
          ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
        };
        img.src = logoUrl;
      }
      
      // Add text overlay
      ctx.fillStyle = "#000000";
      ctx.font = `${cellSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      // Extract session code from the URL
      const codeMatch = value.match(/TL-[A-Z0-9]{6}/);
      if (codeMatch) {
        ctx.fillText(codeMatch[0], size / 2, size - cellSize * 3);
      }
    };

    drawPlaceholderQR();
  }, [value, size, logoUrl]);

  return (
    <div className={`qr-code-container ${className}`}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="border border-gray-300 rounded-lg"
      />
    </div>
  );
}
