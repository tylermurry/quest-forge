import { useEffect, useMemo, type ReactNode } from "react";
import { currentOS, downloadUrl, pickDownloads, RELEASES_URL, REPO, type Installer } from "./download.ts";
import { Mark } from "./Mark.tsx";
import { QuestPicker } from "./QuestPicker.tsx";
import { useLatestRelease } from "./releases.ts";

export const GITHUB = `https://github.com/${REPO}`;

function Header() {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <a className="brand" href="/">
          <Mark />
          <span>Quest Forge</span>
        </a>
        <nav className="top-nav" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#download">Download</a>
          <a href={GITHUB}>GitHub</a>
        </nav>
        <QuestPicker className="btn btn-outline">Load Quest</QuestPicker>
      </div>
    </header>
  );
}

function Shot({ src, alt, wide }: { src: string; alt: string; wide?: boolean }) {
  return (
    <figure className={`shot${wide ? " shot-wide" : ""}`}>
      <img src={src} alt={alt} loading={wide ? "eager" : "lazy"} decoding="async" />
    </figure>
  );
}

function Feature({ n, title, children, shot, wide }: { n: string; title: string; children: ReactNode; shot: ReactNode; wide?: boolean }) {
  return (
    <section className={`feature${wide ? " feature-wide" : ""}`}>
      <div className="feature-text">
        <p className="feature-n">{n}</p>
        <h2>{title}</h2>
        {children}
      </div>
      {shot}
    </section>
  );
}

function DownloadButton({ installer, version }: { installer: Installer; version: string | undefined }) {
  return (
    <a className="btn btn-primary btn-big" href={downloadUrl(installer.file)}>
      Download for {installer.system}
      {version && <span className="btn-sub">Version {version}</span>}
    </a>
  );
}

function Download() {
  const choice = useMemo(() => pickDownloads(currentOS()), []);
  const release = useLatestRelease();
  const { primary, others } = choice;

  return (
    <section className="download" id="download">
      <div className="wrap download-inner">
        <div>
          <h2>Download Quest Forge</h2>
          <p className="lede">Free. For macOS, Windows and Linux.</p>
          {primary ? (
            <div className="download-main">
              <DownloadButton installer={primary} version={release?.version} />
              <p className="fine">{primary.kind}</p>
            </div>
          ) : (
            <p className="download-mobile">
              The editor runs on a desktop or laptop. Grab it there, or open a game you’ve been sent with <strong>Load Quest</strong>: games play right here on your phone.
            </p>
          )}
          {primary?.os === "mac" && (
            <p className="fine note">
              This early build isn’t notarized yet. The first time, right-click Quest Forge in Applications and choose Open, then Open again.
            </p>
          )}
          {primary?.os === "windows" && (
            <p className="fine note">
              This early build isn’t signed yet. If SmartScreen warns you, choose More info, then Run anyway.
            </p>
          )}
          <p className="fine note">
            No account, no tracking. <a href="/privacy">Privacy</a>
          </p>
        </div>
        <div className="download-list">
          <h3>{primary ? "Other systems" : "All downloads"}</h3>
          <ul>
            {others.map((i) => (
              <li key={i.file}>
                <a href={downloadUrl(i.file)}>
                  <span className="dl-system">{i.system}</span>
                  <span className="dl-kind">{i.kind}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="fine">
            {release ? `Version ${release.version}, released ${release.date.toLocaleDateString(undefined, { dateStyle: "medium" })}. ` : ""}
            <a href={RELEASES_URL}>Release notes and older versions</a>
          </p>
        </div>
      </div>
    </section>
  );
}

const SPECS: [string, string][] = [
  ["Verbs and inventory", "Walk, Look, Use, Talk and items on the icon bar. Use any item on anything."],
  ["Walking that works", "Draw the floor; characters find their way around props and scale with distance."],
  ["Layers and depth", "Props sort by their feet, so the hero walks behind the tree and in front of the fence."],
  ["Sprites and animation", "Slice a sheet into frames. Walk, talk and idle in four directions, looping props and one-off moments."],
  ["Deaths and Try again", "Kill the player off with a closing line. One click puts them back at the room’s door."],
  ["Score and saves", "Points for clever moves, ten save slots, and saves that survive the next version of your game."],
  ["Music and sound", "Music per room and effects on any action, with volume controls for the player."],
  ["Problems, caught early", "A Problems panel finds the missing item or the dead-end room before your players do."],
  ["Touch, too", "Every game plays on phones and tablets: big enough targets, no hover needed."],
];

const HOME_TITLE = "Quest Forge — make point-and-click adventures";

export function Home() {
  useEffect(() => {
    document.title = HOME_TITLE;
  }, []);
  const primary = useMemo(() => pickDownloads(currentOS()).primary, []);

  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="wrap">
            <h1>
              Make the kind of adventure game
              <br />
              you grew up with.
            </h1>
            <p className="lede hero-lede">
              Quest Forge is a desktop editor for point-and-click adventures in the classic style: a verb bar, a bag of odd items, a narrator with opinions, and the occasional untimely death. You draw the rooms and write what happens. Nobody writes code.
            </p>
            <div className="hero-actions">
              {primary ? (
                <a className="btn btn-primary" href="#download">
                  Download for {primary.system}
                </a>
              ) : (
                <a className="btn btn-primary" href="#download">
                  Download
                </a>
              )}
              <QuestPicker className="btn btn-outline">Play a .quest file</QuestPicker>
            </div>
          </div>
          <div className="wrap">
            <Shot wide src="/screenshots/scene-editor.webp" alt="The Quest Forge editor: the project browser, a garden scene with its layers, hotspots and walkable floor, and the pond hotspot open in the Inspector." />
          </div>
        </section>

        <div className="wrap" id="features">
          <Feature
            n="01"
            title="Paint the room. Then show where people can walk."
            shot={<Shot src="/screenshots/scene-walk.webp" alt="Editing the walkable floor of a scene, with a stand-in character and the path it would walk." />}
          >
            <p>
              Bring in a background from any paint program. Trace the floor with a few clicks, drop in props and foreground pieces, and mark the hotspots players can poke at. A stand-in character follows your mouse at the right size, and a line shows the path they’d take, so you see where they’ll get stuck before anyone else does.
            </p>
          </Feature>

          <Feature
            n="02"
            title="Rules that read like sentences."
            shot={<Shot src="/screenshots/rules.webp" alt="A rule card: when the player uses the fishing rod on the pond, narrate a line, give them a fish and award 5 points, once." />}
          >
            <p>
              Every reaction is a card you can read out loud: <em>Use the fishing rod on the pond, once: say “You dangle the string in the water,” give them a fish, award 5 points.</em> You pick each part from a menu, so there’s nothing to misspell and nothing to compile. For the simple stuff, type what Look says and you’re done.
            </p>
          </Feature>

          <Feature
            n="03"
            title="Conversations you can see."
            wide
            shot={<Shot src="/screenshots/dialogue.webp" alt="A dialogue graph: a greeting, a menu of choices with one shown only if the player has a coin, and a sale." />}
          >
            <p>
              Lay out talk as a map of lines and choices. Show an option only if the player has the coin, drop one once it’s been asked, and make a sale without leaving the chat. Start a playtest from any line to hear how it goes.
            </p>
          </Feature>

          <Feature
            n="04"
            title="Press Play. Break things on purpose."
            wide
            shot={<Shot src="/screenshots/playtest.webp" alt="A playtest running inside the editor, with the game state panel and the event log." />}
          >
            <p>
              The game runs inside the editor. Hand yourself an item, flip a switch, jump to the last room. The log says which rule ran and why the others didn’t, in plain words, and one click takes you to the card that needs fixing.
            </p>
          </Feature>

          <Feature
            n="05"
            title="One file. Any browser."
            shot={<Shot src="/screenshots/game.webp" alt="A finished Quest Forge game playing in a web browser." />}
          >
            <p>
              Build Game makes a single <code>.quest</code> file. Send it to anyone: they open it on this site and play, on a laptop or a phone, with saves, music and a score. Nothing to install and nothing uploaded.
            </p>
            <QuestPicker className="btn btn-outline">Load Quest</QuestPicker>
          </Feature>
        </div>

        <section className="specs">
          <div className="wrap">
            <h2>What’s in the box</h2>
            <dl className="spec-list">
              {SPECS.map(([term, text]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <Download />
      </main>

      <Footer />
    </>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <span className="brand brand-small">
          <Mark size={16} />
          Quest Forge
        </span>
        <nav aria-label="Links">
          <a href={GITHUB}>Source</a>
          <a href={RELEASES_URL}>Releases</a>
          <a href={`${GITHUB}/issues`}>Report a problem</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </div>
      <p className="wrap foot-note">
        Quest Forge is free software under the{" "}
        <a href={`${GITHUB}/blob/main/LICENSE`}>GPL-3.0-or-later licence</a>. Games you make with it are
        yours: a built .quest file is your own content, not a derivative of the editor.
      </p>
    </footer>
  );
}
