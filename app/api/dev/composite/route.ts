import { NextRequest, NextResponse } from 'next/server';
import { compositeProduct, cutoutProduct, locateProduct } from '@/lib/server/productComposite';

/** Development-only harness for the product cutout/locate/composite pipeline. */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const body = (await request.json()) as { canonicalUrl?: string; generatedUrl?: string; returnCutout?: boolean };
  if (!body.canonicalUrl) return NextResponse.json({ error: 'canonicalUrl required' }, { status: 400 });

  const started = Date.now();
  const { cutout, reason } = await cutoutProduct(body.canonicalUrl);
  const result: Record<string, unknown> = {
    cutout: cutout ? { width: cutout.width, height: cutout.height, luminance: Math.round(cutout.luminance) } : null,
    reason,
    cutoutMs: Date.now() - started,
  };
  if (cutout && body.generatedUrl) {
    const t = Date.now();
    const located = await locateProduct(body.generatedUrl);
    result.box = located.box;
    result.locateMs = Date.now() - t;
    if (located.box) {
      const t2 = Date.now();
      result.compositeUrl = await compositeProduct(body.generatedUrl, cutout, located.box);
      result.compositeMs = Date.now() - t2;
    }
  }
  if (cutout && body.returnCutout) {
    result.cutoutPng = cutout.png.toString('base64');
  }
  return NextResponse.json(result);
}
