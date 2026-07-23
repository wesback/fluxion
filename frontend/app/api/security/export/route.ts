import { NextResponse } from "next/server"
import axios from "axios"

export const dynamic = "force-dynamic"

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
const API_KEY = process.env.FLUXION_API_KEY

export async function GET(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const response = await axios.get(`${API_BASE_URL}/api/v1/security/export`, {
      headers: { "X-API-Key": API_KEY },
      params: Object.fromEntries(searchParams.entries()),
      responseType: "arraybuffer",
      timeout: 30000,
    })
    return new Response(response.data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers["content-type"] || "application/octet-stream",
        "Content-Disposition": response.headers["content-disposition"] || "attachment",
      },
    })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: error.response?.data?.detail || error.message },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json({ error: "Failed to export security updates" }, { status: 500 })
  }
}
