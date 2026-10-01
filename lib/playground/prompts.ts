/**
 * Splits a pasted block of prompts into one prompt per image, and the Playground's limits.
 * Kept free of `@/` imports so the page, the server and plain node can all use it.
 */

export const MAX_PROMPTS = 100;
export const MAX_PROMPT_CHARS = 4000;
export const MAX_IMAGES_PER_RUN = 100;
export const MAX_BRIEF_CHARS = 50000;
export const MAX_VARIATIONS = 4;

export interface ParsedPrompts {
  prompts: string[];
  warnings: string[];
}

// "Prompt 1: ", "Image 3 —", "(1) ", "1. ", "1) ", "1: ", "1 - ", "#1."; a bare "3 bottles …" is not a marker.
const NUMBERED = /^\s*(?:(?:prompt|image|shot|ad|creative)\s*#?\s*(\d{1,3})\s*[.):\-–—]?\s+|\((\d{1,3})\)\s+|#?(\d{1,3})\s*[.):\-–—]\s*)/i;
const BULLET = /^\s*(?:[-*•▪◦·]|•)\s+/;

function tidy(prompt: string): string {
  return prompt
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fromJson(text: string): string[] | null {
  if (!text.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    const prompts = parsed
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const value = (entry as Record<string, unknown>).prompt ?? (entry as Record<string, unknown>).text;
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .map(tidy)
      .filter(Boolean);
    return prompts.length ? prompts : null;
  } catch {
    return null;
  }
}

/** Items that start with 1, 2, 3 … (a restart or a gap is allowed once, e.g. two lists pasted together). */
function fromMarkers(lines: string[], marker: RegExp, numbered: boolean): string[] | null {
  const starts: number[] = [];
  let expected = 1;
  let restarts = 0;
  lines.forEach((line, index) => {
    const match = line.match(marker);
    if (!match) return;
    if (numbered) {
      const value = Number(match[1] ?? match[2] ?? match[3]);
      if (value === expected || (value === 1 && starts.length > 0 && restarts++ < 1)) {
        starts.push(index);
        expected = value + 1;
      }
      return;
    }
    starts.push(index);
  });
  if (starts.length < 2) return null;
  const prompts = starts.map((start, i) => {
    const end = starts[i + 1] ?? lines.length;
    const block = lines.slice(start, end);
    block[0] = block[0].replace(marker, '');
    return tidy(block.join('\n'));
  }).filter(Boolean);
  // Text before the first marker is a heading ("Here are 40 prompts:"), not a prompt.
  return prompts.length >= 2 ? prompts : null;
}

function fromBlankLines(text: string): string[] | null {
  const blocks = text.split(/\n\s*\n/).map(tidy).filter(Boolean);
  return blocks.length >= 2 ? blocks : null;
}

/** auto: a JSON array, a numbered or bulleted list, blank-line blocks, else one per line. */
export type SplitMode = 'auto' | 'lines' | 'blocks';

export function parsePromptList(input: string, mode: SplitMode = 'auto'): ParsedPrompts {
  const text = input.replace(/\r\n?/g, '\n').trim();
  const warnings: string[] = [];
  if (!text) return { prompts: [], warnings };

  const lines = text.split('\n');
  const eachLine = () => lines.map((line) => tidy(line.replace(NUMBERED, '').replace(BULLET, ''))).filter(Boolean);
  let prompts = mode === 'lines'
    ? eachLine()
    : mode === 'blocks'
      ? text.split(/\n\s*\n/).map(tidy).filter(Boolean)
      : fromJson(text)
        ?? fromMarkers(lines, NUMBERED, true)
        ?? fromMarkers(lines, BULLET, false)
        ?? fromBlankLines(text)
        ?? lines.map(tidy).filter(Boolean);

  prompts = prompts.map((prompt, index) => {
    if (prompt.length <= MAX_PROMPT_CHARS) return prompt;
    warnings.push(`Prompt ${index + 1} was cut to ${MAX_PROMPT_CHARS} characters.`);
    return prompt.slice(0, MAX_PROMPT_CHARS);
  });
  if (prompts.length > MAX_PROMPTS) {
    warnings.push(`Only the first ${MAX_PROMPTS} of ${prompts.length} prompts are used.`);
    prompts = prompts.slice(0, MAX_PROMPTS);
  }
  return { prompts, warnings };
}

/** Prompts from a .csv file: the "prompt" column when there is a header row, else the first column. */
export function parseCsvPrompts(input: string): ParsedPrompts {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const text = input.replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }

  const header = rows[0]?.map((value) => value.trim().toLowerCase()) ?? [];
  const column = header.indexOf('prompt');
  const body = column >= 0 ? rows.slice(1) : rows;
  const picked = body.map((cells) => cells[column >= 0 ? column : 0] ?? '');
  return parsePromptList(JSON.stringify(picked.map(tidy).filter(Boolean)));
}
