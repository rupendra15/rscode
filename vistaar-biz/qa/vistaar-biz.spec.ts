import { test, expect } from "@playwright/test";

const routes = [
  { path: "/", name: "homepage" },
  { path: "/onboarding", name: "onboarding" },
  { path: "/dashboard", name: "dashboard" }
];

test.describe("Vistaar-Biz smoke and UX QA", () => {
  for (const route of routes) {
    test("loads " + route.name + " without console/page errors", async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedRequests: string[] = [];

      page.on("console", msg => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("requestfailed", request => {
        failedRequests.push(
          request.method() + " " + request.url() + " — " + (request.failure()?.errorText ?? "failed")
        );
      });

      if (route.path === "/dashboard") {
        await page.route("**/api/auth/me", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, authenticated:true, user:{ id:"qa-manager", email:"qa@vistaar-biz.test", role:"manager" } }) }));
        await page.route("**/api/workspace?list=1", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, workspaces:[] }) }));
        await page.route("**/api/readiness", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, submissions:[] }) }));
        await page.route("**/api/enquiries", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, enquiries:[] }) }));
      }
      await page.goto(route.path, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      expect(pageErrors, "page errors on " + route.path).toEqual([]);
      expect(consoleErrors, "console errors on " + route.path).toEqual([]);
      expect(failedRequests, "failed requests on " + route.path).toEqual([]);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      }));
      expect(
        overflow.scrollWidth - overflow.clientWidth,
        "horizontal overflow on " + route.path
      ).toBeLessThanOrEqual(2);

      await expect(page.locator("body")).not.toContainText("undefined");
      await expect(page.locator("body")).not.toContainText("NaN");

      await page.screenshot({
        path: "qa-report/screenshots/" + route.name + "-" + test.info().project.name + ".png",
        fullPage: test.info().project.name !== "mobile"
      });
    });
  }

  test("homepage primary interactions work", async ({ page }) => {
    await page.route("**/api/enquiries", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, stored: false })
      });
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /You run the business\. We build the growth\./i })).toBeVisible();

    await page.getByRole("link", { name: /Check your growth readiness/i }).click();
    await expect(page.locator("#audit")).toBeInViewport();

    const service = page.locator("#platform .serviceCard").first();
    await service.getByRole("button", { name: /Explore this service/i }).click();
    await expect(page.getByText(/HOW VISTAAR-BIZ HELPS/i)).toBeVisible();
    await page.locator(".detailClose").click();

    const contactCta = page.getByRole("button", { name: /Talk to Vistaar about growth/i }).first();
    await expect(contactCta).toBeVisible();
    await contactCta.click();
    await expect(page.getByRole("dialog", { name: /Talk to Vistaar-Biz/i })).toBeVisible();

    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: /Send an enquiry/i }).click();
    await expect(modal.locator("#modal-form")).toBeVisible();

    await modal.getByLabel("Your name").fill("QA User");
    await modal.getByLabel("Business name").fill("QA Business");
    await modal.getByLabel("Phone number").fill("+919876543210");
    await modal.getByLabel("Email address").fill("qa@example.com");
    await modal.getByLabel("What do you need?").selectOption({ label: "Get an AI growth plan" });
    await modal.getByLabel("Your question").fill("Testing the Vistaar-Biz enquiry flow.");
    await modal.getByRole("button", { name: /Send my enquiry/i }).click();
    await expect(modal).toContainText(/Thanks — we have your enquiry/i);
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("readiness questionnaire progresses and returns a result", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const audit = page.locator("#audit");

    for (let i = 0; i < 6; i++) {
      const answer = audit.locator(".answerOption").first();
      await answer.click();
      if (i < 5) {
        const next = audit.getByRole("button", { name: /Next question/i });
        await expect(next).toBeEnabled();
        await next.click();
        await expect(audit.locator(".answerOption").first()).toBeVisible();
      } else {
        const finish = audit.getByRole("button", { name: /See my readiness/i });
        await expect(finish).toBeEnabled();
        await finish.click();
      }
    }

    await expect(audit).toContainText(/YOUR DIRECTIONAL PREVIEW/i);
    await expect(audit.locator(".readinessScore b")).toBeVisible();
  });


  test("dashboard recovers the submitted business workspace when a browser ID is stale", async ({ page }) => {
    const workspace = {
      ok: true,
      business: { id: "urban-business", name: "Urban Grill", industry: "Restaurant", city: "Rewa", goal: "More qualified enquiries", workspace_stage: "diagnosed" },
      profile: { businessName: "Urban Grill", industry: "Restaurant", city: "Rewa", goal: "More qualified enquiries", idealCustomer: "Local diners", offerings: "Dining", constraint: "Visibility", challenge: "Improve enquiries" },
      audit: { overall: 71, maturity: "Growing", summary: "Urban Grill has a clear opportunity to improve local discovery.", nextMove: "Improve local discovery", metrics: [], opportunities: [], reasoning: [] },
      actions: [], leads: [], measurements: [], specialists: [], assessment: { id: "urban-assessment" }, businessId: "urban-business", auditId: "urban-audit", assessmentId: "urban-assessment", auditCreatedAt: new Date().toISOString()
    };

    await page.addInitScript(() => {
      localStorage.setItem("vistaar_growth_assessment", JSON.stringify({ id: "urban-assessment", businessId: "stale-business" }));
      localStorage.setItem("vistaar_biz_audit", JSON.stringify({ businessId: "stale-business" }));
    });
    await page.route("**/api/workspace?businessId=stale-business", route =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Workspace not found." }) })
    );
    await page.route("**/api/workspace?assessmentId=urban-assessment", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workspace) })
    );

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Urban Grill" })).toBeVisible();
    await expect(page.getByText("Restaurant · Rewa · Focus: More qualified enquiries")).toBeVisible();
    await expect(page.getByText("Ideal customer")).toBeVisible();
    await expect(page.getByText("Primary growth outcome")).toBeVisible();
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("assessment-specific URLs keep their reports isolated", async ({ page }) => {
    const makeWorkspace = (assessmentId: string, auditId: string, score: number) => ({
      ok: true,
      business: { id: "urban-business", name: "Urban Grill", industry: "Restaurant", city: "Rewa", goal: "More qualified enquiries", workspace_stage: "diagnosed" },
      profile: { businessName: "Urban Grill", industry: "Restaurant", city: "Rewa", goal: "More qualified enquiries" },
      audit: { overall: score, maturity: "Growing", summary: "Assessment-specific report", nextMove: "Improve local discovery", metrics: [], opportunities: [], reasoning: [] },
      actions: [], leads: [], measurements: [], specialists: [], evidence: [],
      assessment: { id: assessmentId, version: assessmentId === "assessment-v2" ? 2 : 1 },
      businessId: "urban-business", auditId, assessmentId, auditCreatedAt: new Date().toISOString()
    });

    await page.route("**/api/auth/me", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, authenticated:true, user:{ id:"qa-admin", email:"qa@vistaar-biz.test", role:"admin" } }) })
    );
    await page.route("**/api/workspace?list=1", route =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ok:true,
        workspaces: [
          { business_id:"urban-business", name:"Urban Grill", industry:"Restaurant", city:"Rewa", assessment_id:"assessment-v2", assessment_version:2, assessment_created_at:new Date().toISOString() },
          { business_id:"urban-business", name:"Urban Grill", industry:"Restaurant", city:"Rewa", assessment_id:"assessment-v1", assessment_version:1, assessment_created_at:new Date().toISOString() }
        ]
      }) })
    );
    await page.route("**/api/readiness", route =>
      route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ok:true,submissions:[]}) })
    );
    await page.route("**/api/enquiries", route =>
      route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ok:true,enquiries:[]}) })
    );
    await page.route("**/api/workspace?assessmentId=assessment-v2", route =>
      route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(makeWorkspace("assessment-v2","audit-v2",82)) })
    );
    await page.route("**/api/workspace?assessmentId=assessment-v1", route =>
      route.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(makeWorkspace("assessment-v1","audit-v1",61)) })
    );

    await page.goto("/dashboard?assessmentId=assessment-v1", { waitUntil:"networkidle" });
    await expect(page.getByText("61")).toBeVisible();
    await expect(page.locator("body")).toContainText("assessment-v1");

    await page.goto("/dashboard?assessmentId=assessment-v2", { waitUntil:"networkidle" });
    await expect(page.getByText("82")).toBeVisible();
    await expect(page.locator("body")).toContainText("assessment-v2");
  });

  test("onboarding and dashboard render", async ({ page }) => {
    await page.route("**/api/auth/me", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, authenticated:true, user:{ id:"qa-manager", email:"qa@vistaar-biz.test", role:"manager" } }) }));
    await page.route("**/api/workspace?list=1", async route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok:true, workspaces:[] }) }));
    await page.goto("/onboarding", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(/business/i);
    expect(await page.getByRole("button").count()).toBeGreaterThan(0);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(/Overview/i);
    for (const label of ["Growth audit", "Leads & pipeline", "Expert network", "Execution studio", "Insights"]) {
      const item = page.getByRole("link", { name: new RegExp(label, "i") }).first();
      if (await item.count()) await expect(item).toBeVisible();
    }
  });
});
