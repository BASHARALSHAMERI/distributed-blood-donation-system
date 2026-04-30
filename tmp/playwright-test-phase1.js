const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'http://localhost:8080';
const SCREENSHOT_DIR = 'c:\\Users\\Bashar Al_shameri\\distributed-blood-donation-system\\phase1-screenshots';

// Create screenshot directory
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

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push(msg.text());
      console.log('⚠️ Console Error:', msg.text());
    }
  });

  console.log('\n=== Phase 1 Verification Test ===\n');

  try {
    // 1. Test Dashboard
    console.log('\n📸 Testing Dashboard...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const dashboardVisible = await page.locator('#dashboardPage.active').count() > 0;
    const otherPagesActive = await page.locator('.page.active').count();
    const logoCount = await page.locator('.brand').count();
    
    addTest('Dashboard loads', dashboardVisible ? 'PASS' : 'FAIL', 'Dashboard page visible');
    addTest('Only one page active', otherPagesActive === 1 ? 'PASS' : 'FAIL', `${otherPagesActive} pages active`);
    addTest('Single logo', logoCount === 1 ? 'PASS' : 'FAIL', `${logoCount} logo(s) found`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '01-dashboard.png'), 
      fullPage: true 
    });

    // 2. Test Donors Page
    console.log('\n📸 Testing Donors...');
    await page.click('[data-page="donors"]');
    await page.waitForTimeout(1500);

    const donorsVisible = await page.locator('#donorsPage.active').count() > 0;
    const donorsListExists = await page.locator('#donorsList').count() > 0;
    const otherPagesActive2 = await page.locator('.page.active').count();
    
    addTest('Donors page loads', donorsVisible ? 'PASS' : 'FAIL', 'Donors page visible');
    addTest('Donors list exists', donorsListExists ? 'PASS' : 'FAIL', 'Donors list element found');
    addTest('Page isolation (donors)', otherPagesActive2 === 1 ? 'PASS' : 'FAIL', `${otherPagesActive2} pages active`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '02-donors.png'), 
      fullPage: true 
    });

    // 3. Test Requests Page
    console.log('\n📸 Testing Requests...');
    await page.click('[data-page="requests"]');
    await page.waitForTimeout(1500);

    const requestsVisible = await page.locator('#requestsPage.active').count() > 0;
    const metricsExist = await page.locator('#totalRequestsMetric').count() > 0;
    const filtersExist = await page.locator('#requestSearchInput').count() > 0;
    const otherPagesActive3 = await page.locator('.page.active').count();
    
    addTest('Requests page loads', requestsVisible ? 'PASS' : 'FAIL', 'Requests page visible');
    addTest('Metrics cards exist', metricsExist ? 'PASS' : 'FAIL', 'Request metrics found');
    addTest('Filters exist', filtersExist ? 'PASS' : 'FAIL', 'Request filters found');
    addTest('Page isolation (requests)', otherPagesActive3 === 1 ? 'PASS' : 'FAIL', `${otherPagesActive3} pages active`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '03-requests.png'), 
      fullPage: true 
    });

    // 4. Test Hospitals Page
    console.log('\n📸 Testing Hospitals...');
    await page.click('[data-page="hospitals"]');
    await page.waitForTimeout(2000);

    const hospitalsVisible = await page.locator('#hospitalsPage.active').count() > 0;
    const hospitalsListExists = await page.locator('#hospitalsList').count() > 0;
    const hospitalsMetricsExist = await page.locator('#hospitalsTotalMetric').count() > 0;
    const hospitalsToolbarExists = await page.locator('#hospitalSearchInput').count() > 0;
    const otherPagesActive4 = await page.locator('.page.active').count();
    
    addTest('Hospitals page loads', hospitalsVisible ? 'PASS' : 'FAIL', 'Hospitals page visible');
    addTest('Hospitals list exists', hospitalsListExists ? 'PASS' : 'FAIL', 'Hospitals list element found');
    addTest('Hospitals metrics exist', hospitalsMetricsExist ? 'PASS' : 'FAIL', 'Hospitals metrics found');
    addTest('Hospitals toolbar exists', hospitalsToolbarExists ? 'PASS' : 'FAIL', 'Hospitals search/filter found');
    addTest('Page isolation (hospitals)', otherPagesActive4 === 1 ? 'PASS' : 'FAIL', `${otherPagesActive4} pages active`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '04-hospitals.png'), 
      fullPage: true 
    });

    // 5. Test Workflow Page
    console.log('\n📸 Testing Workflow...');
    await page.click('[data-page="workflow"]');
    await page.waitForTimeout(1500);

    const workflowVisible = await page.locator('#workflowPage.active').count() > 0;
    const workflowStepsExist = await page.locator('.workflow-step-card').count() > 0;
    const otherPagesActive5 = await page.locator('.page.active').count();
    
    addTest('Workflow page loads', workflowVisible ? 'PASS' : 'FAIL', 'Workflow page visible');
    addTest('Workflow steps exist', workflowStepsExist ? 'PASS' : 'FAIL', `${workflowStepsExist} step cards found`);
    addTest('Page isolation (workflow)', otherPagesActive5 === 1 ? 'PASS' : 'FAIL', `${otherPagesActive5} pages active`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '05-workflow.png'), 
      fullPage: true 
    });

    // 6. Test Health Page
    console.log('\n📸 Testing Health...');
    await page.click('[data-page="health"]');
    await page.waitForTimeout(2000);

    const healthVisible = await page.locator('#healthPage.active').count() > 0;
    const healthListExists = await page.locator('#healthServicesList').count() > 0;
    const servicesLoaded = await page.locator('.service-row').count();
    const otherPagesActive6 = await page.locator('.page.active').count();
    
    addTest('Health page loads', healthVisible ? 'PASS' : 'FAIL', 'Health page visible');
    addTest('Health list exists', healthListExists ? 'PASS' : 'FAIL', 'Health services list found');
    addTest('Services loaded from API', servicesLoaded > 0 ? 'PASS' : 'FAIL', `${servicesLoaded} service(s) shown`);
    addTest('Page isolation (health)', otherPagesActive6 === 1 ? 'PASS' : 'FAIL', `${otherPagesActive6} pages active`);
    
    await page.screenshot({ 
      path: path.join(SCREENSHOT_DIR, '06-health.png'), 
      fullPage: true 
    });

    // 7. Test navigation back to dashboard
    console.log('\n📸 Testing navigation back...');
    await page.click('[data-page="dashboard"]');
    await page.waitForTimeout(1500);

    const dashboardAgain = await page.locator('#dashboardPage.active').count() > 0;
    addTest('Navigation back to dashboard', dashboardAgain ? 'PASS' : 'FAIL', 'Dashboard visible again');

    // 8. Check for console errors
    addTest(
      'No console errors',
      results.consoleErrors.length === 0 ? 'PASS' : 'FAIL',
      results.consoleErrors.length > 0 ? `${results.consoleErrors.length} error(s) found` : 'Clean console'
    );

  } catch (error) {
    console.error('❌ Test execution error:', error.message);
    addTest('Test execution', 'FAIL', error.message);
  }

  // Print summary
  console.log('\n=== PHASE 1 TEST SUMMARY ===\n');
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`✅ PASS: ${results.summary.pass}`);
  console.log(`❌ FAIL: ${results.summary.fail}`);
  console.log(`Success Rate: ${((results.summary.pass / results.summary.total) * 100).toFixed(1)}%`);

  if (results.consoleErrors.length > 0) {
    console.log('\n⚠️ Console Errors:');
    results.consoleErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  }

  console.log(`\n📸 Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('\nTest details:', JSON.stringify(results, null, 2));

  await browser.close();
})();
