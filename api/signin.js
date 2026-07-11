const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required.' });
    }
    
    const sbRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password })
    });
    
    const sbData = await sbRes.json();
    
    if (!sbRes.ok) {
      return res.status(sbRes.status).json({ error: sbData.message || sbData.msg || 'Sign in failed.' });
    }
    
    return res.status(200).json({
      access_token: sbData.access_token,
      refresh_token: sbData.refresh_token,
      user: sbData.user
    });
    
  } catch (err) {
    console.error('Signin error:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
