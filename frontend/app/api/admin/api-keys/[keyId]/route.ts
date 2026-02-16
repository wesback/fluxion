import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const API_KEY = process.env.FLUXION_API_KEY;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> }
) {
  if (!API_KEY) {
    console.error('FLUXION_API_KEY environment variable is not set');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const { keyId } = await params;
  try {
    const response = await axios.delete(`${API_BASE_URL}/api/v1/admin/api-keys/${keyId}`, {
      headers: { 'X-API-Key': API_KEY },
      timeout: 10000,
    });
    return NextResponse.json(response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.detail || error.message;
      console.error(`Error deleting API key ${keyId}: ${status} - ${message}`);
      return NextResponse.json({ error: message }, { status });
    }
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
  }
}
