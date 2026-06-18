import { NextResponse } from 'next/server';
import { queue } from '@/lib/queue';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const title = new URL(request.url).searchParams.get('title') ?? 'Example';
  await queue.add('Add', { title });

  return NextResponse.json({ ok: true });
}
