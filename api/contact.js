export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, company, email, phone, industry, message } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured');
    return res.status(200).json({ ok: true, fallback: true });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Replace My Software <team@roofingwebpro.com>',
        to: ['team@roofingwebpro.com'],
        reply_to: email,
        subject: `New Lead: ${name}${company ? ' — ' + company : ''}`,
        html: `
          <h2>New Lead from replacemysoftware.com</h2>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
            <tr><td style="padding:6px 12px;font-weight:600;">Name:</td><td style="padding:6px 12px;">${name}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;">Company:</td><td style="padding:6px 12px;">${company || '—'}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;">Email:</td><td style="padding:6px 12px;">${email}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;">Phone:</td><td style="padding:6px 12px;">${phone || '—'}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;">Industry:</td><td style="padding:6px 12px;">${industry || '—'}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;">Message:</td><td style="padding:6px 12px;">${message || '—'}</td></tr>
          </table>
        `,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return res.status(200).json({ ok: true, fallback: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Form submission error:', err);
    return res.status(200).json({ ok: true, fallback: true });
  }
}
