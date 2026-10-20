import { describe, expect, it } from "vitest";
import { changePasswordSchema } from "./auth";

describe("changePasswordSchema", () => {
  it("recusa nova senha igual à atual", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "Provisoria#2026",
      newPassword: "Provisoria#2026",
      confirmPassword: "Provisoria#2026",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["newPassword"]);
  });

  it("aceita nova senha diferente", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "Provisoria#2026",
      newPassword: "Definitiva#2026",
      confirmPassword: "Definitiva#2026",
    });
    expect(result.success).toBe(true);
  });
});
