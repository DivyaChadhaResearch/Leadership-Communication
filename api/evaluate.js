export default async function handler(req, res) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── API KEY ───────────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not set in Vercel Environment Variables'
    });
  }

  // ── PARSE BODY ────────────────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { systemPrompt, userMessage } = body || {};
  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ error: 'Missing systemPrompt or userMessage' });
  }

  // ── CALL GOOGLE GEMINI 1.5 FLASH (FREE TIER) ─────────────────────────────
  const GEMINI_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500,
        }
      }),
    });

    const raw = await geminiRes.text();
    console.log('Gemini status:', geminiRes.status);

    if (!geminiRes.ok) {
      console.error('Gemini error:', raw);
      return res.status(geminiRes.status).json({
        error: `Gemini API error (${geminiRes.status}): ${raw}`
      });
    }

    let data;
    try { data = JSON.parse(raw); } catch {
      return res.status(500).json({ error: 'Gemini returned invalid JSON' });
    }

    // Extract text from Gemini response structure
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      console.error('Empty Gemini content:', JSON.stringify(data));
      return res.status(500).json({ error: 'Gemini returned empty content' });
    }

    console.log('Success — response length:', text.length);
    return res.status(200).json({ text });

  } catch (err) {
    console.error('Network error calling Gemini:', err);
    return res.status(500).json({ error: 'Network error: ' + err.message });
  }
}
