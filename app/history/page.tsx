'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Download, Trash2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Generation } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function HistoryPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGenerations();
  }, []);

  const loadGenerations = async () => {
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGenerations(data || []);
    } catch (error) {
      console.error('Failed to load generations:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteGeneration = async (id: string) => {
    try {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setGenerations(generations.filter(g => g.id !== id));
    } catch (error) {
      console.error('Failed to delete generation:', error);
    }
  };

  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26] flex items-center justify-center">
        <div className="text-[#c8b4a0] text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1d18] via-black to-[#2a2e26]">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extralight text-[#f8f7f5] tracking-[0.2em] uppercase mb-4">
            Generation History
          </h1>
          <p className="text-[#c8b4a0] text-lg font-light">
            View and download your previous generations
          </p>
        </div>

        {generations.length === 0 ? (
          <Card className="p-12 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26] text-center">
            <ImageIcon className="mx-auto h-16 w-16 text-[#c8b4a0]/40 mb-4" />
            <p className="text-[#c8b4a0] text-lg">No generations yet</p>
            <p className="text-[#c8b4a0]/60 text-sm mt-2">
              Start creating thumbnails to see them here
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {generations.map((generation) => (
              <Card
                key={generation.id}
                className="p-6 border-[#c8b4a0]/20 bg-gradient-to-br from-[#1a1d18] to-[#2a2e26]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[#f8f7f5] font-light text-lg">
                      {format(new Date(generation.created_at), 'PPpp')}
                    </p>
                    {generation.prompt && (
                      <p className="text-[#c8b4a0]/80 text-sm mt-1">
                        Prompt: {generation.prompt}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => deleteGeneration(generation.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {generation.generated_thumbnails.map((thumbnail, index) => (
                    <div
                      key={index}
                      className="group relative aspect-video rounded-lg overflow-hidden border border-[#c8b4a0]/20"
                    >
                      <img
                        src={thumbnail}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          onClick={() => downloadImage(thumbnail, `thumbnail-${generation.id}-${index + 1}.jpg`)}
                          className="bg-[#6b5545] hover:bg-[#8a7060] text-[#f8f7f5]"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
