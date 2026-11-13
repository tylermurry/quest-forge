import type { Actions } from "../../model/actions.ts";
import { builtInFrameBytes } from "../../model/builtInFrame.ts";
import { STYLING_SECTIONS } from "../../model/gameSettings.ts";
import { isStylingSectionDefault, resetStylingSection, type ResettableSection } from "../../model/style.ts";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog.tsx";
import { Button } from "../components/ui/button.tsx";

/** What a reset changes, in the creator's words, for the confirmation. */
const GOES_BACK: Record<ResettableSection, string> = {
  frames: "The panel frame goes back to the built-in picture with its borders and scale, and narration goes back to its default position and width.",
  typography: "The font, text size and text color go back to the defaults.",
  characterDialogue: "The speaker name color, the choice hover effect and the separator color go back to the defaults.",
  iconBar: "The bar frame, the button pictures and the hover effect go back to the built-in look.",
};

/**
 * "Reset to Default" for one Styling section, at the right end of its heading row. Disabled while the section is
 * already at its defaults; otherwise asks first, then puts only that section back as one undoable step.
 */
export function ResetSection({ actions, section }: { actions: Actions; section: ResettableSection }) {
  const { editor } = actions;
  const title = STYLING_SECTIONS.find((s) => s.section === section)!.title;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={`Reset to Default (${title})`} disabled={isStylingSectionDefault(editor.project, section)} className="ml-auto h-7 px-2 text-[13px] font-normal">
          Reset to Default
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[15px]">Reset {title} to default?</AlertDialogTitle>
          <AlertDialogDescription>
            {GOES_BACK[section]} Your images and fonts stay in their libraries, and no other Styling section changes. You can undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" autoFocus>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction size="sm" onClick={() => editor.apply(`Reset ${title} to default`, (q) => resetStylingSection(q, section, builtInFrameBytes()))}>
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
