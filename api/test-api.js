// Simple test script for the Planet Cooker API
const fetch = require('node-fetch');

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  console.log('🧪 Testing Planet Cooker API...\n');

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    console.log('');

    // Test 2: Save a configuration
    console.log('2️⃣ Testing save configuration...');
    const testConfig = {
      data: {
        seed: 'test-planet',
        radius: 1.5,
        moonCount: 2,
        preset: 'earth',
        moons: [
          {
            size: 0.2,
            distance: 4.0,
            orbitSpeed: 0.5,
            inclination: 15,
            color: '#c0c0c0',
            phase: 0,
            eccentricity: 0.1
          }
        ]
      },
      metadata: {
        name: 'Test Planet',
        description: 'A test planet with 2 moons'
      }
    };

    const saveResponse = await fetch(`${API_BASE}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testConfig)
    });

    if (!saveResponse.ok) {
      throw new Error(`Save failed: ${saveResponse.status}`);
    }

    const saveData = await saveResponse.json();
    console.log('✅ Configuration saved:', saveData);
    console.log('');

    // Test 3: Load the configuration
    console.log('3️⃣ Testing load configuration...');
    const loadResponse = await fetch(`${API_BASE}/share/${saveData.id}`);
    
    if (!loadResponse.ok) {
      throw new Error(`Load failed: ${loadResponse.status}`);
    }

    const loadData = await loadResponse.json();
    console.log('✅ Configuration loaded:', {
      id: loadData.id,
      hasData: !!loadData.data,
      moonCount: loadData.data?.moonCount,
      seed: loadData.data?.seed
    });
    console.log('');

    // Test 4: Test short URL redirect
    console.log('4️⃣ Testing short URL redirect...');
    const redirectResponse = await fetch(`http://localhost:3001/${saveData.id}`, {
      redirect: 'manual'
    });
    console.log('✅ Short URL redirect status:', redirectResponse.status);
    console.log('');

    // Test 5: Get recent configurations
    console.log('5️⃣ Testing recent configurations...');
    const recentResponse = await fetch(`${API_BASE}/recent?limit=5`);
    const recentData = await recentResponse.json();
    console.log('✅ Recent configurations:', recentData.count, 'found');
    console.log('');

    console.log('🎉 All tests passed! API is working correctly.');
    console.log(`\n🔗 Your test configuration ID: ${saveData.id}`);
    console.log(`📱 Short URL: http://localhost:3001/${saveData.id}`);
    console.log(`🔗 Full URL: ${saveData.url}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Make sure the API server is running on port 3001');
    process.exit(1);
  }
}

// Run the test
testAPI();
