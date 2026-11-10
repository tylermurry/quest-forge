// Which installer to offer. Pure, so it's tested in Node.

export type OS = "mac" | "windows" | "linux" | "mobile" | "unknown";
type DesktopOS = "mac" | "windows" | "linux";

export const REPO = "tylermurry/quest-forge";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

export interface Installer {
  os: DesktopOS;
  system: string;
  kind: string;
  /** Stable release asset name; the release workflow uploads under exactly these names. */
  file: string;
}

/** Ordered: each system's first entry is the one its main button offers. */
export const INSTALLERS: readonly Installer[] = [
  { os: "mac", system: "macOS", kind: "Disk image (.dmg) · Apple silicon and Intel", file: "Quest-Forge-macos.dmg" },
  { os: "windows", system: "Windows", kind: "Installer (.exe) · Windows 10 and 11", file: "Quest-Forge-windows-setup.exe" },
  { os: "windows", system: "Windows", kind: "MSI package (.msi)", file: "Quest-Forge-windows.msi" },
  { os: "linux", system: "Linux", kind: "AppImage · most distributions", file: "Quest-Forge-linux.AppImage" },
  { os: "linux", system: "Linux", kind: "Debian / Ubuntu (.deb)", file: "Quest-Forge-linux.deb" },
];

export const downloadUrl = (file: string) => `https://github.com/${REPO}/releases/latest/download/${file}`;

export interface UAData {
  platform?: string;
  mobile?: boolean;
}

/**
 * The visitor's system from the user agent (and User-Agent Client Hints where the
 * browser has them). iPadOS reports itself as a Mac, so a Mac with a touch screen
 * counts as mobile.
 */
export function detectOS(userAgent: string, uaData?: UAData, maxTouchPoints = 0): OS {
  if (uaData?.mobile) return "mobile";
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return "mobile";
  const platform = uaData?.platform?.toLowerCase() ?? "";
  if (platform === "macos" || /Macintosh|Mac OS X/.test(userAgent)) return maxTouchPoints > 1 ? "mobile" : "mac";
  if (platform === "windows" || /Windows/.test(userAgent)) return "windows";
  if (platform === "chrome os" || /CrOS/.test(userAgent)) return "unknown";
  if (platform === "linux" || /Linux|X11/.test(userAgent)) return "linux";
  return "unknown";
}

export interface DownloadChoice {
  /** The installer the main button offers; null on phones and unknown systems. */
  primary: Installer | null;
  /** Everything else, in INSTALLERS order. */
  others: Installer[];
}

export function pickDownloads(os: OS): DownloadChoice {
  const primary = INSTALLERS.find((i) => i.os === os) ?? null;
  return { primary, others: INSTALLERS.filter((i) => i !== primary) };
}

/** Detects from the running browser. */
export function currentOS(): OS {
  const nav = navigator as Navigator & { userAgentData?: UAData };
  return detectOS(nav.userAgent, nav.userAgentData, nav.maxTouchPoints);
}
