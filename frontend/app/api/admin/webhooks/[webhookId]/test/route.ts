import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.FLUXION_API_KEY;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const { webhookId } = await params;
  try {
    const body = await request.json();
    const response = await axios.post(
      `${API_BASE_URL}/api/v1/admin/webhooks/${webhookId}/test`,
      body,
      {
        headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error testing webhook ${webhookId}: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error testing webhook:', error);
    return NextResponse.json({ error: 'Failed to test webhook' }, { status: 500 });
  }
}
