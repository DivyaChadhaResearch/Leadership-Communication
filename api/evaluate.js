export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── API KEY — reads ANTHROPIC_API_KEY from Vercel env vars ───────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server config error: ANTHROPIC_API_KEY not set in Vercel environment variables' });
  }

  // ── PARSE BODY ───────────────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { systemPrompt, userMessage } = body || {};
  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ error: 'Missing systemPrompt or userMessage' });
  }

  // ── CALL OPENAI GPT-4o via Anthropic key is wrong — use Anthropic Claude ─
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    const raw = await aiRes.text();
    console.log('Anthropic status:', aiRes.status);

    if (!aiRes.ok) {
      console.error('Anthropic error:', raw);
      return res.status(aiRes.status).json({ error: 'Anthropic API error ' + aiRes.status + ': ' + raw });
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      return res.status(500).json({ error: 'Anthropic returned invalid JSON' });
    }

    const text = data?.content?.[0]?.text || '';
    if (!text) {
      console.error('Empty content:', JSON.stringify(data));
      return res.status(500).json({ error: 'AI returned empty content' });
    }

    console.log('Success — length:', text.length);
    return res.status(200).json({ text });

  } catch (err) {
    console.error('Network error:', err);
    return res.status(500).json({ error: 'Network error: ' + err.message });
  }
}
