/**
 * Test script to verify Veo 3 API access and configuration
 * Run with: node scripts/test-veo-api.js
 */

require('dotenv').config({ path: '.env.local' });
const { JWT } = require('google-auth-library');

async function testVeoAccess() {
  console.log('\n🔍 Testing Veo 3 API Access...\n');

  // Check if service account JSON is configured
  const serviceAccountJson = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.error('❌ GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON not found in .env.local');
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    console.log('✅ Service account JSON parsed successfully');
    console.log('📧 Service Account Email:', serviceAccount.client_email);
    console.log('🆔 Project ID:', serviceAccount.project_id);
  } catch (error) {
    console.error('❌ Failed to parse service account JSON:', error.message);
    return;
  }

  // Get access token
  console.log('\n🔑 Getting access token...');
  let accessToken;
  try {
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const token = await client.getAccessToken();
    accessToken = token.token;
    console.log('✅ Access token obtained successfully');
  } catch (error) {
    console.error('❌ Failed to get access token:', error.message);
    return;
  }

  // Test Veo 3 model access
  const projectId = serviceAccount.project_id;
  const location = 'us-central1';
  const models = [
    'veo-3.1-generate-001',
    'veo-3.1-fast-generate-001',
    'veo-3.0-generate-001',
    'veo-3.0-fast-generate-001',
  ];

  console.log('\n📡 Testing model access...\n');

  for (const modelId of models) {
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}`;
    
    console.log(`Testing: ${modelId}`);
    
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        console.log(`  ✅ ${modelId} - Accessible`);
      } else {
        const error = await response.text();
        console.log(`  ❌ ${modelId} - Status ${response.status}`);
        if (response.status === 404) {
          console.log(`     Model not found or not enabled`);
        } else if (response.status === 403) {
          console.log(`     Permission denied - check IAM roles`);
        }
      }
    } catch (error) {
      console.log(`  ❌ ${modelId} - Error: ${error.message}`);
    }
  }

  // Test a simple video generation request
  console.log('\n🎬 Testing video generation request...\n');
  
  const testEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1-generate-001:predictLongRunning`;
  
  const testPayload = {
    instances: [{
      prompt: "A beautiful sunset over the ocean"
    }],
    parameters: {
      sampleCount: 1,
      durationSeconds: 4,
      aspectRatio: "16:9",
      generateAudio: true,
      compressionQuality: "optimized"
    }
  };

  try {
    const response = await fetch(testEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Video generation request successful!');
      console.log('📋 Operation Name:', result.name);
      console.log('\n✨ Your Veo 3 API is working correctly!');
    } else {
      console.log('❌ Video generation request failed');
      console.log('Status:', response.status);
      console.log('Error:', JSON.stringify(result, null, 2));
      
      if (result.error?.message) {
        console.log('\n💡 Error Details:', result.error.message);
        
        if (result.error.message.includes('not found')) {
          console.log('\n📝 Action Required:');
          console.log('   1. Enable Vertex AI API: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com');
          console.log('   2. Request access to Veo models (may require allowlisting)');
        } else if (result.error.message.includes('permission')) {
          console.log('\n📝 Action Required:');
          console.log('   Add these IAM roles to your service account:');
          console.log('   - Vertex AI User');
          console.log('   - Vertex AI Service Agent');
        }
      }
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

testVeoAccess().catch(console.error);
