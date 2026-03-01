import { NextResponse } from "next/server";
import { getMetricsText } from "@/lib/metrics";

/**
 * GET /api/metrics — Prometheus scrape endpoint.
 * Returns metrics in Prometheus text exposition format.
 */
export async function GET() {
  const body = getMetricsText();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
