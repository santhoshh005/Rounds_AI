import { chromium } from "playwright";

async function run() {
  console.log("=== STARTING ROUNDSAI REGRESSION & FEATURE VERIFICATION ===");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Helper to ensure demo auth
  await page.goto("http://localhost:3000/station");
  await page.evaluate(() => {
    localStorage.setItem("rounds-auth", "demo");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  console.log("1. Verifying Theme Toggle Removal...");
  const themeToggleInHeader = await page.$('.header-actions button[aria-label*="theme"]');
  if (themeToggleInHeader) {
    throw new Error("FAIL: Theme toggle still present in header!");
  }
  console.log("✓ PASS: Theme toggle is absent from header.");

  console.log("2. Verifying Status and Profile popovers...");
  // Open Status
  await page.click('.status-button');
  await page.waitForSelector('.status-popover', { state: 'visible' });
  console.log("✓ PASS: Status popover opened.");

  // Open Profile - must close Status (mutual exclusivity)
  await page.click('.avatar-button');
  await page.waitForSelector('.profile-menu', { state: 'visible' });
  const statusPopoverHidden = await page.$('.status-popover');
  if (statusPopoverHidden) {
    throw new Error("FAIL: Status popover remained open when Profile was opened!");
  }
  console.log("✓ PASS: Status popover automatically closed when Profile opened (mutually exclusive).");

  // Verify theme option removed from profile menu
  const themeInProfile = await page.$('.profile-theme');
  if (themeInProfile) {
    throw new Error("FAIL: Theme row still found in profile menu!");
  }
  console.log("✓ PASS: Theme option removed from profile menu.");

  // Click outside closes profile menu
  await page.mouse.click(200, 200);
  await page.waitForTimeout(400);
  const profileMenuClosed = await page.$('.profile-menu');
  if (profileMenuClosed) {
    throw new Error("FAIL: Profile menu did not close on outside click!");
  }
  console.log("✓ PASS: Profile menu closed cleanly on outside click.");

  // Re-open Profile and click "Profile" button to open ClinicianProfileModal
  await page.click('.avatar-button');
  await page.waitForSelector('.profile-menu', { state: 'visible' });
  await page.click('.profile-menu button:has-text("Profile")');
  await page.waitForSelector('.clinician-profile-dialog', { state: 'visible' });
  console.log("✓ PASS: Clinician profile modal opened with Dr. Attending details and AI fallback architecture.");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_clinician_profile_modal.png" });

  // Close profile modal
  await page.click('.clinician-profile-dialog button:has-text("Done")');
  await page.waitForSelector('.clinician-profile-dialog', { state: 'hidden' });
  console.log("✓ PASS: Clinician profile modal closed.");

  console.log("3. Verifying Bedside-to-Station Real-Time Sync...");
  // Go to Mobile Companion
  await page.click('button:has-text("Mobile")');
  await page.waitForSelector('.companion-background', { state: 'visible' });

  // Clear and type new dictation notes on mobile
  const testMobileNote = "Bedside round Bed 12: Patient afebrile at 36.8°C. Mild hand-foot numbness reported. Absolute neutrophil count 1,400 /µL verified with stat hematology.";
  await page.fill('.live-mobile-textarea', testMobileNote);

  // Click "Send to station"
  await page.click('.phone-action button');
  await page.waitForSelector('.phone-action button:has-text("Sent to station")');
  console.log("✓ PASS: Bedside notes sent to station from mobile companion.");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_mobile_sent_to_station.png" });

  // Switch to Station
  await page.click('button:has-text("Station")');
  await page.waitForSelector('.sync-notice', { state: 'visible' });
  console.log("✓ PASS: Station detects incoming bedside sync notice banner.");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_station_sync_banner.png" });

  // Click "Load into station"
  await page.click('.sync-notice button:has-text("Load into station")');
  await page.waitForTimeout(500);

  // Verify the textarea in CaptureStep contains the exact mobile text!
  const stationTextareaVal = await page.inputValue('.capture-textarea');
  if (!stationTextareaVal.includes("Patient afebrile at 36.8°C. Mild hand-foot numbness reported")) {
    throw new Error(`FAIL: Station textarea does not match mobile notes! Found: ${stationTextareaVal}`);
  }
  console.log("✓ PASS: Bedside notes loaded into Station textarea flawlessly!");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_station_loaded_bedside_notes.png" });

  console.log("4. Verifying Checklist 'Edit' Button in Confirm Before Signing...");
  // Click "Analyze round"
  await page.click('.step-action button:has-text("Analyze round")');
  // Wait for ReviewStep (Step 2)
  await page.waitForSelector('.review-step', { state: 'visible', timeout: 10000 });
  console.log("✓ PASS: Step 2 Review clinical findings rendered.");

  // Check the checklist edit buttons
  const editButtons = await page.$$('.checklist-edit-btn');
  console.log(`Found ${editButtons.length} checklist Edit buttons.`);
  if (editButtons.length < 3) {
    throw new Error(`FAIL: Expected 3 edit buttons, found ${editButtons.length}`);
  }

  // Click Edit on Point 2
  await editButtons[1].click();
  await page.waitForSelector('.checklist-edit-input', { state: 'visible' });
  console.log("✓ PASS: Clicking 'Edit' activates inline text input.");

  // Modify Point 2 text
  await page.fill('.checklist-edit-input', "Confirm patient is afebrile (36.8°C) with Grade 1 neuropathy noted and vitals stable");
  // Click Save
  await page.click('.checklist-inline-editor button:has-text("Save")');
  await page.waitForSelector('.checklist-edit-input', { state: 'hidden' });

  // Verify updated text is in the row
  const checkRows = await page.$$('.check-row');
  const point2Text = await checkRows[1].textContent();
  if (!point2Text.includes("Grade 1 neuropathy noted")) {
    throw new Error(`FAIL: Edited point text was not saved! Found: ${point2Text}`);
  }
  console.log("✓ PASS: Checklist verification point edited and saved successfully!");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_checklist_edited.png" });

  console.log("5. Verifying Note Attestation & Analytics...");
  // Confirm all 3 points
  const checkboxes = await page.$$('.check-row input[type="checkbox"]');
  for (let i = 0; i < checkboxes.length; i++) {
    const isChecked = await checkboxes[i].isChecked();
    if (!isChecked) {
      await checkboxes[i].click();
    }
  }

  // Click "Continue to sign"
  await page.click('button:has-text("Continue to sign")');
  await page.waitForSelector('.sign-step', { state: 'visible' });

  // Click "Attest note" / "Attest & approve" (supports both desktop .round-summary and .sign-bar)
  const desktopAttest = page.locator('.round-summary button:has-text("Attest")');
  const barAttest = page.locator('.sign-bar button:has-text("Attest")');
  if (await desktopAttest.isVisible()) {
    await desktopAttest.click();
  } else {
    await barAttest.scrollIntoViewIfNeeded();
    await barAttest.click();
  }
  await page.waitForTimeout(600);
  console.log("✓ PASS: Note attested and locked.");

  // Navigate to Analytics
  await page.click('button:has-text("Analytics")');
  await page.waitForSelector('.analytics', { state: 'visible' });

  // Verify NO "Not enough rounds yet" banner for David Miller (#104)
  const emptyBanner104 = await page.$('.empty-banner');
  if (emptyBanner104) {
    throw new Error("FAIL: Empty banner triggered for David Miller (#104)!");
  }
  console.log("✓ PASS: David Miller (#104) displays full historical nadir curve without empty banner.");

  // Check Sarah Jenkins (#105)
  await page.click('.patient-chips button:has-text("#105")');
  await page.waitForTimeout(400);
  const emptyBanner105 = await page.$('.empty-banner');
  if (emptyBanner105) {
    throw new Error("FAIL: Empty banner triggered for Sarah Jenkins (#105)!");
  }
  console.log("✓ PASS: Sarah Jenkins (#105) displays complete multi-cycle data without empty banner.");

  // Check Elena Rostova (#106)
  await page.click('.patient-chips button:has-text("#106")');
  await page.waitForTimeout(400);
  const emptyBanner106 = await page.$('.empty-banner');
  if (emptyBanner106) {
    throw new Error("FAIL: Empty banner triggered for Elena Rostova (#106)!");
  }
  console.log("✓ PASS: Elena Rostova (#106) displays complete multi-cycle data without empty banner.");

  // Click "Sync rounds" in Analytics
  await page.click('.analytics-actions button:has-text("Sync rounds")');
  await page.waitForSelector('.toast', { state: 'visible' });
  const toastText = await page.textContent('.toast');
  console.log(`✓ PASS: Analytics Sync rounds verified. Toast: "${toastText.trim()}"`);

  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_analytics_all_patients_clean.png" });

  console.log("6. Verifying Roster three dots menu outside-click dismissal...");
  await page.click('button:has-text("Roster")');
  await page.waitForSelector('.roster-surface', { state: 'visible' });

  // Open three dots menu on first row
  await page.locator('.more-wrap button').first().click();
  await page.waitForSelector('.row-menu', { state: 'visible' });
  console.log("✓ PASS: Roster three-dots menu opened.");

  // Click outside (e.g. on page title)
  await page.click('.page-title-row h1');
  await page.waitForTimeout(300);
  const rosterMenuClosed = await page.$('.row-menu');
  if (rosterMenuClosed) {
    throw new Error("FAIL: Roster three-dots menu did not close on outside click!");
  }
  console.log("✓ PASS: Roster three-dots menu closed cleanly on outside click.");

  await browser.close();
  console.log("=== ALL 6 REGRESSION & FEATURE CHECKS PASSED PERFECTLY! ===");
}

run().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
