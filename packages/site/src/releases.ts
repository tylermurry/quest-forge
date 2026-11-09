// The latest release's version, for the download section. Links don't depend on it.
import { useEffect, useState } from "react";
import { REPO } from "./download.ts";

export interface Release {
  version: string;
  date: Date;
}

export function useLatestRelease(): Release | null {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { signal: ctl.signal, headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tag_name?: string; published_at?: string } | null) => {
        if (data?.tag_name && data.published_at) setRelease({ version: data.tag_name.replace(/^v/, ""), date: new Date(data.published_at) });
      })
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  return release;
}
