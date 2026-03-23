const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '/Users/sameermishra/InfraMarket/Visicraft/.env' });

async function run() {
  const serviceAccountJsonStr = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
  const credentials = JSON.parse(serviceAccountJsonStr);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  const projectId = credentials.project_id;
  const location = 'us-central1';

  // 1. Submit a job
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/veo-2.0-generate-001:predictLongRunning`;
  // or v1 instead of v1beta1
  
  const payload = {
    instances: [{ prompt: "A calm blue sky" }],
    parameters: { sampleCount: 1 }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const data = await res.json();
  console.log("Submit Response:", JSON.stringify(data, null, 2));

  if (!data.name) return;
  const operationName = data.name;
  const operationId = operationName.split('/').pop();

  console.log("\\n--- Testing fetchPredictOperation ---");

  const pollEndpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${location}/publishers/google/models/veo-2.0-generate-001:fetchPredictOperation`;
  
  const payloadToFetch = { operationName: operationName }; // exact field name required by Vertex AI

  console.log(`POST ${pollEndpoint} with`, payloadToFetch);

  const r = await fetch(pollEndpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadToFetch)
  });

  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  console.log(`Response:`, txt.substring(0, 500));
}

run().catch(console.error);
