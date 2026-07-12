'use client';

import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronDown, Clapperboard, Download, Eye, Image as ImageIcon, Mic, Plus, X } from 'lucide-react';
import { forwardRef, memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import toast from '@/lib/toast';
import { useSpeechDictation } from '@/lib/useSpeechDictation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { getCreditCost } from '@/lib/credits/calculator';
import { cn } from '@/lib/utils';
import { uploadFileWithSignedUrl } from '@/lib/supabase/storage';

const IMAGE_CREDIT_COST = 65;
const VIDEO_CREDIT_COST = 120;
const MARQUEE_WRAP_MIN = -20;
const MARQUEE_WRAP_MAX = -45;

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
}

interface ProductImageCandidate {
  url: string;
  alt?: string;
  source: 'shopify' | 'metadata' | 'page';
}

interface ProductCapture {
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  vendor?: string;
  description?: string;
  images: ProductImageCandidate[];
}

interface MarqueeProps {
  children: string;
  baseVelocity: number;
  className?: string;
  delay?: number;
  scrollDependent?: boolean;
}

function wrapMarquee(min: number, max: number, value: number) {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

const SHOWCASE_VIDEO_DURATION_MS = 5000;

const showcaseCategories = [
  {
    title: 'Fashion Launches',
    description: 'Model-led looks, drop teasers, and catalog-ready campaign cuts.',
    poster: '/Youtube%20Template/Youtube%20_Source.png',
    objectPosition: 'center',
    videos: [
      '/showcase-videos/fashion/01.mp4',
      '/showcase-videos/fashion/02.mp4',
      '/showcase-videos/fashion/03.mp4',
    ],
  },
  {
    title: 'Creator Ads',
    description: 'Thumb-stopping social visuals for launches, hooks, and retargeting.',
    poster: '/Youtube%20Template/Youtube_Generated.png',
    objectPosition: '42% center',
    videos: [
      '/showcase-videos/creator-ads/01.mp4',
      '/showcase-videos/creator-ads/02.mp4',
      '/showcase-videos/creator-ads/03.mp4',
    ],
  },
  {
    title: 'Product Stories',
    description: 'Hero shots, texture details, and benefit-led scenes from one product.',
    poster: '/Youtube%20Template/youtube_Reference.png',
    objectPosition: 'center',
    videos: [
      '/showcase-videos/product-stories/01.mp4',
      '/showcase-videos/product-stories/02.mp4',
      '/showcase-videos/product-stories/03.mp4',
    ],
  },
  {
    title: 'Brand Systems',
    description: 'Consistent seasonal, marketplace, and performance creative variants.',
    poster: '/new-section/logo1.png',
    objectPosition: 'center',
    videos: [
      '/showcase-videos/brand-systems/01.mp4',
      '/showcase-videos/brand-systems/02.mp4',
      '/showcase-videos/brand-systems/03.mp4',
    ],
  },
];

const ShowcaseCard = memo(({ card, index }: { card: (typeof showcaseCategories)[number]; index: number }) => {
  const [cycleIndex, setCycleIndex] = useState(0);
  const [failedVideos, setFailedVideos] = useState<Set<string>>(new Set());
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false);
  const activeVideoIndex = card.videos.length ? cycleIndex % card.videos.length : 0;
  const activeVideo = card.videos[activeVideoIndex];
  const nextVideo = card.videos.length ? card.videos[(activeVideoIndex + 1) % card.videos.length] : undefined;
  const showPoster = !hasLoadedVideo;

  useEffect(() => {
    const timer = setTimeout(() => {
      setCycleIndex((current) => current + 1);
    }, SHOWCASE_VIDEO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [cycleIndex]);

  return (
    <article
      className="group relative min-h-[360px] overflow-hidden rounded-[20px] bg-[#151518] shadow-[0_28px_70px_rgba(0,0,0,0.42)] opacity-0 animate-word-appear sm:min-h-[460px]"
      style={{
        animationDelay: `${0.1 + index * 0.08}s`,
        animationFillMode: 'forwards',
      }}
    >
      <img
        src={card.poster}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] ${
          showPoster ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ objectPosition: card.objectPosition }}
        aria-hidden
      />
      {activeVideo && !failedVideos.has(activeVideo) && (
        <video
          key={activeVideo}
          className="absolute inset-0 h-full w-full object-cover opacity-100 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          style={{ objectPosition: card.objectPosition }}
          src={activeVideo}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          onCanPlay={(event) => {
            setHasLoadedVideo(true);
            void event.currentTarget.play().catch(() => undefined);
          }}
          onError={() => {
            setFailedVideos((current) => new Set(current).add(activeVideo));
            setCycleIndex((current) => current + 1);
          }}
        />
      )}
      {nextVideo && nextVideo !== activeVideo && !failedVideos.has(nextVideo) && (
        <video
          key={`preload-${nextVideo}`}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          src={nextVideo}
          muted
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/35" />
      <div className="relative z-10 flex h-full min-h-[360px] flex-col justify-between p-6 sm:min-h-[460px] sm:p-7">
        <div>
          <div className="mb-5 h-1 w-28 overflow-hidden rounded-full bg-white/22">
            <span
              key={`${card.title}-${cycleIndex}`}
              className="block h-full rounded-full bg-white"
              style={{
                animation: `showcaseProgress ${SHOWCASE_VIDEO_DURATION_MS}ms linear forwards`,
              }}
            />
          </div>
          <h3 className="text-2xl font-light leading-none text-white sm:text-[28px]">
            {card.title}
          </h3>
        </div>
        <p className="max-w-[18rem] text-sm font-light leading-relaxed text-white/72">
          {card.description}
        </p>
      </div>
    </article>
  );
});

ShowcaseCard.displayName = 'ShowcaseCard';

const Marquee = forwardRef<HTMLDivElement, MarqueeProps>(
  (
    {
      children,
      baseVelocity,
      className,
      delay = 0,
      scrollDependent = false,
    },
    ref
  ) => {
    const baseX = useMotionValue(0);
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const smoothVelocity = useSpring(scrollVelocity, {
      damping: 50,
      stiffness: 400,
    });
    const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 2], {
      clamp: false,
    });
    const x = useTransform(baseX, (value) => `${wrapMarquee(MARQUEE_WRAP_MIN, MARQUEE_WRAP_MAX, value)}%`);
    const directionFactor = useRef(1);
    const hasStarted = useRef(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        hasStarted.current = true;
      }, delay);

      return () => clearTimeout(timer);
    }, [delay]);

    useAnimationFrame((_, delta) => {
      if (!hasStarted.current) return;

      let moveBy = directionFactor.current * baseVelocity * (delta / 1000);

      if (scrollDependent) {
        if (velocityFactor.get() < 0) {
          directionFactor.current = -1;
        } else if (velocityFactor.get() > 0) {
          directionFactor.current = 1;
        }
      }

      moveBy += directionFactor.current * moveBy * velocityFactor.get();
      baseX.set(baseX.get() + moveBy);
    });

    return (
      <div ref={ref} className="flex w-full flex-nowrap overflow-hidden whitespace-nowrap">
        <motion.div className="flex flex-nowrap gap-8 whitespace-nowrap" style={{ x }}>
          {[0, 1, 2, 3].map((item) => (
            <span key={item} className={cn('block text-[clamp(3.75rem,9vw,9.75rem)] leading-none', className)}>
              {children}
            </span>
          ))}
        </motion.div>
      </div>
    );
  }
);

Marquee.displayName = 'Marquee';

const IMAGE_MODELS = [
  { id: 'nano-banana-pro', name: 'Nano Banana Pro' },
];

const VIDEO_MODELS = [
  { id: 'veo-3.1-generate-001', name: 'Google Veo 3.1' },
  { id: 'veo-2.0-generate-001', name: 'Google Veo 2.0' },
  { id: 'veo-1.0', name: 'Google Veo 1.0' },
  { id: 'runway-gen3', name: 'Runway Gen-3 Alpha' },
];

const MODEL_MENU_STAGGER_MS = 28;
const MODEL_MENU_ANIM_MS = 150;
const MODEL_MENU_CLOSE_STAGGER_MS = 12;
const MODEL_MENU_CLOSE_ANIM_MS = 85;

const modelMenuItemAnimStyle = (
  name: 'heroModelOptionIn' | 'heroModelOptionOut',
  delayMs: number,
  durationMs: number = MODEL_MENU_ANIM_MS
): CSSProperties => ({
  animationName: name,
  animationDuration: `${durationMs}ms`,
  animationTimingFunction: 'ease',
  animationFillMode: 'forwards',
  animationDelay: `${delayMs}ms`,
});

function getModelMenuCloseDurationMs(count: number) {
  return Math.max(0, count - 1) * MODEL_MENU_CLOSE_STAGGER_MS + MODEL_MENU_CLOSE_ANIM_MS;
}

function extractFirstPublicUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[),.]+$/, ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function removeUrlFromPrompt(value: string, url: string): string {
  return value.replace(url, '').replace(/\s+/g, ' ').trim();
}

function buildProductCreativePrompt(product: ProductCapture, originalPrompt: string, productUrl: string): string {
  const userDirection = removeUrlFromPrompt(originalPrompt, productUrl);
  const productName = product.title ? `"${product.title}"` : 'this Shopify product';
  const brand = product.vendor ? ` by ${product.vendor}` : '';
  return userDirection || `High-Vogue luxury campaign for ${productName}${brand}, preserving the exact canonical product identity.`;
}

function ProductCreativeProgress({
  statusMessage,
  progress,
  referenceUrls,
  productCapture,
}: {
  statusMessage: string;
  progress: number;
  referenceUrls: string[];
  productCapture: ProductCapture | null;
}) {
  const displayUrls = referenceUrls.length
    ? referenceUrls
    : productCapture?.images.map((image) => image.url) ?? [];
  const placeholderCount = Math.max(8, productCapture?.images.length ?? 8);
  const steps = [
    'Analyzing reference images',
    'Reading branding and packaging',
    'Mapping Instagram and Shopify crops',
    'Generating tailored images',
  ];
  const activeStep = progress < 30 ? 0 : progress < 54 ? 1 : progress < 74 ? 2 : 3;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#151519]/88 p-4 text-left shadow-[0_26px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,240,90,0.10),transparent_42%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[1fr_0.82fr]">
        <div className="overflow-hidden rounded-[22px] border border-white/10 bg-black/28 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-white/38">
              Analyzing {displayUrls.length || placeholderCount} references
            </span>
            <span className="rounded-full bg-[#fff05a] px-2.5 py-1 text-[10px] font-semibold text-black">
              {Math.max(12, Math.min(progress, 96))}%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(displayUrls.length ? displayUrls : new Array(placeholderCount).fill('')).map((url, index) => (
              <div
                key={`${url || 'placeholder'}-${index}`}
                className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]"
              >
                {url ? (
                  <img src={url} alt="Analyzed product reference" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full animate-pulse bg-white/8" />
                )}
                <span
                  className="absolute inset-y-0 w-8 bg-gradient-to-r from-transparent via-white/45 to-transparent"
                  style={{
                    animation: `workflowScan ${2.4 + index * 0.16}s cubic-bezier(0.2,0.8,0.2,1) infinite`,
                    animationDelay: `${index * 120}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="mb-4">
            <p className="text-2xl font-light leading-tight text-white sm:text-3xl">
              {activeStep < 3 ? 'Analyzing your product system' : 'Generating tailored images'}
            </p>
            <p className="mt-2 text-sm font-light leading-relaxed text-white/50">
              {statusMessage || 'Reading visual identity, packaging, color, and product context from the references.'}
            </p>
          </div>
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors',
                  index <= activeStep
                    ? 'border-[#fff05a]/20 bg-[#fff05a]/10 text-white'
                    : 'border-white/8 bg-white/[0.035] text-white/34'
                )}
              >
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    index <= activeStep ? 'bg-[#fff05a] shadow-[0_0_18px_rgba(255,240,90,0.45)]' : 'bg-white/20'
                  )}
                />
                <span className="text-sm font-light">{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[#fff05a] transition-all duration-500 ease-out"
              style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

let imageIdCounter = 0;

export function HeroSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { credits, refreshCredits } = useCredits();

  const typingTargets = [
    'Paste a Shopify product URL',
    'Or describe the creative you want',
  ];
  const [promptValue, setPromptValue] = useState('');
  const [typingText, setTypingText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const [generationMode, setGenerationMode] = useState<'image' | 'video'>('image');
  const [selectedModel, setSelectedModel] = useState('nano-banana-pro');
  const currentModels = generationMode === 'video' ? VIDEO_MODELS : IMAGE_MODELS;
  const [modelMenuPhase, setModelMenuPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [modelMenuKey, setModelMenuKey] = useState(0);
  const modelMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [productCapture, setProductCapture] = useState<ProductCapture | null>(null);
  const [selectedProductUrls, setSelectedProductUrls] = useState<string[]>([]);
  const [isCapturingProduct, setIsCapturingProduct] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedResults, setGeneratedResults] = useState<string[]>([]);
  const [generatedType, setGeneratedType] = useState<'image' | 'video'>('image');
  const [generationReferenceUrls, setGenerationReferenceUrls] = useState<string[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const productUrl = extractFirstPublicUrl(promptValue);

  const speech = useSpeechDictation(setPromptValue, {
    onError: (code) => {
      if (code === 'not-allowed') {
        toast.error('Microphone access denied. Allow the microphone in your browser settings.');
      } else if (code === 'service-not-allowed') {
        toast.error('Voice input is not available. Check your browser permissions.');
      } else if (code === 'network') {
        toast.error('Voice recognition failed (network). Check your connection.');
      }
    },
  });

  useEffect(() => {
    return () => {
      uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  }, []);

  useEffect(() => {
    const currentTarget = typingTargets[typingIndex];
    const nextDelay = isDeleting ? 40 : 85;
    const pauseAtEdge = isDeleting ? 250 : 1000;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        const next = currentTarget.slice(0, typingText.length + 1);
        setTypingText(next);
        if (next === currentTarget) {
          setTimeout(() => setIsDeleting(true), pauseAtEdge);
        }
      } else {
        const next = currentTarget.slice(0, Math.max(0, typingText.length - 1));
        setTypingText(next);
        if (next.length === 0) {
          setIsDeleting(false);
          setTypingIndex((prev) => (prev + 1) % typingTargets.length);
        }
      }
    }, nextDelay);

    return () => clearTimeout(timer);
  }, [isDeleting, typingText, typingIndex, typingTargets]);

  const closeModelMenuAnimated = (onFullyClosed?: () => void) => {
    if (modelMenuPhase !== 'open') return;
    if (modelMenuCloseTimerRef.current) {
      clearTimeout(modelMenuCloseTimerRef.current);
    }
    setModelMenuPhase('closing');
    const duration = getModelMenuCloseDurationMs(currentModels.length);
    modelMenuCloseTimerRef.current = setTimeout(() => {
      modelMenuCloseTimerRef.current = null;
      setModelMenuPhase('closed');
      onFullyClosed?.();
    }, duration);
  };

  const openModelMenu = () => {
    if (modelMenuCloseTimerRef.current) {
      clearTimeout(modelMenuCloseTimerRef.current);
      modelMenuCloseTimerRef.current = null;
    }
    setModelMenuKey((k) => k + 1);
    setModelMenuPhase('open');
  };

  useEffect(() => {
    return () => {
      if (modelMenuCloseTimerRef.current) clearTimeout(modelMenuCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        if (modelMenuPhase === 'open') {
          closeModelMenuAnimated();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modelMenuPhase]);

  useEffect(() => {
    if (!currentModels.find((m) => m.id === selectedModel)) {
      setSelectedModel(currentModels[0].id);
    }
  }, [generationMode]);

  const selectedModelName =
    currentModels.find((model) => model.id === selectedModel)?.name ?? currentModels[0].name;

  const creditCost = generationMode === 'image'
    ? getCreditCost(selectedModel, '2K')
    : VIDEO_CREDIT_COST;

  const handleTrustCtaClick = useCallback(() => {
    promptInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => promptInputRef.current?.focus(), 450);
  }, []);

  const handlePricingClick = useCallback(() => {
    router.push('/pricing');
  }, [router]);

  const handleSignupClick = useCallback(() => {
    router.push('/login');
  }, [router]);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const newImages: UploadedImage[] = Array.from(files).map((file) => ({
      id: `img-${++imageIdCounter}`,
      file,
      preview: URL.createObjectURL(file),
    }));
    setUploadedImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setUploadedImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const toggleProductImage = useCallback((url: string) => {
    setSelectedProductUrls((prev) => {
      if (prev.includes(url)) {
        return prev.filter((item) => item !== url);
      }
      return [...prev, url];
    });
  }, []);

  const clearProductCapture = useCallback(() => {
    setProductCapture(null);
    setSelectedProductUrls([]);
  }, []);

  const captureProductImages = useCallback(async (url: string) => {
    setIsCapturingProduct(true);
    setStatusMessage('Hunting for images...');
    setProgress(12);

    try {
      const res = await fetch('/api/product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await res.json() as {
        product?: ProductCapture;
        error?: string;
      };

      if (!res.ok || !result.product) {
        throw new Error(result.error || 'Could not capture product images');
      }

      setProductCapture(result.product);
      const selected = result.product.images.map((image) => image.url);
      setSelectedProductUrls(selected);
      setProgress(24);
      setStatusMessage(`Found ${result.product.images.length} product images`);
      return { product: result.product, selected };
    } finally {
      setIsCapturingProduct(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setError('');
    setProgress(0);
    setStatusMessage('');
    const activeProductUrl = extractFirstPublicUrl(promptValue);

    let productReferenceUrls =
      activeProductUrl && productCapture?.requestedUrl !== activeProductUrl
        ? []
        : selectedProductUrls;
    let promptForGeneration = promptValue;
    let activeProductCapture = productCapture;
    let capturedThisRun = false;

    if (activeProductUrl && uploadedImages.length === 0 && productReferenceUrls.length === 0) {
      try {
        const capture = await captureProductImages(activeProductUrl);
        capturedThisRun = true;
        productReferenceUrls = capture.selected;
        activeProductCapture = capture.product;
        promptForGeneration = buildProductCreativePrompt(capture.product, promptValue, activeProductUrl);
        setPromptValue(promptForGeneration);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not capture product images';
        setError(msg);
        toast.error(msg);
        return;
      }
    } else if (activeProductUrl && productCapture && productReferenceUrls.length > 0) {
      const promptWithoutUrl = removeUrlFromPrompt(promptValue, activeProductUrl);
      if (!promptWithoutUrl || promptWithoutUrl === promptValue) {
        promptForGeneration = buildProductCreativePrompt(productCapture, promptValue, activeProductUrl);
      }
    }

    const referenceCount = uploadedImages.length + productReferenceUrls.length;
    if (referenceCount === 0) {
      toast.error('Upload an image or paste a Shopify product URL');
      return;
    }

    if (!user) {
      toast.error('Sign up to generate creatives from these product images');
      if (!capturedThisRun) {
        setTimeout(() => router.push('/login?redirectTo=/'), 1500);
      }
      return;
    }

    if (generationMode === 'image' && referenceCount === 1 && !promptForGeneration.trim()) {
      toast.error('Add a prompt when using a single image');
      return;
    }

    if (generationMode === 'video' && !promptForGeneration.trim()) {
      toast.error('A prompt is required for video generation');
      return;
    }

    if (credits < creditCost) {
      toast.error(`Insufficient credits! Need ${creditCost}, have ${credits}`);
      return;
    }

    setGenerationReferenceUrls([...productReferenceUrls, ...uploadedImages.map((img) => img.preview)]);
    setStatusMessage(productReferenceUrls.length > 0
      ? 'Analyzing Shopify references, text branding, packaging, and product identity...'
      : 'Analyzing uploaded product references...');
    setProgress(18);
    setIsGenerating(true);
    setGeneratedResults([]);
    setGeneratedType(generationMode);

    try {
      setStatusMessage(uploadedImages.length > 0 ? 'Preparing reference board...' : 'Preparing product image set...');
      setProgress(26);

      const uploadedImageUrls = uploadedImages.length > 0
        ? await Promise.all(
            uploadedImages.map((img) => uploadFileWithSignedUrl(img.file, 'source-images'))
          )
        : [];
      const imageUrls = [...productReferenceUrls, ...uploadedImageUrls];
      setGenerationReferenceUrls([...productReferenceUrls, ...uploadedImageUrls]);

      console.log(`📎 Sending ${imageUrls.length} reference image(s) to model:`, imageUrls);

      setStatusMessage('Reading brand colors, product shape, labels, and ecommerce context...');
      setProgress(42);

      if (generationMode === 'image') {
        const isProductCreativeSet = productReferenceUrls.length > 0;
        setStatusMessage(isProductCreativeSet ? 'Generating four tailored premium images for Instagram and Shopify...' : 'Generating tailored image...');
        setProgress(68);

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'generate',
            referenceImages: imageUrls,
            prompt: promptForGeneration || '',
            model: selectedModel,
            creativeSet: isProductCreativeSet,
            aspectRatio: isProductCreativeSet ? '9:16' : undefined,
            resolution: '2K',
            productContext: activeProductCapture
              ? {
                  title: activeProductCapture.title,
                  vendor: activeProductCapture.vendor,
                  description: activeProductCapture.description,
                }
              : undefined,
          }),
        });

        setProgress(86);

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');

        setProgress(100);
        setStatusMessage('Tailored images ready.');
        setGeneratedResults(result.images ?? []);
      } else {
        setStatusMessage('Starting tailored video generation...');

        const res = await fetch('/api/img2vid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imageUrls[0],
            prompt: promptForGeneration || '',
            model: selectedModel,
          }),
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Video generation failed');

        if (result.operationId) {
          setProgress(15);
          setStatusMessage('Rendering video...');

          let isDone = false;
          let failed = false;
          let finalUrls: string[] = [];

          while (!isDone) {
            await new Promise((r) => setTimeout(r, 10000));
            try {
              const statusRes = await fetch('/api/video-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operationId: result.operationId }),
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.error) {
                  failed = true;
                  isDone = true;
                  throw new Error(statusData.error);
                }
                if (statusData.done) {
                  isDone = true;
                  finalUrls = statusData.url ? [statusData.url] : [];
                  setProgress(100);
                  setStatusMessage('Done!');
                } else {
                  const p = typeof statusData.progress === 'number' && statusData.progress > 0
                    ? statusData.progress : 15;
                  setProgress(p);
                  setStatusMessage(`Rendering video... ${p}%`);
                }
              }
            } catch (e) {
              if ((e as Error).message) {
                failed = true;
                isDone = true;
              }
            }
          }
          if (failed) throw new Error('Video generation failed');
          setGeneratedResults(finalUrls);
        } else if (result.images) {
          setProgress(100);
          setStatusMessage('Done!');
          setGeneratedResults(result.images);
        }
      }

      await refreshCredits();

      uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setUploadedImages([]);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      toast.error(msg);
      await refreshCredits();
    } finally {
      setIsGenerating(false);
    }
  }, [user, uploadedImages, selectedProductUrls, productCapture, promptValue, generationMode, selectedModel, credits, creditCost, refreshCredits, router, captureProductImages]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08080a]">
      {/* Visible Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.025] animate-grid-draw"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_36%),linear-gradient(to_bottom,transparent,#08080a_80%)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1840px] flex-col items-center px-5 pb-16 pt-28 sm:px-8 sm:pb-20 sm:pt-36">
        <div className="flex w-full flex-col items-center text-center">
        <div className="w-full max-w-6xl space-y-5 sm:space-y-7">
          {/* Animated Title */}
          <h1 className="mx-auto max-w-6xl text-[56px] font-light leading-[0.96] text-[#f4f4f5] sm:text-[84px] md:text-[112px] lg:text-[136px]">
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{ animationDelay: '0s', animationFillMode: 'forwards' }}
            >
              Product links into
            </span>
            <br />
            <span
              className="inline-block animate-word-appear opacity-0"
              style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
            >
              tailored creatives
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto max-w-3xl px-4 text-lg font-light text-[#a6a6ad] sm:text-2xl">
            Paste a Shopify URL. Visicraft finds the product images and turns them into campaign-ready visuals for your brand.
          </p>

          {/* Prompt Box */}
          <div className="relative z-20 pt-8 sm:pt-10">
            {isGenerating ? (
              <div className="mx-auto w-full max-w-[1080px]">
                <ProductCreativeProgress
                  statusMessage={statusMessage}
                  progress={progress}
                  referenceUrls={generationReferenceUrls}
                  productCapture={productCapture}
                />
              </div>
            ) : (
            <div className="mx-auto w-full max-w-[980px] rounded-[28px] border border-white/10 bg-[#18181b]/90 p-3 shadow-[0_28px_100px_rgba(0,0,0,0.62)] backdrop-blur-2xl">
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-left sm:px-4">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-light text-white/80">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {generationMode === 'video' ? 'Video' : 'Image'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-light text-white/70">
                    Reference
                    {uploadedImages.length + selectedProductUrls.length > 0
                      ? ` x${uploadedImages.length + selectedProductUrls.length}`
                      : ''}
                  </span>
                  {productUrl && (
                    <span className="inline-flex max-w-full items-center rounded-md bg-[#bca8ff]/15 px-2.5 py-1 text-xs font-light text-[#c8b8ff]">
                      Shopify URL
                    </span>
                  )}
                  <span className="inline-flex max-w-full items-center rounded-md bg-[#f6e958]/15 px-2.5 py-1 text-xs font-light text-[#fbf2a0]">
                    {selectedModelName}
                  </span>
                </div>
                <div className="relative px-3 py-3 sm:px-5 sm:py-4">
                  {promptValue.length === 0 && !speech.isListening && (
                    <div className="pointer-events-none absolute left-3 top-5 text-base font-light text-white/40 sm:left-5 sm:text-xl">
                      {typingText}
                      <span className="ml-1 inline-block h-5 w-px animate-pulse bg-white/45 align-middle" />
                    </div>
                  )}
                  <textarea
                    ref={promptInputRef}
                    className="min-h-[72px] w-full resize-none appearance-none bg-transparent py-2 pr-12 text-base font-light text-white placeholder:text-white/40 !border-0 !outline-none !ring-0 !shadow-none focus:!border-0 focus:!outline-none focus:!ring-0 focus:!shadow-none focus-visible:!border-0 focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!shadow-none sm:min-h-[84px] sm:text-xl"
                    placeholder=""
                    value={promptValue}
                    onChange={(e) => setPromptValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !isGenerating) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />
                </div>

                {(isCapturingProduct || productCapture) && (
                  <div className="px-3 pb-3 sm:px-4">
                    {isCapturingProduct && !productCapture ? (
                      <div className="relative mx-auto flex min-h-[190px] max-w-xl items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(188,168,255,0.24),transparent_42%)]" />
                        <div className="relative h-32 w-40 overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
                          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/20 via-white/8 to-transparent" />
                          <div className="absolute left-5 top-5 h-6 w-14 rounded-full bg-[#fff05a]/90" />
                          <div className="absolute bottom-5 left-1/2 h-20 w-20 -translate-x-1/2 rounded-xl bg-black/70" />
                        </div>
                        <p className="absolute text-4xl font-light text-[#c8b8ff] sm:text-5xl">
                          Hunting for images
                        </p>
                      </div>
                    ) : productCapture ? (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-light text-white">
                              {productCapture.title ?? 'Product images captured'}
                            </p>
                            <p className="mt-0.5 text-xs text-white/45">
                              {selectedProductUrls.length || 0} selected from {productCapture.images.length} found
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={clearProductCapture}
                            className="self-start rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:self-auto"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {productCapture.images.map((image, index) => {
                            const selected = selectedProductUrls.includes(image.url);
                            return (
                              <button
                                key={`${image.url}-${index}`}
                                type="button"
                                onClick={() => toggleProductImage(image.url)}
                                className={`group relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border transition-all sm:h-28 sm:w-28 ${
                                  selected
                                    ? 'border-[#fff05a] ring-2 ring-[#fff05a]/25'
                                    : 'border-white/10 hover:border-white/30'
                                }`}
                              >
                                <img
                                  src={image.url}
                                  alt={image.alt ?? productCapture.title ?? 'Captured product'}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <span className={`absolute right-2 top-2 h-4 w-4 rounded-full border ${
                                  selected ? 'border-[#fff05a] bg-[#fff05a]' : 'border-white/60 bg-black/30'
                                }`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Uploaded Images Strip */}
                {uploadedImages.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto px-3 pb-3 scrollbar-hide sm:px-4">
                    {uploadedImages.map((img) => (
                      <div
                        key={img.id}
                        className="group relative h-16 w-16 flex-shrink-0 animate-[chipIn_150ms_ease-out_forwards] overflow-hidden rounded-2xl border border-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
                      >
                        <img
                          src={img.preview}
                          alt="Upload"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/20 text-white/40 transition-colors hover:border-white/40 hover:text-white/70"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    {uploadedImages.length > 4 && (
                      <span className="ml-1 flex-shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/60">
                        {uploadedImages.length} images
                      </span>
                    )}
                  </div>
                )}

                {/* Bottom Toolbar */}
                <div className="mt-2 flex flex-col gap-3 border-t border-white/10 px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Image upload button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/12 bg-white px-4 text-sm font-light text-black transition-colors hover:bg-[#f3f3f3]"
                      title="Upload images"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add your product</span>
                    </button>

                    {/* Image / Video toggle */}
                    <div className="relative grid w-[165px] grid-cols-2 items-center rounded-full border border-white/10 bg-black/28 p-1">
                      <span
                        className={`pointer-events-none absolute ml-1 h-[26px] w-[calc(82.5px-4px)] rounded-full bg-white/12 shadow-[0_1px_0_rgba(255,255,255,0.04)] transition-transform duration-300 ease-out ${
                          generationMode === 'video' ? 'translate-x-[82.5px]' : 'translate-x-0'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setGenerationMode('image')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[10px] transition-colors duration-300 ${
                          generationMode === 'image'
                            ? 'font-bold text-[#fff16a]'
                            : 'font-medium text-white/60 hover:text-white'
                        }`}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Image</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGenerationMode('video')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[10px] transition-colors duration-300 ${
                          generationMode === 'video'
                            ? 'font-bold text-[#fff16a]'
                            : 'font-medium text-white/60 hover:text-white'
                        }`}
                      >
                        <Clapperboard className="h-3.5 w-3.5" />
                        <span>Video</span>
                      </button>
                    </div>

                    {/* Model picker */}
                    <div ref={modelMenuRef} className="relative ml-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (modelMenuPhase === 'open') {
                            closeModelMenuAnimated();
                          } else if (modelMenuPhase === 'closed') {
                            openModelMenu();
                          }
                        }}
                        className="flex max-w-[180px] items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold text-white/60 transition-colors hover:text-white"
                      >
                        <span>{selectedModelName}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 opacity-50 transition-transform ${modelMenuPhase !== 'closed' ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {modelMenuPhase !== 'closed' && (
                        <div
                          key={modelMenuKey}
                          className="absolute bottom-full left-0 z-40 mb-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#161616] shadow-2xl"
                        >
                          {currentModels.map((model, index) => {
                            const isClosing = modelMenuPhase === 'closing';
                            const reverseIndex = currentModels.length - 1 - index;
                            const staggerDelay = isClosing
                              ? reverseIndex * MODEL_MENU_CLOSE_STAGGER_MS
                              : index * MODEL_MENU_STAGGER_MS;
                            return (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                closeModelMenuAnimated(() => setSelectedModel(model.id));
                              }}
                              className={`block w-full border-b border-[#4d453c]/20 px-3 py-2 text-left text-xs transition-colors last:border-b-0 ${
                                selectedModel === model.id
                                  ? 'bg-white/10 text-[#fff16a]'
                                  : 'text-white/70 hover:bg-white/10 hover:text-white'
                              }`}
                              style={
                                isClosing
                                  ? {
                                      opacity: 1,
                                      transform: 'translateY(0)',
                                      ...modelMenuItemAnimStyle(
                                        'heroModelOptionOut',
                                        staggerDelay,
                                        MODEL_MENU_CLOSE_ANIM_MS
                                      ),
                                    }
                                  : {
                                      opacity: 0,
                                      transform: 'translateY(8px)',
                                      ...modelMenuItemAnimStyle('heroModelOptionIn', staggerDelay),
                                    }
                              }
                            >
                              {model.name}
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {/* Credit cost label */}
                    {uploadedImages.length > 0 && (
                      <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-white/60 sm:inline-flex">
                        {creditCost} credits
                      </span>
                    )}
                    {/* Mic */}
                    <button
                      type="button"
                      aria-pressed={speech.isListening}
                      aria-label={speech.isListening ? 'Stop voice input' : 'Start voice input'}
                      title={
                        speech.isListening
                          ? 'Stop listening'
                          : speech.supported
                            ? 'Voice input'
                            : 'Voice input not supported in this browser'
                      }
                      onClick={() => {
                        if (!speech.supported) {
                          toast.error(
                            'Voice input is not supported in this browser. Try Chrome, Edge, or Safari.'
                          );
                          return;
                        }
                        speech.toggle(promptValue);
                      }}
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                        speech.isListening
                          ? 'animate-mic-listening bg-white/12 ring-1 ring-white/10 hover:bg-white/16'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {speech.isListening ? (
                        <span
                          className="block h-[11px] w-[11px] rounded-[2.5px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.55)]"
                          aria-hidden
                        />
                      ) : (
                        <Mic className="h-5 w-5" />
                      )}
                    </button>
                    {/* Generate button */}
                    <button
                      type="button"
                      disabled={isGenerating || isCapturingProduct}
                      onClick={handleGenerate}
                      className={cn(
                        'flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-light shadow-lg transition-all',
                        isGenerating || isCapturingProduct
                          ? 'cursor-wait bg-white/12 text-white/40'
                          : 'bg-[#fff05a] text-black hover:scale-[1.03] hover:bg-[#fff36f] active:scale-95'
                      )}
                    >
                      {isGenerating || isCapturingProduct ? (
                        <>
                          <span className="flex h-4 w-4 items-center justify-center">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-[#fff05a] shadow-[0_0_18px_rgba(255,240,90,0.55)]" />
                          </span>
                          <span>{isGenerating ? 'Working' : 'Capturing'}</span>
                        </>
                      ) : (
                        <>
                          <ArrowUp className="h-[18px] w-[18px]" />
                          <span>
                            {productUrl && selectedProductUrls.length === 0 && uploadedImages.length === 0
                              ? 'Capture'
                              : 'Generate'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Results / Progress Section */}
          {(generatedResults.length > 0 || error) && (
            <div ref={resultsRef} className="mx-auto w-full max-w-[1780px] pt-6">
              {/* Error */}
              {error && (
                <p className="text-center text-sm text-red-400">{error}</p>
              )}

              {/* Generated Images */}
              {!isGenerating && generatedResults.length > 0 && generatedType === 'image' && (
                <div className="mx-auto w-full overflow-x-auto pb-2 scrollbar-hide">
                  <div className="mx-auto grid min-w-[920px] max-w-[1280px] grid-cols-4 gap-3 sm:gap-4">
                  {generatedResults.map((url, i) => (
                    <div
                      key={i}
                      className="group relative aspect-[9/16] w-full overflow-hidden rounded-[22px] border border-white/10 bg-[#151519] opacity-0 shadow-[0_22px_70px_rgba(0,0,0,0.34)] animate-word-appear"
                      style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(url)}
                        className="block h-full w-full cursor-zoom-in"
                      >
                        <img
                          src={url}
                          alt={`Generated ${i + 1}`}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                        />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/72 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <div className="flex gap-1.5">
                          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/76 backdrop-blur">
                            Instagram
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/76 backdrop-blur">
                            Shopify
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(url)}
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                            aria-label="Preview generated image"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        <a
                          href={url}
                          download={`visicraft-${i + 1}.png`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                          aria-label="Download generated image"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}

              {/* Generated Video */}
              {!isGenerating && generatedResults.length > 0 && generatedType === 'video' && (
                <div className="space-y-3">
                  {generatedResults.map((url, i) => (
                    <video
                      key={i}
                      src={url}
                      controls
                      className="w-full rounded-2xl border border-[#4d453c]/20 bg-[#1a1a1a] opacity-0 animate-word-appear"
                      style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {previewImageUrl && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/82 p-4 backdrop-blur-xl"
              onClick={() => setPreviewImageUrl(null)}
            >
              <div
                className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/12 bg-[#151519] shadow-[0_30px_120px_rgba(0,0,0,0.62)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">Creative preview</p>
                    <p className="mt-0.5 text-xs text-white/42">Review before using on Instagram or Shopify.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewImageUrl}
                      download="visicraft-preview.png"
                      className="flex h-9 items-center gap-2 rounded-full bg-[#fff05a] px-3 text-xs font-medium text-black transition-colors hover:bg-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => setPreviewImageUrl(null)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/58 transition-colors hover:bg-white/10 hover:text-white"
                      aria-label="Close preview"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[calc(92vh-66px)] overflow-auto bg-black/30 p-3">
                  <img
                    src={previewImageUrl}
                    alt="Generated creative preview"
                    className="mx-auto max-h-[calc(92vh-92px)] w-auto rounded-2xl object-contain"
                  />
                </div>
              </div>
            </div>
          )}

          <section id="showcase" className="w-full pt-20 sm:pt-28">
            <div className="mx-auto max-w-5xl text-center">
              <h2 className="text-4xl font-light leading-tight text-[#f4f4f5] sm:text-6xl">
                Creative angles for every product category
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-base font-light leading-relaxed text-[#a6a6ad] sm:text-xl">
                Each category is built for three five-second examples, showing how one product can become lifestyle, studio, and performance ad creative.
              </p>
            </div>
            <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
              {showcaseCategories.map((card, index) => (
                <ShowcaseCard key={card.title} card={card} index={index} />
              ))}
            </div>
          </section>

          <section id="workflow" className="w-full pt-20 sm:pt-28">
            <div className="mx-auto mb-10 max-w-5xl text-center sm:mb-14">
              <p className="text-xs font-light uppercase tracking-[0.28em] text-white/36 sm:text-sm">
                From link to launch system
              </p>
              <h2 className="mt-4 text-4xl font-light leading-tight text-[#f4f4f5] sm:text-6xl">
                See how one prompt becomes a premium product video.
              </h2>
              <p className="mx-auto mt-5 max-w-3xl text-base font-light leading-relaxed text-[#a6a6ad] sm:text-xl">
                Visicraft reads the store page, captures the strongest product references, then renders a polished creative your team can use across ads, landing pages, and social launches.
              </p>
            </div>

            <div className="workflow-showcase mx-auto grid max-w-[1760px] gap-5 lg:grid-cols-[minmax(0,1.03fr)_minmax(430px,0.97fr)]">
              <div className="workflow-image-stage group relative min-h-[520px] overflow-hidden rounded-[30px] bg-[#151519] shadow-[0_34px_120px_rgba(0,0,0,0.46)] sm:min-h-[650px] lg:min-h-[760px]">
                <video
                  className="h-full w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.035]"
                  src="/showcase-videos/product-stories/01.mp4"
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  aria-label="Generated product video preview"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.38)),radial-gradient(circle_at_18%_12%,rgba(255,240,90,0.20),transparent_34%)]" />
                <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2 sm:left-7 sm:top-7">
                  <span className="rounded-full bg-white/92 px-3.5 py-2 text-xs font-medium text-black shadow-[0_12px_38px_rgba(0,0,0,0.24)]">
                    Generated video
                  </span>
                  <span className="rounded-full border border-white/14 bg-black/32 px-3.5 py-2 text-xs font-light text-white/76 backdrop-blur-xl">
                    Ready to publish
                  </span>
                </div>
                <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full border border-white/12 bg-black/36 px-3.5 py-2 text-xs font-light text-white/78 backdrop-blur-xl sm:right-7 sm:top-7">
                  <span className="h-2 w-2 rounded-full bg-[#fff05a] shadow-[0_0_18px_rgba(255,240,90,0.7)]" />
                  5s loop
                </div>
                <div className="absolute bottom-5 left-5 right-5 rounded-[24px] border border-white/10 bg-black/34 p-4 backdrop-blur-2xl sm:bottom-7 sm:left-7 sm:right-7 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-sm font-light uppercase tracking-[0.22em] text-white/46">Final render</p>
                      <h3 className="mt-2 max-w-xl text-3xl font-light leading-none text-white sm:text-5xl">
                        The video takes over the stage.
                      </h3>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 sm:w-48">
                      {[
                        '/Youtube%20Template/Youtube%20_Source.png',
                        '/Youtube%20Template/youtube_Reference.png',
                        '/Youtube%20Template/Youtube_Generated.png',
                        '/new-section/logo1.png',
                      ].map((image, index) => (
                        <div
                          key={`main-output-${image}`}
                          className="workflow-mini-output aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/6"
                          style={{ animationDelay: `${index * 180}ms` }}
                        >
                          <img src={image} alt="" className="h-full w-full object-cover" aria-hidden />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="workflow-console relative min-h-[620px] overflow-hidden rounded-[30px] border border-white/8 bg-[#1b1b1f] p-4 shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:p-6 lg:min-h-[760px]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(255,240,90,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_34%)]" />
                <div className="relative z-10 flex h-full min-h-[588px] flex-col gap-4 lg:min-h-[712px]">
                  <div className="workflow-reference-strip grid grid-cols-4 overflow-hidden rounded-[22px] border border-white/8 bg-black/24">
                    {[
                      '/Youtube%20Template/Youtube%20_Source.png',
                      '/Youtube%20Template/youtube_Reference.png',
                      '/Youtube%20Template/Youtube_Generated.png',
                      '/new-section/logo1.png',
                    ].map((image, index) => (
                      <div key={`workflow-ref-${image}`} className="relative aspect-[4/3] overflow-hidden">
                        <img
                          src={image}
                          alt=""
                          className="h-full w-full object-cover opacity-85"
                          aria-hidden
                        />
                        <span
                          className="workflow-scan-line absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/38 to-transparent"
                          style={{ animationDelay: `${index * 420}ms` }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="workflow-prompt-card ml-auto w-full max-w-[600px] rounded-[22px] bg-[#37373c] p-3.5 shadow-[0_18px_60px_rgba(0,0,0,0.32)] sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 overflow-hidden rounded-full border border-white/12 bg-white/10">
                        <img src="/Youtube%20Template/Youtube%20_Source.png" alt="" className="h-full w-full object-cover" aria-hidden />
                      </span>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-black">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Product
                      </span>
                      <span className="inline-flex h-8 items-center rounded-lg bg-white/88 px-2.5 text-xs font-medium text-black">
                        Model
                      </span>
                      <span className="workflow-active-chip inline-flex h-8 items-center gap-1.5 rounded-full bg-[#fff05a] px-3 text-xs font-semibold text-black">
                        <Clapperboard className="h-3.5 w-3.5" />
                        Video render
                      </span>
                    </div>
                    <p className="workflow-type-line text-sm font-light leading-relaxed text-white/82 sm:text-base">
                      Create a cinematic 5-second product video: premium lighting, slow camera movement, natural product detail, and a clean ad-ready finish.
                    </p>
                  </div>

                  <div className="workflow-process relative flex flex-1 gap-4">
                    <div className="hidden w-[42%] min-w-[220px] overflow-hidden rounded-[22px] bg-[#343439] lg:block">
                      <div className="workflow-build-panel h-full w-full">
                        <div className="workflow-video-render relative mx-auto mt-6 aspect-[9/14] w-[72%] overflow-hidden rounded-[20px] border border-white/10 bg-black/30 shadow-[0_24px_64px_rgba(0,0,0,0.36)]">
                          <video
                            className="h-full w-full object-cover opacity-82"
                            src="/showcase-videos/product-stories/01.mp4"
                            muted
                            autoPlay
                            loop
                            playsInline
                            preload="auto"
                            aria-hidden
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.32))]" />
                          <div className="workflow-render-scan absolute inset-x-0 h-14 bg-gradient-to-b from-transparent via-[#fff05a]/26 to-transparent" />
                          <span className="absolute left-3 top-3 rounded-full bg-black/48 px-2.5 py-1 text-[11px] font-light text-white/78 backdrop-blur-xl">
                            Rendering
                          </span>
                        </div>
                        <div className="absolute bottom-8 left-8 right-8">
                          <div className="mb-2 flex items-center justify-between text-[11px] font-light uppercase tracking-[0.18em] text-white/42">
                            <span>Scene pass</span>
                            <span>82%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <span className="workflow-render-progress block h-full rounded-full bg-[#fff05a]" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="workflow-outputs grid flex-1 grid-cols-2 gap-3">
                      {[
                        { label: 'Hero cut', src: '/showcase-videos/product-stories/01.mp4' },
                        { label: 'Social crop', src: '/showcase-videos/product-stories/02.mp4' },
                        { label: 'Ad motion', src: '/showcase-videos/product-stories/03.mp4' },
                        { label: 'Launch loop', src: '/showcase-videos/fashion/01.mp4' },
                      ].map((item, index) => (
                        <div
                          key={item.label}
                          className="workflow-output-tile relative min-h-[150px] overflow-hidden rounded-[22px] border border-white/8 bg-white/6 sm:min-h-[190px]"
                          style={{ animationDelay: `${index * 360 + 260}ms` }}
                        >
                          <video
                            src={item.src}
                            className="h-full w-full object-cover"
                            muted
                            autoPlay
                            loop
                            playsInline
                            preload="metadata"
                            aria-hidden
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/48 via-transparent to-transparent" />
                          <span className="absolute bottom-3 left-3 rounded-full bg-black/46 px-2.5 py-1 text-xs font-light text-white/76 backdrop-blur-xl">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="workflow-beam pointer-events-none absolute left-[31%] top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-[#fff05a] to-transparent lg:block" />
                  </div>

                  <div className="workflow-command-bar mt-auto flex items-center gap-3 rounded-[22px] bg-[#444449] p-3 shadow-[0_16px_54px_rgba(0,0,0,0.24)]">
                    <div className="min-w-0 flex-1 px-2 text-sm font-light text-white/42 sm:text-base">
                      Paste Shopify URL, describe the campaign...
                    </div>
                    <button
                      type="button"
                      onClick={handleTrustCtaClick}
                      className="premium-engine-button flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#fff05a] text-black transition-transform hover:scale-105"
                      aria-label="Try with your product"
                    >
                      <ArrowUp className="relative z-10 h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative -mx-4 mt-16 overflow-hidden py-10 sm:-mx-6 sm:mt-24 sm:py-16 lg:-mx-8">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0b0b0d] to-transparent sm:w-48" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0b0b0d] to-transparent sm:w-48" />
            <div className="space-y-3 opacity-0 animate-word-appear sm:space-y-4" style={{ animationDelay: '0.12s', animationFillMode: 'forwards' }}>
              <Marquee baseVelocity={-2.4} className="font-semibold tracking-normal text-white/90">
                AGENCIES TRUST US • CREATORS TRUST US •
              </Marquee>
              <Marquee baseVelocity={2.1} className="font-semibold tracking-normal text-[#fff05a]" delay={120}>
                SHOPIFY TO CAMPAIGN CREATIVE • LAUNCH FASTER •
              </Marquee>
              <Marquee baseVelocity={-1.7} className="font-light tracking-normal text-white/28" delay={240} scrollDependent>
                PRODUCT ADS • SOCIAL CUTS • BRAND VISUALS •
              </Marquee>
            </div>
            <div className="relative z-20 mx-auto mt-10 flex max-w-3xl flex-col items-center px-4 text-center sm:mt-12">
              <p className="text-xs font-light uppercase tracking-[0.24em] text-white/42 sm:text-sm">
                Built for repeat creative work
              </p>
              <h2 className="mt-4 max-w-4xl text-[clamp(2.1rem,5.2vw,4.6rem)] font-light leading-[1.04] text-[#f4f4f5]">
                Agencies and creators turn product links into ready-to-ship campaign assets.
              </h2>
              <p className="mt-5 max-w-2xl text-base font-light leading-relaxed text-[#a6a6ad] sm:text-lg">
                Capture the product once, then generate the angles your client, store, or audience needs across launch pages, paid ads, and social posts.
              </p>
              <button
                type="button"
                onClick={handleTrustCtaClick}
                className="premium-engine-button mt-7 inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition-all hover:-translate-y-0.5 hover:bg-[#fff05a] hover:shadow-[0_18px_44px_rgba(255,240,90,0.18)]"
              >
                <span className="relative z-10">Start with a product link</span>
              </button>
            </div>
          </section>

          <footer className="relative -mx-4 overflow-hidden bg-[#0b0b0d] pt-14 text-white sm:-mx-6 sm:pt-24 lg:-mx-8">
            <div className="mx-auto max-w-6xl px-4 text-center">
              <h2 className="text-[clamp(2.7rem,8.5vw,8rem)] font-light leading-[0.92] tracking-normal text-[#f4f4f5]">
                Ready to <span className="font-serif italic">transform</span> your
                <br />
                product content?
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#9a9aa2] sm:mt-7 sm:text-xl">
                Start creating campaign-ready product shots today.{' '}
                <span className="text-[#fff05a]">From ₹499/mo.</span>
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:mt-9">
                <button
                  type="button"
                  onClick={handlePricingClick}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/16 bg-transparent px-6 text-base font-light text-[#f4f4f5] transition-colors hover:border-white/35 hover:bg-white/8"
                >
                  View pricing
                </button>
                <button
                  type="button"
                  onClick={handleSignupClick}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[#f4f4f5] px-6 text-base font-light text-black transition-colors hover:bg-white"
                >
                  Sign up
                </button>
              </div>
            </div>

            <div className="mt-16 px-4 pb-8 pt-8 sm:mt-24 sm:px-8 sm:pt-14">
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(500px,0.48fr)] xl:items-end">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={handleTrustCtaClick}
                    className="footer-wordmark group block select-none text-left text-[clamp(3.25rem,9.5vw,10.5rem)] font-semibold leading-[0.78] tracking-[-0.035em] text-white"
                    aria-label="Try Visicraft with your product"
                  >
                    <span className="footer-wordmark-letter">V</span>
                    <span className="footer-wordmark-letter">i</span>
                    <span className="footer-wordmark-letter">s</span>
                    <span className="footer-wordmark-letter">i</span>
                    <span className="footer-wordmark-letter">c</span>
                    <span className="footer-wordmark-letter">r</span>
                    <span className="footer-wordmark-letter">a</span>
                    <span className="footer-wordmark-letter">f</span>
                    <span className="footer-wordmark-letter">t</span>
                  </button>
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 xl:gap-x-12">
                  <div>
                    <p className="mb-3 text-base font-light text-white/42 sm:text-lg">Product</p>
                    <div className="flex flex-col items-start gap-1.5 text-lg font-light leading-tight text-[#f4f4f5] sm:text-xl">
                      <a href="#showcase" className="transition-colors hover:text-[#fff05a]">Features</a>
                      <a href="#showcase" className="transition-colors hover:text-[#fff05a]">Showcase</a>
                      <a href="/workflow" className="transition-colors hover:text-[#fff05a]">Workflow</a>
                      <a href="/pricing" className="transition-colors hover:text-[#fff05a]">Pricing</a>
                      <a href="/generate" className="transition-colors hover:text-[#fff05a]">Tools</a>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-base font-light text-white/42 sm:text-lg">Resources</p>
                    <div className="flex flex-col items-start gap-1.5 text-lg font-light leading-tight text-[#f4f4f5] sm:text-xl">
                      <a href="/workflow" className="transition-colors hover:text-[#fff05a]">Docs</a>
                      <a href="#showcase" className="transition-colors hover:text-[#fff05a]">Learn</a>
                      <a href="#showcase" className="transition-colors hover:text-[#fff05a]">Customers</a>
                      <a href="/pricing" className="transition-colors hover:text-[#fff05a]">Plans</a>
                      <a href="/login" className="transition-colors hover:text-[#fff05a]">Account</a>
                      <a href="mailto:support@visicraft.in" className="break-all transition-colors hover:text-[#fff05a]">support@visicraft.in</a>
                    </div>
                  </div>
                  <div>
                    <p className="mb-3 text-base font-light text-white/42 sm:text-lg">Social</p>
                    <div className="flex flex-col items-start gap-1.5 text-lg font-light leading-tight text-[#f4f4f5] sm:text-xl">
                      <a href="#" className="transition-colors hover:text-[#fff05a]">Instagram</a>
                      <a href="#" className="transition-colors hover:text-[#fff05a]">Youtube</a>
                      <a href="#" className="transition-colors hover:text-[#fff05a]">Facebook</a>
                      <a href="#" className="transition-colors hover:text-[#fff05a]">X</a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative mt-10 flex flex-col items-center justify-between gap-5 text-base font-light text-white/36 sm:mt-8 sm:flex-row sm:text-lg">
                <span>© 2026 Visicraft</span>
                <button
                  type="button"
                  onClick={handleTrustCtaClick}
                  className="premium-engine-button inline-flex h-12 items-center justify-center gap-3 rounded-full bg-[#f4f4f5] px-6 text-base font-light text-black shadow-[0_12px_40px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#fff05a]"
                >
                  <ArrowUp className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">Try with your product</span>
                </button>
                <span className="hidden sm:block">Built for product teams</span>
              </div>
            </div>
          </footer>
        </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes heroModelOptionIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes heroModelOptionOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-8px);
          }
        }
        @keyframes chipIn {
          from {
            opacity: 0;
            transform: scale(0.85);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes showcaseProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .workflow-showcase {
          perspective: 1400px;
        }
        .workflow-image-stage {
          transform: translateZ(0);
        }
        .workflow-image-stage::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 18%, rgba(255,255,255,0.10) 42%, transparent 58%);
          opacity: 0;
          transform: translateX(-120%);
          animation: workflowStageShine 8s ease-in-out infinite;
          pointer-events: none;
        }
        .workflow-console {
          transform: translateZ(0);
        }
        .workflow-scan-line {
          left: -20%;
          animation: workflowScan 4.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }
        .workflow-prompt-card {
          animation: workflowCardLift 7s ease-in-out infinite;
        }
        .workflow-active-chip {
          animation: workflowChipPulse 2.8s ease-in-out infinite;
        }
        .workflow-type-line {
          position: relative;
        }
        .workflow-type-line::after {
          content: '';
          display: inline-block;
          height: 1em;
          width: 1px;
          margin-left: 5px;
          background: rgba(255, 240, 90, 0.82);
          vertical-align: -0.12em;
          animation: workflowCursor 900ms steps(2, end) infinite;
        }
        .workflow-build-panel {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 28%, rgba(255,255,255,0.13), transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.045), transparent);
        }
        .workflow-build-panel::before {
          content: '';
          position: absolute;
          inset: -35% 0;
          background: linear-gradient(180deg, transparent, rgba(255,240,90,0.12), transparent);
          transform: translateY(-45%);
          animation: workflowBuildScan 3.9s ease-in-out infinite;
        }
        .workflow-build-panel::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 31%;
          height: 130px;
          width: 130px;
          border: 1px solid rgba(255, 240, 90, 0.22);
          border-radius: 999px;
          transform: translate(-50%, -50%);
          animation: workflowOrbit 3.5s linear infinite;
          box-shadow: 0 0 32px rgba(255, 240, 90, 0.08);
        }
        .workflow-video-render {
          animation: workflowVideoRenderLift 6s ease-in-out infinite;
        }
        .workflow-render-scan {
          top: -20%;
          animation: workflowRenderScan 2.8s ease-in-out infinite;
        }
        .workflow-render-progress {
          width: 82%;
          animation: workflowRenderProgress 5s ease-in-out infinite;
        }
        .workflow-output-tile {
          opacity: 0;
          transform: translateY(18px) scale(0.97);
          animation: workflowOutputReveal 8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }
        .workflow-output-tile img,
        .workflow-output-tile video {
          animation: workflowImageBreath 8s ease-in-out infinite;
        }
        .workflow-mini-output {
          animation: workflowMiniPop 4.6s ease-in-out infinite;
        }
        .workflow-beam {
          opacity: 0.18;
          animation: workflowBeam 2.8s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(255,240,90,0.46));
        }
        .workflow-command-bar {
          animation: workflowCommandGlow 6s ease-in-out infinite;
        }
        @keyframes workflowStageShine {
          0%, 64% {
            opacity: 0;
            transform: translateX(-120%);
          }
          74% {
            opacity: 1;
          }
          92%, 100% {
            opacity: 0;
            transform: translateX(120%);
          }
        }
        @keyframes workflowScan {
          0% {
            transform: translateX(0);
            opacity: 0;
          }
          24% {
            opacity: 0.9;
          }
          58%, 100% {
            transform: translateX(460%);
            opacity: 0;
          }
        }
        @keyframes workflowCardLift {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 18px 60px rgba(0,0,0,0.32);
          }
          48% {
            transform: translateY(-6px);
            box-shadow: 0 28px 76px rgba(0,0,0,0.38);
          }
        }
        @keyframes workflowChipPulse {
          0%, 100% {
            box-shadow: 0 0 0 rgba(255, 240, 90, 0);
          }
          50% {
            box-shadow: 0 0 28px rgba(255, 240, 90, 0.24);
          }
        }
        @keyframes workflowCursor {
          0%, 42% { opacity: 1; }
          43%, 100% { opacity: 0; }
        }
        @keyframes workflowBuildScan {
          0%, 100% {
            transform: translateY(-45%);
            opacity: 0;
          }
          45%, 58% {
            opacity: 1;
          }
          82% {
            transform: translateY(45%);
            opacity: 0;
          }
        }
        @keyframes workflowOrbit {
          from {
            transform: translate(-50%, -50%) rotate(0deg) scale(0.96);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg) scale(0.96);
          }
        }
        @keyframes workflowVideoRenderLift {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 24px 64px rgba(0,0,0,0.36);
          }
          48% {
            transform: translateY(-5px);
            box-shadow: 0 34px 78px rgba(0,0,0,0.44), 0 0 42px rgba(255,240,90,0.08);
          }
        }
        @keyframes workflowRenderScan {
          0%, 100% {
            transform: translateY(0);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          72% {
            transform: translateY(520%);
            opacity: 0.9;
          }
        }
        @keyframes workflowRenderProgress {
          0%, 100% {
            width: 36%;
            opacity: 0.72;
          }
          48% {
            width: 82%;
            opacity: 1;
          }
          74% {
            width: 96%;
            opacity: 0.92;
          }
        }
        @keyframes workflowOutputReveal {
          0%, 12% {
            opacity: 0;
            transform: translateY(18px) scale(0.97);
            filter: saturate(0.8) brightness(0.86);
          }
          24%, 82% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: saturate(1) brightness(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-8px) scale(0.99);
            filter: saturate(0.9) brightness(0.9);
          }
        }
        @keyframes workflowImageBreath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
        @keyframes workflowMiniPop {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.74;
          }
          48% {
            transform: translateY(-3px);
            opacity: 1;
          }
        }
        @keyframes workflowBeam {
          0%, 100% {
            transform: scaleY(0.4);
            opacity: 0.1;
          }
          46% {
            transform: scaleY(1);
            opacity: 0.42;
          }
        }
        @keyframes workflowCommandGlow {
          0%, 100% {
            box-shadow: 0 16px 54px rgba(0,0,0,0.24);
          }
          50% {
            box-shadow: 0 18px 64px rgba(255,240,90,0.08), 0 16px 54px rgba(0,0,0,0.24);
          }
        }
        .footer-wordmark {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          padding: 0 0 0.08em;
          cursor: pointer;
          isolation: isolate;
          filter: drop-shadow(0 0 0 rgba(255, 240, 90, 0));
          transition:
            letter-spacing 520ms cubic-bezier(0.2, 0.8, 0.2, 1),
            filter 520ms ease,
            transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .footer-wordmark::before {
          content: '';
          position: absolute;
          left: -4%;
          right: -4%;
          top: 48%;
          height: 0.08em;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(255, 240, 90, 0.18), rgba(255, 255, 255, 0.5), transparent);
          opacity: 0;
          transform: translateX(-14%) scaleX(0.2);
          transform-origin: left;
          pointer-events: none;
          z-index: -1;
        }
        .footer-wordmark::after {
          content: '';
          position: absolute;
          left: 3%;
          top: 14%;
          height: 0.12em;
          width: 0.12em;
          border-radius: 999px;
          background: #fff05a;
          opacity: 0;
          box-shadow: 0 0 26px rgba(255, 240, 90, 0.75), 0 0 52px rgba(255, 255, 255, 0.26);
          transform: translate3d(0, 0, 0) scale(0.45);
          pointer-events: none;
        }
        .footer-wordmark-letter {
          display: inline-block;
          background: linear-gradient(110deg, #ffffff 0%, #ffffff 35%, #fff6a8 48%, #ffffff 62%, #ffffff 100%);
          background-size: 240% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          transition:
            transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1),
            background-position 720ms cubic-bezier(0.2, 0.8, 0.2, 1),
            text-shadow 520ms ease;
        }
        .footer-wordmark:hover,
        .footer-wordmark:focus-visible {
          letter-spacing: -0.02em;
          filter: drop-shadow(0 18px 50px rgba(255, 240, 90, 0.08));
          transform: translateY(-0.015em);
          outline: none;
        }
        .footer-wordmark:hover::before,
        .footer-wordmark:focus-visible::before {
          opacity: 1;
          animation: wordmarkRail 920ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .footer-wordmark:hover::after,
        .footer-wordmark:focus-visible::after {
          opacity: 1;
          animation: wordmarkSpark 980ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .footer-wordmark:hover .footer-wordmark-letter,
        .footer-wordmark:focus-visible .footer-wordmark-letter {
          background-position: 100% 0;
          text-shadow: 0 0 24px rgba(255, 255, 255, 0.08);
        }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(1),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(1) { transform: translateY(-0.045em) rotate(-1.4deg); transition-delay: 0ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(2),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(2) { transform: translateY(-0.02em) rotate(0.8deg); transition-delay: 24ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(3),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(3) { transform: translateY(-0.055em) rotate(-0.7deg); transition-delay: 48ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(4),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(4) { transform: translateY(-0.018em) rotate(0.8deg); transition-delay: 72ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(5),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(5) { transform: translateY(-0.046em) rotate(-0.8deg); transition-delay: 96ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(6),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(6) { transform: translateY(-0.026em) rotate(0.5deg); transition-delay: 120ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(7),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(7) { transform: translateY(-0.05em) rotate(-0.7deg); transition-delay: 144ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(8),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(8) { transform: translateY(-0.025em) rotate(0.6deg); transition-delay: 168ms; }
        .footer-wordmark:hover .footer-wordmark-letter:nth-child(9),
        .footer-wordmark:focus-visible .footer-wordmark-letter:nth-child(9) { transform: translateY(-0.046em) rotate(0.9deg); transition-delay: 192ms; }
        @keyframes wordmarkRail {
          0% {
            transform: translateX(-16%) scaleX(0.2);
            opacity: 0;
          }
          35% {
            opacity: 1;
          }
          100% {
            transform: translateX(16%) scaleX(1);
            opacity: 0;
          }
        }
        @keyframes wordmarkSpark {
          0% {
            transform: translate3d(0, 0, 0) scale(0.45);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          68% {
            transform: translate3d(680%, 210%, 0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate3d(920%, 250%, 0) scale(0.45);
            opacity: 0;
          }
        }
        .premium-engine-button {
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }
        .premium-engine-button::before {
          content: '';
          position: absolute;
          inset: 2px;
          border-radius: inherit;
          background:
            linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.72) 46%, rgba(255,240,90,0.72) 52%, transparent 62%);
          opacity: 0;
          transform: translateX(-115%);
          transition: opacity 180ms ease;
          z-index: 0;
          pointer-events: none;
        }
        .premium-engine-button::after {
          content: '';
          position: absolute;
          right: 14px;
          top: 50%;
          height: 7px;
          width: 7px;
          border-radius: 999px;
          background: #fff05a;
          box-shadow: 0 0 0 0 rgba(255,240,90,0.34), 0 0 18px rgba(255,240,90,0.42);
          opacity: 0;
          transform: translateY(-50%) scale(0.45);
          z-index: 0;
          pointer-events: none;
        }
        .premium-engine-button:hover::before,
        .premium-engine-button:focus-visible::before {
          opacity: 0.46;
          animation: engineSweep 780ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .premium-engine-button:hover::after,
        .premium-engine-button:focus-visible::after {
          opacity: 1;
          animation: enginePulse 900ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .workflow-image-stage::after,
          .workflow-scan-line,
          .workflow-prompt-card,
          .workflow-active-chip,
          .workflow-type-line::after,
          .workflow-build-panel::before,
          .workflow-build-panel::after,
          .workflow-video-render,
          .workflow-render-scan,
          .workflow-render-progress,
          .workflow-output-tile,
          .workflow-output-tile img,
          .workflow-output-tile video,
          .workflow-mini-output,
          .workflow-beam,
          .workflow-command-bar {
            animation: none !important;
          }
          .workflow-output-tile {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes engineSweep {
          from { transform: translateX(-115%); }
          to { transform: translateX(115%); }
        }
        @keyframes enginePulse {
          0% {
            transform: translateY(-50%) scale(0.45);
            box-shadow: 0 0 0 0 rgba(255,240,90,0.34), 0 0 18px rgba(255,240,90,0.42);
          }
          55% {
            transform: translateY(-50%) scale(1);
            box-shadow: 0 0 0 10px rgba(255,240,90,0), 0 0 22px rgba(255,240,90,0.55);
          }
          100% {
            transform: translateY(-50%) scale(0.7);
            box-shadow: 0 0 0 0 rgba(255,240,90,0), 0 0 14px rgba(255,240,90,0.32);
          }
        }
      `}</style>
    </div>
  );
}
