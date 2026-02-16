import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.FLUXION_API_KEY;

export async function GET() {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/admin/api-keys`, {
      headers: { 'X-API-Key': API_KEY },
      timeout: 10000,
    });
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error fetching API keys: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error fetching API keys:', error);
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  try {
    const body = await request.json();
    const response = await axios.post(`${API_BASE_URL}/api/v1/admin/api-keys`, body, {
      headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return NextResponse.json(response.data, { status: 201 });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error creating API key: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
