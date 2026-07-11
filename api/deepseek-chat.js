const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Simple in-memory rate limiting per user (resets on cold start)
// Generous: 50 messages per user per hour
const userMessages = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxMessages = 50;
  
  if (!userMessages.has(userId)) {
    userMessages.set(userId, []);
  }
  
  const timestamps = userMessages.get(userId).filter(t => now - t < windowMs);
  
  if (timestamps.length >= maxMessages) {
    return { allowed: false, remaining: 0, resetIn: windowMs - (now - timestamps[0]) };
  }
  
  timestamps.push(now);
  userMessages.set(userId, timestamps);
  
  return { allowed: true, remaining: maxMessages - timestamps.length, resetIn: 0 };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { messages, userToken } = req.body;
    
    if (!userToken) {
      return res.status(401).json({ error: 'Please sign up to use the AI assistant.' });
    }
    
    // Verify Supabase token
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${userToken}`, 'apikey': supabaseAnonKey }
    });
    
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    
    const userData = await userRes.json();
    const userId = userData.id;
    
    // Rate limit
    const rate = checkRateLimit(userId);
    if (!rate.allowed) {
      const mins = Math.ceil(rate.resetIn / 60000);
      return res.status(429).json({ error: `You've reached the hourly limit. Try again in ${mins} minutes.` });
    }
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'No messages provided.' });
    }
    
    // System prompt — context about the DIY guide
    const systemPrompt = `You are a helpful AI assistant on a "Build Your Own Roofing CRM" guide page. The user is following a 7-step DIY guide to build a roofing CRM using AI tools (Lovable, OpenClaw, or Hermes), Supabase, Resend, GitHub, and Vercel.

Be friendly, clear, and concise. Answer questions about:
- How to use the AI agents (Lovable, OpenClaw, Hermes)
- How to set up Supabase, Resend, GitHub, Vercel
- How to paste the prompts from the guide
- How to debug common issues
- General coding/app-building questions

If the user seems stuck or frustrated, gently suggest they can apply for a custom build at replacemysoftware.com/apply starting at $10K.

Keep responses under 200 words unless the user asks for detailed code.`;
    
    // Call DeepSeek API (OpenAI-compatible format)
    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });
    
    if (!dsRes.ok) {
      const errText = await dsRes.text();
      console.error('DeepSeek error:', errText);
      return res.status(502).json({ error: 'The AI assistant is having trouble. Please try again.' });
    }
    
    const dsData = await dsRes.json();
    const reply = dsData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
    
    res.setHeader('X-RateLimit-Remaining', rate.remaining.toString());
    return res.status(200).json({ reply, remaining: rate.remaining });
    
  } catch (err) {
    console.error('Chat API error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
