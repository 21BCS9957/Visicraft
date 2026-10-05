'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Canvas,
  Canvas2dFilterBackend,
  Circle,
  FabricImage,
  FabricObject,
  filters,
  Line,
  PencilBrush,
  Point,
  Rect,
  setFilterBackend,
  Shadow,
  Textbox,
  util,
  type Path,
} from 'fabric';
import { ChevronDown, ChevronLeft, Download, Loader2, Maximize, Minus, Plus, Redo2, Save, Undo2 } from 'lucide-react';
import toast from '@/lib/toast';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { canvasApi, PlaygroundApiError } from '@/lib/playground/api';
import { enabledSizes, playgroundModel, sizeForImage, sizeOption } from '@/lib/playground/models';
import { Popover, PopoverClose } from '../ui';
import { canvasFont, loadCanvasFont } from './fonts';
import { NO_ADJUSTMENTS, type Adjustments, type CanvasDoc, type EditorApi, type Layer, type ShapeKind, type TextPreset, type Tool } from './editorTypes';
import { AdjustPanel, AiPanel, ImagePanel, LayersPanel, SelectionToolbar, ShapesPanel, TextPanel, ToolRail } from './panels';

// Our layer properties travel with every saved design.
FabricObject.customProperties = ['name', 'fontKey', 'isMask', 'userLocked'];
// Filters on photos up to 12k px: the WebGL backend's texture limit is smaller.
setFilterBackend(new Canvas2dFilterBackend());

const TOAST = { position: 'top-center' as const };
const HISTORY_LIMIT = 60;
const MASK_COLOR = 'rgba(255, 0, 255, 0.45)';

export interface CanvasSource {
  projectId: string;
  projectName: string;
  itemId: string;
  /** The image the edit is saved against (a generated image, or the edited image being updated). */
  sourceItemId: string;
  editItemId: string | null;
  baseUrl: string;
  width: number;
  height: number;
  doc: CanvasDoc | null;
  preview: boolean;
}

const isMask = (object: unknown) => Boolean((object as Layer | undefined)?.isMask);

function waitForImage(url: string) {
  return FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
}

export default function CanvasEditor({ source }: { source: CanvasSource }) {
  const { refreshCredits } = useCredits();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const baseUrlRef = useRef(source.baseUrl);
  const adjustmentsRef = useRef<Adjustments>(source.doc?.adjustments ?? NO_ADJUSTMENTS);
  const scaleRef = useRef(1);
  const historyRef = useRef<{ past: string[]; future: string[]; restoring: boolean }>({ past: [], future: [], restoring: false });
  const editIdRef = useRef<string | null>(source.editItemId);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [view, setView] = useState<{ version: number; active: Layer | null; layers: Layer[] }>({ version: 0, active: null, layers: [] });
  const [history, setHistory] = useState({ undo: false, redo: false });
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [scale, setScale] = useState(1);
  const [adjustments, setAdjustmentsState] = useState<Adjustments>(adjustmentsRef.current);
  const [brush, setBrush] = useState(48);
  const [strokes, setStrokes] = useState(0);
  const [instruction, setInstruction] = useState('');
  const [aiModel, setAiModel] = useState('gemini-3.1-flash-image');
  const [aiBusy, setAiBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guides, setGuides] = useState({ vertical: false, horizontal: false });

  const W = source.width;
  const H = source.height;
  /** Copies what the panels show (selection, layer list) out of Fabric into React state. */
  const bump = useCallback(() => {
    const canvas = canvasRef.current;
    const active = (canvas?.getActiveObject() as Layer | undefined) ?? null;
    const layers = (canvas?.getObjects() ?? []).filter((object) => !isMask(object)) as Layer[];
    setView((current) => ({ version: current.version + 1, active, layers }));
  }, []);

  // ---------- design <-> JSON ----------
  const serialize = useCallback((): CanvasDoc => {
    const canvas = canvasRef.current;
    return {
      version: 1,
      width: W,
      height: H,
      baseUrl: baseUrlRef.current,
      adjustments: adjustmentsRef.current,
      objects: (canvas?.getObjects() ?? []).filter((object) => !isMask(object)).map((object) => object.toObject() as Record<string, unknown>),
    };
  }, [W, H]);

  const record = useCallback(() => {
    const store = historyRef.current;
    if (store.restoring || !canvasRef.current) return;
    const snapshot = JSON.stringify(serialize());
    if (store.past[store.past.length - 1] === snapshot) return;
    store.past = [...store.past, snapshot].slice(-HISTORY_LIMIT);
    store.future = [];
    setHistory({ undo: store.past.length > 1, redo: false });
  }, [serialize]);

  const applyFilters = useCallback((next: Adjustments) => {
    const image = canvasRef.current?.backgroundImage;
    if (!(image instanceof FabricImage)) return;
    const list = [];
    if (next.brightness) list.push(new filters.Brightness({ brightness: next.brightness }));
    if (next.contrast) list.push(new filters.Contrast({ contrast: next.contrast }));
    if (next.saturation) list.push(new filters.Saturation({ saturation: next.saturation }));
    if (next.blur) list.push(new filters.Blur({ blur: next.blur }));
    image.filters = list;
    image.applyFilters();
    canvasRef.current?.requestRenderAll();
  }, []);

  const setBase = useCallback(async (url: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = await waitForImage(url);
    image.set({ left: W / 2, top: H / 2, selectable: false, evented: false });
    image.scaleX = W / (image.width || W);
    image.scaleY = H / (image.height || H);
    canvas.backgroundImage = image;
    baseUrlRef.current = url;
    applyFilters(adjustmentsRef.current);
  }, [W, H, applyFilters]);

  /** Fonts are stored by key; the generated family name can change between builds. */
  const refreshFonts = useCallback(async (objects: FabricObject[]) => {
    await Promise.all(objects.map(async (object) => {
      if (!(object instanceof Textbox)) return;
      const font = canvasFont((object as Layer).fontKey);
      await loadCanvasFont(font, Number(object.fontWeight) || 400);
      object.set('fontFamily', font.family);
      object.initDimensions();
      object.setCoords();
    }));
  }, []);

  const restore = useCallback(async (snapshot: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const doc = JSON.parse(snapshot) as CanvasDoc;
    historyRef.current.restoring = true;
    try {
      canvas.discardActiveObject();
      canvas.getObjects().filter((object) => !isMask(object)).forEach((object) => canvas.remove(object));
      adjustmentsRef.current = doc.adjustments;
      setAdjustmentsState(doc.adjustments);
      if (doc.baseUrl !== baseUrlRef.current) await setBase(doc.baseUrl);
      else applyFilters(doc.adjustments);
      const objects = (await util.enlivenObjects(doc.objects)) as FabricObject[];
      await refreshFonts(objects);
      const masks = canvas.getObjects().filter(isMask);
      masks.forEach((mask) => canvas.remove(mask));
      canvas.add(...objects, ...masks);
      canvas.requestRenderAll();
    } finally {
      historyRef.current.restoring = false;
      bump();
    }
  }, [applyFilters, bump, refreshFonts, setBase]);

  const undo = useCallback(async () => {
    const store = historyRef.current;
    if (store.past.length < 2) return;
    const current = store.past[store.past.length - 1];
    store.past = store.past.slice(0, -1);
    store.future = [current, ...store.future];
    await restore(store.past[store.past.length - 1]);
    setHistory({ undo: store.past.length > 1, redo: true });
  }, [restore]);

  const redo = useCallback(async () => {
    const store = historyRef.current;
    const next = store.future[0];
    if (!next) return;
    store.future = store.future.slice(1);
    store.past = [...store.past, next];
    await restore(next);
    setHistory({ undo: true, redo: store.future.length > 0 });
  }, [restore]);

  // ---------- size ----------
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const fitScale = Math.min((stage.clientWidth - 64) / W, (stage.clientHeight - 64) / H);
    const next = zoom === 'fit' ? Math.max(0.02, fitScale) : zoom;
    scaleRef.current = next;
    setScale(next);
    canvas.setDimensions({ width: Math.round(W * next), height: Math.round(H * next) });
    canvas.setZoom(next);
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.width = brush / next;
    canvas.requestRenderAll();
  }, [W, H, zoom, brush]);

  // ---------- set up Fabric ----------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Fabric wraps its <canvas> in its own elements; React only owns the empty host.
    const element = document.createElement('canvas');
    host.appendChild(element);
    const canvas = new Canvas(element, { preserveObjectStacking: true, selectionColor: 'rgba(255,240,90,0.08)', selectionBorderColor: '#fff05a' });
    canvasRef.current = canvas;
    FabricObject.ownDefaults.borderColor = '#fff05a';
    FabricObject.ownDefaults.cornerColor = '#fff05a';
    FabricObject.ownDefaults.cornerStrokeColor = '#111';
    FabricObject.ownDefaults.transparentCorners = false;
    FabricObject.ownDefaults.cornerSize = 11;
    let disposed = false;

    const onChange = () => {
      record();
      bump();
    };
    canvas.on('object:modified', onChange);
    canvas.on('object:added', ({ target }) => {
      // A brush stroke while painting is part of the AI mask, not a layer.
      if (canvas.isDrawingMode && target.type === 'path') {
        (target as Path & Layer).isMask = true;
        target.set({ selectable: false, evented: false });
        setStrokes(canvas.getObjects().filter(isMask).length);
        return;
      }
      if (!isMask(target)) onChange();
    });
    canvas.on('object:removed', ({ target }) => {
      if (!isMask(target)) onChange();
    });
    canvas.on('text:editing:exited', onChange);
    canvas.on('selection:created', bump);
    canvas.on('selection:updated', bump);
    canvas.on('selection:cleared', bump);
    // Snap to the centre lines while dragging.
    canvas.on('object:moving', ({ target }) => {
      const tolerance = 10 / scaleRef.current;
      const center = target.getCenterPoint();
      const vertical = Math.abs(center.x - W / 2) < tolerance;
      const horizontal = Math.abs(center.y - H / 2) < tolerance;
      if (vertical || horizontal) {
        target.setPositionByOrigin(new Point(vertical ? W / 2 : center.x, horizontal ? H / 2 : center.y), 'center', 'center');
        target.setCoords();
      }
      setGuides((current) => (current.vertical === vertical && current.horizontal === horizontal ? current : { vertical, horizontal }));
    });
    canvas.on('mouse:up', () => setGuides({ vertical: false, horizontal: false }));

    (async () => {
      try {
        await setBase(source.doc?.baseUrl ?? source.baseUrl);
        if (source.doc?.objects?.length) {
          const objects = (await util.enlivenObjects(source.doc.objects)) as FabricObject[];
          await refreshFonts(objects);
          historyRef.current.restoring = true;
          canvas.add(...objects);
          historyRef.current.restoring = false;
        }
        if (disposed) return;
        setReady(true);
        historyRef.current.past = [JSON.stringify(serialize())];
        bump();
      } catch (error) {
        console.error(error);
        toast.error("The image couldn't be loaded into the Canvas.", TOAST);
      }
    })();

    return () => {
      disposed = true;
      canvasRef.current = null;
      void canvas.dispose();
      host.innerHTML = '';
    };
    // Set up once per opened image.
  }, [source.itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    fit();
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ready, fit]);

  // Drawing mode for the AI brush.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const painting = tool === 'erase' || tool === 'replace';
    canvas.isDrawingMode = painting;
    if (painting) {
      canvas.discardActiveObject();
      const pencil = new PencilBrush(canvas);
      pencil.color = MASK_COLOR;
      pencil.width = brush / scaleRef.current;
      pencil.strokeLineCap = 'round';
      pencil.strokeLineJoin = 'round';
      canvas.freeDrawingBrush = pencil;
    }
    canvas.requestRenderAll();
  }, [tool, brush, ready]);

  // ---------- layer actions ----------

  const place = useCallback((object: FabricObject, name: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    (object as Layer).name = name;
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    setTool('select');
  }, []);

  const addText = useCallback(async (preset: TextPreset) => {
    const specs: Record<TextPreset, { text: string; font: string; size: number; weight: number; fill: string; box?: string; width: number; top: number; align: 'center' | 'left' }> = {
      headline: { text: 'YOUR HEADLINE', font: 'bebas', size: 0.1, weight: 400, fill: '#ffffff', width: 0.84, top: 0.14, align: 'center' },
      subline: { text: 'A short line about the product', font: 'inter', size: 0.042, weight: 500, fill: '#ffffff', width: 0.8, top: 0.24, align: 'center' },
      body: { text: 'Add a line of text', font: 'inter', size: 0.032, weight: 400, fill: '#ffffff', width: 0.7, top: 0.5, align: 'center' },
      price: { text: '₹2,999', font: 'poppins', size: 0.07, weight: 800, fill: '#111111', box: '#fff05a', width: 0.34, top: 0.78, align: 'center' },
      cta: { text: 'Shop now', font: 'poppins', size: 0.045, weight: 700, fill: '#ffffff', box: '#111111', width: 0.36, top: 0.88, align: 'center' },
    };
    const spec = specs[preset];
    const font = canvasFont(spec.font);
    await loadCanvasFont(font, spec.weight);
    const text = new Textbox(spec.text, {
      left: W / 2,
      top: H * spec.top,
      width: W * spec.width,
      fontSize: W * spec.size,
      fontFamily: font.family,
      fontWeight: spec.weight,
      fill: spec.fill,
      textAlign: spec.align,
      backgroundColor: spec.box ?? '',
      padding: spec.box ? W * 0.015 : 0,
      lineHeight: 1.1,
      splitByGrapheme: false,
      shadow: spec.box ? null : new Shadow({ color: 'rgba(0,0,0,0.35)', blur: W * 0.012, offsetX: 0, offsetY: W * 0.004 }),
    });
    (text as Layer).fontKey = font.key;
    place(text, preset === 'price' ? 'Price tag' : preset === 'cta' ? 'Button' : 'Text');
  }, [W, H, place]);

  const addShape = useCallback((kind: ShapeKind) => {
    const size = Math.min(W, H);
    const common = { left: W / 2, top: H / 2, fill: '#fff05a' };
    const shape = kind === 'circle'
      ? new Circle({ ...common, radius: size * 0.14 })
      : kind === 'line'
        ? new Line([-W * 0.3, 0, W * 0.3, 0], { left: W / 2, top: H / 2, stroke: '#ffffff', strokeWidth: Math.max(2, size * 0.006) })
        : new Rect({
          ...common,
          width: W * (kind === 'pill' ? 0.4 : 0.44),
          height: H * (kind === 'pill' ? 0.07 : 0.16),
          rx: kind === 'rounded' ? size * 0.03 : kind === 'pill' ? H * 0.035 : 0,
          ry: kind === 'rounded' ? size * 0.03 : kind === 'pill' ? H * 0.035 : 0,
        });
    place(shape, { rect: 'Rectangle', rounded: 'Rounded box', pill: 'Pill badge', circle: 'Circle', line: 'Line' }[kind]);
  }, [W, H, place]);

  const addImage = useCallback(async (file: File) => {
    setImageBusy(true);
    try {
      const url = source.preview ? URL.createObjectURL(file) : await canvasApi.upload(file);
      const image = await waitForImage(url);
      image.set({ left: W / 2, top: H / 2 });
      image.scaleToWidth(Math.min(W * 0.35, image.width || W));
      place(image, file.name.replace(/\.\w+$/, '').slice(0, 40) || 'Logo');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the image', TOAST);
    } finally {
      setImageBusy(false);
    }
  }, [W, H, place, source.preview]);

  const target = (explicit?: Layer | null) => explicit ?? ((canvasRef.current?.getActiveObject() as Layer | undefined) ?? null);

  const update = useCallback((props: Record<string, unknown>, explicit?: Layer | null) => {
    const object = target(explicit);
    const canvas = canvasRef.current;
    if (!object || !canvas) return;
    const next = { ...props };
    if (next.shadow === 'shadow') next.shadow = new Shadow({ color: 'rgba(0,0,0,0.35)', blur: W * 0.012, offsetX: 0, offsetY: W * 0.004 });
    object.set(next);
    if (object instanceof Textbox) object.initDimensions();
    object.setCoords();
    canvas.requestRenderAll();
    record();
    bump();
  }, [W, record, bump]);

  const setFont = useCallback(async (key: string) => {
    const object = target();
    if (!(object instanceof Textbox)) return;
    const font = canvasFont(key);
    const weight = font.weights.includes(Number(object.fontWeight)) ? Number(object.fontWeight) : font.weights[font.weights.length > 1 ? 1 : 0];
    await loadCanvasFont(font, weight);
    (object as Layer).fontKey = font.key;
    update({ fontFamily: font.family, fontWeight: weight }, object);
  }, [update]);

  const duplicate = useCallback(async () => {
    const object = target();
    const canvas = canvasRef.current;
    if (!object || !canvas) return;
    const copy = await object.clone();
    copy.set({ left: (object.left ?? 0) + W * 0.03, top: (object.top ?? 0) + W * 0.03 });
    (copy as Layer).name = object.name;
    (copy as Layer).fontKey = object.fontKey;
    canvas.add(copy);
    canvas.setActiveObject(copy);
    canvas.requestRenderAll();
  }, [W]);

  const remove = useCallback((explicit?: Layer | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const selected = explicit ? [explicit] : (canvas.getActiveObjects() as Layer[]);
    canvas.discardActiveObject();
    selected.forEach((object) => canvas.remove(object));
    canvas.requestRenderAll();
  }, []);

  const forward = useCallback((explicit?: Layer | null) => {
    const object = target(explicit);
    if (!object || !canvasRef.current) return;
    canvasRef.current.bringObjectForward(object);
    canvasRef.current.requestRenderAll();
    record();
    bump();
  }, [record, bump]);

  const backward = useCallback((explicit?: Layer | null) => {
    const object = target(explicit);
    if (!object || !canvasRef.current) return;
    canvasRef.current.sendObjectBackwards(object);
    canvasRef.current.requestRenderAll();
    record();
    bump();
  }, [record, bump]);

  const toggleLock = useCallback((explicit?: Layer | null) => {
    const object = target(explicit);
    if (!object) return;
    const locked = !object.userLocked;
    object.userLocked = locked;
    object.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
    canvasRef.current?.requestRenderAll();
    record();
    bump();
  }, [record, bump]);

  const toggleVisible = useCallback((object: Layer) => {
    object.set({ visible: object.visible === false });
    if (object.visible === false) canvasRef.current?.discardActiveObject();
    canvasRef.current?.requestRenderAll();
    record();
    bump();
  }, [record, bump]);

  const select = useCallback((object: Layer) => {
    const canvas = canvasRef.current;
    if (!canvas || object.visible === false) return;
    setTool('select');
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    bump();
  }, [bump]);

  const setAdjustments = useCallback((next: Adjustments) => {
    adjustmentsRef.current = next;
    setAdjustmentsState(next);
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => {
      applyFilters(next);
      record();
    }, 160);
  }, [applyFilters, record]);

  const editor: EditorApi = {
    width: W,
    height: H,
    version: view.version,
    active: view.active,
    layers: view.layers,
    addText,
    addShape,
    addImage,
    update,
    setFont,
    duplicate,
    remove,
    forward,
    backward,
    toggleLock,
    toggleVisible,
    select,
    adjustments,
    setAdjustments,
  };

  // ---------- rendering to pixels ----------
  /** Draws the design at `pixelScale` × full size, then puts the on-screen size back. */
  const renderAt = useCallback((pixelScale: number, only: (object: unknown) => boolean) => {
    const canvas = canvasRef.current!;
    const shown = { width: canvas.width, height: canvas.height, zoom: canvas.getZoom() };
    canvas.setDimensions({ width: Math.round(W * pixelScale), height: Math.round(H * pixelScale) }, { backstoreOnly: true });
    canvas.setZoom(pixelScale);
    const element = canvas.toCanvasElement(1, { filter: only });
    canvas.setDimensions({ width: shown.width, height: shown.height }, { backstoreOnly: true });
    canvas.setZoom(shown.zoom);
    canvas.requestRenderAll();
    return element;
  }, [W, H]);

  const exportBlob = useCallback(async (type: 'image/png' | 'image/jpeg') => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('The Canvas is not ready.');
    canvas.discardActiveObject();
    const element = renderAt(1, (object) => !isMask(object));
    return new Promise<Blob>((resolve, reject) => {
      element.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))), type, 0.95);
    });
  }, [renderAt]);

  const maskPng = useCallback(() => {
    const canvas = canvasRef.current!;
    const masks = canvas.getObjects().filter(isMask);
    const background = canvas.backgroundImage;
    const color = canvas.backgroundColor;
    const strokeColors = masks.map((mask) => mask.stroke);
    canvas.backgroundImage = undefined;
    canvas.backgroundColor = '#000000';
    masks.forEach((mask) => mask.set({ stroke: '#ffffff' }));
    const element = renderAt(Math.min(1, 1600 / Math.max(W, H)), isMask);
    canvas.backgroundImage = background;
    canvas.backgroundColor = color;
    masks.forEach((mask, index) => mask.set({ stroke: strokeColors[index] }));
    canvas.requestRenderAll();
    return element.toDataURL('image/png');
  }, [renderAt, W, H]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().filter(isMask).forEach((mask) => canvas.remove(mask));
    canvas.requestRenderAll();
    setStrokes(0);
  }, []);

  const undoStroke = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const masks = canvas.getObjects().filter(isMask);
    const last = masks[masks.length - 1];
    if (last) canvas.remove(last);
    canvas.requestRenderAll();
    setStrokes(Math.max(0, masks.length - 1));
  }, []);

  const aiCredits = useMemo(() => {
    const prices: Record<string, number> = {};
    for (const id of ['gemini-3.1-flash-image', 'gemini-3-pro-image']) {
      const model = playgroundModel(id);
      // 4K is turned off: a big picture is priced (and edited) at the largest size still offered.
      prices[id] = sizeOption(model, sizeForImage(W, H, enabledSizes(model).map((option) => option.id)))?.credits ?? 0;
    }
    return prices;
  }, [W, H]);

  const runAi = useCallback(async () => {
    const mode = tool === 'replace' ? 'replace' : 'remove';
    if (!strokes) return;
    setAiBusy(true);
    try {
      const mask = maskPng();
      if (source.preview) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        clearMask();
        toast.success('Preview: no AI call was made.', TOAST);
        return;
      }
      const result = await canvasApi.aiEdit(source.itemId, {
        baseUrl: baseUrlRef.current,
        mask,
        mode,
        instruction: mode === 'replace' ? instruction : undefined,
        model: aiModel,
        width: W,
        height: H,
      });
      await setBase(result.imageUrl);
      clearMask();
      record();
      bump();
      void refreshCredits();
      toast.success(mode === 'remove' ? 'Removed. Only the painted area changed.' : 'Replaced. Only the painted area changed.', TOAST);
    } catch (error) {
      const message = error instanceof PlaygroundApiError || error instanceof Error ? error.message : 'The edit failed.';
      toast.error(`${message}${/refund/i.test(message) ? '' : ' Your credits were refunded.'}`, { ...TOAST, duration: 6000 });
      void refreshCredits();
    } finally {
      setAiBusy(false);
    }
  }, [tool, strokes, maskPng, source.preview, source.itemId, instruction, aiModel, W, H, setBase, clearMask, record, bump, refreshCredits]);

  const download = useCallback(async (type: 'image/png' | 'image/jpeg') => {
    try {
      const blob = await exportBlob(type);
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `canvas-${source.itemId.slice(0, 8)}.${type === 'image/png' ? 'png' : 'jpg'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not export the image', TOAST);
    }
  }, [exportBlob, source.itemId]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const blob = await exportBlob('image/jpeg');
      if (source.preview) {
        toast.success('Preview: saving is off.', TOAST);
        return;
      }
      const imageUrl = await canvasApi.upload(blob);
      const { item } = await canvasApi.saveEdit(source.projectId, {
        sourceItemId: source.sourceItemId,
        editItemId: editIdRef.current ?? undefined,
        imageUrl,
        canvasDoc: serialize(),
      });
      editIdRef.current = item.id;
      toast.success('Saved to the project as an edited image', TOAST);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save', TOAST);
    } finally {
      setSaving(false);
    }
  }, [exportBlob, serialize, source.preview, source.projectId, source.sourceItemId]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const typing = (event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
      const editing = (canvas.getActiveObject() as Textbox | undefined)?.isEditing;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        if (typing || editing) return;
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (mod && event.key.toLowerCase() === 'y') {
        if (typing || editing) return;
        event.preventDefault();
        void redo();
      } else if (mod && event.key.toLowerCase() === 'd') {
        if (typing || editing) return;
        event.preventDefault();
        void duplicate();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && !editing) {
        if (canvas.getActiveObjects().length) {
          event.preventDefault();
          remove();
        }
      } else if (event.key.startsWith('Arrow') && !typing && !editing) {
        const object = canvas.getActiveObject();
        if (!object) return;
        event.preventDefault();
        const step = (event.shiftKey ? 10 : 1) / scaleRef.current;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        object.set({ left: (object.left ?? 0) + dx, top: (object.top ?? 0) + dy });
        object.setCoords();
        canvas.requestRenderAll();
        record();
      } else if (event.key === 'Escape' && !editing) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setTool('select');
      } else if (!mod && !typing && !editing && (event.key === 'v' || event.key === 't')) {
        if (event.key === 't') void addText('body');
        else setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicate, remove, record, addText]);

  const backHref = `/playground/${source.projectId}${source.preview ? '?previewPlayground=1' : ''}`;
  const painting = tool === 'erase' || tool === 'replace';

  return (
    <div className="flex h-dvh flex-col bg-[#08080a] text-white">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-[#0a0a0d] px-3">
        <Link href={backHref} className="flex items-center gap-1 rounded-full px-2 py-1.5 text-sm text-white/60 hover:bg-white/7 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> {source.projectName}
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-sm text-white">Canvas</span>
        <div className="ml-4 flex items-center gap-1">
          <button type="button" onClick={() => void undo()} disabled={!history.undo} aria-label="Undo" title="Undo (Cmd/Ctrl+Z)" className="rounded-full p-2 text-white/60 hover:bg-white/8 hover:text-white disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => void redo()} disabled={!history.redo} aria-label="Redo" title="Redo (Shift+Cmd/Ctrl+Z)" className="rounded-full p-2 text-white/60 hover:bg-white/8 hover:text-white disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="ml-2 flex items-center gap-1 rounded-full border border-white/10 px-1 py-0.5 text-xs text-white/70">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.05, scale / 1.25))} className="rounded-full p-1.5 hover:bg-white/8"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom('fit')} className="flex items-center gap-1 rounded-full px-2 py-1 tabular-nums hover:bg-white/8" title="Fit to screen"><Maximize className="h-3 w-3" />{Math.round(scale * 100)}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom(Math.min(4, scale * 1.25))} className="rounded-full p-1.5 hover:bg-white/8"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <span className="ml-2 hidden text-[11px] text-white/35 md:inline">{W} × {H}px</span>
        <div className="ml-auto flex items-center gap-2">
          <Popover
            side="bottom"
            align="end"
            className="w-56"
            trigger={<button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/12 px-3 text-sm text-white/85 hover:bg-white/8"><Download className="h-4 w-4" /> Download <ChevronDown className="h-3.5 w-3.5" /></button>}
          >
            <PopoverClose asChild>
              <button type="button" onClick={() => void download('image/png')} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/8">PNG <span className="text-white/40">· lossless</span></button>
            </PopoverClose>
            <PopoverClose asChild>
              <button type="button" onClick={() => void download('image/jpeg')} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/8">JPEG <span className="text-white/40">· smaller file</span></button>
            </PopoverClose>
          </Popover>
          <button type="button" onClick={() => void save()} disabled={saving || !ready} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#fff05a] px-4 text-sm font-medium text-black hover:bg-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to project
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ToolRail tool={tool} onTool={(next) => { setTool(next); if (next !== 'select') canvasRef.current?.discardActiveObject(); canvasRef.current?.requestRenderAll(); bump(); }} />
        {tool !== 'select' && (
          <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/8 bg-[#0c0c0f] p-4">
            {tool === 'text' && <TextPanel editor={editor} />}
            {tool === 'shapes' && <ShapesPanel editor={editor} />}
            {tool === 'image' && <ImagePanel editor={editor} busy={imageBusy} />}
            {tool === 'adjust' && <AdjustPanel editor={editor} />}
            {painting && (
              <AiPanel
                mode={tool}
                brush={brush}
                onBrush={setBrush}
                strokes={strokes}
                onUndoStroke={undoStroke}
                onClear={clearMask}
                instruction={instruction}
                onInstruction={setInstruction}
                model={aiModel}
                onModel={setAiModel}
                credits={aiCredits}
                busy={aiBusy}
                onRun={() => void runAi()}
              />
            )}
          </aside>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
            <div className="pointer-events-auto max-w-full">{!painting && <SelectionToolbar editor={editor} />}</div>
          </div>
          <div ref={stageRef} className="relative flex min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.035),transparent_70%)]">
            <div className="m-auto p-8">
              <div className="relative shadow-[0_30px_120px_rgba(0,0,0,0.6)]" style={{ width: Math.round(W * scale), height: Math.round(H * scale) }}>
                <div ref={hostRef} className={painting ? 'cursor-crosshair' : undefined} />
                {guides.vertical && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#ff4fd8]" />}
                {guides.horizontal && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#ff4fd8]" />}
                {aiBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
                    <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm text-white">
                      <Loader2 className="h-4 w-4 animate-spin text-[#fff05a]" /> Gemini is working on the painted area…
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-white/50">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading the image…
            </div>
          )}
        </main>

        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-white/8 bg-[#0c0c0f] p-4 lg:block">
          <LayersPanel editor={editor} />
          <p className="mt-6 text-[11px] leading-relaxed text-white/35">
            Double-click text to type. Drag the corners to resize. Del removes, Cmd/Ctrl+D duplicates, arrow keys nudge.
          </p>
        </aside>
      </div>
    </div>
  );
}
