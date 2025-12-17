import { NextResponse } from 'next/server';

/**
 * Runtime configuration endpoint
 * Returns configuration that can be changed at container startup
 * without rebuilding the image
 */
export async function GET() {
  const config = {
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  };

  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
