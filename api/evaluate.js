export default async function handler(req, res) {
  // ── CORS ────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── API KEY ──────────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server config error: OPENAI_API_KEY not set in Vercel environment variables' });
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

  // ── CALL OPENAI GPT-4o ───────────────────────────────────────────────────
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.7,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
      }),
    });

    const raw = await openaiRes.text();
    console.log('OpenAI status:', openaiRes.status);

    if (!openaiRes.ok) {
      console.error('OpenAI error:', raw);
      return res.status(openaiRes.status).json({ error: `OpenAI API error (${openaiRes.status}): ${raw}` });
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      console.error('Non-JSON from OpenAI:', raw);
      return res.status(500).json({ error: 'OpenAI returned invalid JSON' });
    }

    const text = data?.choices?.[0]?.message?.content || '';
    if (!text) {
      console.error('Empty content from OpenAI:', JSON.stringify(data));
      return res.status(500).json({ error: 'OpenAI returned empty content' });
    }

    console.log('Success — response length:', text.length);
    return res.status(200).json({ text });

  } catch (err) {
    console.error('Network error calling OpenAI:', err);
    return res.status(500).json({ error: `Network error: ${err.message}` });
  }
}
