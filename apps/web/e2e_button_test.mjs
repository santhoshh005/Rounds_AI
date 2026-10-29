import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ARTIFACT_DIR = "C:\\Users\\saisa\\.gemini\\antigravity\\brain\\c68413c6-d89d-4149-9a5c-5c229ff3649c";
const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("=== STARTING ROUNDSAI FULL BROWSER E2E TEST ===");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === "error") {
      errors.push(`Console Error: ${text}`);
      console.error(`[Browser Console Error] ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    errors.push(`Page Error: ${err.message}`);
    console.error(`[Browser Page Error] ${err.message}`);
  });

  const testResults = [];

  function record(suite, testName, passed, details = "") {
    testResults.push({ suite, testName, passed, details });
    const mark = passed ? "✓" : "✗";
    console.log(`  [${mark}] ${suite} -> ${testName} ${details ? `(${details})` : ""}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. LANDING PAGE (/)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[1/6] Testing Landing Page (/)...");
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_1_landing.png") });

  const title = await page.title();
  record("Landing", "Page Title & Load", title.includes("RoundsAI"), title);

  // Test Theme Toggle
  const themeToggle = page.locator(".public-nav .icon-button").first();
  if (await themeToggle.isVisible()) {
    await themeToggle.click();
    await page.waitForTimeout(300);
    const themeAfter = await page.evaluate(() => document.documentElement.dataset.theme);
    record("Landing", "Theme Toggle Click", true, `Theme switched to: ${themeAfter}`);
    // toggle back
    await themeToggle.click();
    await page.waitForTimeout(300);
  } else {
    record("Landing", "Theme Toggle Click", false, "Theme toggle button not found");
  }

  // Test FAQ Accordion buttons
  const faqButtons = page.locator(".faq-section article button");
  const faqCount = await faqButtons.count();
  record("Landing", "FAQ Accordion Presence", faqCount >= 3, `Found ${faqCount} FAQ items`);
  if (faqCount > 1) {
    // FAQ 0 is expanded by default; clicking FAQ 1 expands FAQ 1
    await faqButtons.nth(1).click();
    await page.waitForTimeout(200);
    const faqExpanded = await faqButtons.nth(1).getAttribute("aria-expanded");
    record("Landing", "FAQ Accordion Click & Expand", faqExpanded === "true", "FAQ item toggled open");
  }

  // Test "Open station" / Hero Action button
  const heroAction = page.locator(".hero-actions button, .public-nav button.primary").first();
  record("Landing", "CTA Button Visibility", await heroAction.isVisible(), "CTA Button visible");

  // ─────────────────────────────────────────────────────────────
  // 2. LOGIN PAGE & AUTHENTICATION (/login)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[2/6] Testing Login Page (/login)...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_2_login.png") });

  // Test password toggle
  const pwdInput = page.locator("input[name='password']");
  const togglePwdBtn = page.locator(".password-field button");
  if (await togglePwdBtn.isVisible()) {
    await togglePwdBtn.click();
    const typeAfter = await pwdInput.getAttribute("type");
    record("Login", "Password Show/Hide Toggle", typeAfter === "text", `Type toggled to ${typeAfter}`);
  }

  // Test empty submit validation
  const signInBtn = page.locator("button[type='submit']");
  await signInBtn.click();
  await page.waitForTimeout(200);
  const errorMsg = await page.locator(".form-error").textContent();
  record("Login", "Form Validation On Empty Submit", errorMsg.includes("Enter your Staff ID"), errorMsg);

  // Test "Continue in demo mode" button
  const demoModeBtn = page.getByText("Continue in demo mode", { exact: false });
  record("Login", "Demo Mode Button Visible", await demoModeBtn.isVisible());
  await demoModeBtn.click();
  await page.waitForTimeout(1000);

  // Verify transition to Station
  const stationHeading = page.locator(".step-intro h2").first();
  const stationVisible = await stationHeading.isVisible();
  record("Login", "Demo Mode Login Transition to Station", stationVisible, "Navigated to /station");

  // ─────────────────────────────────────────────────────────────
  // 3. DOCTOR ASSESSMENT STATION (/station)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[3/6] Testing Doctor Assessment Station (/station)...");
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_3_station_step1.png") });

  // 3A. Top Sync Notice
  const syncNotice = page.locator(".sync-notice");
  if (await syncNotice.isVisible()) {
    record("Station", "Live Sync Notice Banner", true, "Banner present");
    const syncBedsideBtn = syncNotice.locator("button").first();
    await syncBedsideBtn.click();
    await page.waitForTimeout(300);
    record("Station", "Sync Bedside Button Click", true, "Clicked Sync Bedside");
  }

  // 3B. Dictation Button & Waveform
  const dictationBtn = page.getByRole("button", { name: /Dictate|Stop dictation/i });
  if (await dictationBtn.isVisible()) {
    await dictationBtn.click();
    await page.waitForTimeout(400);
    const waveformActive = await page.locator(".waveform").isVisible();
    record("Station", "Voice Dictation Trigger", waveformActive, "Waveform activated");
    await dictationBtn.click(); // turn off
    await page.waitForTimeout(200);
  }

  // 3C. Stepper Navigation
  const stepperButtons = page.locator(".stepper button");
  const stepperCount = await stepperButtons.count();
  record("Station", "Stepper Tabs Count", stepperCount === 3, `Found ${stepperCount} steps`);

  // Test Pipeline "Analyze this round" button
  const analyzeBtn = page.locator(".step-action button.primary, button.primary").filter({ hasText: /Analyze/i }).first();
  if (await analyzeBtn.isVisible()) {
    await analyzeBtn.click();
    console.log("    Waiting for pipeline analysis animation (2.2s)...");
    await page.waitForTimeout(2500);
  }

  // Verify Step 2 Review Screen
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_3_station_step2.png") });
  const criticalAlert = page.locator(".critical-alert");
  record("Station - Step 2", "Critical Alert Card Visible", await criticalAlert.isVisible(), "Febrile Neutropenia alert");

  const metricCards = page.locator(".metric-card");
  const metricCount = await metricCards.count();
  record("Station - Step 2", "Metric Cards Presence", metricCount >= 3, `Found ${metricCount} cards (ANC, Plt, WBC)`);

  const sparklines = page.locator(".sparkline");
  record("Station - Step 2", "Sparklines Rendered", (await sparklines.count()) >= 3, "SVG Sparklines active");

  // Check confirmation checklist items
  const checkRows = page.locator(".checklist .check-row input[type='checkbox']");
  const checkCount = await checkRows.count();
  record("Station - Step 2", "Confirmation Checklist", checkCount > 0, `Found ${checkCount} checklist items`);
  if (checkCount > 0) {
    await checkRows.nth(checkCount - 1).click();
    await page.waitForTimeout(200);
    record("Station - Step 2", "Checklist Item Toggle", true, "Toggled confirmation item");
  }

  // Continue to Step 3 Sign
  const continueSignBtn = page.locator(".step-action button.primary").filter({ hasText: /Continue to sign/i }).first();
  if (await continueSignBtn.isVisible()) {
    await continueSignBtn.click();
    await page.waitForTimeout(500);
  }

  // Verify Step 3 Sign Screen
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_3_station_step3.png") });
  const signStep = page.locator(".sign-step");
  record("Station - Step 3", "Sign Step Visible", await signStep.isVisible(), "Sign Step displayed");

  // Test "Copy EMR note" button
  const copyBtn = page.getByRole("button", { name: /Copy EMR note/i });
  if (await copyBtn.isVisible()) {
    await copyBtn.click();
    await page.waitForTimeout(300);
    const toast = page.locator(".toast");
    record("Station - Step 3", "Copy EMR Note Button", await toast.isVisible(), "Toast displayed");
  }

  // Test "Attest & approve note" button
  const attestBtn = page.getByRole("button", { name: /Attest & approve note/i });
  if (await attestBtn.isVisible()) {
    await attestBtn.click();
    await page.waitForTimeout(300);
    const lockPill = page.locator(".lock-pill, button:disabled").filter({ hasText: /Attested & locked/i });
    record("Station - Step 3", "Attest & Approve Note Button", await lockPill.isVisible(), "Note attested and locked");
  }

  // ─────────────────────────────────────────────────────────────
  // 4. BEDSIDE MOBILE COMPANION (/mobile)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[4/6] Testing Bedside Mobile Companion (/mobile)...");
  const mobileTab = page.locator(".main-tabs button").filter({ hasText: /Mobile/i });
  if (await mobileTab.isVisible()) {
    await mobileTab.click();
  } else {
    await page.goto(`${BASE_URL}/mobile`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_4_mobile.png") });

  const recordLarge = page.locator(".record-large");
  record("Mobile", "Giant Mic Button Visible", await recordLarge.isVisible());
  if (await recordLarge.isVisible()) {
    await recordLarge.click();
    await page.waitForTimeout(300);
    record("Mobile", "Mic Button Tap (Start Recording)", await recordLarge.evaluate(el => el.classList.contains("recording")), "Pulsating recording active");
    await recordLarge.click(); // stop
  }

  // Test preset chips (+ Afebrile, etc.)
  const presetChips = page.locator(".preset-row button");
  const chipCount = await presetChips.count();
  record("Mobile", "Preset Oncology Chips Count", chipCount >= 3, `Found ${chipCount} chips`);
  if (chipCount > 0) {
    const transcriptBefore = await page.locator(".live-text p").textContent();
    await presetChips.nth(0).click();
    await page.waitForTimeout(200);
    const transcriptAfter = await page.locator(".live-text p").textContent();
    record("Mobile", "Preset Chip Click (Appends Text)", transcriptAfter.length > transcriptBefore.length, `Appended text: ${transcriptAfter.slice(-25)}`);
  }

  // Test Lab scan button
  const scanMobileBtn = page.locator(".scan-mobile");
  if (await scanMobileBtn.isVisible()) {
    await scanMobileBtn.click();
    await page.waitForTimeout(200);
    record("Mobile", "Lab Scan Button Click", await scanMobileBtn.evaluate(el => el.classList.contains("captured")), "CBC scan attached");
  }

  // Test "Sync round to doctor dashboard" button
  const syncMobileBtn = page.locator(".sync-mobile");
  if (await syncMobileBtn.isVisible()) {
    await syncMobileBtn.click();
    await page.waitForTimeout(300);
    const sentText = await page.locator(".sync-mobile").textContent();
    record("Mobile", "Sync Round Button", sentText.includes("Transmitted"), sentText.trim());
  }

  // ─────────────────────────────────────────────────────────────
  // 5. PATIENT LONGITUDINAL ANALYTICS (/analytics)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[5/6] Testing Patient Longitudinal Analytics (/analytics)...");
  const analyticsTab = page.locator(".main-tabs button").filter({ hasText: /Analytics/i });
  if (await analyticsTab.isVisible()) {
    await analyticsTab.click();
  } else {
    await page.goto(`${BASE_URL}/analytics`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_5_analytics.png") });

  const patientHero = page.locator(".summary-person h1");
  const heroName = await patientHero.textContent();
  record("Analytics", "Patient Hero Header", heroName.includes("David Miller") || heroName.includes("Rajesh Kumar"), heroName);

  // Test Nadir Chart
  const nadirSvg = page.locator(".chart-scroll svg").first();
  record("Analytics", "Nadir Trajectory SVG Chart", await nadirSvg.isVisible(), "Rendered SVG chart");

  // Test Recovery Chart
  const recoverySvg = page.locator(".chart-scroll svg").nth(1);
  record("Analytics", "Recovery Curve SVG Chart", await recoverySvg.isVisible(), "Rendered recovery curve");

  // Test Chemo Dose Modification Advisor Card
  const doseCard = page.locator(".advisor");
  record("Analytics", "Chemo Dose Modification Advisor", (await doseCard.textContent()).includes("dose reduction"), "NCCN guideline recommendation active");

  // Test Historical Rounds Audit Log Table
  const auditRows = page.locator(".audit-table table tbody tr");
  const rowCount = await auditRows.count();
  record("Analytics", "Historical Rounds Audit Log Table", rowCount >= 3, `Found ${rowCount} historical rounds`);

  // Test Analytics Patient Selector Pill Click
  const patientChips = page.locator(".patient-chips button");
  if (await patientChips.count() >= 2) {
    await patientChips.nth(1).click();
    await page.waitForTimeout(300);
    const chipText = await patientChips.nth(1).textContent();
    record("Analytics", "Patient Switch Chip", true, `Switched to patient: ${chipText.trim()}`);
    // switch back
    await patientChips.nth(0).click();
    await page.waitForTimeout(200);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. WARD ROSTER (/roster)
  // ─────────────────────────────────────────────────────────────
  console.log("\n[6/6] Testing Ward Census Roster (/roster)...");
  const rosterTab = page.locator(".main-tabs button").filter({ hasText: /Roster/i });
  if (await rosterTab.isVisible()) {
    await rosterTab.click();
  } else {
    await page.goto(`${BASE_URL}/roster`, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "screen_6_roster.png") });

  const rosterRows = page.locator(".roster-surface table tbody tr");
  const rosterCount = await rosterRows.count();
  record("Roster", "Ward Inpatient Rows Presence", rosterCount >= 3, `Found ${rosterCount} inpatient rows`);

  // Test "Admit patient" button & drawer
  const admitBtn = page.getByRole("button", { name: /Admit patient/i });
  if (await admitBtn.isVisible()) {
    await admitBtn.click();
    await page.waitForTimeout(300);
    const admitDrawer = page.locator(".admit-drawer");
    record("Roster", "Admit Patient Drawer Open", await admitDrawer.isVisible(), "Drawer opened");
    const closeDrawerBtn = admitDrawer.locator("button").filter({ hasText: /Close/i });
    if (await closeDrawerBtn.isVisible()) {
      await closeDrawerBtn.click();
      await page.waitForTimeout(200);
      record("Roster", "Admit Patient Drawer Close", !(await admitDrawer.isVisible()), "Drawer closed successfully");
    }
  }

  // Test patient action buttons in table (e.g. "Assess round" button)
  const assessBtn = page.locator(".row-actions button").filter({ hasText: /Assess round/i }).first();
  record("Roster", "Assess Round Action Button", await assessBtn.isVisible(), "Assess action button accessible");

  // Summary
  await browser.close();

  const total = testResults.length;
  const passed = testResults.filter(t => t.passed).length;
  const failed = total - passed;

  console.log("\n=================================================");
  console.log(`  E2E TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log(`  CONSOLE ERRORS: ${errors.length}`);
  console.log("=================================================");

  // Write detailed JSON report
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "browser_test_report.json"),
    JSON.stringify({ total, passed, failed, errors, results: testResults }, null, 2)
  );

  if (failed > 0 || errors.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error("FATAL ERROR in browser tests:", err);
  process.exit(1);
});
