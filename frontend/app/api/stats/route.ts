import { NextResponse } from 'next/server';
import axios from 'axios';

/**
 * API route for fetching stats from the backend
 * This route runs server-side and includes the API key
 */
export const dynamic = 'force-dynamic';

// Use BACKEND_URL for server-side calls (internal Docker network)
const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.FLUXION_API_KEY;

export async function GET() {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/stats`, {
      headers: {
        'X-API-Key': API_KEY,
      },
      timeout: 10000,
    });

    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error fetching stats: ${status} - ${message}`);
      return NextResponse.json(
        { error: message },
        { status }
      );
    }
    
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
