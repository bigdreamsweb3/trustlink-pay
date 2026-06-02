export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      event?: string;
      meta?: Record<string, unknown>;
      level?: "info" | "warn" | "error";
    };
    const event = String(body.event ?? "tsn.frontend");
    const meta = body.meta ?? {};
    const level = body.level ?? "info";
    const line = `[${level}] ${event} ${JSON.stringify(meta)}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[error] tsn.frontend.log_failed", error);
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
