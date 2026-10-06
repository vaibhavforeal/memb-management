import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: {
    business: { findUnique: vi.fn() },
    branch: { findFirst: vi.fn() },
    staffAccess: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
  getSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`Redirect:${path}`);
  }),
}));
vi.mock("../src/lib/db", () => ({ db: mocks.db }));
vi.mock("../src/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import {
  assertActive,
  getContext,
  type TenantContext,
} from "../src/lib/context";
import { billingOwner } from "../src/lib/business-billing";
import { PlanRequiredError } from "../src/lib/workspace-access";
const ctx: TenantContext = {
  businessId: "business",
  branchId: "branch",
  userId: "owner",
  role: "OWNER",
  support: false,
};
const business = {
  id: "business",
  status: "ACTIVE",
  trialRequired: true,
  trialEndsAt: new Date("2020-01-01"),
  billingPaidThrough: null,
  branches: [{ id: "branch" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    user: { id: "owner", platformAdmin: false },
  });
  mocks.db.business.findUnique.mockResolvedValue(business);
  mocks.db.branch.findFirst.mockResolvedValue({ id: "branch" });
  mocks.db.staffAccess.findUnique.mockResolvedValue({ role: "OWNER" });
  mocks.db.staffAccess.findFirst.mockResolvedValue({
    role: "OWNER",
    businessId: "business",
    business,
  });
});

describe("trial enforcement at server entry points", () => {
  it("redirects expired feature pages and returns a payment error to APIs", async () => {
    await expect(getContext()).rejects.toThrow("Redirect:/upgrade");
    await expect(getContext({ api: true })).rejects.toBeInstanceOf(
      PlanRequiredError,
    );
  });
  it("blocks service calls made with an earlier context after expiry", async () => {
    await expect(assertActive(ctx)).rejects.toBeInstanceOf(PlanRequiredError);
  });
  it("allows billing checkout after expiry, while retaining role and status checks", async () => {
    expect(await getContext({ allowExpired: true })).toEqual(ctx);
    await expect(billingOwner(ctx)).resolves.toBeUndefined();
    await expect(billingOwner({ ...ctx, role: "STAFF" })).rejects.toThrow(
      "Only a business owner",
    );
    mocks.db.business.findUnique.mockResolvedValue({
      ...business,
      status: "SUSPENDED",
    });
    await expect(billingOwner(ctx)).rejects.toThrow("not active");
  });
  it("restores feature access when a valid paid-through date exists", async () => {
    const paid = { ...business, billingPaidThrough: new Date("2099-01-01") };
    mocks.db.business.findUnique.mockResolvedValue(paid);
    mocks.db.staffAccess.findFirst.mockResolvedValue({
      role: "OWNER",
      businessId: "business",
      business: paid,
    });
    expect(await getContext()).toEqual(ctx);
    await expect(assertActive(ctx)).resolves.toEqual(paid);
  });
  it("does not restart access for newly invited staff", async () => {
    mocks.db.staffAccess.findFirst.mockResolvedValue({
      role: "STAFF",
      businessId: "business",
      business,
    });
    await expect(getContext()).rejects.toThrow("Redirect:/upgrade");
  });
});
