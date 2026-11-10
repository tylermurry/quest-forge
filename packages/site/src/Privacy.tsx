// /privacy: what the editor, the site and the player collect. Keep it in step with the code:
// when a network call or a stored value is added or removed, this page changes in the same commit.
import { useEffect } from "react";
import { Footer, GITHUB } from "./Home.tsx";
import { Mark } from "./Mark.tsx";

const UPDATED = "2026-11-09";

export function Privacy() {
  useEffect(() => {
    document.title = "Privacy — Quest Forge";
  }, []);

  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <a className="brand" href="/">
            <Mark />
            <span>Quest Forge</span>
          </a>
        </div>
      </header>
      <main className="wrap prose">
        <h1>Privacy</h1>
        <p className="fine">Last updated {UPDATED}</p>
        <p>
          Quest Forge has no accounts, no analytics and no tracking. We don’t run a server that stores anything about you. Quest Forge sets no cookies.
          The rest of this page says what happens in each place, including the few network requests involved.
        </p>

        <h2>The editor</h2>
        <p>
          The editor works on files on your computer and sends nothing anywhere. It has no telemetry and no update check. It remembers the list of recent projects, the window size and position, and the panel sizes on your computer, and none of it leaves your computer. To get a newer version, download it from this site.
        </p>

        <h2>The website</h2>
        <p>
          This website has no accounts, no analytics and no advertising, and it sets no cookies. The fonts are part of the site, not loaded from another company. The home page asks GitHub for the latest version number (see GitHub, below).
        </p>

        <h2>Playing games in your browser (/play)</h2>
        <p>
          When you open a <code>.quest</code> file, your browser reads it on your device. The file is never uploaded, and its pictures and sounds are not fetched from anywhere else.
        </p>
        <p>
          A game’s saved games and volume settings are kept in your browser’s local storage on your device, under names that start with <code>questforge/</code>. Quest Forge doesn’t see them. Clearing this site’s data in your browser deletes them.
        </p>

        <h2>Hosting (Cloudflare)</h2>
        <p>
          Cloudflare hosts this website. Like most hosts, it keeps standard request logs, such as your IP address, the page requested and your browser. That is under{" "}
          <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare’s privacy policy</a>, and Quest Forge doesn’t add anything to it.
        </p>

        <h2>GitHub (release check and downloads)</h2>
        <p>
          When the home page loads, your browser asks GitHub for the latest release, so the page can show the version number. GitHub sees your IP address and browser, as with any request. Downloads of the editor also come from GitHub. Both are under{" "}
          <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">GitHub’s privacy statement</a>.
        </p>

        <h2>Contact and changes</h2>
        <p>
          Questions or concerns: <a href={`${GITHUB}/issues`}>open an issue on GitHub</a>. If this page changes, the date at the top changes with it.
        </p>
      </main>
      <Footer />
    </>
  );
}
