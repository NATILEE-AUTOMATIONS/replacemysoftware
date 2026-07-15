const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { emails, breakdown } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'No emails provided' });
    }

    if (emails.length > 10) {
      return res.status(400).json({ error: 'Max 10 emails' });
    }

    const rows = [
      { label: 'Monthly CRM Spend', value: breakdown.monthly },
      { label: 'Yearly CRM Spend', value: breakdown.yearly },
      { label: `Spent in the last ${breakdown.pastYears} years`, value: breakdown.spent },
      { label: `Projected for the next ${breakdown.futureYears} years`, value: breakdown.future },
      { label: 'Total Projected Spend', value: breakdown.total }
    ];

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #060709; color: #f5f5f7; border-radius: 20px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 2rem; text-align: center;">
          <h1 style="margin: 0; font-size: 1.8rem; color: #fff;">Your CRM Cost Report</h1>
        </div>
        <div style="padding: 2rem;">
          <p style="font-size: 1.1rem; color: #94a3b8; margin-bottom: 1.5rem;">Here's the breakdown from your CRM Cost Calculator:</p>
          <table style="width: 100%; border-collapse: collapse;">
            ${rows.map(r => `
              <tr style="border-bottom: 1px solid #1e293b;">
                <td style="padding: 1rem 0; font-size: 1.05rem; color: #94a3b8;">${r.label}</td>
                <td style="padding: 1rem 0; font-size: 1.2rem; font-weight: bold; text-align: right; color: #ef4444;">${r.value}</td>
              </tr>
            `).join('')}
          </table>
          <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); border-radius: 12px; text-align: center;">
            <p style="font-size: 1.2rem; color: #f5f5f7; margin-bottom: 1rem;">A custom CRM starts at <strong style="color: #3b82f6;">$10K</strong> — one time.</p>
            <a href="https://replacemysoftware.com/apply" style="display: inline-block; padding: 0.8rem 2rem; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 1.1rem;">Get a Free Quote →</a>
          </div>
          <p style="text-align: center; color: #64748b; font-size: 0.85rem; margin-top: 1.5rem;">replacemysoftware.com</p>
        </div>
      </div>
    `;

    const text = `Your CRM Cost Report\n\n${rows.map(r => `${r.label}: ${r.value}`).join('\n')}\n\nA custom CRM starts at $10K — one time.\nGet a free quote: https://replacemysoftware.com/apply`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ReplaceMySoftware <team@roofingwebpro.com>',
        to: emails,
        subject: 'Your CRM Cost Report',
        html,
        text
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true, sent: emails.length });
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
