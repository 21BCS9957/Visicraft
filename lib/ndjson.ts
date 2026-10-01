/**
 * Reads a newline-delimited JSON stream (the creative pipeline's progress events) and calls
 * `onEvent` for each object in order. If `onEvent` throws, the stream is cancelled and the
 * error is rethrown, so a handler can stop reading on an `error` event.
 */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const emit = (line: string) => {
    if (!line.trim()) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event && typeof event === 'object') onEvent(event as Record<string, unknown>);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(emit);
      if (done) break;
    }
    emit(buffer);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
