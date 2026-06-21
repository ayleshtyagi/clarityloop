// /api/clarity.js
// Vercel serverless function. Keeps the Groq API key on the server —
// it never reaches the browser. Set GROQ_API_KEY in Vercel's
// Project Settings > Environment Variables.

const SYSTEM_PROMPT = `You are ClarityLoop, a direct thinking partner for solo founders who think too much and ship too little. You will receive a brain-dump and possibly some of the user's recent past entries.

Respond in exactly this structure, plain text, no markdown asterisks or bold, no preamble, no sign-off:

TOP 3 PRIORITIES
1. ...
2. ...
3. ...

THE DECISION YOU'RE AVOIDING
One direct sentence naming the decision they're avoiding, if one is identifiable. Be blunt, not cruel.

WHAT TO DROP
1-2 things that don't deserve attention right now.

ONE SHARP QUESTION
A single pointed question that pushes their thinking forward.

If past entries are provided and something from them is still unresolved today, add this section FIRST, before TOP 3 PRIORITIES:

STILL UNRESOLVED
Name the specific repeated item and how many days it has been sitting there, in one or two sentences.

Rules: no generic productivity language ("time-block", "eat the frog", "circle back"). No hedging language ("maybe", "you might want to consider"). Write like a sharp co-founder, not a life coach. Keep the whole response under 180 words.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { dump, history } = req.body || {};

  if (!dump || typeof dump !== 'string' || !dump.trim()) {
    res.status(400).json({ error: 'No brain-dump text received.' });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GROQ_API_KEY is not set in Vercel environment variables.' });
    return;
  }

  let historyText = 'None yet.';
  if (Array.isArray(history) && history.length) {
    historyText = history.map(h => {
      const d = h.date ? new Date(h.date).toLocaleDateString() : 'unknown date';
      return `- [${d}] ${String(h.dump || '').slice(0, 300)}`;
    }).join('\n');
  }

  const userPrompt = `Past entries (most recent first):\n${historyText}\n\nToday's brain-dump:\n${dump.slice(0, 4000)}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      const msg = (data && data.error && data.error.message) || 'Groq API request failed.';
      res.status(groqRes.status).json({ error: msg });
      return;
    }

    const output = data?.choices?.[0]?.message?.content;
    if (!output) {
      res.status(500).json({ error: 'Empty response from the model.' });
      return;
    }

    res.status(200).json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
};
