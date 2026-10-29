import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ARTIFACT_DIR = "C:\\Users\\saisa\\.gemini\\antigravity\\brain\\c68413c6-d89d-4149-9a5c-5c229ff3649c";
const BASE_URL = "http://localhost:3000";

async function main() {
  console.log("=== STARTING FULL CORE FEATURES REGRESSION TEST ===");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();

  const results = [];
  function record(suite, name, pass, info = "") {
    results.push({ suite, name, pass, info });
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${suite} :: ${name} ${info ? `(${info})` : ""}`);
  }

  // 0. AUTHENTICATION & LOGIN
  console.log("\n[0] Authenticating via /login (Demo Mode)...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  const demoModeBtn = page.getByText("Continue in demo mode", { exact: false });
  await demoModeBtn.click();
  await page.waitForTimeout(800);

  // 1. STATION & CENSUS PATIENT SWITCHING
  console.log("\n[1] Testing Station & Census Patient Switching...");
  const title1 = await page.locator(".patient-header h1").innerText();
  record("Station", "Default Patient Loaded", title1.includes("David Miller"), title1);

  // Click on Sarah Jenkins (Bed 14) in Census
  const sarahRow = page.locator(".patient-rows button").filter({ hasText: /Sarah Jenkins/i }).first();
  await sarahRow.click();
  await page.waitForTimeout(400);

  const title2 = await page.locator(".patient-header h1").innerText();
  record("Census", "Switch Patient to Sarah Jenkins", title2.includes("Sarah Jenkins"), title2);

  // Click on Elena Rostova (Bed 16) in Census
  const elenaRow = page.locator(".patient-rows button").filter({ hasText: /Elena Rostova/i }).first();
  await elenaRow.click();
  await page.waitForTimeout(400);

  const title3 = await page.locator(".patient-header h1").innerText();
  record("Census", "Switch Patient to Elena Rostova", title3.includes("Elena Rostova"), title3);

  // Switch back to David Miller
  const davidRow = page.locator(".patient-rows button").filter({ hasText: /David Miller/i }).first();
  await davidRow.click();
  await page.waitForTimeout(400);

  // 2. LIVE ASR & WHISPER ENGINE TOGGLE
  console.log("\n[2] Testing Dictation & STT Engine Toggles...");
  const liveAsrChip = page.locator(".stt-engine-toggle button").filter({ hasText: /Live ASR/i });
  const whisperChip = page.locator(".stt-engine-toggle button").filter({ hasText: /Whisper STT/i });

  await whisperChip.click();
  await page.waitForTimeout(300);
  const whisperActive = await whisperChip.evaluate((el) => el.classList.contains("active"));
  record("Dictation", "Whisper STT Chip Active", whisperActive);

  const dictateBtn = page.locator(".capture-toolbar button").filter({ hasText: /Dictate/i });
  const dictateText = await dictateBtn.innerText();
  record("Dictation", "Dictate Button text reflects Whisper", dictateText.includes("Whisper"), dictateText);

  await liveAsrChip.click();
  await page.waitForTimeout(300);
  const liveActive = await liveAsrChip.evaluate((el) => el.classList.contains("active"));
  record("Dictation", "Live ASR Chip Active", liveActive);

  // 3. CLINICAL ONCOLOGY AUTO-CORRECT MODAL
  console.log("\n[3] Testing Clinical Auto-Correct Modal with Confidence Scores...");
  const textarea = page.locator(".capture-textarea");
  await textarea.fill("Patient on our chop cycle 2. Shen, Anarcho AMC, 1400 RPM. Given ox ally platin with phil grass tim. Patient is having fever.");
  await page.waitForTimeout(300);

  const autoCorrectBtn = page.locator(".capture-toolbar button").filter({ hasText: /Clinical auto-correct/i });
  await autoCorrectBtn.click();
  await page.waitForTimeout(500);

  const modalVisible = await page.locator(".autocorrect-modal-card").isVisible();
  record("AutoCorrect", "Modal Dialog Opened", modalVisible);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "regression_autocorrect_modal.png") });

  const totalTerms = await page.locator(".autocorrect-metrics-banner .metric-pill strong").first().innerText();
  record("AutoCorrect", "Detected Terms Counted", parseInt(totalTerms, 10) > 0, `${totalTerms} terms`);

  const confidenceScore = await page.locator(".autocorrect-metrics-banner .confidence-pill strong").innerText();
  record("AutoCorrect", "Confidence Score Displayed", confidenceScore.includes("%"), confidenceScore);

  // Click Apply auto-correct
  const applyBtn = page.locator(".autocorrect-modal-card button").filter({ hasText: /Apply auto-correct/i });
  await applyBtn.click();
  await page.waitForTimeout(500);

  const noteAfter = await textarea.inputValue();
  const appliedRegimen = noteAfter.includes("R-CHOP");
  const appliedAnc = noteAfter.includes("ANC");
  const appliedOxali = noteAfter.includes("oxaliplatin");
  record("AutoCorrect", "Applied Corrections to Note", appliedRegimen && appliedAnc && appliedOxali, noteAfter.slice(0, 80));

  // 4. MULTIMODAL OCR LAB SCAN & INTERACTIVE REVIEW MODAL
  console.log("\n[4] Testing Multimodal OCR Review & Reactive Analytics JSON...");
  const sampleLabPath = path.join(ARTIFACT_DIR, "scratch", "sample_cbc_lab.txt");
  fs.writeFileSync(sampleLabPath, `CITY CANCER CENTER - ONCOLOGY STAT CBC
Patient: David Miller | MRN-009184 | Bed 12
WBC: 1.8 x10^3/uL
Absolute Neutrophil Count (ANC): 420 cells/uL
Platelet Count: 88,000 /uL
Hemoglobin: 10.2 g/dL
Vitals: Temp 38.4 C
Clinical Flag: Febrile Neutropenia Grade 4`);

  const fileInput = page.locator(".capture-toolbar input[type='file']");
  await fileInput.setInputFiles(sampleLabPath);
  await page.waitForTimeout(600);

  // Check OCR Review Modal is open
  const ocrModal = page.locator(".autocorrect-modal-card").filter({ hasText: /Multimodal OCR Lab Extraction/i });
  const ocrOpen = await ocrModal.isVisible();
  record("OCR", "Interactive OCR Review Modal Opened", ocrOpen);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "regression_ocr_review_modal.png") });

  // Verify prefilled extracted values
  const ancInput = ocrModal.locator("input[type='number']").nth(0);
  const ancVal = await ancInput.inputValue();
  record("OCR", "ANC Extracted Accurately", ancVal === "420", `Extracted ANC: ${ancVal}`);

  // Confirm and commit
  const commitOcrBtn = ocrModal.locator("button").filter({ hasText: /Confirm & Commit/i });
  await commitOcrBtn.click();
  await page.waitForTimeout(600);

  const ocrBanner = page.locator(".ocr-banner");
  const bannerVisible = await ocrBanner.isVisible();
  record("OCR", "OCR Verified Banner Displayed", bannerVisible);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "regression_station_ocr_verified.png") });

  // 5. CHECK ANALYTICS REACTIVE STORE UPDATED WITH OCR
  console.log("\n[5] Testing Reactive JSON Analytics Store on /analytics...");
  const analyticsTab = page.locator(".main-tabs button").filter({ hasText: /Analytics/i });
  await analyticsTab.click();
  await page.waitForTimeout(600);

  // Check Audit Log table for "OCR Verified" status
  const ocrBadge = page.locator(".audit-section tr").filter({ hasText: /OCR Verified/i }).first();
  const ocrLogged = await ocrBadge.isVisible();
  record("Analytics", "OCR Verified Round Logged in Audit Trail", ocrLogged);

  const exportBtn = page.locator("button").filter({ hasText: /Export JSON/i });
  record("Analytics", "Export JSON Button Present", await exportBtn.isVisible());

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "regression_analytics_ocr_updated.png") });

  // 6. ROSTER THREE-DOTS MENU & OUTSIDE CLICK
  console.log("\n[6] Testing Roster Three-Dots Menu & Outside Click...");
  const rosterTab = page.locator(".main-tabs button").filter({ hasText: /Roster/i });
  await rosterTab.click();
  await page.waitForTimeout(600);

  const moreBtn = page.locator(".more-wrap button").first();
  await moreBtn.click();
  await page.waitForTimeout(300);

  const menuVisible1 = await page.locator(".row-menu").isVisible();
  record("Roster", "Three Dots Menu Opened", menuVisible1);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "regression_roster_menu_open.png") });

  // Click outside (e.g. on roster title)
  await page.locator(".page-title-row h1").click();
  await page.waitForTimeout(300);

  const menuVisible2 = await page.locator(".row-menu").isVisible();
  record("Roster", "Three Dots Menu Closed on Outside Click", !menuVisible2);

  // Re-open and click Edit
  await moreBtn.click();
  await page.waitForTimeout(200);
  const editBtn = page.locator(".row-menu button").filter({ hasText: /Edit/i });
  await editBtn.click();
  await page.waitForTimeout(400);

  const editDrawerVisible = await page.locator(".admit-drawer h2").filter({ hasText: /Edit patient details/i }).isVisible();
  record("Roster", "Edit Patient Drawer Opened", editDrawerVisible);

  // Close edit drawer
  const closeEditBtn = page.locator(".drawer-heading button, .drawer-actions button").filter({ hasText: /Cancel|Close/i }).first();
  await closeEditBtn.click();
  await page.waitForTimeout(300);

  // 7. HEADER STATUS OUTSIDE CLICK
  console.log("\n[7] Testing Header Status Outside Click...");
  const statusBtn = page.locator(".status-button");
  await statusBtn.click();
  await page.waitForTimeout(300);
  const statusOpen = await page.locator(".status-popover").isVisible();
  record("Header", "Status Popover Opened", statusOpen);

  // Click on background
  await page.locator(".page-title-row").click();
  await page.waitForTimeout(300);
  const statusClosed = !(await page.locator(".status-popover").isVisible());
  record("Header", "Status Popover Closed on Outside Click", statusClosed);

  await browser.close();

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== REGRESSION SUITE COMPLETE: ${passed}/${total} PASSED ===`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN REGRESSION TEST:", err);
  process.exit(1);
});
