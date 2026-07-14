import {
  type APIRequestContext,
  expect,
  request as playwrightRequest,
  test,
} from "@playwright/test";
import { UserRole } from "@prisma/client";

import { createSessionToken } from "@/e2e/helpers/session";
import { prisma } from "@/lib/prisma";
import { storageUrlForKey } from "@/lib/storage/storage-url";

const environment = process.env;
const runSignedDelivery = environment.RUN_S4_SIGNED_DELIVERY_E2E === "1";
const suite = test.describe;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const id = (name: string) => `s4-${runId}-${name}`;
const accountHost = "0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com";
const bucket = "s4-private-files";

const keys = {
  material: `private/teachers/${id("teacher")}/materials/material.pdf`,
  photo: `public/teachers/${id("admin")}/active.webp`,
  inactivePhoto: `public/teachers/${id("admin")}/inactive.webp`,
};

function user(userId: string, role: UserRole) {
  return {
    id: userId,
    email: `${userId}@example.com`,
    fullName: userId,
    role,
    passwordHash: "not-used",
    isActive: true,
  };
}

async function sessionCookie(userId: string, role: UserRole) {
  return `ulu_session=${await createSessionToken({
    uid: userId,
    role,
    email: `${userId}@example.com`,
    fullName: userId,
  })}`;
}

function expectNoStore(headers: Record<string, string>) {
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

function expectOfflineR2Redirect(location: string | undefined) {
  expect(location).toBeTruthy();
  const url = new URL(location ?? "");
  expect(url.protocol).toBe("https:");
  expect(url.host).toBe(`${bucket}.${accountHost}`);
  expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
}

suite("signed file delivery composition", () => {
  test.skip(!runSignedDelivery, "Set RUN_S4_SIGNED_DELIVERY_E2E=1 to run PostgreSQL composition");

  test("uses real signed sessions, DB policy, Next routes, and offline R2 presigning", async ({
    request,
  }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL;
    expect(typeof baseURL).toBe("string");
    expect(environment.STORAGE_DRIVER).toBe("r2");
    expect(environment.R2_ENDPOINT).toBe(`https://${accountHost}`);
    expect(environment.R2_BUCKET_NAME).toBe(bucket);

    const contexts: APIRequestContext[] = [];
    try {
      await prisma.appUser.createMany({
        data: [
          user(id("teacher"), UserRole.TEACHER),
          user(id("other-teacher"), UserRole.TEACHER),
          user(id("student"), UserRole.STUDENT),
          user(id("other-student"), UserRole.STUDENT),
        ],
      });
      await prisma.classGroup.create({
        data: {
          id: id("group"),
          name: "S4 signed delivery group",
          teacherId: id("teacher"),
          students: { connect: { id: id("student") } },
        },
      });
      await prisma.scheduledClass.create({
        data: {
          id: id("class"),
          title: "S4 signed delivery class",
          startAt: new Date("2026-07-14T10:00:00.000Z"),
          endAt: new Date("2026-07-14T11:00:00.000Z"),
          teacherId: id("teacher"),
          classGroupId: id("group"),
        },
      });
      await prisma.courseMaterial.create({
        data: {
          id: id("material"),
          title: "S4 signed material",
          fileUrl: storageUrlForKey(keys.material),
          scheduledClassId: id("class"),
          teacherId: id("teacher"),
          attachments: {
            create: {
              id: id("attachment"),
              filename: "material.pdf",
              storageKey: keys.material,
              mimeType: "application/pdf",
              size: 20,
            },
          },
        },
      });
      await prisma.teacher.createMany({
        data: [
          {
            id: id("public-teacher"),
            fullName: "S4 Active Public Teacher",
            title: "Teacher",
            bio: "S4 active public photo fixture",
            photoUrl: storageUrlForKey(keys.photo),
            isActive: true,
          },
          {
            id: id("inactive-public-teacher"),
            fullName: "S4 Inactive Public Teacher",
            title: "Teacher",
            bio: "S4 inactive public photo fixture",
            photoUrl: storageUrlForKey(keys.inactivePhoto),
            isActive: false,
          },
        ],
      });

      for (const [userId, role, expectedStatus] of [
        [id("teacher"), UserRole.TEACHER, 302],
        [id("other-teacher"), UserRole.TEACHER, 404],
        [id("student"), UserRole.STUDENT, 302],
        [id("other-student"), UserRole.STUDENT, 404],
      ] as const) {
        const context = await playwrightRequest.newContext({
          baseURL,
          extraHTTPHeaders: { Cookie: await sessionCookie(userId, role) },
        });
        contexts.push(context);
        const response = await context.get(storageUrlForKey(keys.material), { maxRedirects: 0 });
        expect(response.status()).toBe(expectedStatus);
        expectNoStore(response.headers());
        if (expectedStatus === 302) {
          expectOfflineR2Redirect(response.headers().location);
          expect(response.headers().vary).toContain("Cookie");
        }
      }

      const activePhoto = await request.get(storageUrlForKey(keys.photo), {
        maxRedirects: 0,
      });
      expect(activePhoto.status()).toBe(302);
      expectNoStore(activePhoto.headers());
      expectOfflineR2Redirect(activePhoto.headers().location);

      const inactivePhoto = await request.get(storageUrlForKey(keys.inactivePhoto), {
        maxRedirects: 0,
      });
      expect(inactivePhoto.status()).toBe(404);
      expectNoStore(inactivePhoto.headers());
    } finally {
      await Promise.all(contexts.map((context) => context.dispose()));
      const fixtureIds = { startsWith: `s4-${runId}-` };
      await prisma.teacher.deleteMany({ where: { id: fixtureIds } });
      await prisma.attachment.deleteMany({ where: { id: fixtureIds } });
      await prisma.courseMaterial.deleteMany({ where: { id: fixtureIds } });
      await prisma.scheduledClass.deleteMany({ where: { id: fixtureIds } });
      await prisma.classGroup.deleteMany({ where: { id: fixtureIds } });
      await prisma.appUser.deleteMany({ where: { id: fixtureIds } });
    }
  });
});
