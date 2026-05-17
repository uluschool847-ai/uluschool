import { expect } from "@playwright/test";

async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const response = await fetch(baseURL);
  expect(response.ok).toBeTruthy();
  console.log("Dev server is running");
}

export default globalSetup;
