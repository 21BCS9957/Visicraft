#!/usr/bin/env node

/**
 * Script to create required Supabase storage buckets
 * Run with: node scripts/create-storage-buckets.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKETS = [
  {
    name: 'source-images',
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  },
  {
    name: 'generated-thumbnails',
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  },
  {
    name: 'generated-videos',
    public: true,
    fileSizeLimit: 104857600, // 100MB
    allowedMimeTypes: ['video/mp4', 'video/webm']
  }
];

async function createBuckets() {
  console.log('🚀 Creating Supabase Storage Buckets...\n');

  // List existing buckets
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }

  console.log('📦 Existing buckets:', existingBuckets.map(b => b.name).join(', ') || 'none');
  console.log('');

  for (const bucket of BUCKETS) {
    const exists = existingBuckets.find(b => b.name === bucket.name);
    
    if (exists) {
      console.log(`✅ Bucket "${bucket.name}" already exists`);
      continue;
    }

    console.log(`📦 Creating bucket: ${bucket.name}...`);
    
    const { data, error } = await supabase.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes
    });

    if (error) {
      console.error(`   ❌ Error creating bucket "${bucket.name}":`, error.message);
    } else {
      console.log(`   ✅ Created bucket "${bucket.name}" (${bucket.public ? 'public' : 'private'})`);
    }
  }

  console.log('\n✨ Storage bucket setup complete!');
  console.log('\n📋 Summary:');
  console.log('   - source-images: For uploaded source images');
  console.log('   - generated-thumbnails: For AI-generated thumbnails');
  console.log('   - generated-videos: For AI-generated videos');
  console.log('\n🔗 View buckets: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets');
}

createBuckets().catch(console.error);
