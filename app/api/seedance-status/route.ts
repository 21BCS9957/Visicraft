import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const apiKey = process.env.PIAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Seedance is not configured yet. Add PIAPI_API_KEY to the environment.' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.piapi.ai/api/v1/task/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.message || 'Seedance polling failed' },
        { status: response.status }
      );
    }

    const task = data?.data ?? data;
    const status = String(task?.status ?? '').toLowerCase();
    const errorMessage = task?.error?.message || task?.error?.raw_message || task?.detail;

    if (status === 'completed' || status === 'success') {
      const videoUrl = task?.output?.video || task?.output?.video_url || task?.output?.url;
      if (!videoUrl) {
        return NextResponse.json({ done: true, error: 'Seedance completed without a video URL' });
      }
      return NextResponse.json({ done: true, progress: 100, url: videoUrl });
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return NextResponse.json({
        done: true,
        progress: 0,
        error: errorMessage || 'Seedance generation failed',
      });
    }

    return NextResponse.json({
      done: false,
      progress: status === 'processing' || status === 'running' ? 45 : 15,
      status,
    });
  } catch (error) {
    console.error('Seedance status API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Seedance polling failed' },
      { status: 500 }
    );
  }
}
