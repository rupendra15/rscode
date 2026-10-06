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
        fullPage: true
      });
    });
  }

  test("homepage primary interactions work", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Good businesses/i })).toBeVisible();

    await page.getByRole("link", { name: /Discover your growth readiness/i }).click();
    await expect(page.locator("#audit")).toBeInViewport();

    const service = page.locator("#platform .serviceCard").first();
    await service.getByRole("button", { name: /Explore this service/i }).click();
    await expect(page.getByText(/HOW VISTAAR-BIZ HELPS/i)).toBeVisible();
    await page.getByRole("button", { name: /Close details/i }).click();

    await page.getByRole("button", { name: /Let's talk/i }).click();
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
        const finish = audit.getByRole("button", { name: /View my preview/i });
        await expect(finish).toBeEnabled();
        await finish.click();
      }
    }

    await expect(audit).toContainText(/YOUR DIRECTIONAL PREVIEW/i);
    await expect(audit.locator(".readinessScore b")).toBeVisible();
  });

  test("onboarding and dashboard render", async ({ page }) => {
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
