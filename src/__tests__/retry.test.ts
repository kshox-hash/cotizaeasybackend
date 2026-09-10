import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../core/retry";

describe("withRetry", () => {
  it("devuelve el resultado sin reintentar si la primera llamada tiene éxito", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta tras un fallo transitorio y devuelve el resultado si un intento posterior tiene éxito", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fallo transitorio"))
      .mockResolvedValueOnce("ok tras reintento");
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe("ok tras reintento");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("agota los intentos configurados y relanza el último error si nunca tiene éxito", async () => {
    const err = new Error("siempre falla");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, 3, 1)).rejects.toThrow("siempre falla");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respeta la cantidad de intentos pedida (attempts=1 no reintenta)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("falla"));
    await expect(withRetry(fn, 1, 1)).rejects.toThrow("falla");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
