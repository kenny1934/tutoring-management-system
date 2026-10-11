import { describe, expect, it } from "vitest";
import { lowerFirst } from "./LatestRelease";

describe("a changelog heading in the middle of a sentence", () => {
  it("starts with a small letter", () => {
    expect(lowerFirst("A bar along the bottom")).toBe("a bar along the bottom");
    expect(lowerFirst("Share to WhatsApp")).toBe("share to WhatsApp");
  });

  it("keeps a name's capitals", () => {
    expect(lowerFirst("CSM as an app on your phone")).toBe("CSM as an app on your phone");
    expect(lowerFirst("WhatsApp messages")).toBe("WhatsApp messages");
    expect(lowerFirst("Vasco Center")).toBe("Vasco Center");
  });
});
