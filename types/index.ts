export interface Generation {
  id: string;
  user_id?: string;
  reference_image_url: string;
  source_images_urls: string[];
  generated_thumbnails: string[];
  prompt?: string;
  created_at: string;
}

export interface UploadedImage {
  file: File;
  preview: string;
  id: string;
}

export interface UploadedVideo {
  file: File;
  preview: string;
  id: string;
}

export interface GenerationRequest {
  referenceImage: string;
  sourceImages: string[];
  prompt?: string;
}

export interface GenerationResponse {
  success: boolean;
  thumbnails: string[];
  generationId: string;
  error?: string;
}
