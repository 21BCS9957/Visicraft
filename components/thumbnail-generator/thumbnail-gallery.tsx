'use client';

import { Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ThumbnailGalleryProps {
  thumbnails: string[];
}

export function ThumbnailGallery({ thumbnails }: ThumbnailGalleryProps) {
  const downloadImage = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      const isVideoPath = url.match(/\.(mp4|webm|mov)$/i);
      const isDataVideo = url.startsWith('data:video/');
      const ext = isVideoPath ? isVideoPath[1].toLowerCase() : isDataVideo ? url.split(';')[0].split('/')[1] : 'jpg';
      link.download = `output-${index + 1}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const downloadAll = async () => {
    for (let i = 0; i < thumbnails.length; i++) {
      await downloadImage(thumbnails[i], i);
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  if (thumbnails.length === 0) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-extralight text-[#f8f7f5] tracking-wide">
          Generated Results
        </h2>
        <Button
          onClick={downloadAll}
          variant="outline"
          className="border-[#c8b4a0]/20 text-[#c8b4a0] hover:bg-[#c8b4a0]/10"
        >
          <Download className="mr-2 h-4 w-4" />
          Download All
        </Button>
      </div>

      <div className={`grid gap-6 ${thumbnails.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {thumbnails.map((thumbnail, index) => (
          <Card
            key={index}
            className="group relative overflow-hidden border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]"
          >
            <div className="aspect-video relative flex items-center justify-center bg-[#1a1d18]">
              {(thumbnail.match(/\.(mp4|webm|mov)(\?.*)?$/i) || thumbnail.startsWith('data:video/')) ? (
                <video
                  src={thumbnail}
                  className="max-w-full max-h-full object-contain"
                  controls
                  autoPlay
                  loop
                  muted
                />
              ) : (
                <img
                  src={thumbnail}
                  alt={`Generated Media ${index + 1}`}
                  className="max-w-full max-h-full object-contain"
                />
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  onClick={() => downloadImage(thumbnail, index)}
                  size="lg"
                  className="bg-[#6b5545] hover:bg-[#8a7060] text-[#f8f7f5]"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
