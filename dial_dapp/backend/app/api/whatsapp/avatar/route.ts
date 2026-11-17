export const runtime = "nodejs";

import { fail } from "@/app/lib/http";

function isAllowedAvatarUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isAllowedAvatarUrl(url)) {
    return fail("Invalid avatar url", 400);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    return fail("Could not load avatar", 502);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = await response.arrayBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}
