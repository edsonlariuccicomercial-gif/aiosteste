import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  const origin = req.headers?.origin || '';
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { danfeHtml } = req.body || {};
  if (!danfeHtml) return res.status(400).json({ error: "danfeHtml required" });

  let browser = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 794, height: 1123 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:10mm;background:#fff">${danfeHtml}</body></html>`;
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' }
    });

    const base64 = pdfBuffer.toString('base64');
    return res.status(200).json({ ok: true, pdfBase64: base64, sizeKB: Math.round(base64.length * 0.75 / 1024) });
  } catch (err) {
    console.error('[generate-danfe-pdf] Error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
}
