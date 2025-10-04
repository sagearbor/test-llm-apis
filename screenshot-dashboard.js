import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1200 });

  // Listen to console logs
  page.on('console', async msg => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => arg.toString())));
    console.log('BROWSER LOG:', ...args);
  });

  // Navigate to the dashboard
  await page.goto('http://localhost:3001/dashboard-analytics.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  // Wait for the canvas to be rendered
  await page.waitForSelector('#usageOverTimeCanvas', { timeout: 10000 });
  await new Promise(resolve => setTimeout(resolve, 3000)); // Give charts time to render

  // Take screenshot
  await page.screenshot({
    path: 'dashboard-screenshot.png',
    fullPage: true
  });

  console.log('Screenshot saved to dashboard-screenshot.png');

  // Also log the API response for debugging
  const summaryData = await page.evaluate(async () => {
    const response = await fetch('/api/usage/summary');
    return await response.json();
  });

  console.log('\nAPI Response Summary:');
  console.log('Total Requests:', summaryData.totalRequests);
  console.log('Total Tokens:', summaryData.totalTokens);
  console.log('Hourly Usage Keys:', Object.keys(summaryData.hourlyUsage || {}).sort());
  console.log('\nHourly Usage Details:');
  Object.entries(summaryData.hourlyUsage || {}).sort().forEach(([hour, data]) => {
    console.log(`  ${hour}:`, {
      requests: data.requests,
      tokens: data.tokens,
      models: Object.keys(data.models || {})
    });
  });

  await browser.close();
})();
