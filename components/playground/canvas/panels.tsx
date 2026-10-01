'use client';

import { useRef } from 'react';
import type { Textbox } from 'fabric';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Circle as CircleIcon,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  ImagePlus,
  Italic,
  Loader2,
  Lock,
  Minus,
  MousePointer2,
  RectangleHorizontal,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Type,
  Underline,
  Unlock,
  Upload,
  Wand2,
} from 'lucide-react';
import { cx, Tip } from '../ui';
import { CANVAS_FONTS, canvasFont } from './fonts';
import type { Adjustments, EditorApi, Layer, ShapeKind, TextPreset, Tool } from './editorTypes';

const TOOLS: Array<{ id: Tool; label: string; icon: typeof Type; hint: string }> = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'Select and move (V)' },
  { id: 'text', label: 'Text', icon: Type, hint: 'Add text (T)' },
  { id: 'shapes', label: 'Shapes', icon: Square, hint: 'Shapes and badges' },
  { id: 'image', label: 'Logo', icon: ImagePlus, hint: 'Add a logo or image' },
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal, hint: 'Brightness, contrast, colour' },
  { id: 'erase', label: 'AI Erase', icon: Eraser, hint: 'Paint over something to remove it' },
  { id: 'replace', label: 'AI Replace', icon: Wand2, hint: 'Paint an area and say what goes there' },
];

export function ToolRail({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-white/8 bg-[#0c0c0f] py-3">
      {TOOLS.map(({ id, label, icon: Icon, hint }) => (
        <Tip key={id} text={hint}>
          <button
            type="button"
            onClick={() => onTool(id)}
            aria-label={label}
            className={cx(
              'flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition-colors',
              tool === id ? 'bg-white/12 text-white' : 'text-white/50 hover:bg-white/6 hover:text-white',
              (id === 'erase' || id === 'replace') && tool === id && 'bg-[#fff05a]/15 text-[#fff05a]'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        </Tip>
      ))}
    </nav>
  );
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-medium text-white">{children}</h3>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{hint}</p>}
    </div>
  );
}

const TEXT_PRESETS: Array<{ id: TextPreset; label: string; sample: string; className: string }> = [
  { id: 'headline', label: 'Headline', sample: 'BIG FESTIVE SALE', className: 'text-xl font-bold tracking-wide' },
  { id: 'subline', label: 'Subline', sample: 'Handcrafted in India', className: 'text-sm' },
  { id: 'body', label: 'Text', sample: 'Add a line of text', className: 'text-xs text-white/70' },
  { id: 'price', label: 'Price tag', sample: '₹2,999', className: 'inline-block bg-[#fff05a] px-2 text-base font-extrabold text-black' },
  { id: 'cta', label: 'Button', sample: 'Shop now', className: 'inline-block rounded bg-white px-3 py-0.5 text-sm font-semibold text-black' },
];

export function TextPanel({ editor }: { editor: EditorApi }) {
  return (
    <div>
      <PanelTitle hint="Click a style to add it, then double-click on the canvas to type.">Text</PanelTitle>
      <div className="space-y-2">
        {TEXT_PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => void editor.addText(preset.id)} className="block w-full rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left hover:border-white/20 hover:bg-white/[0.06]">
            <span className="block text-[10px] uppercase tracking-wide text-white/35">{preset.label}</span>
            <span className={cx('mt-1 text-white', preset.className)}>{preset.sample}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const SHAPES: Array<{ id: ShapeKind; label: string; icon: typeof Square }> = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'rounded', label: 'Rounded', icon: RectangleHorizontal },
  { id: 'pill', label: 'Pill badge', icon: RectangleHorizontal },
  { id: 'circle', label: 'Circle', icon: CircleIcon },
  { id: 'line', label: 'Line', icon: Minus },
];

export function ShapesPanel({ editor }: { editor: EditorApi }) {
  return (
    <div>
      <PanelTitle hint="Put a shape behind text for offers, badges and buttons.">Shapes</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        {SHAPES.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => editor.addShape(id)} className="flex flex-col items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] py-4 text-xs text-white/75 hover:border-white/20 hover:bg-white/[0.06]">
            <Icon className={cx('h-6 w-6', id === 'pill' && 'rounded-full')} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ImagePanel({ editor, busy }: { editor: EditorApi; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <PanelTitle hint="A transparent PNG logo works best. It's saved with the design.">Logo or image</PanelTitle>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 py-8 text-sm text-white/70 hover:border-white/30 hover:bg-white/[0.03] disabled:opacity-50">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        {busy ? 'Adding…' : 'Upload PNG, JPG or WebP'}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void editor.addImage(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-white/70">
        {label}
        <span className="tabular-nums text-white/40">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-[#fff05a]" />
    </label>
  );
}

export function AdjustPanel({ editor }: { editor: EditorApi }) {
  const set = (patch: Partial<Adjustments>) => editor.setAdjustments({ ...editor.adjustments, ...patch });
  const percent = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100)}`;
  return (
    <div className="space-y-5">
      <PanelTitle hint="Applies to the photo only, not to your text and shapes.">Adjust photo</PanelTitle>
      <Slider label="Brightness" value={editor.adjustments.brightness} min={-0.5} max={0.5} step={0.01} onChange={(brightness) => set({ brightness })} format={percent} />
      <Slider label="Contrast" value={editor.adjustments.contrast} min={-0.5} max={0.5} step={0.01} onChange={(contrast) => set({ contrast })} format={percent} />
      <Slider label="Saturation" value={editor.adjustments.saturation} min={-1} max={1} step={0.01} onChange={(saturation) => set({ saturation })} format={percent} />
      <Slider label="Blur" value={editor.adjustments.blur} min={0} max={0.5} step={0.01} onChange={(blur) => set({ blur })} format={(value) => String(Math.round(value * 100))} />
      <button type="button" onClick={() => editor.setAdjustments({ brightness: 0, contrast: 0, saturation: 0, blur: 0 })} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8">
        Reset
      </button>
    </div>
  );
}

export function AiPanel({ mode, brush, onBrush, strokes, onUndoStroke, onClear, instruction, onInstruction, model, onModel, credits, busy, onRun }: {
  mode: 'erase' | 'replace';
  brush: number;
  onBrush: (size: number) => void;
  strokes: number;
  onUndoStroke: () => void;
  onClear: () => void;
  instruction: string;
  onInstruction: (text: string) => void;
  model: string;
  onModel: (model: string) => void;
  credits: Record<string, number>;
  busy: boolean;
  onRun: () => void;
}) {
  const replace = mode === 'replace';
  return (
    <div className="space-y-5">
      <PanelTitle hint={replace ? 'Paint the area to change, then say what should be there.' : 'Paint over what you want gone. Gemini fills it in; nothing else in the photo changes.'}>
        {replace ? 'AI Replace' : 'AI Erase'}
      </PanelTitle>
      <Slider label="Brush size" value={brush} min={8} max={160} step={2} onChange={onBrush} format={(value) => `${value}px`} />
      <div className="flex gap-2">
        <button type="button" disabled={!strokes || busy} onClick={onUndoStroke} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8 disabled:opacity-40">Undo stroke</button>
        <button type="button" disabled={!strokes || busy} onClick={onClear} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/8 disabled:opacity-40">Clear painting</button>
      </div>
      {replace && (
        <label className="block">
          <span className="text-xs text-white/70">What goes in the painted area</span>
          <textarea value={instruction} onChange={(event) => onInstruction(event.target.value)} rows={3} maxLength={600} placeholder="e.g. a white marble tabletop" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25" />
        </label>
      )}
      <div className="space-y-1.5">
        <span className="text-xs text-white/70">Model</span>
        {[['gemini-3.1-flash-image', 'Nano Banana 2', 'Fast'], ['gemini-3-pro-image', 'Nano Banana Pro', 'Best detail']].map(([id, name, hint]) => (
          <button key={id} type="button" onClick={() => onModel(id)} className={cx('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs', model === id ? 'border-[#fff05a]/45 bg-[#fff05a]/8 text-white' : 'border-white/8 text-white/65 hover:bg-white/5')}>
            <span><span className="block text-sm">{name}</span><span className="text-white/40">{hint}</span></span>
            <span className="text-white/55">{credits[id]} credits</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={busy || !strokes || (replace && !instruction.trim())}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fff05a] text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? 'Working… about 20–40 s' : `${replace ? 'Replace' : 'Remove'} · ${credits[model]} credits`}
      </button>
      <p className="text-[11px] leading-relaxed text-white/35">Credits are refunded if the edit fails. Your text and logos stay on top and stay editable.</p>
    </div>
  );
}

function layerName(layer: Layer): string {
  if (layer.type === 'textbox' || layer.type === 'i-text' || layer.type === 'text') {
    const text = (layer as unknown as Textbox).text?.trim().replace(/\s+/g, ' ');
    return text ? `“${text.slice(0, 28)}${text.length > 28 ? '…' : ''}”` : 'Text';
  }
  return layer.name ?? (layer.type === 'image' ? 'Image' : layer.type ?? 'Layer');
}

export function LayersPanel({ editor }: { editor: EditorApi }) {
  const layers = [...editor.layers].reverse();
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">Layers</h3>
      {layers.length === 0 && <p className="text-[11px] text-white/35">Text, shapes and logos you add appear here.</p>}
      <ul className="space-y-1">
        {layers.map((layer, index) => (
          <li key={`${layer.type}-${index}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => editor.select(layer)}
              onKeyDown={(event) => event.key === 'Enter' && editor.select(layer)}
              className={cx('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', editor.active === layer ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5')}
            >
              <span className="min-w-0 flex-1 truncate">{layerName(layer)}</span>
              <button type="button" aria-label={layer.visible === false ? 'Show' : 'Hide'} onClick={(event) => { event.stopPropagation(); editor.toggleVisible(layer); }} className="rounded p-1 text-white/40 hover:text-white">
                {layer.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button type="button" aria-label={layer.userLocked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); editor.toggleLock(layer); }} className="rounded p-1 text-white/40 hover:text-white">
                {layer.userLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button type="button" aria-label="Delete" onClick={(event) => { event.stopPropagation(); editor.remove(layer); }} className="rounded p-1 text-white/40 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/40">
          <Lock className="h-3.5 w-3.5" /> Photo
        </li>
      </ul>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/50" title={label}>
      <span className="relative h-6 w-6 overflow-hidden rounded-md border border-white/15" style={{ background: hex }}>
        <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
      </span>
      {label}
    </label>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-white/50">
      {label}
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="w-16 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1 text-xs text-white outline-none focus:border-white/25"
      />
    </label>
  );
}

function ToolbarButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cx('flex h-7 w-7 items-center justify-center rounded-md', active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white')}>
      {children}
    </button>
  );
}

/** Properties of the selected layer, above the canvas. */
export function SelectionToolbar({ editor }: { editor: EditorApi }) {
  const layer = editor.active;
  if (!layer) return null;
  const isText = layer.type === 'textbox';
  const text = layer as unknown as Textbox;
  const isLine = layer.type === 'line';
  const isShape = layer.type === 'rect' || layer.type === 'circle';
  const font = canvasFont(layer.fontKey);
  const heaviest = Math.max(...font.weights);
  const fontSize = isText ? Number(text.fontSize) * (layer.scaleY ?? 1) : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-white/10 bg-[#141418]/95 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      {isText && (
        <>
          <select
            value={font.key}
            onChange={(event) => void editor.setFont(event.target.value)}
            aria-label="Font"
            className="h-7 rounded-md border border-white/10 bg-[#1b1b20] px-2 text-xs text-white outline-none"
          >
            {CANVAS_FONTS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <NumberInput label="Size" value={fontSize} min={6} max={2000} onChange={(size) => editor.update({ fontSize: size / (layer.scaleY ?? 1) })} />
          <div className="flex items-center gap-0.5">
            <ToolbarButton label="Bold" active={Number(text.fontWeight) >= 600} onClick={() => editor.update({ fontWeight: Number(text.fontWeight) >= 600 ? 400 : heaviest })}><Bold className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton label="Italic" active={text.fontStyle === 'italic'} onClick={() => editor.update({ fontStyle: text.fontStyle === 'italic' ? 'normal' : 'italic' })}><Italic className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton label="Underline" active={Boolean(text.underline)} onClick={() => editor.update({ underline: !text.underline })}><Underline className="h-3.5 w-3.5" /></ToolbarButton>
          </div>
          <div className="flex items-center gap-0.5">
            <ToolbarButton label="Align left" active={text.textAlign === 'left'} onClick={() => editor.update({ textAlign: 'left' })}><AlignLeft className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton label="Align centre" active={text.textAlign === 'center'} onClick={() => editor.update({ textAlign: 'center' })}><AlignCenter className="h-3.5 w-3.5" /></ToolbarButton>
            <ToolbarButton label="Align right" active={text.textAlign === 'right'} onClick={() => editor.update({ textAlign: 'right' })}><AlignRight className="h-3.5 w-3.5" /></ToolbarButton>
          </div>
          <ColorInput label="Colour" value={String(text.fill ?? '#ffffff')} onChange={(fill) => editor.update({ fill })} />
          <ColorInput label="Box" value={String(text.backgroundColor || '#000000')} onChange={(backgroundColor) => editor.update({ backgroundColor })} />
          {text.backgroundColor ? (
            <button type="button" onClick={() => editor.update({ backgroundColor: '' })} className="text-[11px] text-white/45 hover:text-white">No box</button>
          ) : null}
          <NumberInput label="Spacing" value={Number(text.charSpacing) / 10} min={-20} max={100} onChange={(value) => editor.update({ charSpacing: value * 10 })} />
          <NumberInput label="Line" value={Number(text.lineHeight)} min={0.6} max={3} step={0.05} onChange={(lineHeight) => editor.update({ lineHeight })} />
          <ColorInput label="Outline" value={String(text.stroke || '#000000')} onChange={(stroke) => editor.update({ stroke, strokeWidth: Math.max(1, Number(text.strokeWidth) || fontSize * 0.04), paintFirst: 'stroke' })} />
          {text.stroke ? <button type="button" onClick={() => editor.update({ stroke: null, strokeWidth: 0 })} className="text-[11px] text-white/45 hover:text-white">No outline</button> : null}
          <button type="button" onClick={() => editor.update({ shadow: text.shadow ? null : 'shadow' })} className={cx('rounded-md px-2 py-1 text-[11px]', text.shadow ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/8')}>Shadow</button>
        </>
      )}
      {isShape && (
        <>
          <ColorInput label="Fill" value={String(layer.fill ?? '#ffffff')} onChange={(fill) => editor.update({ fill })} />
          <ColorInput label="Border" value={String(layer.stroke || '#000000')} onChange={(stroke) => editor.update({ stroke, strokeWidth: Math.max(2, Number(layer.strokeWidth) || editor.width * 0.004) })} />
          {layer.type === 'rect' && (
            <NumberInput label="Corners" value={Number((layer as unknown as { rx: number }).rx) || 0} min={0} max={4000} onChange={(radius) => editor.update({ rx: radius, ry: radius })} />
          )}
        </>
      )}
      {isLine && (
        <>
          <ColorInput label="Colour" value={String(layer.stroke ?? '#ffffff')} onChange={(stroke) => editor.update({ stroke })} />
          <NumberInput label="Width" value={Number(layer.strokeWidth)} min={1} max={400} onChange={(strokeWidth) => editor.update({ strokeWidth })} />
        </>
      )}
      <NumberInput label="Opacity" value={Math.round((layer.opacity ?? 1) * 100)} min={5} max={100} onChange={(value) => editor.update({ opacity: value / 100 })} />
      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton label="Bring forward" onClick={() => editor.forward()}><ArrowUp className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton label="Send backward" onClick={() => editor.backward()}><ArrowDown className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton label="Duplicate (Cmd/Ctrl+D)" onClick={() => void editor.duplicate()}><Copy className="h-3.5 w-3.5" /></ToolbarButton>
        <ToolbarButton label={layer.userLocked ? 'Unlock' : 'Lock'} onClick={() => editor.toggleLock()}>{layer.userLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</ToolbarButton>
        <ToolbarButton label="Delete (Del)" onClick={() => editor.remove()}><Trash2 className="h-3.5 w-3.5" /></ToolbarButton>
      </div>
    </div>
  );
}
