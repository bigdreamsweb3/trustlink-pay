"use client";

import { useEffect, useRef } from "react";

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
  logoUrl?: string;
}

const VERSION = 5;
const MODULE_COUNT = VERSION * 4 + 17;
const DATA = 108;
const ECC = 26;

type Cell = boolean | null;

function multiplyGf(left: number, right: number) {
  let product = 0;
  for (let value = right; value > 0; value >>>= 1) {
    if ((value & 1) !== 0) product ^= left;
    left <<= 1;
    if ((left & 0x100) !== 0) left ^= 0x11d;
  }
  return product;
}

function makeGenerator(degree: number) {
  let result = [1];
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    const next = new Array(result.length + 1).fill(0);
    for (let coefficient = 0; coefficient < result.length; coefficient += 1) {
      next[coefficient] ^= multiplyGf(result[coefficient], root);
      next[coefficient + 1] ^= result[coefficient];
    }
    result = next;
    root = multiplyGf(root, 2);
  }
  return result;
}

function makeEcc(data: number[]) {
  const generator = makeGenerator(ECC);
  const remainder = new Array(ECC).fill(0);
  for (const value of data) {
    const factor = value ^ remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ECC; index += 1) {
      remainder[index] ^= multiplyGf(generator[index], factor);
    }
  }
  return remainder;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function makeDATA(value: string) {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > DATA - 2) {
    // Don't hard-crash the app for long values. The caller can decide to render
    // a shorter URL/value instead (e.g. wa.me), or fall back to showing the code.
    return null;
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, DATA * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    data.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
  }
  for (let padIndex = 0; data.length < DATA; padIndex += 1) {
    data.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }

  return [...data, ...makeEcc(data)];
}

function makeMatrix() {
  return Array.from({ length: MODULE_COUNT }, () => new Array<Cell>(MODULE_COUNT).fill(null));
}

function setModule(matrix: Cell[][], reserved: boolean[][], x: number, y: number, dark: boolean, isReserved = true) {
  if (x < 0 || y < 0 || x >= MODULE_COUNT || y >= MODULE_COUNT) return;
  matrix[y][x] = dark;
  if (isReserved) reserved[y][x] = true;
}

function drawFinder(matrix: Cell[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const dark =
        dx >= 0 &&
        dx <= 6 &&
        dy >= 0 &&
        dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(matrix, reserved, xx, yy, dark);
    }
  }
}

function drawAlignment(matrix: Cell[][], reserved: boolean[][], x: number, y: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setModule(matrix, reserved, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function reserveFormat(matrix: Cell[][], reserved: boolean[][]) {
  for (let index = 0; index < 9; index += 1) {
    if (index !== 6) {
      setModule(matrix, reserved, 8, index, false);
      setModule(matrix, reserved, index, 8, false);
    }
  }
  for (let index = 0; index < 8; index += 1) {
    setModule(matrix, reserved, MODULE_COUNT - 1 - index, 8, false);
    setModule(matrix, reserved, 8, MODULE_COUNT - 1 - index, false);
  }
}

function drawFunctionPatterns(matrix: Cell[][], reserved: boolean[][]) {
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, MODULE_COUNT - 7, 0);
  drawFinder(matrix, reserved, 0, MODULE_COUNT - 7);
  drawAlignment(matrix, reserved, 30, 30);

  for (let index = 8; index < MODULE_COUNT - 8; index += 1) {
    const dark = index % 2 === 0;
    setModule(matrix, reserved, 6, index, dark);
    setModule(matrix, reserved, index, 6, dark);
  }

  reserveFormat(matrix, reserved);
  setModule(matrix, reserved, 8, VERSION * 4 + 9, true);
}

function maskBit(mask: number, x: number, y: number) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function placeData(baseMatrix: Cell[][], reserved: boolean[][], data: number[], mask: number) {
  const matrix = baseMatrix.map((row) => [...row]);
  const bits = data.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => (codeword >>> (7 - index)) & 1),
  );
  let bitIndex = 0;
  let upward = true;

  for (let right = MODULE_COUNT - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vertical = 0; vertical < MODULE_COUNT; vertical += 1) {
      const y = upward ? MODULE_COUNT - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        const rawDark = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
        matrix[y][x] = rawDark !== maskBit(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  return matrix as boolean[][];
}

function formatBits(mask: number) {
  let data = (0b01 << 3) | mask;
  let bits = data << 10;
  const generator = 0b10100110111;
  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >>> index) & 1) !== 0) bits ^= generator << (index - 10);
  }
  return (((data << 10) | bits) ^ 0b101010000010010) & 0x7fff;
}

function drawFormat(matrix: boolean[][], mask: number) {
  const bits = formatBits(mask);
  const first = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ];
  const second = [
    [MODULE_COUNT - 1, 8], [MODULE_COUNT - 2, 8], [MODULE_COUNT - 3, 8], [MODULE_COUNT - 4, 8],
    [MODULE_COUNT - 5, 8], [MODULE_COUNT - 6, 8], [MODULE_COUNT - 7, 8], [MODULE_COUNT - 8, 8],
    [8, MODULE_COUNT - 7], [8, MODULE_COUNT - 6], [8, MODULE_COUNT - 5], [8, MODULE_COUNT - 4],
    [8, MODULE_COUNT - 3], [8, MODULE_COUNT - 2], [8, MODULE_COUNT - 1],
  ];

  first.forEach(([x, y], index) => { matrix[y][x] = ((bits >>> index) & 1) !== 0; });
  second.forEach(([x, y], index) => { matrix[y][x] = ((bits >>> index) & 1) !== 0; });
}

function penalty(matrix: boolean[][]) {
  let score = 0;
  for (let y = 0; y < MODULE_COUNT; y += 1) {
    for (let x = 0, runColor = matrix[y][0], run = 0; x < MODULE_COUNT; x += 1) {
      if (matrix[y][x] === runColor) run += 1;
      else {
        if (run >= 5) score += run - 2;
        runColor = matrix[y][x];
        run = 1;
      }
      if (x === MODULE_COUNT - 1 && run >= 5) score += run - 2;
    }
  }
  for (let x = 0; x < MODULE_COUNT; x += 1) {
    for (let y = 0, runColor = matrix[0][x], run = 0; y < MODULE_COUNT; y += 1) {
      if (matrix[y][x] === runColor) run += 1;
      else {
        if (run >= 5) score += run - 2;
        runColor = matrix[y][x];
        run = 1;
      }
      if (y === MODULE_COUNT - 1 && run >= 5) score += run - 2;
    }
  }
  for (let y = 0; y < MODULE_COUNT - 1; y += 1) {
    for (let x = 0; x < MODULE_COUNT - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) score += 3;
    }
  }
  return score;
}

function createQrMatrix(value: string) {
  const baseMatrix = makeMatrix();
  const reserved = Array.from({ length: MODULE_COUNT }, () => new Array<boolean>(MODULE_COUNT).fill(false));
  drawFunctionPatterns(baseMatrix, reserved);
  const data = makeDATA(value);
  if (!data) return null;
  let best = placeData(baseMatrix, reserved, data, 0);
  let bestMask = 0;
  let bestPenalty = penalty(best);

  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = placeData(baseMatrix, reserved, data, mask);
    const score = penalty(candidate);
    if (score < bestPenalty) {
      best = candidate;
      bestMask = mask;
      bestPenalty = score;
    }
  }

  drawFormat(best, bestMask);
  return best;
}

export function QRCodeDisplay({
  value,
  size = 256,
  className = "",
  logoUrl,
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const matrix = createQrMatrix(value);
    if (!matrix) {
      // Clear any previous drawing and leave the canvas blank; parent can render a fallback.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = size * pixelRatio;
    canvas.height = size * pixelRatio;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const quietZone = 4;
    const modules = MODULE_COUNT + quietZone * 2;
    const moduleSize = size / modules;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#06120b";

    matrix.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (!dark) return;
        ctx.fillRect(
          Math.round((x + quietZone) * moduleSize),
          Math.round((y + quietZone) * moduleSize),
          Math.ceil(moduleSize),
          Math.ceil(moduleSize),
        );
      });
    });

    if (!logoUrl) return;

    const img = new Image();
    // Helps when integrators host the logo on a CDN with proper CORS headers.
    // Same-origin URLs (e.g. "/trustlink-logo.png") will work either way.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const logoSize = size * 0.18;
      const logoX = (size - logoSize) / 2;
      const logoY = (size - logoSize) / 2;
      const padding = logoSize * 0.22;
      const radius = logoSize * 0.24;

      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(logoX - padding, logoY - padding, logoSize + padding * 2, logoSize + padding * 2, radius);
      ctx.fill();
      ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
    };
    img.src = logoUrl;
  }, [value, size, logoUrl]);

  return (
    <div className={`qr-code-container ${className}`}>
      <canvas
        ref={canvasRef}
        className="block rounded-[18px]"
        aria-label="WhatsApp verification QR code"
      />
    </div>
  );
}
