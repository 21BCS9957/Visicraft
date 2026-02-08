const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Testing Supabase Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NOT FOUND');
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test 1: Check if we can connect
    console.log('1️⃣  Testing basic connection...');
    const { data: healthData, error: healthError } = await supabase
      .from('generations')
      .select('count')
      .limit(0);
    
    if (healthError) {
      if (healthError.message.includes('relation "public.generations" does not exist')) {
        console.log('   ⚠️  Table "generations" does not exist yet');
        console.log('   📝 Need to create the table\n');
        return { connected: true, tableExists: false };
      } else {
        console.log('   ❌ Connection error:', healthError.message);
        return { connected: false, tableExists: false };
      }
    }
    
    console.log('   ✅ Connected successfully\n');

    // Test 2: Check table structure
    console.log('2️⃣  Checking table structure...');
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('   ❌ Error:', error.message);
      return { connected: true, tableExists: false };
    }
    
    console.log('   ✅ Table exists and is accessible\n');

    // Test 3: Check storage buckets
    console.log('3️⃣  Checking storage buckets...');
    const { data: buckets, error: bucketError } = await supabase
      .storage
      .listBuckets();
    
    if (bucketError) {
      console.log('   ⚠️  Could not list buckets:', bucketError.message);
    } else {
      const sourceImagesBucket = buckets.find(b => b.name === 'source-images');
      const generatedBucket = buckets.find(b => b.name === 'generated-thumbnails');
      
      console.log('   Buckets found:');
      buckets.forEach(bucket => {
        console.log(`   - ${bucket.name} ${bucket.public ? '(public)' : '(private)'}`);
      });
      
      if (!sourceImagesBucket) {
        console.log('   ⚠️  Missing bucket: source-images');
      }
      if (!generatedBucket) {
        console.log('   ⚠️  Missing bucket: generated-thumbnails');
      }
      
      if (sourceImagesBucket && generatedBucket) {
        console.log('   ✅ All required buckets exist\n');
      } else {
        console.log('');
      }
    }

    // Test 4: Count existing records
    console.log('4️⃣  Checking existing data...');
    const { count, error: countError } = await supabase
      .from('generations')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.log('   ⚠️  Could not count records:', countError.message);
    } else {
      console.log(`   📊 Total generations: ${count || 0}\n`);
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SUPABASE IS CONNECTED AND READY!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Status:');
    console.log('✅ Database connected');
    console.log('✅ Table "generations" exists');
    
    if (buckets) {
      const sourceImagesBucket = buckets.find(b => b.name === 'source-images');
      const generatedBucket = buckets.find(b => b.name === 'generated-thumbnails');
      
      if (!sourceImagesBucket || !generatedBucket) {
        console.log('⚠️  Storage buckets need to be created\n');
        console.log('Create them here:');
        console.log('https://supabase.com/dashboard/project/zzbdfzwkvogegqdyblre/storage/buckets\n');
      } else {
        console.log('✅ Storage buckets configured\n');
      }
    }
    
    console.log('🚀 Your app is ready at: http://localhost:3000/generate\n');
    
    return { connected: true, tableExists: true };

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    return { connected: false, tableExists: false };
  }
}

testConnection();
