import { describe, expect, it } from "vitest";
import { INSTALLERS, detectOS, downloadUrl, pickDownloads } from "../src/download.ts";

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

describe("detectOS", () => {
  it("reads desktop systems from the user agent", () => {
    expect(detectOS(UA.mac)).toBe("mac");
    expect(detectOS(UA.windows)).toBe("windows");
    expect(detectOS(UA.linux)).toBe("linux");
  });

  it("treats phones, tablets and iPads posing as Macs as mobile", () => {
    expect(detectOS(UA.iphone)).toBe("mobile");
    expect(detectOS(UA.android)).toBe("mobile");
    expect(detectOS(UA.mac, undefined, 5)).toBe("mobile");
    expect(detectOS(UA.windows, { platform: "Windows", mobile: true })).toBe("mobile");
  });

  it("prefers client hints and doesn't offer Linux builds to Chromebooks", () => {
    expect(detectOS("", { platform: "macOS", mobile: false })).toBe("mac");
    expect(detectOS("", { platform: "Linux", mobile: false })).toBe("linux");
    expect(detectOS(UA.chromebook)).toBe("unknown");
    expect(detectOS("curl/8.0")).toBe("unknown");
  });
});

describe("pickDownloads", () => {
  it("offers the visitor's system first and lists the rest", () => {
    const { primary, others } = pickDownloads("windows");
    expect(primary?.file).toBe("Quest-Forge-windows-setup.exe");
    expect(others.map((i) => i.file)).toEqual(INSTALLERS.filter((i) => i !== primary).map((i) => i.file));
    expect(others).toHaveLength(INSTALLERS.length - 1);
  });

  it("offers no main button on phones", () => {
    expect(pickDownloads("mobile")).toEqual({ primary: null, others: [...INSTALLERS] });
  });

  it("links to the latest release's stable asset names", () => {
    expect(downloadUrl("Quest-Forge-macos.dmg")).toBe("https://github.com/tylermurry/quest-forge/releases/latest/download/Quest-Forge-macos.dmg");
  });
});
