import { describe, expect, it } from "vitest";
import { buildFaqs, features, steps } from "../src/components/landing/content";
import { money } from "../src/lib/domain";
import {
  SIGNUP_MONTHLY_FEE_PAISE,
  TRIAL_DAYS,
} from "../src/lib/workspace-access";

describe("landing content", () => {
  it("lists six features and three steps with real copy", () => {
    expect(features).toHaveLength(6);
    expect(steps).toHaveLength(3);
    for (const item of [...features, ...steps]) {
      expect(item.title.trim()).not.toBe("");
      expect(item.text.trim()).not.toBe("");
    }
  });

  it("builds the trial FAQ from the real fee and trial length", () => {
    const fee = money(SIGNUP_MONTHLY_FEE_PAISE);
    const faqs = buildFaqs(fee, TRIAL_DAYS);
    expect(faqs).toHaveLength(5);
    const trial = faqs.find((f) => /trial/i.test(f.q))!;
    expect(trial.a).toContain(`${TRIAL_DAYS} days`);
    expect(trial.a).toContain(fee);
  });

  it("does not hard-code the fee or trial length", () => {
    const trial = buildFaqs("₹999", 7).find((f) => /trial/i.test(f.q))!;
    expect(trial.a).toContain("7 days");
    expect(trial.a).toContain("₹999");
    expect(trial.a).not.toContain("3 days");
  });
});
