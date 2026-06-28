'use client';

import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronDown, Clapperboard, Image as ImageIcon, Mic, Plus, X, Download } from 'lucide-react';
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
  const activeVideoIndex = card.videos.length ? cycleIndex % card.videos.length : 0;
  const activeVideo = card.videos[activeVideoIndex];
  const showVideo = activeVideo && !failedVideos.has(activeVideo);

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
          showVideo ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ objectPosition: card.objectPosition }}
        aria-hidden
      />
      {showVideo && (
        <video
          key={`${activeVideo}-${cycleIndex}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          style={{ objectPosition: card.objectPosition }}
          src={activeVideo}
          poster={card.poster}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          onCanPlay={(event) => {
            void event.currentTarget.play().catch(() => undefined);
          }}
          onError={() => {
            setFailedVideos((current) => new Set(current).add(activeVideo));
          }}
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
  const productName = product.title ? `"${product.title}"` : 'the product';
  const brandLine = product.vendor ? ` for ${product.vendor}` : '';
  const base = `Create four premium advertising creatives${brandLine} using ${productName} as the exact product reference. Make them look like polished ecommerce campaign shots with realistic lighting, sharp packaging detail, modern art direction, and scroll-stopping social ad composition.`;

  if (userDirection) {
    return `${base} Creative direction: ${userDirection}`;
  }

  return `${base} Explore lifestyle, studio, texture, and stacked product compositions.`;
}

let imageIdCounter = 0;

export function HeroSection() {
  const router = useRouter();
  const { user } = useAuth();
  const { credits, deductCredits, addCredits, refreshCredits } = useCredits();

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
      return [...prev, url].slice(0, 4);
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
      const firstImage = result.product.images[0]?.url;
      const selected = firstImage ? [firstImage] : [];
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
    let capturedThisRun = false;

    if (activeProductUrl && uploadedImages.length === 0 && productReferenceUrls.length === 0) {
      try {
        const capture = await captureProductImages(activeProductUrl);
        capturedThisRun = true;
        productReferenceUrls = capture.selected;
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

    setIsGenerating(true);
    setGeneratedResults([]);
    setGeneratedType(generationMode);

    const deducted = await deductCredits(creditCost);
    if (!deducted) {
      setIsGenerating(false);
      toast.error('Failed to deduct credits');
      return;
    }

    try {
      setStatusMessage(uploadedImages.length > 0 ? 'Uploading images...' : 'Preparing product images...');
      setProgress(10);

      const uploadedImageUrls = uploadedImages.length > 0
        ? await Promise.all(
            uploadedImages.map((img) => uploadFileWithSignedUrl(img.file, 'source-images'))
          )
        : [];
      const imageUrls = [...productReferenceUrls, ...uploadedImageUrls];

      console.log(`📎 Sending ${imageUrls.length} reference image(s) to model:`, imageUrls);

      setProgress(30);

      if (generationMode === 'image') {
        setStatusMessage('Generating image...');

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'generate',
            referenceImages: imageUrls,
            prompt: promptForGeneration || '',
            model: selectedModel,
          }),
        });

        setProgress(80);

        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');

        setProgress(100);
        setStatusMessage('Done!');
        setGeneratedResults(result.images ?? []);
      } else {
        setStatusMessage('Starting video generation...');

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
      await addCredits(creditCost);
      await refreshCredits();
    } finally {
      setIsGenerating(false);
    }
  }, [user, uploadedImages, selectedProductUrls, productCapture, promptValue, generationMode, selectedModel, credits, creditCost, deductCredits, addCredits, refreshCredits, router, captureProductImages]);

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
                        <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
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
          </div>

          {/* Results / Progress Section */}
          {(isGenerating || generatedResults.length > 0 || error) && (
            <div ref={resultsRef} className="mx-auto w-full max-w-3xl pt-6">
              {/* Progress */}
              {isGenerating && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <div className="relative h-32 w-full overflow-hidden rounded-2xl bg-[#1a1a1a] border border-[#4d453c]/20">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#4d453c]/10 to-transparent"
                        style={{
                          animation: 'shimmer 1.5s ease-in-out infinite',
                        }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <span className="block h-5 w-5 animate-spin rounded-full border-2 border-[#8b7355]/30 border-t-[#c8b4a0]" />
                        <span className="text-sm font-light text-[#d1c4b8]/60">{statusMessage}</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#8b7355] to-[#c8b4a0] transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && !isGenerating && (
                <p className="text-center text-sm text-red-400">{error}</p>
              )}

              {/* Generated Images */}
              {!isGenerating && generatedResults.length > 0 && generatedType === 'image' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {generatedResults.map((url, i) => (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-2xl border border-[#4d453c]/20 bg-[#1a1a1a] opacity-0 animate-word-appear"
                      style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                    >
                      <img
                        src={url}
                        alt={`Generated ${i + 1}`}
                        className="w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 p-3">
                        <a
                          href={url}
                          download={`visicraft-${i + 1}.png`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg backdrop-blur-sm transition-transform hover:scale-110"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  ))}
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

          <section className="relative -mx-4 mt-24 overflow-hidden border-y border-white/10 py-16 sm:-mx-6 sm:mt-32 sm:py-24 lg:-mx-8">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[#0b0b0d] to-transparent sm:w-48" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[#0b0b0d] to-transparent sm:w-48" />
            <div className="space-y-5 opacity-0 animate-word-appear" style={{ animationDelay: '0.12s', animationFillMode: 'forwards' }}>
              <Marquee baseVelocity={-2.4} className="font-semibold tracking-normal text-white">
                AGENCIES TRUST US • CREATORS TRUST US •
              </Marquee>
              <Marquee baseVelocity={2.1} className="font-semibold tracking-normal text-[#fff05a]" delay={120}>
                SHOPIFY TO CAMPAIGN CREATIVE • LAUNCH FASTER •
              </Marquee>
              <Marquee baseVelocity={-1.7} className="font-light tracking-normal text-white/28" delay={240} scrollDependent>
                PRODUCT ADS • SOCIAL CUTS • BRAND VISUALS •
              </Marquee>
            </div>
            <div className="relative z-20 mx-auto mt-14 flex max-w-4xl flex-col items-center px-4 text-center sm:mt-20">
              <p className="text-sm font-light uppercase tracking-[0.24em] text-white/42">
                Built for repeat creative work
              </p>
              <h2 className="mt-5 text-4xl font-light leading-tight text-[#f4f4f5] sm:text-6xl">
                Agencies and creators use Visicraft to turn product links into ready-to-ship campaign assets.
              </h2>
              <p className="mt-6 max-w-2xl text-base font-light leading-relaxed text-[#a6a6ad] sm:text-xl">
                Capture the product once, then generate the angles your client, store, or audience needs across launch pages, paid ads, and social posts.
              </p>
              <button
                type="button"
                onClick={handleTrustCtaClick}
                className="mt-9 inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-medium text-black transition-all hover:-translate-y-0.5 hover:bg-[#fff05a] hover:shadow-[0_18px_44px_rgba(255,240,90,0.18)]"
              >
                Start with a product link
              </button>
            </div>
          </section>
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
      `}</style>
    </div>
  );
}
