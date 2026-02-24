#!/usr/bin/env node

/**
 * Script to create generated-videos bucket in Supabase
 * Run with: node scripts/create-video-bucket.js
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
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createVideoBucket() {
  console.log('🎬 Creating generated-videos bucket...\n');

  // Check if bucket exists
  const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error('❌ Error listing buckets:', listError.message);
    process.exit(1);
  }

  const exists = existingBuckets.find(b => b.name === 'generated-videos');
  
  if (exists) {
    console.log('✅ Bucket "generated-videos" already exists');
    process.exit(0);
  }

  // Create bucket with no file size limit (or very large limit)
  const { data, error } = await supabase.storage.createBucket('generated-videos', {
    public: true,
    fileSizeLimit: null, // No limit
    allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
  });

  if (error) {
    console.error('❌ Error creating bucket:', error.message);
    console.log('\n💡 Manual creation steps:');
    console.log('1. Go to: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets');
    console.log('2. Click "New bucket"');
    console.log('3. Name: generated-videos');
    console.log('4. Public bucket: Yes');
    console.log('5. File size limit: Leave empty or set to 500MB');
    console.log('6. Allowed MIME types: video/mp4, video/webm');
    process.exit(1);
  }

  console.log('✅ Created bucket "generated-videos" successfully!');
  console.log('\n📋 Bucket details:');
  console.log('   - Name: generated-videos');
  console.log('   - Public: Yes');
  console.log('   - Allowed types: video/mp4, video/webm, video/quicktime');
  console.log('\n🔗 View: https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets');
}

createVideoBucket().catch(console.error);
