const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const previewUrl = process.env.WEATHER_PREVIEW_URL || "http://127.0.0.1:5178";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 820, height: 760 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const assertAnchored = async (topSelector, bottomSelector) => {
      const [weather, top, bottom] = await Promise.all([
        page.locator(".weather").boundingBox(),
        page.locator(topSelector).boundingBox(),
        page.locator(bottomSelector).boundingBox(),
      ]);
      assert.ok(weather && top && bottom);
      assert.ok(top.y - weather.y <= 14, `${topSelector} is not top aligned`);
      assert.ok(
        weather.y + weather.height - (bottom.y + bottom.height) <= 14,
        `${bottomSelector} is not bottom aligned`,
      );
    };
    await page.goto(`${previewUrl}/ExampleWidget_Weather/preview/`);
    await page.locator(".temperature").waitFor();
    await page.evaluate(() => {
      document.querySelector("#widget").style.cssText =
        "height:164px;width:416px";
    });
    await page.locator(".view-switch").waitFor();
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    assert.equal(await page.locator(".day").count(), 0);
    assert.match(
      await page.locator(".temperature").getAttribute("title"),
      /Max wind/,
    );
    assert.doesNotMatch(
      await page.locator(".temperature").getAttribute("title"),
      /\[object Object\]/,
    );
    assert.equal(await page.locator("footer,.detail").count(), 0);
    await page
      .locator(".weather")
      .screenshot({ path: "dist/weather-current-compact.png" });
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "260px";
    });
    await page.locator(".view-switch").waitFor();
    await assertAnchored(".view-heading", ".hero");
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "164px";
    });
    await page.getByRole("button", { name: "Forecast", exact: true }).click();
    await page.locator(".day").first().waitFor();
    assert.equal(await page.locator(".day").count(), 3);
    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await page.waitForTimeout(650);
    assert.equal(await page.locator(".day").count(), 7);
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    assert.match(
      await page.locator(".day").first().getAttribute("title"),
      /Precipitation/,
    );
    await page
      .locator(".weather")
      .screenshot({ path: "dist/weather-forecast-compact.png" });
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "260px";
    });
    await page.locator(".view-switch").waitFor();
    await assertAnchored(".view-heading", ".forecast");
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "164px";
    });
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "320px";
    });
    await page.locator(".forecast.stacked").waitFor();
    assert.equal(await page.locator(".temperature").isVisible(), true);
    assert.equal(await page.locator(".view-switch").count(), 0);
    assert.equal(await page.locator(".day").count(), 7);
    await assertAnchored(".view-heading", ".forecast");
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    await page
      .locator(".weather")
      .screenshot({ path: "dist/weather-stacked.png" });
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "164px";
    });
    await page.locator(".view-switch").waitFor();
    assert.equal(await page.locator(".temperature").count(), 0);
    assert.equal(await page.locator(".day").count(), 7);
    await page.locator(".day").last().click();
    await page.getByRole("button", { name: "3 days", exact: true }).click();
    assert.equal(
      await page
        .locator(".forecast-body")
        .evaluate((e) => e.style.getPropertyValue("--flip-out")),
      "-90deg",
    );
    await page.waitForTimeout(650);
    assert.equal(await page.locator(".day").count(), 3);
    assert.equal(await page.locator(".day[aria-pressed=true]").count(), 1);
    await page.getByRole("button", { name: "Current", exact: true }).click();
    await page.evaluate(() => window.weatherPreview.setUnits("F"));
    await page.waitForTimeout(50);
    assert.match(await page.locator(".temperature").innerText(), /57°/);
    await page.evaluate(() => window.weatherPreview.fail(true));
    await page.locator(".temperature").click();
    await page.getByRole("alert").waitFor();
    assert.match(await page.locator(".temperature").innerText(), /57°/);
    await page.evaluate(() => {
      window.weatherPreview.fail(false);
      window.weatherPreview.setUnits("C");
    });
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    await page.screenshot({ path: "dist/weather-grid-preview.png" });
    await page.setViewportSize({ width: 368, height: 900 });
    await page.evaluate(() => {
      document.querySelector("#widget").style.cssText =
        "height:164px;width:260px";
    });
    await page.locator(".view-switch").waitFor();
    assert.equal(await page.locator(".view-toggle").count(), 0);
    assert.equal(await page.locator(".view-switch button").count(), 2);
    assert.equal(await page.locator(".location").innerText(), "Montréal");
    assert.equal(
      await page.locator(".location-block .muted").innerText(),
      "Québec, Canada",
    );
    await page.evaluate(() => {
      document.querySelector("#widget").style.width = "238px";
    });
    await page.locator(".location").waitFor({ state: "detached" });
    const viewToggle = page.locator(".view-toggle");
    await viewToggle.waitFor();
    assert.equal((await viewToggle.innerText()).trim(), "Current");
    assert.equal(await page.locator(".location-block,.location").count(), 0);
    assert.match(
      await page.locator(".temperature").getAttribute("title"),
      /Montréal, Québec, Canada/,
    );
    await viewToggle.click();
    assert.equal(
      await viewToggle.evaluate((element) =>
        element.style.getPropertyValue("--flip-out"),
      ),
      "90deg",
    );
    await page.waitForTimeout(650);
    assert.equal((await viewToggle.innerText()).trim(), "Forecast");
    await viewToggle.click();
    assert.equal(
      await viewToggle.evaluate((element) =>
        element.style.getPropertyValue("--flip-out"),
      ),
      "-90deg",
    );
    await page.waitForTimeout(650);
    assert.equal((await viewToggle.innerText()).trim(), "Current");
    await page.evaluate(() => {
      document.querySelector("#widget").style.width = "260px";
    });
    await page.locator(".location").waitFor();
    await page.getByRole("button", { name: "Forecast", exact: true }).click();
    await page.getByRole("button", { name: "7 days", exact: true }).click();
    await page.waitForTimeout(650);
    const previous = page.getByRole("button", { name: "Scroll forecast left" });
    const next = page.getByRole("button", { name: "Scroll forecast right" });
    await previous.waitFor();
    assert.equal(await previous.isDisabled(), true);
    assert.equal((await previous.innerText()).trim(), "│");
    assert.equal(await next.isDisabled(), false);
    assert.equal((await next.innerText()).trim(), "›");
    const forecastSizes = await page.locator(".days").evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
      tile: element.querySelector(".day")?.getBoundingClientRect().width,
    }));
    assert.ok(forecastSizes.scroll > forecastSizes.client);
    assert.ok(Math.abs(forecastSizes.tile - forecastSizes.client + 4) <= 2);
    await next.click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator(".days").evaluate((element) => element.scrollLeft > 0));
    assert.equal(await previous.isDisabled(), false);
    assert.equal((await previous.innerText()).trim(), "‹");
    await page.locator(".days").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(50);
    assert.equal(await next.isDisabled(), true);
    assert.equal((await next.innerText()).trim(), "│");
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
      true,
    );
    await page.screenshot({ path: "dist/weather-narrow-preview.png" });
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "360px";
    });
    await page.locator(".forecast.stacked").waitFor();
    assert.equal(await page.locator(".temperature").isVisible(), true);
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    await page.evaluate(() => {
      document.querySelector("#widget").style.height = "164px";
    });
    await page.locator(".view-switch").waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "3 days", exact: true }).click();
    assert.equal(await page.locator(".day").count(), 3);
    assert.equal(
      await page
        .locator(".forecast-body")
        .evaluate((e) => getComputedStyle(e).animationName),
      "none",
    );
    await page.goto(`${previewUrl}/ExampleWidget_Weather/preview/?setup`);
    await page.evaluate(() => {
      document.querySelector("#widget").style.cssText =
        "height:164px;width:100%";
    });
    assert.equal(
      await page
        .getByRole("button", { name: /Detect my location/ })
        .isDisabled(),
      true,
    );
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    await page
      .locator(".weather")
      .screenshot({ path: "dist/weather-setup-compact.png" });
    await page.getByRole("button", { name: "Enter a city" }).click();
    assert.equal(
      await page
        .locator(".weather")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
      true,
    );
    await page.getByLabel("City or postal code").fill("Montreal");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: "Montréal Québec, Canada" }).click();
    await page.locator(".temperature").waitFor();
    assert.equal(await page.locator(".location").innerText(), "Montréal");
    assert.deepEqual(errors, []);
    console.log(
      "Browser checks passed: range flips, reverse direction, selection, units, retained data on failure, recovery, narrow view flip, hidden compact location, one-card paging, edge bars, reduced motion, location setup.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
