import { useEffect, useRef } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';

type Props = {
  initialMarkdown: string;
  doc: Y.Doc | null;
  awareness: Awareness | null;
  readOnly: boolean;
  onChange: (markdown: string) => void;
  onError: (message: string) => void;
};

/** Milkdown's mature editor UI bound directly to this file's Yjs document. */
export default function MilkdownMarkdownEditor({ initialMarkdown, doc, awareness, readOnly, onChange, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!hostRef.current || !doc) return;
    let disposed = false;
    const editor = new Crepe({
      root: hostRef.current,
      defaultValue: initialMarkdown,
      features: {
        // This app has no image upload endpoint yet; avoid persisting unusable blob URLs.
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false,
      },
    });
    editorRef.current = editor;
    if (!readOnly) {
      editor.editor.use(collab);
      editor.on((listener) => listener.markdownUpdated((_ctx, markdown) => {
        if (!disposed) onChangeRef.current(markdown);
      }));
    }

    editor.create()
      .then(() => {
        if (disposed) return;
        editor.setReadonly(readOnly);
        // Viewers render the REST snapshot. Binding an empty Y.Doc would erase it.
        if (readOnly) return;
        editor.editor.action((ctx) => {
          const collaboration = ctx.get(collabServiceCtx);
          collaboration.bindDoc(doc);
          if (awareness) collaboration.setAwareness(awareness);
          collaboration.applyTemplate(initialMarkdown).connect();
        });
      })
      .catch((error) => {
        if (!disposed) onError(error instanceof Error ? error.message : 'Markdown 编辑器初始化失败');
      });

    return () => {
      disposed = true;
      editorRef.current = null;
      void editor.destroy();
    };
  // The file Y.Doc identity defines an editor session; markdown updates come through Yjs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  useEffect(() => { editorRef.current?.setReadonly(readOnly); }, [readOnly]);

  return <div ref={hostRef} className="milkdown-host" aria-label="Markdown 编辑器" />;
}
