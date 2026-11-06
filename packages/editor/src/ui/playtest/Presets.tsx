import { Bookmark, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { Playtest } from "../../model/playtest/playtest.ts";
import { Button } from "../components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../components/ui/dropdown-menu.tsx";
import { Input } from "../components/ui/input.tsx";

function usePresets(playtest: Playtest) {
  useSyncExternalStore(playtest.presets.subscribe, () => playtest.presets.version);
  return playtest.presets.list;
}

/** Toolbar menu: start from a saved preset (D126), playing or not. */
export function PresetMenu({ playtest }: { playtest: Playtest }) {
  const list = usePresets(playtest);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="gap-1 px-1.5 text-[12px]" aria-label="Start from preset">
          <Bookmark className="size-3.5" /> Presets
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[11px]">Start from preset</DropdownMenuLabel>
        {list.length === 0 && <p className="text-muted-foreground px-2 py-1 text-[12px]">No presets yet. Save one from the state panel while playing.</p>}
        {list.map((p) => (
          <DropdownMenuItem key={p.name} className="text-[13px]" onSelect={() => playtest.playPreset(p.name)}>
            {p.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** State panel section: save the current state under a name, start or delete saved ones. */
export function PresetSection({ playtest }: { playtest: Playtest }) {
  const list = usePresets(playtest);
  const [name, setName] = useState("");
  const save = () => {
    if (!name.trim()) return;
    void playtest.savePreset(name);
    setName("");
  };
  return (
    <section aria-label="Presets" className="px-2 py-1.5">
      <h3 className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">Presets</h3>
      <form
        className="mb-1 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input aria-label="Preset name" placeholder="e.g. Before cave" value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-[12px]" />
        <Button type="submit" size="xs" variant="outline" disabled={!name.trim()}>
          Save state
        </Button>
      </form>
      <ul>
        {list.map((p) => (
          <li key={p.name} className="flex items-center gap-1">
            <button className="hover:bg-muted min-w-0 flex-1 truncate rounded-sm px-1 py-0.5 text-left" title={`Start from "${p.name}"`} onClick={() => playtest.playPreset(p.name)}>
              {p.name}
            </button>
            <button aria-label={`Delete preset ${p.name}`} className="hover:bg-muted rounded-sm p-1" onClick={() => void playtest.presets.remove(p.name)}>
              <Trash2 className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
