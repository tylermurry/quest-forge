import { toast } from "sonner";
import type { Editor } from "../model/editor.ts";

/** Saves by hand. A successful save says so in a toast; a failure shows in the status. */
export async function saveNow(editor: Editor) {
  if (!editor.hasUnsavedChanges) return;
  await editor.flush();
  if (editor.status.state === "saved") toast.success("Saved");
}
