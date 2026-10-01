'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cx } from './ui';

/** Guidelines rendered as readable dark prose. Raw HTML in the file is shown as text, never run. */
const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-semibold text-white first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold text-white first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="my-2 leading-relaxed text-white/80">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-white/80 marker:text-white/35">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-white/80 marker:text-white/35">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/85">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#fff05a] underline underline-offset-2 hover:text-white">{children}</a>
  ),
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-[#fff05a]/50 pl-3 text-white/65">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[0.85em] text-[#fff6a8]">{children}</code>,
  pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-xl border border-white/8 bg-black/30 p-3 text-xs">{children}</pre>,
  hr: () => <hr className="my-5 border-white/10" />,
  table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
  th: ({ children }) => <th className="border-b border-white/15 px-2 py-1.5 font-semibold text-white">{children}</th>,
  td: ({ children }) => <td className="border-b border-white/8 px-2 py-1.5 text-white/75">{children}</td>,
  img: () => null,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx('text-sm', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
