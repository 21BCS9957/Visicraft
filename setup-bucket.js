const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '/Users/sameermishra/InfraMarket/Visicraft/.env' });

async function run() {
  const serviceAccountJsonStr = process.env.GOOGLE_VIDEO_SERVICE_ACCOUNT_JSON;
  const credentials = JSON.parse(serviceAccountJsonStr);
  const projectId = credentials.project_id;
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;

  const bucketName = `visicraft-veo-output-${projectId}`;
  console.log(`Checking bucket: ${bucketName}...`);

  // 1. Check if it exists
  const checkRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (checkRes.status === 200) {
    console.log('Bucket already exists!');
  } else if (checkRes.status === 404) {
    console.log('Bucket not found. Creating...');
    // 2. Create the bucket
    const createRes = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: bucketName,
        location: 'US-CENTRAL1'
      })
    });
    const createData = await createRes.json();
    console.log('Create Result:', createRes.status, createData);
  } else {
    console.log('Unknown error:', checkRes.status, await checkRes.text());
  }

  // 3. Make bucket public
  console.log('Making bucket public...');
  const policyRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/iam`, {
    method: 'POST', // or pass as SetIamPolicy
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bindings: [
        {
          role: "roles/storage.objectViewer",
          members: ["allUsers"]
        }
      ]
    })
  });
  
  // Actually, wait, the REST API to set IAM policy is different for Storage. We can use a simpler route: making default object acl public.
  const aclRes = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/defaultObjectAcl`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entity: 'allUsers',
      role: 'READER'
    })
  });
  console.log('ACL Result:', aclRes.status, await aclRes.json());
}

run().catch(console.error);
