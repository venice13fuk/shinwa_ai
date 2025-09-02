// 診断付き：環境変数未設定やOpenAIのエラー本文をそのまま返します
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'OPENAI_API_KEY is missing on Netlify. Set it in Environment variables and redeploy (Clear cache and deploy site).'
        })
      };
    }

    const { model, temperature, system, user } = JSON.parse(event.body || '{}');

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        messages: [
          { role: 'system', content: system || 'You are a helpful assistant.' },
          { role: 'user', content: user || '' }
        ]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return { statusCode: r.status, body: text };
    }
    const json = await r.json();
    const content = json.choices?.[0]?.message?.content || '';
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};

