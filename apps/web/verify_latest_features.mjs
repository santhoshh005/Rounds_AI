import { chromium } from "playwright";
import * as assert from "node:assert/strict";

async function main() {
  console.log("=== Launching Browser to Verify All User Requirements ===");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Set auth demo token
    await page.goto("http://localhost:3000/roster");
    await page.evaluate(() => {
      localStorage.setItem("rounds-auth", "demo");
    });
    await page.goto("http://localhost:3000/roster");
    await page.waitForLoadState("networkidle");

  console.log("\n--- TEST 1: Bed Occupancy Validation ---");
  // Check Roster is open and 3 patients are admitted
  const rows = await page.locator("tbody tr").count();
  console.log(`Current patients admitted: ${rows}`);
  assert.ok(rows >= 3, "Expected at least 3 patients admitted");

  // Click 'Admit patient'
  await page.locator("button:has-text('Admit patient')").first().click();
  await page.waitForTimeout(400);

  // Fill details with an ALREADY OCCUPIED bed: Bed 12 (David Miller)
  await page.locator("input[name='name']").fill("Dr. Sung Jinwoo");
  await page.locator("input[name='age']").fill("25");
  await page.locator("input[name='mrn']").fill("MRN-999888");
  await page.locator("input[name='bed']").fill("12"); // Bed 12 occupied!
  await page.locator("input[name='diagnosis']").fill("Metastatic Colorectal Cancer");
  await page.locator("input[name='regimen']").fill("mFOLFOX6");
  await page.locator("input[name='cycle']").fill("Cycle 4 of 6");
  await page.locator("input[name='anc']").fill("1450");
  await page.locator("input[name='ecog']").fill("1");

  // Attempt to submit
  await page.locator("button[type='submit']:has-text('Admit patient')").click();
  await page.waitForTimeout(400);

  // Verify conflict banner appears
  const conflictBanner = await page.locator(".bed-conflict-banner").textContent();
  console.log(`Conflict Banner Text: "${conflictBanner}"`);
  assert.ok(
    conflictBanner.includes("occupied by David Miller"),
    "Should clearly indicate Bed 12 is occupied by David Miller"
  );
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_bed_conflict_alert.png" });

  // Now allocate an available bed by clicking an available bed chip: Bed 18
  console.log("Clicking available Bed 18 chip...");
  await page.locator("button.ward-bed-chip:has-text('Bed 18')").click();
  await page.waitForTimeout(300);

  // Submit with Bed 18
  await page.locator("button[type='submit']:has-text('Admit patient')").click();
  await page.waitForTimeout(600);

  // Check that new patient is admitted
  const updatedRowCount = await page.locator("tbody tr").count();
  console.log(`Updated patient count in roster: ${updatedRowCount}`);
  assert.equal(updatedRowCount, 4, "Roster should now have 4 patients");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_patient_admitted_bed18.png" });

  console.log("\n--- TEST 2: Dynamic Patient-Specific Dose Recommendations ---");
  // Go to Analytics
  await page.goto("http://localhost:3000/analytics");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);

  // 1. Check David Miller (#104)
  await page.locator("button:has-text('#104 David')").click();
  await page.waitForTimeout(400);
  let recTitle = await page.locator(".dose-rec-title").textContent();
  let badgeText = await page.locator(".dose-recommendation-card").getAttribute("class");
  console.log(`#104 David Miller: ${recTitle} (Card class: ${badgeText})`);
  assert.ok(badgeText.includes("danger"), "David Miller must have danger badge");
  assert.ok(recTitle.includes("Protocol Dose Reduction"), "Should recommend protocol dose reduction for Grade 4");

  // 2. Check Sarah Jenkins (#105)
  await page.locator("button:has-text('#105 Sarah')").click();
  await page.waitForTimeout(400);
  recTitle = await page.locator(".dose-rec-title").textContent();
  badgeText = await page.locator(".dose-recommendation-card").getAttribute("class");
  console.log(`#105 Sarah Jenkins: ${recTitle} (Card class: ${badgeText})`);
  assert.ok(badgeText.includes("warning"), "Sarah Jenkins must have warning badge");
  assert.ok(recTitle.includes("Chemotherapy Cycle Delay"), "Should recommend cycle delay for Grade 3");

  // 3. Check Elena Rostova (#106)
  await page.locator("button:has-text('#106 Elena')").click();
  await page.waitForTimeout(400);
  recTitle = await page.locator(".dose-rec-title").textContent();
  badgeText = await page.locator(".dose-recommendation-card").getAttribute("class");
  console.log(`#106 Elena Rostova: ${recTitle} (Card class: ${badgeText})`);
  assert.ok(badgeText.includes("success"), "Elena Rostova must have success badge");
  assert.ok(recTitle.includes("Full Planned Dose Continuation"), "Should recommend full continuation for Grade 0");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_elena_full_dose_recommendation.png" });

  console.log("\n--- TEST 3: Historical Rounds Audit Log Table ---");
  // Check the audit table for Elena Rostova
  const auditRowsElena = await page.locator(".audit-table tbody tr").count();
  console.log(`Elena Rostova audit log rows count: ${auditRowsElena}`);
  assert.ok(auditRowsElena >= 4, "Elena Rostova should have at least 4 historical rounds in table");
  const firstRowElena = await page.locator(".audit-table tbody tr").first().textContent();
  console.log(`First row in Elena audit log: "${firstRowElena.trim()}"`);

  // Check the audit table for newly admitted Sung Jinwoo
  console.log("Switching to newly admitted patient in Analytics...");
  await page.locator(".patient-chips button").nth(3).click();
  await page.waitForTimeout(500);
  const auditRowsSung = await page.locator(".audit-table tbody tr").count();
  console.log(`Sung Jinwoo audit log rows count: ${auditRowsSung}`);
  assert.ok(auditRowsSung >= 1, "Sung Jinwoo should have their admission baseline round");
  const sungFirstRow = await page.locator(".audit-table tbody tr").first().textContent();
  console.log(`Sung Jinwoo first row: "${sungFirstRow.trim()}"`);
  assert.ok(sungFirstRow.includes("Admission Workup") || sungFirstRow.includes("1,450"), "Should show admission baseline");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_audit_table_rendered.png" });

  console.log("\n--- TEST 4: Distinct Patient Trajectory Curves & Reactive Attestation ---");
  // Check David Miller's chart vs Elena Rostova's chart
  await page.locator("button:has-text('#104 David')").click();
  await page.waitForTimeout(400);
  const davidSvg = await page.locator("svg.chart").first().innerHTML();
  assert.ok(davidSvg.includes("420"), "David Miller chart must contain 420 /uL nadir point");
  assert.ok(davidSvg.includes("Base: 1,400"), "David Miller chart must show Base: 1,400");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_david_distinct_chart.png" });

  await page.locator("button:has-text('#106 Elena')").click();
  await page.waitForTimeout(400);
  const elenaSvg = await page.locator("svg.chart").first().innerHTML();
  assert.ok(elenaSvg.includes("1,620"), "Elena Rostova chart must contain 1,620 /uL point");
  assert.ok(elenaSvg.includes("Base: 1,650"), "Elena Rostova chart must show Base: 1,650");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_elena_distinct_chart.png" });

  // Now test attesting a note on Station for David Miller
  console.log("\n--- TEST 5: Attesting Note Reactive Update in Analytics ---");
  await page.goto("http://localhost:3000/station");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);

  // Jump to Step 2 Review via Stepper
  await page.locator(".stepper button").nth(1).click();
  await page.waitForTimeout(400);

  // Click on Point 3 checkbox to toggle confirmed state
  console.log("Toggling Point 3 checkbox on Review Step...");
  await page.locator(".check-row").nth(2).locator("input[type='checkbox']").click({ force: true });
  await page.waitForTimeout(400);

  // Advance to Step 3 Sign via 'Continue to sign' button
  console.log("Advancing to Sign Step via 'Continue to sign'...");
  await page.locator("button:has-text('Continue to sign')").click();
  await page.waitForTimeout(600);

  // Wait for SOAP note on Step 3
  await page.waitForSelector(".soap-note");

  // Verify SOAP note editing is controlled and saved
  console.log("Testing clinician edit in SOAP note textarea...");
  const assessmentArea = page.locator("textarea[aria-label='Assessment note']");
  await assessmentArea.fill("58M with Stage III colon cancer on mFOLFOX6 presenting with Febrile Neutropenia (CTCAE v5.0 Grade 4). Clinician verified fever 38.4C and ANC 420.");
  await page.waitForTimeout(300);

  // Click 'Attest note' or 'Attest & approve'
  console.log("Clicking attest button...");
  const attestBtn = page.locator(".round-summary button:has-text('Attest'), .sign-bar button:has-text('Attest')").first();
  await attestBtn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_station_attested.png" });

  // Now go back to Analytics and verify the newly attested round is present in audit log and chart!
  await page.goto("http://localhost:3000/analytics");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Select David Miller
  await page.locator("button:has-text('#104 David')").click();
  await page.waitForTimeout(400);

  const davidAuditRowsAfter = await page.locator(".audit-table tbody tr").count();
  console.log(`David Miller audit rows after attesting note: ${davidAuditRowsAfter}`);
  assert.ok(davidAuditRowsAfter >= 5, "Audit log should now have 5 rounds including attested note");

  const newestRow = await page.locator(".audit-table tbody tr").first().textContent();
  console.log(`Newest attested round row in audit log: "${newestRow.trim()}"`);
  assert.ok(
    newestRow.includes("Ward Station Note Attestation") || newestRow.includes("Approved"),
    "Audit log must show the newly attested station note"
  );
  assert.ok(
    newestRow.includes("420") || newestRow.includes("Grade 4"),
    "Audit log must record David's acute 420 cells/uL nadir and Grade 4 toxicity"
  );
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_analytics_reactive_attestation.png" });

  console.log("\n--- TEST 6: Toast Notification Auto-Dismiss & Clean Message (No Double Checkmarks) ---");
  await page.goto("http://localhost:3000/station");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // Jump to Step 2 Review
  await page.locator(".stepper button").nth(1).click();
  await page.waitForTimeout(400);

  // Click 'Edit' on verification point 2
  console.log("Clicking Edit on verification point 2...");
  const editBtnPoint2 = page.locator(".check-row").nth(1).locator("button:has-text('Edit')");
  await editBtnPoint2.click();
  await page.waitForTimeout(300);

  const editInput = page.locator(".check-row").nth(1).locator("input[type='text']");
  await editInput.fill("Point 2 Confirm patient is afebrile (36.8°C) with no focal toxicity");
  await page.locator(".check-row").nth(1).locator("button:has-text('Save')").click();
  await page.waitForTimeout(300);

  // Verify toast appears
  const toastLocator = page.locator(".toast");
  assert.equal(await toastLocator.isVisible(), true, "Toast banner must be visible after editing point");

  const toastText = await toastLocator.locator("span").textContent();
  console.log(`Toast message text: "${toastText}"`);
  assert.equal(toastText?.trim(), "Updated verification point 2", "Toast message must NOT duplicate checkmark icon");

  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_toast_clean_single_icon.png" });

  // Test Auto-Dismiss: Wait 4 seconds and check that toast has automatically disappeared
  console.log("Waiting 4 seconds to verify toast auto-dismiss...");
  await page.waitForTimeout(4000);
  const isToastStillVisible = await toastLocator.isVisible();
  console.log(`Toast visible after 4 seconds: ${isToastStillVisible}`);
  assert.equal(isToastStillVisible, false, "Toast banner must auto-dismiss after timeout");

  // Test Manual Dismiss
  console.log("Testing manual dismiss button...");
  await editBtnPoint2.click();
  await page.waitForTimeout(200);
  await page.locator(".check-row").nth(1).locator("button:has-text('Save')").click();
  await page.waitForTimeout(300);
  assert.equal(await toastLocator.isVisible(), true, "Toast should appear again");
  await toastLocator.locator("button:has-text('Dismiss')").click();
  await page.waitForTimeout(200);
  assert.equal(await toastLocator.isVisible(), false, "Clicking Dismiss should immediately remove toast");

  console.log("\n--- TEST 7: Clinical Notification Center ---");
  // Check notification bell button
  const bellBtn = page.locator(".notification-bell-btn");
  assert.equal(await bellBtn.isVisible(), true, "Notification bell button must be present in header");

  // Check unread badge
  const badgeLocator = page.locator(".notification-badge");
  const hasBadge = await badgeLocator.isVisible();
  console.log(`Notification unread badge visible: ${hasBadge}`);
  if (hasBadge) {
    const unreadCount = await badgeLocator.textContent();
    console.log(`Unread alerts count: ${unreadCount}`);
    assert.ok(parseInt(unreadCount || "0", 10) > 0, "Unread count should be > 0");
  }

  // Click bell to open Notification Center
  console.log("Opening Notification Center popover...");
  await bellBtn.click();
  await page.waitForTimeout(400);

  const notifPopover = page.locator(".notification-popover");
  assert.equal(await notifPopover.isVisible(), true, "Notification popover must open on bell click");

  const notifItemsCount = await page.locator(".notification-item").count();
  console.log(`Notification feed items count: ${notifItemsCount}`);
  assert.ok(notifItemsCount >= 2, "Expected clinical alert items in feed");

  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_notification_center_open.png" });

  // Click 'Mark all read'
  console.log("Clicking 'Mark all read'...");
  const markAllReadBtn = page.locator(".notification-mark-read");
  if (await markAllReadBtn.isVisible()) {
    await markAllReadBtn.click();
    await page.waitForTimeout(400);
  }

  // Badge should now be gone or 0
  const badgeAfter = await page.locator(".notification-badge").isVisible();
  console.log(`Badge visible after mark all read: ${badgeAfter}`);
  assert.equal(badgeAfter, false, "Notification unread badge should disappear once marked all read");

  // Close notification popover by clicking outside
  await page.mouse.click(200, 200);
  await page.waitForTimeout(300);

  console.log("\n--- TEST 8: Clinician Doctor Profile Editing & Cross-App Reflection ---");
  // Open Clinician Menu
  const avatarBtn = page.locator(".avatar-button");
  console.log("Opening Clinician Profile menu...");
  await avatarBtn.click();
  await page.waitForTimeout(400);

  // Click 'Profile'
  await page.locator(".profile-menu button:has-text('Profile')").click();
  await page.waitForTimeout(500);

  const profileDialog = page.locator(".clinician-profile-dialog");
  assert.equal(await profileDialog.isVisible(), true, "Clinician profile modal must be open");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_doctor_profile_view_mode.png" });

  // Switch to Edit Mode
  console.log("Clicking 'Edit Details' button...");
  await page.locator(".clinician-profile-dialog button:has-text('Edit Details')").click();
  await page.waitForTimeout(400);

  // Verify form fields
  assert.equal(await page.locator("#clinician-name").isVisible(), true, "Clinician name field must be present");
  await page.locator("#clinician-name").fill("Dr. Gregory House, MD");
  await page.locator("#clinician-title").fill("Head of Diagnostic & Medical Oncology");
  await page.locator("#clinician-ward").fill("Ward 4B Senior Attending");
  await page.locator("#clinician-initials").fill(""); // Clear initials to verify auto-derivation to 'GH'

  // Save changes
  console.log("Saving doctor profile changes...");
  await page.locator(".clinician-profile-dialog button:has-text('Save Changes')").click();
  await page.waitForTimeout(600);

  // Verify toast appears
  const profileToast = await page.locator(".toast span").textContent();
  console.log(`Doctor profile update toast: "${profileToast}"`);
  assert.ok(profileToast?.includes("Dr. Gregory House, MD"), "Toast should confirm profile update");

  // Verify avatar initials updated to 'GH'
  const newInitials = await avatarBtn.textContent();
  console.log(`Updated avatar initials: "${newInitials?.trim()}"`);
  assert.equal(newInitials?.trim(), "GH", "Doctor initials should auto-derive to 'GH'");

  // Verify header menu displays 'Dr. Gregory House, MD'
  await avatarBtn.click();
  await page.waitForTimeout(300);
  const menuDoctorName = await page.locator(".profile-menu strong").textContent();
  console.log(`Profile menu doctor name: "${menuDoctorName}"`);
  assert.equal(menuDoctorName?.trim(), "Dr. Gregory House, MD");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Check Station Step 3 Sign shows updated attending name
  console.log("Checking attestation signature in Station Sign Step...");
  await page.locator(".stepper button").nth(2).click();
  await page.waitForTimeout(500);

  const attendingLabel = await page.locator(".soap-header span").textContent();
  console.log(`Attending label in SOAP note: "${attendingLabel?.trim()}"`);
  assert.ok(attendingLabel?.includes("Dr. Gregory House, MD"), "SOAP header must show updated attending doctor name");
  await page.screenshot({ path: "C:/Users/saisa/.gemini/antigravity/brain/c68413c6-d89d-4149-9a5c-5c229ff3649c/verified_doctor_profile_updated_soap_note.png" });

    console.log("\n=== ALL 8 VERIFICATION CHECKS PASSED PERFECTLY! ===");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
