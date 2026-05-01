export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error: API key missing' });
  }

  let body = req.body;

  // Vercel sometimes passes body as string — parse it
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { systemPrompt, userMessage } = body || {};

  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ error: 'Missing systemPrompt or userMessage in request body' });
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const responseText = await anthropicRes.text();
    console.log('Anthropic status:', anthropicRes.status);

    if (!anthropicRes.ok) {
      console.error('Anthropic error body:', responseText);
      return res.status(anthropicRes.status).json({ error: `Anthropic API error: ${responseText}` });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse Anthropic response:', responseText);
      return res.status(500).json({ error: 'Invalid JSON from Anthropic API' });
    }

    const text = data?.content?.[0]?.text || '';
    if (!text) {
      console.error('Empty content from Anthropic:', JSON.stringify(data));
      return res.status(500).json({ error: 'Empty response from AI model' });
    }

    return res.status(200).json({ text });

  } catch (err) {
    console.error('Fetch to Anthropic failed:', err);
    return res.status(500).json({ error: `Network error calling AI: ${err.message}` });
  }
}
