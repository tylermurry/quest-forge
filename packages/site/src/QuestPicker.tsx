import { useRef, type ReactNode } from "react";
import { playQuestFile } from "./questFile.ts";

/** A button that opens the file dialog for a `.quest` and plays the pick. */
export function QuestPicker({ className, children }: { className?: string; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept=".quest"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) playQuestFile(file);
        }}
      />
    </>
  );
}
