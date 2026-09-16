import { describe, expect, it } from "vitest";
import { fuelNeedleDeg } from "./ui";

describe("analog fuel needle", () => {
  it("points at F when unused and at E when empty", () => {
    expect(fuelNeedleDeg(0)).toBe(90);
    expect(fuelNeedleDeg(100)).toBe(-90);
    expect(fuelNeedleDeg(50)).toBe(0);
  });
});
