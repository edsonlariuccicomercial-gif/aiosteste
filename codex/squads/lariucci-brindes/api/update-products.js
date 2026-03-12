// POST /api/update-products — autentica admin e dispara redeploy do Vercel
// O build.js roda durante o deploy e busca produtos frescos da Asia Import
const ADMIN_USER = 'lariucci';
const ADMIN_PASS = 'lariucci@2025';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, pass } = req.body || {};
  if ((user || '').trim().toLowerCase() !== ADMIN_USER || (pass || '').trim().toLowerCase() !== ADMIN_PASS) {
    return res.status(403).json({ error: 'Usuario ou senha incorretos' });
  }

  const deployToken = process.env.VERCEL_DEPLOY_TOKEN;
  if (!deployToken) {
    return res.status(500).json({ error: 'Token de deploy nao configurado no servidor.' });
  }

  try {
    // 1. Get latest deployment to redeploy
    const teamId = process.env.VERCEL_TEAM_ID || '';
    const projectId = process.env.VERCEL_PROJECT_ID || '';
    const teamParam = teamId ? `&teamId=${teamId}` : '';

    const listRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1&state=READY${teamParam}`,
      { headers: { Authorization: `Bearer ${deployToken}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.json().catch(() => ({}));
      throw new Error(`Falha ao listar deploys: ${err.error?.message || listRes.status}`);
    }

    const { deployments } = await listRes.json();
    if (!deployments || deployments.length === 0) {
      throw new Error('Nenhum deployment encontrado para redeploy.');
    }

    const latestId = deployments[0].uid;

    // 2. Trigger redeploy (re-runs build.js with fresh API data)
    const redeployRes = await fetch(
      `https://api.vercel.com/v13/deployments${teamParam ? '?' + teamParam.substring(1) : ''}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deployToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'lariucci-brindes',
          deploymentId: latestId,
          target: 'production'
        })
      }
    );

    if (!redeployRes.ok) {
      const err = await redeployRes.json().catch(() => ({}));
      throw new Error(`Falha no redeploy: ${err.error?.message || redeployRes.status}`);
    }

    const redeployData = await redeployRes.json();

    return res.status(200).json({
      success: true,
      message: 'Redeploy iniciado! Os produtos serao atualizados em 1-2 minutos.',
      deployId: redeployData.id || redeployData.uid,
      url: redeployData.url
    });
  } catch (error) {
    console.error('Redeploy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
