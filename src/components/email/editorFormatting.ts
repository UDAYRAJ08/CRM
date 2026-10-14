import { useCallback, useEffect, useState, RefObject } from 'react';

export interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  list: boolean;
}

const INACTIVE: EditorFormatState = { bold: false, italic: false, underline: false, list: false };

/**
 * Tracks which inline formats (bold / italic / underline / bullet list) are active
 * at the caret or selection inside a contentEditable editor, so toolbar buttons can
 * show an on/off state. Call `refresh()` after running a format command.
 */
export function useEditorFormatState(editorRef: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<EditorFormatState>(INACTIVE);

  const refresh = useCallback(() => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
      setState((prev) => (prev === INACTIVE ? prev : INACTIVE));
      return;
    }
    const next: EditorFormatState = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      list: document.queryCommandState('insertUnorderedList'),
    };
    setState((prev) =>
      prev.bold === next.bold && prev.italic === next.italic &&
      prev.underline === next.underline && prev.list === next.list
        ? prev
        : next
    );
  }, [editorRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, [refresh]);

  return { formatState: state, refreshFormatState: refresh };
}

/** Class names for a toolbar toggle button; `active` shows the ON state. */
export const toolbarToggleClass = (active: boolean) =>
  `p-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
    active
      ? 'toolbar-toggle-on bg-indigo-100 text-indigo-700 border-indigo-400 shadow-sm'
      : 'border-transparent text-slate-600 hover:bg-white hover:shadow-sm'
  }`;
