import { NextResponse } from "next/server"
import axios from "axios"

export const dynamic = "force-dynamic"

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
const API_KEY = process.env.FLUXION_API_KEY

export async function GET(request: Request) {
  if (!API_KEY) return NextResponse.json({ error: "Server configuration error" }, { status: 500 })

  try {
    const { searchParams } = new URL(request.url)
    const response = await axios.get(`${API_BASE_URL}/api/v1/admin/diagnostics/webhooks`, {
      headers: { "X-API-Key": API_KEY },
      params: Object.fromEntries(searchParams.entries()),
      timeout: 10000,
    })
    return NextResponse.json(response.data)
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.detail || error.message
      : "Failed to fetch webhook coverage"
    return NextResponse.json({ error: message }, { status: axios.isAxiosError(error) ? error.response?.status || 500 : 500 })
  }
}
