import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/create next app/i);
  await expect(
    page.getByText(/to get started, edit the page\.tsx file\./i)
  ).toBeVisible();
});
