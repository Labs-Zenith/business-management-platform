import { beforeEach, describe, expect, it } from "vitest";
import { createBusinessFeatureRepository } from "./business-features-repo";
import { createEmptyStore, type MockStore } from "./store";

/**
 * Mirrors `lib/mock/pipeline-repo.test.ts`'s scope, adapted for the simpler
 * `businessId -> feature -> enabled` shape (see
 * `lib/services/ports.ts`'s `BusinessFeatureRepository`). Proves
 * deny-by-default (no row / `enabled: false`) and the `setEnabled` round
 * trip, cross-business isolated.
 */

const BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS_ID = "10000000-0000-4000-8000-000000000099";

let store: MockStore;

beforeEach(() => {
  store = createEmptyStore();
});

describe("createBusinessFeatureRepository.isEnabled", () => {
  it("returns false (deny-by-default) when the business has no entry at all", async () => {
    const repo = createBusinessFeatureRepository(store);

    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(false);
  });

  it("returns false after setEnabled(false) even though a row now exists", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(BUSINESS_ID, "pipeline", false);

    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(false);
  });

  it("returns true after setEnabled(true)", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(BUSINESS_ID, "pipeline", true);

    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(true);
  });

  it("is business-scoped: enabling for one business never leaks to another", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(BUSINESS_ID, "pipeline", true);

    expect(await repo.isEnabled(OTHER_BUSINESS_ID, "pipeline")).toBe(false);
  });
});

describe("createBusinessFeatureRepository.setEnabled", () => {
  it("round-trips: toggling true -> false -> true is reflected by isEnabled each time", async () => {
    const repo = createBusinessFeatureRepository(store);

    await repo.setEnabled(BUSINESS_ID, "pipeline", true);
    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(true);

    await repo.setEnabled(BUSINESS_ID, "pipeline", false);
    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(false);

    await repo.setEnabled(BUSINESS_ID, "pipeline", true);
    expect(await repo.isEnabled(BUSINESS_ID, "pipeline")).toBe(true);
  });
});

describe("createBusinessFeatureRepository.listEnabledFeatures", () => {
  it("returns an empty array for a business with no entries", async () => {
    const repo = createBusinessFeatureRepository(store);

    expect(await repo.listEnabledFeatures(BUSINESS_ID)).toEqual([]);
  });

  it("returns only features with enabled: true, excluding explicitly disabled ones", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(BUSINESS_ID, "pipeline", true);

    expect(await repo.listEnabledFeatures(BUSINESS_ID)).toEqual(["pipeline"]);
  });

  it("excludes a feature after it's disabled", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(BUSINESS_ID, "pipeline", true);
    await repo.setEnabled(BUSINESS_ID, "pipeline", false);

    expect(await repo.listEnabledFeatures(BUSINESS_ID)).toEqual([]);
  });

  it("is business-scoped: does not include another business's enabled features", async () => {
    const repo = createBusinessFeatureRepository(store);
    await repo.setEnabled(OTHER_BUSINESS_ID, "pipeline", true);

    expect(await repo.listEnabledFeatures(BUSINESS_ID)).toEqual([]);
  });
});
