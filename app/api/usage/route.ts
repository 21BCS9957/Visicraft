import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface UsageRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  model: string;
  feature: 'image_generation' | 'video_generation';
  status: 'processing' | 'completed' | 'failed';
  input_tokens: number | string;
  output_tokens: number | string;
  total_tokens: number | string;
  image_count: number;
  video_seconds: number | string;
  estimated_cost_usd: number | string;
  actual_cost_usd: number | string | null;
  pricing_version: string;
  created_at: string;
}

function monthRange(raw: string | null): { month: string; start: string; end: string } | null {
  const month = raw || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    month,
    start: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1)).toISOString(),
  };
}

function numberValue(value: number | string | null | undefined): number {
  return Number(value) || 0;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(10));
}

export async function GET(request: NextRequest) {
  const range = monthRange(request.nextUrl.searchParams.get('month'));
  if (!range) {
    return NextResponse.json({ error: 'month must use YYYY-MM format' }, { status: 400 });
  }

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const adminEmails = (process.env.USAGE_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = Boolean(user.email && adminEmails.includes(user.email.toLowerCase()));
  const requestedUserId = request.nextUrl.searchParams.get('userId');
  const scopeAll = request.nextUrl.searchParams.get('scope') === 'all';

  if ((scopeAll || requestedUserId) && !isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceClient();
  let query = supabase
    .from('ai_usage_events')
    .select('id,user_id,user_email,model,feature,status,input_tokens,output_tokens,total_tokens,image_count,video_seconds,estimated_cost_usd,actual_cost_usd,pricing_version,created_at')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false });

  if (!scopeAll) query = query.eq('user_id', requestedUserId || user.id);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: `Failed to load usage: ${error.message}` }, { status: 500 });
  }

  const rows = (data || []) as UsageRow[];
  const completed = rows.filter((row) => row.status === 'completed');
  const byModel = new Map<string, {
    model: string;
    feature: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    imageCount: number;
    videoSeconds: number;
    calculatedCostUsd: number;
    actualCostUsd: number;
  }>();

  for (const row of completed) {
    const key = `${row.model}:${row.feature}`;
    const summary = byModel.get(key) || {
      model: row.model,
      feature: row.feature,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      imageCount: 0,
      videoSeconds: 0,
      calculatedCostUsd: 0,
      actualCostUsd: 0,
    };
    summary.requests += 1;
    summary.inputTokens += numberValue(row.input_tokens);
    summary.outputTokens += numberValue(row.output_tokens);
    summary.totalTokens += numberValue(row.total_tokens);
    summary.imageCount += numberValue(row.image_count);
    summary.videoSeconds += numberValue(row.video_seconds);
    summary.calculatedCostUsd += numberValue(row.estimated_cost_usd);
    summary.actualCostUsd += numberValue(row.actual_cost_usd);
    byModel.set(key, summary);
  }

  const modelSummaries = Array.from(byModel.values()).map((summary) => ({
    ...summary,
    videoSeconds: Number(summary.videoSeconds.toFixed(3)),
    calculatedCostUsd: roundUsd(summary.calculatedCostUsd),
    actualCostUsd: roundUsd(summary.actualCostUsd),
  }));

  return NextResponse.json({
    month: range.month,
    scope: scopeAll ? 'all' : requestedUserId || user.id,
    totals: {
      requests: completed.length,
      processing: rows.filter((row) => row.status === 'processing').length,
      failed: rows.filter((row) => row.status === 'failed').length,
      inputTokens: modelSummaries.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: modelSummaries.reduce((sum, row) => sum + row.outputTokens, 0),
      totalTokens: modelSummaries.reduce((sum, row) => sum + row.totalTokens, 0),
      imageCount: modelSummaries.reduce((sum, row) => sum + row.imageCount, 0),
      videoSeconds: Number(modelSummaries.reduce((sum, row) => sum + row.videoSeconds, 0).toFixed(3)),
      calculatedCostUsd: roundUsd(modelSummaries.reduce((sum, row) => sum + row.calculatedCostUsd, 0)),
      actualCostUsd: roundUsd(modelSummaries.reduce((sum, row) => sum + row.actualCostUsd, 0)),
      unreconciledRequests: completed.filter((row) => row.actual_cost_usd === null).length,
    },
    byModel: modelSummaries,
    events: rows,
  });
}

