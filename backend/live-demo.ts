import fs from 'fs';
import path from 'path';
import app from './src/app';

async function runLiveDemo() {
  const server = app.listen(5055);
  const baseUrl = 'http://localhost:5055/api/v1';

  try {
    console.log('\n======================================================');
    console.log('🚀 1. CHECKING LIVE SERVER HEALTH');
    console.log('======================================================');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.log(JSON.stringify(healthData, null, 2));

    console.log('\n======================================================');
    console.log('👤 2. REGISTERING A LIVE USER');
    console.log('======================================================');
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `akshat_${Date.now()}@taskforce.ai`,
        password: 'SuperSecurePassword123!',
      }),
    });
    const regData: any = await regRes.json();
    const token = regData.data.token;
    console.log(`Registered User: ${regData.data.user.email} (ID: ${regData.data.user.id})`);

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    console.log('\n======================================================');
    console.log('🤖 3. CREATING A CUSTOM SPECIALIST AGENT');
    console.log('======================================================');
    const agentRes = await fetch(`${baseUrl}/agents`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Chief Financial Analyst Agent',
        role: 'analyst',
        systemInstructions:
          'You are the Chief Financial Analyst Agent. When analyzing CSV sales data, highlight total revenue, rank the top 5 products with exact numbers and percentages, compare software vs hardware categories, and give 3 actionable executive recommendations.',
        isActive: true,
      }),
    });
    const agentData: any = await agentRes.json();
    console.log('Created Custom Agent:', JSON.stringify(agentData.data.agent, null, 2));

    console.log('\n======================================================');
    console.log('📂 4. UPLOADING sample_sales.csv TO USER WORKSPACE');
    console.log('======================================================');
    const csvPath = path.resolve(__dirname, 'samples/sample_sales.csv');
    const csvBuffer = fs.readFileSync(csvPath);
    const formData = new FormData();
    formData.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'sample_sales.csv');

    const uploadRes = await fetch(`${baseUrl}/workspace/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const uploadData: any = await uploadRes.json();
    console.log('Uploaded File:', JSON.stringify(uploadData.data.file, null, 2));

    console.log('\n======================================================');
    console.log('🧠 5. ASSIGNING AUTONOMOUS TASK TO COORDINATOR & AGENTS');
    console.log('======================================================');
    const taskRes = await fetch(`${baseUrl}/tasks`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Q3 Sales CSV Deep-Dive & Executive Report',
        description:
          'Analyze this sales CSV. Calculate total revenue, identify the top five products, compare their performance, and generate a professional report.',
      }),
    });
    const taskData: any = await taskRes.json();

    if (!taskData.success) {
      console.log('⚠️ Live Gemini API Response Error:', JSON.stringify(taskData, null, 2));
      return;
    }

    const task = taskData.data.task;
    console.log(`Task Status: ${task.status}`);
    console.log(`Generated Plan (${task.steps.length} steps):`);
    for (const s of task.steps) {
      console.log(`  Step ${s.sequence} [${s.agentType.toUpperCase()}]: ${s.description} -> ${s.status}`);
    }

    console.log('\n======================================================');
    console.log('📄 6. READING GENERATED REPORT FROM WORKSPACE');
    console.log('======================================================');
    const artifacts = task.finalOutput?.artifacts || [];
    if (artifacts.length > 0) {
      const fileId = artifacts[0].fileId;
      const fileRes = await fetch(`${baseUrl}/workspace/files/${fileId}`, {
        headers: authHeaders,
      });
      const fileData: any = await fileRes.json();
      console.log(`Saved File Path on Disk: backend/workspace/users/${regData.data.user.id}/${fileData.data.file.filename}`);
      console.log('\n--- GENERATED MARKDOWN REPORT PREVIEW ---\n');
      console.log(fileData.data.file.content);
    }
  } finally {
    server.close();
  }
}

runLiveDemo().catch(console.error);

