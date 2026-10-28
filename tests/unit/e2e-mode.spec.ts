import { expect, test } from "@playwright/test";
import { isE2eMockEnabled } from "../../lib/e2e-mode";

test("a URL cannot enable synthetic masks in a public build", () => {
  const previous = process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", { value: { location: { search: "?e2eMockSegmenter=1" } }, configurable: true });
    delete process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK;
    expect(isE2eMockEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK = "0";
    expect(isE2eMockEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK = "1";
    expect(isE2eMockEnabled()).toBe(true);
    Object.defineProperty(globalThis, "window", { value: { location: { search: "" } }, configurable: true });
    expect(isE2eMockEnabled()).toBe(false);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK;
    else process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK = previous;
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
