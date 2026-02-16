import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.FLUXION_API_KEY;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const { webhookId } = await params;
  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/admin/webhooks/${webhookId}`, {
      headers: { 'X-API-Key': API_KEY },
      timeout: 10000,
    });
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error fetching webhook ${webhookId}: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error fetching webhook:', error);
    return NextResponse.json({ error: 'Failed to fetch webhook' }, { status: 500 });
  }
}

export async function PATCH(
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
    const response = await axios.patch(
      `${API_BASE_URL}/api/v1/admin/webhooks/${webhookId}`,
      body,
      {
        headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error updating webhook ${webhookId}: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error updating webhook:', error);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const { webhookId } = await params;
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/v1/admin/webhooks/${webhookId}`, {
      headers: { 'X-API-Key': API_KEY },
      timeout: 10000,
    });
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error deleting webhook ${webhookId}: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error deleting webhook:', error);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
