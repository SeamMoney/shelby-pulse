import type { VercelRequest, VercelResponse } from '@vercel/node';

const VM_API_URL = 'http://147.182.237.239:3002/api';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Get the path after /api/proxy
  const path = req.url?.replace('/api/proxy', '') || '';
  const targetUrl = `${VM_API_URL}${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body: JSON.stringify(req.body) } : {}),
    });

    const data = await response.json();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from backend' });
  }
}
