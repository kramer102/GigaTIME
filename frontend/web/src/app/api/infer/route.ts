/**
 * Route Handler for /api/infer — bypasses the Next.js rewrite proxy
 * to avoid its 10 MB body-size limit and short timeout.
 *
 * Forwards the multipart upload as-is to the FastAPI backend and
 * streams the JSON response back.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8000";

/** CPU inference can take 30-60 s on a single tile. */
const INFERENCE_TIMEOUT_MS = 120_000;

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();
  const contentType = request.headers.get("content-type") || "";

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/infer`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: Buffer.from(body),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Backend request failed: ${msg}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
