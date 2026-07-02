import { createClient } from '@supabase/supabase-js';

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#';
  return Array.from({length: 12}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, company, email, phone, industry, message } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  // 1. Create Supabase user (so they can log into portal)
  let userId = null;
  let portalPassword = null;
  if (supabaseUrl && supabaseKey) {
    portalPassword = genPassword();
    try {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password: portalPassword,
          email_confirm: true,
          user_metadata: { name, company, phone, industry },
        }),
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userId = userData.id || userData.user?.id;
      } else {
        // User might already exist — try to get their ID
        const err = await userRes.json().catch(() => ({}));
        if (err.message?.includes('already') || userRes.status === 422) {
          // Look up existing user by email
          const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(email)}`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
          });
          if (listRes.ok) {
            const users = await listRes.json();
            // Try to find the user in the response - v1 API doesn't support filter, need to iterate
            if (Array.isArray(users)) {
              const found = users.find(u => u.email === email);
              if (found) userId = found.id;
            }
          }
          portalPassword = null; // Don't show password for existing users
        }
      }
    } catch (e) {
      console.error('User creation error:', e.message);
    }
  }

  // 2. Insert lead into Supabase
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    supabase.from('leads').insert({
      name, company, email, phone, industry, message,
      status: 'new',
      ...(userId ? { user_id: userId } : {}),
    }).then(({ error }) => {
      if (error) console.error('Supabase insert error:', error.message);
      else console.log('Lead saved to Supabase:', email);
    });
  }

  // 3. Twilio double-call (simultaneous — bypasses DND)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  const notifyPhone = process.env.NOTIFY_PHONE;
  if (twilioSid && twilioToken && twilioFrom && notifyPhone) {
    const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
    const twiml = `<Response><Say>New lead from Replace My Software. ${name}, ${company || 'no company'}. ${industry || ''}. Check your email.</Say></Response>`;
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: notifyPhone, From: twilioFrom, Twiml: twiml }),
    }).catch(() => {});
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: notifyPhone, From: twilioFrom, Twiml: twiml }),
    }).catch(() => {});
  }

  // 4. Send Resend email
  if (!RESEND_API_KEY) {
    return res.status(200).json({ ok: true, email, portalPassword, fallback: true });
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
          ${portalPassword ? `<p style="margin-top:1rem;padding:1rem;background:#f0f9ff;border-radius:8px;"><strong>Portal ready:</strong> <a href="https://replacemysoftware.com/portal.html">replacemysoftware.com/portal.html</a><br>Login: ${email}<br>Password: ${portalPassword}</p>` : ''}
        `,
      }),
    });

    if (!response.ok) {
      console.error('Resend error:', await response.text());
      return res.status(200).json({ ok: true, email, portalPassword, fallback: true });
    }

    return res.status(200).json({ ok: true, email, portalPassword });
  } catch (err) {
    console.error('Form submission error:', err);
    return res.status(200).json({ ok: true, email, portalPassword, fallback: true });
  }
}
