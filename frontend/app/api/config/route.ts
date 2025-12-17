import { NextResponse } from 'next/server';

/**
 * Runtime configuration endpoint
 * Returns configuration that can be changed at container startup
 * without rebuilding the image
 * 
 * This is a public endpoint that doesn't require authentication
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  };

  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
