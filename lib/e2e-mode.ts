/** Test masks must never be activated by an arbitrary link to a public build. */
export const isE2eMockEnabled = () =>
  process.env.NEXT_PUBLIC_ENABLE_E2E_MOCK === "1" &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("e2eMockSegmenter") === "1";
