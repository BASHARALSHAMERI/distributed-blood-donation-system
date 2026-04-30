const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = 'c:\\Users\\Bashar Al_shameri\\distributed-blood-donation-system\\phase2-screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = {
  tests: [],
  consoleErrors: [],
  summary: { total: 0, pass: 0, fail: 0 }
};

function addTest(name, status, details = '') {
  results.tests.push({ name, status, details });
  results.summary.total++;
  if (status === 'PASS') results.summary.pass++;
  else results.summary.fail++;
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${name}: ${details}`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
      console.log('⚠️ Console Error:', msg.text());
    }
  });

  console.log('\n=== Phase 2 - Donations Page Test ===\n');

  try {
    // Navigate to donations page
    console.log('📸 Loading Donations page...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click donations in sidebar
    await page.click('[data-page="donations"]');
    await page.waitForTimeout(2000);

    // Test 1: Page visibility
    const donationsVisible = await page.locator('#donationsPage.active').count() > 0;
    addTest('Donations page loads', donationsVisible ? 'PASS' : 'FAIL', 'Donations page visible');

    // Test 2: Page isolation
    const activePages = await page.locator('.page.active').count();
    addTest('Page isolation', activePages === 1 ? 'PASS' : 'FAIL', `${activePages} page(s) active`);

    // Test 3: Title and description
    const titleExists = await page.locator('#donationsPage h1').count() > 0;
    const descExists = await page.locator('#donationsPage p').count() > 0;
    addTest('Title and description', titleExists && descExists ? 'PASS' : 'FAIL', 'Page header exists');

    // Test 4: Action button
    const addBtnExists = await page.locator('#openDonationModalBtn').count() > 0;
    addTest('Add donation button', addBtnExists ? 'PASS' : 'FAIL', 'Button visible');

    // Test 5: Search bar
    const searchExists = await page.locator('#donationSearchInput').count() > 0;
    addTest('Search bar', searchExists ? 'PASS' : 'FAIL', 'Search input exists');

    // Test 6: Blood type filter
    const bloodFilterExists = await page.locator('#donationBloodTypeFilter').count() > 0;
    addTest('Blood type filter', bloodFilterExists ? 'PASS' : 'FAIL', 'Filter exists');

    // Test 7: Status filter
    const statusFilterExists = await page.locator('#donationStatusFilter').count() > 0;
    addTest('Status filter', statusFilterExists ? 'PASS' : 'FAIL', 'Filter exists');

    // Test 8: Metrics cards
    const totalMetric = await page.locator('#totalDonationsMetric').count() > 0;
    const todayMetric = await page.locator('#todayDonationsMetric').count() > 0;
    const unitsMetric = await page.locator('#totalUnitsMetric').count() > 0;
    addTest('Metrics cards', totalMetric && todayMetric && unitsMetric ? 'PASS' : 'FAIL', 'All 3 metrics exist');

    // Test 9: Donations list
    const listExists = await page.locator('#donationsList').count() > 0;
    addTest('Donations list', listExists ? 'PASS' : 'FAIL', 'List container exists');

    // Test 10: Data loaded from API
    await page.waitForTimeout(1000);
    const rowsCount = await page.locator('#donationsList .domain-row').count();
    addTest('Data loaded from API', rowsCount > 0 ? 'PASS' : 'FAIL', `${rowsCount} donation(s) shown`);

    // Test 11: Modal opens
    await page.click('#openDonationModalBtn');
    await page.waitForTimeout(500);
    const modalOpen = await page.locator('#donationModal.active').count() > 0;
    addTest('Modal opens', modalOpen ? 'PASS' : 'FAIL', 'Donation modal visible');

    // Test 12: Modal has donor dropdown
    const donorDropdown = await page.locator('#donationDonorId').count() > 0;
    addTest('Modal has donor dropdown', donorDropdown ? 'PASS' : 'FAIL', 'Donor select exists');

    // Test 13: Modal has quantity field
    const quantityField = await page.locator('#donationQuantity').count() > 0;
    addTest('Modal has quantity field', quantityField ? 'PASS' : 'FAIL', 'Quantity input exists');

    // Test 14: Modal closes
    await page.click('#cancelDonationBtn');
    await page.waitForTimeout(500);
    const modalClosed = await page.locator('#donationModal.active').count() === 0;
    addTest('Modal closes', modalClosed ? 'PASS' : 'FAIL', 'Modal hidden');

    // Test 15: Uses "وحدات دم" terminology
    const pageContent = await page.locator('#donationsPage').innerText();
    const usesCorrectTerm = pageContent.includes('وحدات الدم') || pageContent.includes('وحدة دم');
    addTest('Uses "وحدات دم" terminology', usesCorrectTerm ? 'PASS' : 'FAIL', 'Correct terminology used');

    // Take screenshot
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, 'donations-page.png'), 
      fullPage: true 
    });

    // Check console errors
    addTest(
      'No console errors',
      results.consoleErrors.length === 0 ? 'PASS' : 'FAIL',
      results.consoleErrors.length > 0 ? `${results.consoleErrors.length} error(s)` : 'Clean console'
    );

  } catch (error) {
    console.error('❌ Test error:', error.message);
    addTest('Test execution', 'FAIL', error.message);
  }

  // Summary
  console.log('\n=== DONATIONS PAGE TEST SUMMARY ===\n');
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`✅ PASS: ${results.summary.pass}`);
  console.log(`❌ FAIL: ${results.summary.fail}`);
  console.log(`Success Rate: ${((results.summary.pass / results.summary.total) * 100).toFixed(1)}%`);

  if (results.consoleErrors.length > 0) {
    console.log('\n⚠️ Console Errors:');
    results.consoleErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  }

  console.log(`\n📸 Screenshot saved to: ${SCREENSHOT_DIR}/donations-page.png`);
  console.log('\nFull results:', JSON.stringify(results, null, 2));

  await browser.close();
})();
