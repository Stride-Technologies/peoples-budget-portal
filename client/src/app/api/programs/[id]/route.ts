import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

const getApiUrl = () => process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const API_URL = getApiUrl()

  try {
    const session = await getSession();
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

    const res = await fetch(`${API_URL}/programs/${id}`, {
      method: 'GET',
      headers,
    })

    const text = await res.text()
    let body: unknown = {}
    try { body = JSON.parse(text) } catch { body = text }

    if (!res.ok) {
      const status = res.status
      const msg = (typeof body === 'object' && body !== null && 'message' in body) ? ((body as Record<string, unknown>)['message'] as string | undefined) : undefined
      return NextResponse.json({ error: msg || 'Failed to fetch program' }, { status })
    }

    return NextResponse.json(body)
  } catch (err) {
    console.error('[api/programs/[id]/GET]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const API_URL = getApiUrl()

  try {
    const payload = await req.json()

    const session = await getSession();
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

    const res = await fetch(`${API_URL}/programs/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    })

    const text = await res.text()
    let body: unknown = {}
    try { body = JSON.parse(text) } catch { body = text }

    if (!res.ok) {
      const status = res.status
      const msg = (typeof body === 'object' && body !== null && 'message' in body) ? ((body as Record<string, unknown>)['message'] as string | undefined) : undefined
      return NextResponse.json({ error: msg || 'Failed to update program' }, { status })
    }

    // Revalidate listing paths
    try {
      revalidatePath('/dashboard/aip')
      revalidatePath('/programs')
    } catch (err) {
      console.error('[api/programs/[id]/PATCH] revalidatePath failed', err)
    }

    return NextResponse.json(body)
  } catch (err) {
    console.error('[api/programs/[id]/PATCH]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const API_URL = getApiUrl()

  try {
    const session = await getSession();
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

    const res = await fetch(`${API_URL}/programs/${id}`, {
      method: 'DELETE',
      headers,
    })

    const text = await res.text()
    if (!res.ok) {
      let body: unknown = {}
      try { body = JSON.parse(text) } catch { body = { message: text } }
      let msg: string | undefined
      if (typeof body === 'object' && body !== null && 'message' in body) {
        const b = body as { message?: unknown }
        if (typeof b.message === 'string') msg = b.message
      }
      const status = res.status
      return NextResponse.json({ error: msg || 'Failed to delete program' }, { status })
    }

    // Revalidate paths that list programs
    try {
      revalidatePath('/dashboard/aip')
      revalidatePath('/programs')
    } catch (err) {
      console.error('[api/programs/[id]/DELETE] revalidatePath failed', err)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/programs/[id]/DELETE]', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
