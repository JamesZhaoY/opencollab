import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useFileStore } from '@/stores/fileStore';
import { CollaborationManager } from '@/yjs/collab';
import { getAccessToken } from '@/services/sessionAuth';
import { createUniver } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import zhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import type { IRange, IWorkbookData } from '@univerjs/core';
import { LocaleType } from '@univerjs/core';
import CanvasEditor, {
  EditorMode,
  ListStyle,
  ListType,
  PageMode,
  TitleLevel,
  type IEditorData,
  type IEditorResult,
} from '@hufe921/canvas-editor';
import type { Comment, Permission as PermissionType } from '@/types';
import { authFetch } from '@/services/authFetch';
import { parseWorkbookSnapshot, workbookToPersistedSheets } from '@/utils/univerAdapter';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type UniverHandle = ReturnType<typeof createUniver>;
type CanvasEditorHandle = InstanceType<typeof CanvasEditor>;
type DisposableLike = { dispose: () => void };
type DocumentType = 'excel' | 'markdown' | 'word' | string;
type OnlineCollaborator = { id: number | string; name: string };
type DocxCommand = CanvasEditorHandle['command'] & {
  executeImportDocx?: (options: { arrayBuffer: ArrayBuffer }) => Promise<void> | void;
  executeExportDocx?: (options: { fileName: string }) => void;
};
type CanvasEditorPlugin = (editor: CanvasEditorHandle) => void;

function disposeUniverLater(handle: UniverHandle | null) {
  if (!handle) return;
  window.setTimeout(() => {
    try {
      handle.univer.dispose();
    } catch (err) {
      console.warn('Failed to dispose Univer:', err);
    }
  }, 0);
}

function rangeToCellRef(range: IRange | undefined): string | null {
  if (!range) return null;
  return `${columnToName(range.startColumn)}${range.startRow + 1}`;
}

function columnToName(index: number): string {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const rem = (value - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function getDocumentTypeLabel(type: DocumentType) {
  switch (type) {
    case 'word': return 'Word';
    case 'markdown': return 'Markdown';
    case 'excel': return 'Excel';
    default: return '文档';
  }
}

function getPermissionLabel(permission?: string | null) {
  switch (permission) {
    case 'owner': return '所有者';
    case 'edit': return '可编辑';
    case 'view': return '仅查看';
    default: return '未知权限';
  }
}

function textToCanvasEditorData(text: string): IEditorData {
  const normalized = text || '';
  const main = normalized
    .split('\n')
    .flatMap((line, index, lines) => {
      const elements = [...line].map((char) => ({ value: char }));
      if (index < lines.length - 1) elements.push({ value: '\n' });
      return elements;
    });
  return { main: main.length ? main : [{ value: '' }] };
}

function parseCanvasEditorData(raw: string | null | undefined): IEditorData {
  if (!raw) return textToCanvasEditorData('');
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed
      && typeof parsed === 'object'
      && 'data' in parsed
      && parsed.data
      && typeof parsed.data === 'object'
      && Array.isArray((parsed.data as IEditorData).main)
    ) {
      return parsed.data as IEditorData;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as IEditorData).main)) {
      return parsed as IEditorData;
    }
  } catch {
    // Existing Word files may still contain plain text from the old textarea editor.
  }
  return textToCanvasEditorData(raw);
}

function serializeCanvasEditorValue(value: IEditorResult): string {
  return JSON.stringify({
    schema: 'canvas-editor',
    version: value.version,
    data: value.data,
    options: value.options,
  });
}

function takePendingDocxImport(fileId: string | undefined): ArrayBuffer | null {
  if (!fileId) return null;
  const key = `pending_docx_import:${fileId}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw) as { buffer?: number[] };
    if (!Array.isArray(parsed.buffer)) return null;
    return new Uint8Array(parsed.buffer).buffer;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(text: string) {
  const segments = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={index}>{segment.slice(2, -2)}</strong>;
    }
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return <code key={index}>{segment.slice(1, -1)}</code>;
    }
    return <span key={index}>{segment}</span>;
  });
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  return line.includes('|') && parseTableCells(line).length >= 2;
}

function getTableAlignment(separator: string): 'left' | 'center' | 'right' {
  const cell = separator.trim();
  if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
  if (cell.endsWith(':')) return 'right';
  return 'left';
}

function isTableSeparator(line: string, expectedColumns: number): boolean {
  const cells = parseTableCells(line);
  return cells.length === expectedColumns
    && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function MarkdownPreview({ value }: { value: string }) {
  const lines = value.split('\n');
  const nodes = [];
  let codeLines: string[] = [];
  let inCode = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      if (inCode) {
        nodes.push(<pre key={`code-${index}`}><code>{codeLines.join('\n')}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      nodes.push(<div key={`space-${index}`} className="md-space" />);
      continue;
    }
    if (isTableRow(line) && isTableSeparator(lines[index + 1] || '', parseTableCells(line).length)) {
      const headers = parseTableCells(line);
      const alignments = parseTableCells(lines[index + 1]).map(getTableAlignment);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) {
        const cells = parseTableCells(lines[index]);
        if (cells.length !== headers.length) break;
        rows.push(cells);
        index++;
      }
      index--;
      nodes.push(
        <div key={`table-${index}`} className="markdown-table-wrap">
          <table className="markdown-table">
            <thead>
              <tr>
                {headers.map((header, columnIndex) => (
                  <th key={columnIndex} style={{ textAlign: alignments[columnIndex] }}>
                    {renderInlineMarkdown(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex} style={{ textAlign: alignments[columnIndex] }}>
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = renderInlineMarkdown(heading[2]);
      if (level === 1) nodes.push(<h1 key={index}>{content}</h1>);
      if (level === 2) nodes.push(<h2 key={index}>{content}</h2>);
      if (level === 3) nodes.push(<h3 key={index}>{content}</h3>);
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.*)$/);
    if (listItem) {
      nodes.push(<p key={index} className="md-list-item">• {renderInlineMarkdown(listItem[1])}</p>);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      nodes.push(<blockquote key={index}>{renderInlineMarkdown(quote[1])}</blockquote>);
      continue;
    }
    nodes.push(<p key={index}>{renderInlineMarkdown(line)}</p>);
  }

  if (inCode) {
    nodes.push(<pre key="code-tail"><code>{codeLines.join('\n')}</code></pre>);
  }

  return <div className="markdown-preview">{nodes.length ? nodes : <p className="doc-empty">暂无内容</p>}</div>;
}

export default function FileEditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.user);
  const downloadFile = useFileStore((s) => s.downloadFile);
  const selectedFile = useFileStore((s) => s.selectedFile);
  const setSelectedFile = useFileStore((s) => s.setSelectedFile);

  const univerContainerRef = useRef<HTMLDivElement | null>(null);
  const markdownTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const wordEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const collabRef = useRef<CollaborationManager | null>(null);
  const univerRef = useRef<UniverHandle | null>(null);
  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const workbookRef = useRef<{ save: () => IWorkbookData } | null>(null);
  const univerDisposablesRef = useRef<DisposableLike[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastDataRef = useRef<string>('');
  const documentTypeRef = useRef<DocumentType>('excel');
  const textContentRef = useRef('');
  const textYjsInitializedRef = useRef(false);
  const textYjsCleanupRef = useRef<(() => void) | null>(null);
  const canvasEditorCleanupRef = useRef<(() => void) | null>(null);
  const isApplyingRemoteWordRef = useRef(false);
  const isPublishingLocalWordRef = useRef(false);
  const canEditFileRef = useRef(false);
  const [isSynced, setIsSynced] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [editorLoading, setEditorLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedCellRef, setSelectedCellRef] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissions, setPermissions] = useState<PermissionType[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [collaborators, setCollaborators] = useState<Map<number | string, string>>(new Map());
  const [editorError, setEditorError] = useState<string | null>(null);
  const [wordPluginBusy, setWordPluginBusy] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [collaborationReadyVersion, setCollaborationReadyVersion] = useState(0);
  const [editorLoadedFileId, setEditorLoadedFileId] = useState<string | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs for mutable values accessed inside timers to avoid stale closures
  const fileIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const documentType: DocumentType = selectedFile?.document_type || 'excel';
  const isExcelFile = documentType === 'excel';
  const isMarkdownFile = documentType === 'markdown';
  const canManagePermissions = Boolean(selectedFile && currentUser?.id === selectedFile.owner_id);
  const canEditFile = selectedFile?.current_permission === 'owner' || selectedFile?.current_permission === 'edit';
  canEditFileRef.current = canEditFile;
  fileIdRef.current = fileId ?? null;
  tokenRef.current = getAccessToken() || token || null;
  documentTypeRef.current = documentType;

  // Clear save status indicator after a delay
  const clearSaveStatus = () => {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  };

  const scheduleSave = (nextText?: string) => {
    if (!canEditFileRef.current) return;
    const currentFileId = fileIdRef.current;
    const currentToken = tokenRef.current;
    const currentDocumentType = documentTypeRef.current;
    if (typeof nextText === 'string') {
      textContentRef.current = nextText;
    }
    if (!currentFileId || !currentToken) return;
    if (currentDocumentType === 'excel' && !workbookRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveStatus('saving');

      try {
        const payload = currentDocumentType === 'excel'
          ? workbookToPersistedSheets(workbookRef.current!.save())
          : textContentRef.current;
        const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (dataStr === lastDataRef.current) {
          setSaveStatus('idle');
          return;
        }

        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            const saveResponse = await authFetch(`/api/files/${currentFileId}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sheets: payload }),
            });
            if (!saveResponse.ok) {
              throw new Error(`Save failed with status ${saveResponse.status}`);
            }
            const savedFile = await saveResponse.json();
            if (currentDocumentType === 'excel') {
              const collab = collabRef.current;
              const clientId = collab?.getClientId();
              collab?.getMap('excel').set('snapshot', {
                data: payload,
                clientId,
                updatedAt: Date.now(),
              });
            }
            const savedData = typeof savedFile.sheet_data === 'string' ? savedFile.sheet_data : dataStr;
            lastDataRef.current = savedData;
            if (currentDocumentType === 'markdown') {
              setSelectedFile(savedFile);
            }
            setSaveStatus('saved');
            clearSaveStatus();
            return;
          } catch (err) {
            attempts++;
            if (attempts >= maxAttempts) throw err;
            await new Promise((r) => setTimeout(r, 500 * attempts));
          }
        }
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatus('error');
        clearSaveStatus();
      } finally {
        savingRef.current = false;
      }
    }, 800);
  };

  // Load file detail when fileId changes.
  useEffect(() => {
    if (!fileId) return;
    setEditorLoadedFileId(null);
    setEditorLoading(true);
    setEditorError(null);
    const loadFile = async () => {
      try {
        const resp = await authFetch(`/api/files/${fileId}`);
        if (resp.ok) {
          const data = await resp.json();
          setSelectedFile(data);
          setEditorLoadedFileId(fileId);
        }
      } catch { /* ignore */ }
    };
    loadFile();
  }, [fileId, token, setSelectedFile]);

  useEffect(() => {
    collabRef.current?.setCanPersist(canEditFile);
  }, [canEditFile, collaborationReadyVersion]);

  // Load comments when comment panel opens
  useEffect(() => {
    if (!showComments || !fileId || !token) return;
    let cancelled = false;
    setIsLoadingComments(true);
    authFetch(`/api/files/${fileId}/comments`)
      .then((r) => r.json())
      .then((data: Comment[]) => {
        if (!cancelled) {
          setComments(data);
          setIsLoadingComments(false);
        }
      })
      .catch(() => setIsLoadingComments(false));
    return () => { cancelled = true; };
  }, [showComments, fileId, token]);

  // Load permissions when permission modal opens
  useEffect(() => {
    if (!showPermissions || !fileId || !token) return;
    let cancelled = false;
    setIsLoadingPermissions(true);
    authFetch(`/api/files/${fileId}/permissions`)
      .then((r) => r.json())
      .then((data: PermissionType[]) => {
        if (!cancelled) {
          setPermissions(data);
          setIsLoadingPermissions(false);
        }
      })
      .catch(() => setIsLoadingPermissions(false));
    return () => { cancelled = true; };
  }, [showPermissions, fileId, token]);

  // Effect: setup collaboration presence.
  useEffect(() => {
    if (!fileId || !token) return;
    fileIdRef.current = fileId;
    const getCurrentToken = () => getAccessToken() || tokenRef.current;
    tokenRef.current = getAccessToken() || token;

    const collab = new CollaborationManager(parseInt(fileId), getCurrentToken);
    collabRef.current = collab;
    setCollaborationReadyVersion((version) => version + 1);

    collab.connect(
      (synced) => setIsSynced(synced),
      getCurrentToken,
      currentUser ? { id: currentUser.id, username: currentUser.username } : null,
    );

    // Wire up real-time collaborators from Yjs awareness
    const updateCollaborators = () => {
      try {
        const awareness = collab.getAwareness();
        const states = awareness.getStates();
        const map = new Map<number | string, string>();
        for (const [clientId, state] of states.entries()) {
          const record = state as Record<string, unknown>;
          const user = record.user as { id?: number; name?: string } | undefined;
          const username = user?.name || (record.username as string | undefined);
          const stableUserId = user?.id ?? (record.userId as number | string | undefined);
          if (username) {
            map.set(stableUserId ?? `client:${clientId}`, username);
          }
        }
        if (currentUser) {
          map.set(currentUser.id, currentUser.username);
        }
        setCollaborators(map);
      } catch { /* awareness not ready yet */ }
    };
    const awarenessUpdateHandler = () => updateCollaborators();
    try {
      collab.getAwareness().on('update', awarenessUpdateHandler);
      updateCollaborators();
    } catch { /* provider not ready */ }

    return () => {
      try { collab.getAwareness().off('update', awarenessUpdateHandler); } catch { /* */ }
      textYjsInitializedRef.current = false;
      textYjsCleanupRef.current?.();
      canvasEditorCleanupRef.current?.();
      collab.disconnect();
      collabRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveStatusTimerRef.current) {
        clearTimeout(saveStatusTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, token, currentUser?.id, currentUser?.username]);

  const onlineCollaborators: OnlineCollaborator[] = collaborators.size > 0
    ? Array.from(collaborators.entries()).map(([id, name]) => ({ id, name }))
    : [{ id: currentUser?.id || 'me', name: currentUser?.username || '我' }];

  useEffect(() => {
    if (!isExcelFile) return;
    const collab = collabRef.current;
    if (!collab) return;

    const excelMap = collab.getMap<{ data?: unknown; clientId?: number; updatedAt?: number }>('excel');
    const handleExcelUpdate = () => {
      const remoteSnapshot = excelMap.get('snapshot');
      if (!remoteSnapshot?.data) return;
      if (remoteSnapshot.clientId === collab.getClientId()) return;

      const dataStr = JSON.stringify(remoteSnapshot.data);
      if (dataStr === lastDataRef.current) return;
      lastDataRef.current = dataStr;
      if (selectedFile) setSelectedFile({ ...selectedFile, sheet_data: dataStr });
      setSaveStatus('saved');
      clearSaveStatus();
    };

    excelMap.observe(handleExcelUpdate);
    return () => excelMap.unobserve(handleExcelUpdate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExcelFile, fileId, collaborationReadyVersion, selectedFile]);

  useEffect(() => {
    if (!selectedFile || selectedFile.document_type === 'excel') return;
    const collab = collabRef.current;
    if (!collab) return;

    const content = selectedFile.sheet_data || '';
    const yText = collab.getText('content');

    if (!textYjsInitializedRef.current) {
      const yTextContent = yText.toString();
      if (canEditFileRef.current && yTextContent !== content) {
        yText.doc?.transact(() => {
          yText.delete(0, yText.length);
          if (content) yText.insert(0, content);
        });
      } else if (!canEditFileRef.current && yText.length === 0 && content) {
        textContentRef.current = content;
        setTextContent(content);
      }
      textYjsInitializedRef.current = true;
    }

    const syncFromYText = () => {
      const nextContent = yText.toString();
      textContentRef.current = nextContent;
      setTextContent(nextContent);
      if (selectedFile.document_type === 'word' && canvasEditorRef.current) {
        if (isPublishingLocalWordRef.current) {
          isPublishingLocalWordRef.current = false;
          return;
        }
        try {
          isApplyingRemoteWordRef.current = true;
          canvasEditorRef.current.command.executeSetValue(parseCanvasEditorData(nextContent), {
            isSetCursor: false,
          });
        } finally {
          window.setTimeout(() => {
            isApplyingRemoteWordRef.current = false;
          }, 0);
        }
      }
      if (canEditFileRef.current) scheduleSave(nextContent);
    };

    yText.observe(syncFromYText);
    textYjsCleanupRef.current = () => {
      yText.unobserve(syncFromYText);
      textYjsCleanupRef.current = null;
    };

    const currentContent = yText.toString() || content;
    textContentRef.current = currentContent;
    setTextContent(currentContent);

    return () => {
      textYjsCleanupRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedFile?.id,
    selectedFile?.document_type,
    selectedFile?.sheet_data,
    collaborationReadyVersion,
  ]);

  // Initialize Univer whenever the selected file is available.
  useEffect(() => {
    if (!selectedFile || !fileId) return;
    if (editorLoadedFileId !== fileId) return;

    const container = univerContainerRef.current;

    univerDisposablesRef.current.forEach((item) => item.dispose());
    univerDisposablesRef.current = [];
    disposeUniverLater(univerRef.current);
    univerRef.current = null;
    canvasEditorRef.current?.destroy();
    canvasEditorRef.current = null;
    canvasEditorCleanupRef.current?.();
    canvasEditorCleanupRef.current = null;
    workbookRef.current = null;

    initializedRef.current = true;
    setEditorLoading(true);
    setEditorError(null);

    if (selectedFile.document_type === 'markdown') {
      const content = selectedFile.sheet_data || '';
      textContentRef.current = content;
      lastDataRef.current = content;
      setTextContent(content);
      setSelectedCellRef(null);
      setEditorLoading(false);
      return;
    }

    if (selectedFile.document_type === 'word') {
      const wordContainer = wordEditorContainerRef.current;
      if (!wordContainer) return;
      const data = parseCanvasEditorData(selectedFile.sheet_data);
      const serialized = JSON.stringify({
        schema: 'canvas-editor',
        data,
      });
      textContentRef.current = serialized;
      lastDataRef.current = selectedFile.sheet_data || serialized;
      setTextContent(serialized);
      setSelectedCellRef(null);

      try {
        const editor = new CanvasEditor(wordContainer, data, {
          mode: canEditFile ? EditorMode.EDIT : EditorMode.READONLY,
          locale: 'zhCN',
          pageMode: PageMode.PAGING,
          defaultFont: 'SimSun',
          defaultSize: 16,
          width: 794,
          height: 1123,
          margins: [72, 72, 72, 72],
          pageGap: 16,
        });
        canvasEditorRef.current = editor;

        const handleContentChange = () => {
          if (!canEditFileRef.current) return;
          if (isApplyingRemoteWordRef.current) return;
          const nextValue = serializeCanvasEditorValue(editor.command.getValue());
          textContentRef.current = nextValue;
          setTextContent(nextValue);
          scheduleSave(nextValue);

          const collab = collabRef.current;
          if (collab && documentTypeRef.current === 'word') {
            const yText = collab.getText('content');
            if (yText.toString() !== nextValue) {
              isPublishingLocalWordRef.current = true;
              try {
                yText.doc?.transact(() => {
                  yText.delete(0, yText.length);
                  yText.insert(0, nextValue);
                });
              } finally {
                window.setTimeout(() => {
                  isPublishingLocalWordRef.current = false;
                }, 0);
              }
            }
          }
        };
        editor.eventBus.on('contentChange', handleContentChange);
        canvasEditorCleanupRef.current = () => {
          editor.eventBus.off('contentChange', handleContentChange);
          canvasEditorCleanupRef.current = null;
        };

        const pendingDocx = takePendingDocxImport(fileId);
        setWordPluginBusy(true);
        Promise.all([
          import('@hufe921/canvas-editor-plugin-docx'),
          import('@hufe921/canvas-editor-plugin-floating-toolbar'),
        ])
          .then(([docxModule, floatingToolbarModule]) => {
            editor.use(docxModule.default as CanvasEditorPlugin);
            editor.use(floatingToolbarModule.default as CanvasEditorPlugin);
            const command = editor.command as DocxCommand;
            if (!pendingDocx || !command.executeImportDocx) return null;
            return Promise.resolve(command.executeImportDocx({ arrayBuffer: pendingDocx }));
          })
            .then(() => {
              if (!pendingDocx) return;
              const nextValue = serializeCanvasEditorValue(editor.command.getValue());
              if (nextValue !== textContentRef.current) {
                textContentRef.current = nextValue;
                setTextContent(nextValue);
                scheduleSave(nextValue);
              }
            })
            .catch((err) => {
              console.error('Failed to load Word plugins:', err);
              setEditorError(pendingDocx ? 'Word 文件导入失败，请尝试重新上传' : 'Word 插件加载失败');
            })
            .finally(() => {
              setWordPluginBusy(false);
            });
      } catch (err) {
        console.error('Failed to initialize Canvas Editor:', err);
        setEditorError(err instanceof Error ? err.message : 'Word 编辑器初始化失败');
      } finally {
        setEditorLoading(false);
      }
      return;
    }

    if (!container) return;

    try {
      const snapshot = parseWorkbookSnapshot(
        selectedFile.sheet_data,
        selectedFile.name || 'Untitled',
        `file-${fileId}`,
      );
      lastDataRef.current = JSON.stringify(snapshot);

      const univerHandle = createUniver({
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: zhCN,
        },
        presets: [
          UniverSheetsCorePreset({
            container,
            header: true,
            toolbar: true,
            formulaBar: true,
            footer: { sheetBar: true, statisticBar: true, zoomSlider: true },
            statusBarStatistic: true,
          }),
        ],
      });
      const workbook = univerHandle.univerAPI.createWorkbook(snapshot);

      univerRef.current = univerHandle;
      workbookRef.current = workbook;

      const selectionChanged = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.SelectionChanged,
        (params) => {
          setSelectedCellRef(rangeToCellRef(params.selections[0]));
        },
      );
      const commandExecuted = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.CommandExecuted,
        () => {
          if (canEditFile) scheduleSave();
        },
      );
      univerDisposablesRef.current = [selectionChanged, commandExecuted];
    } catch (err) {
      console.error('Failed to initialize Univer:', err);
      setEditorError(err instanceof Error ? err.message : '编辑器初始化失败');
    } finally {
      setEditorLoading(false);
    }

    return () => {
      univerDisposablesRef.current.forEach((item) => item.dispose());
      univerDisposablesRef.current = [];
      workbookRef.current = null;
      canvasEditorCleanupRef.current?.();
      canvasEditorCleanupRef.current = null;
      canvasEditorRef.current?.destroy();
      canvasEditorRef.current = null;
      disposeUniverLater(univerRef.current);
      univerRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fileId,
    selectedFile?.id,
    selectedFile?.document_type,
    selectedFile?.sheet_data,
    editorLoadedFileId,
  ]);

  // Reset initialization on file change
  useEffect(() => {
    return () => { initializedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const handleDownload = () => {
    if (selectedFile) {
      if (documentType === 'word') {
        const command = canvasEditorRef.current?.command as DocxCommand | undefined;
        if (command?.executeExportDocx) {
          command.executeExportDocx({ fileName: selectedFile.name });
          return;
        }
      }
      downloadFile(selectedFile.id, selectedFile.name);
    }
  };

  const handleBack = () => {
    navigate('/files');
  };

  const handleTextChange = (value: string) => {
    if (!canEditFile) return;
    setTextContent(value);
    textContentRef.current = value;
    scheduleSave(value);

    const collab = collabRef.current;
    if (collab && documentTypeRef.current !== 'excel') {
      const yText = collab.getText('content');
      const currentValue = yText.toString();
      if (currentValue !== value) {
        yText.doc?.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, value);
        });
      }
      return;
    }
  };

  const applyTextCommand = (
    command: 'h1' | 'h2' | 'bold' | 'italic' | 'code' | 'quote' | 'list' | 'divider',
  ) => {
    if (!canEditFile) return;
    const textarea = markdownTextAreaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textContentRef.current;
    const selected = value.slice(start, end);
    const fallback = isMarkdownFile ? '文本' : '内容';
    const text = selected || fallback;
    const atLineStart = start === 0 || value[start - 1] === '\n';
    const linePrefix = atLineStart ? '' : '\n';

    let replacement = text;
    let selectionOffset = 0;
    switch (command) {
      case 'h1':
        replacement = `${linePrefix}# ${text}`;
        selectionOffset = linePrefix.length + 2;
        break;
      case 'h2':
        replacement = `${linePrefix}## ${text}`;
        selectionOffset = linePrefix.length + 3;
        break;
      case 'bold':
        replacement = `**${text}**`;
        selectionOffset = 2;
        break;
      case 'italic':
        replacement = `_${text}_`;
        selectionOffset = 1;
        break;
      case 'code':
        replacement = isMarkdownFile ? `\`${text}\`` : `「${text}」`;
        selectionOffset = 1;
        break;
      case 'quote':
        replacement = `${linePrefix}> ${text}`;
        selectionOffset = linePrefix.length + 2;
        break;
      case 'list':
        replacement = `${linePrefix}- ${text}`;
        selectionOffset = linePrefix.length + 2;
        break;
      case 'divider':
        replacement = `${linePrefix}\n---\n`;
        selectionOffset = replacement.length;
        break;
    }

    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    handleTextChange(nextValue);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextStart = selected ? start + replacement.length : start + selectionOffset;
      const nextEnd = selected ? nextStart : nextStart + text.length;
      textarea.setSelectionRange(nextStart, nextEnd);
    });
  };

  const applyCanvasEditorCommand = (
    command: 'h1' | 'h2' | 'bold' | 'italic' | 'underline' | 'quote' | 'list' | 'divider' | 'undo' | 'redo',
  ) => {
    if (!canEditFile) return;
    const editor = canvasEditorRef.current;
    if (!editor) return;

    switch (command) {
      case 'h1':
        editor.command.executeTitle(TitleLevel.FIRST);
        break;
      case 'h2':
        editor.command.executeTitle(TitleLevel.SECOND);
        break;
      case 'bold':
        editor.command.executeBold();
        break;
      case 'italic':
        editor.command.executeItalic();
        break;
      case 'underline':
        editor.command.executeUnderline();
        break;
      case 'quote':
        editor.command.executeRowMargin(18);
        break;
      case 'list':
        editor.command.executeList(ListType.UL, ListStyle.DISC);
        break;
      case 'divider':
        editor.command.executeSeparator([3, 1], { lineWidth: 1, color: '#cbd5e1' });
        break;
      case 'undo':
        editor.command.executeUndo();
        break;
      case 'redo':
        editor.command.executeRedo();
        break;
    }
    editor.command.executeFocus();
  };

  const renderDocumentToolbar = () => (
    <div className="document-toolbar" aria-label={`${getDocumentTypeLabel(documentType)} 工具栏`}>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn strong" onClick={() => applyTextCommand('h1')} disabled={!canEditFile}>
          H1
        </button>
        <button type="button" className="document-tool-btn strong" onClick={() => applyTextCommand('h2')} disabled={!canEditFile}>
          H2
        </button>
      </div>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn strong" onClick={() => applyTextCommand('bold')} disabled={!canEditFile}>
          B
        </button>
        <button type="button" className="document-tool-btn italic" onClick={() => applyTextCommand('italic')} disabled={!canEditFile}>
          I
        </button>
        <button type="button" className="document-tool-btn mono" onClick={() => applyTextCommand('code')} disabled={!canEditFile}>
          {'</>'}
        </button>
      </div>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn" onClick={() => applyTextCommand('quote')} disabled={!canEditFile}>
          引用
        </button>
        <button type="button" className="document-tool-btn" onClick={() => applyTextCommand('list')} disabled={!canEditFile}>
          列表
        </button>
        {isMarkdownFile && (
          <button type="button" className="document-tool-btn" onClick={() => applyTextCommand('divider')} disabled={!canEditFile}>
            分隔线
          </button>
        )}
      </div>
      <span className="document-toolbar-hint">
        {canEditFile ? '自动保存' : '仅查看'}
      </span>
    </div>
  );

  const renderWordToolbar = () => (
    <div className="document-toolbar" aria-label="Word 工具栏">
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn" onClick={() => applyCanvasEditorCommand('undo')} disabled={!canEditFile}>
          撤销
        </button>
        <button type="button" className="document-tool-btn" onClick={() => applyCanvasEditorCommand('redo')} disabled={!canEditFile}>
          重做
        </button>
      </div>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn strong" onClick={() => applyCanvasEditorCommand('h1')} disabled={!canEditFile}>
          H1
        </button>
        <button type="button" className="document-tool-btn strong" onClick={() => applyCanvasEditorCommand('h2')} disabled={!canEditFile}>
          H2
        </button>
      </div>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn strong" onClick={() => applyCanvasEditorCommand('bold')} disabled={!canEditFile}>
          B
        </button>
        <button type="button" className="document-tool-btn italic" onClick={() => applyCanvasEditorCommand('italic')} disabled={!canEditFile}>
          I
        </button>
        <button type="button" className="document-tool-btn underline" onClick={() => applyCanvasEditorCommand('underline')} disabled={!canEditFile}>
          U
        </button>
      </div>
      <div className="document-toolbar-group">
        <button type="button" className="document-tool-btn" onClick={() => applyCanvasEditorCommand('list')} disabled={!canEditFile}>
          列表
        </button>
        <button type="button" className="document-tool-btn" onClick={() => applyCanvasEditorCommand('divider')} disabled={!canEditFile}>
          分隔线
        </button>
      </div>
      <span className="document-toolbar-hint">
        {wordPluginBusy ? '正在导入 DOCX' : canEditFile ? 'DOCX 插件已启用，自动保存' : 'DOCX 插件已启用，仅查看'}
      </span>
    </div>
  );

  const handlePostComment = async () => {
    if (!commentText.trim() || !fileId || !token) return;
    try {
      const resp = await authFetch(`/api/files/${fileId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cell_ref: selectedCellRef || null,
          content: commentText.trim(),
        }),
      });
      if (resp.ok) {
        const newComment: Comment = await resp.json();
        setComments((prev) => [newComment, ...prev]);
        setCommentText('');
        setSelectedCellRef(null);
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  return (
    <>
      <div className="editor-page">
        {/* Toolbar */}
        <div className="editor-toolbar">
          <div className="toolbar-left">
            <button className="btn-back" onClick={handleBack} title="返回文件列表">←</button>
            <span className="file-title">{selectedFile?.name || 'Loading...'}</span>
            <span className={`doc-type-pill ${documentType}`}>{getDocumentTypeLabel(documentType)}</span>
            <span className={`permission-pill ${canEditFile ? 'editable' : 'readonly'}`}>
              {getPermissionLabel(selectedFile?.current_permission)}
            </span>
            <span className={`sync-status ${isSynced ? 'synced' : 'connecting'}`}>
              <span className="sync-dot"></span>
              {isSynced ? '已同步' : '连接中...'}
            </span>
            {/* Save status indicator */}
            {saveStatus !== 'idle' && (
              <span className={`save-status ${saveStatus}`}>
                {saveStatus === 'saving' && '保存中...'}
                {saveStatus === 'saved' && '已保存'}
                {saveStatus === 'error' && '保存失败'}
              </span>
            )}
          </div>
          <div className="toolbar-right">
            <div className="collaborators">
              <span className="online-label">
                {isSynced ? `在线 ${onlineCollaborators.length}` : '连接中'}
              </span>
              <div className="collab-avatar-group">
                {onlineCollaborators
                  .slice(0, 5)
                  .map((user, i) => (
                    <div key={user.id} className={`collab-avatar a${(i % 3) + 1}`} title={user.name}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
              </div>
            </div>
            <button className="btn-tb" onClick={handleDownload} disabled={wordPluginBusy}>
              {documentType === 'word' ? '导出 Word' : '下载'}
            </button>
            {canManagePermissions && (
              <button className="btn-tb" onClick={() => setShowPermissions(true)}>权限</button>
            )}
            <button
              className={`btn-tb ${showComments ? 'active' : ''}`}
              onClick={() => setShowComments(!showComments)}
            >
              评论
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="editor-body">
          <div className={`editor-main ${isExcelFile ? 'spreadsheet' : 'document-editor'}`}>
            {editorLoading && (
              <div className="editor-loading-overlay">
                <div className="editor-loader">
                  <span className="loader-mark" />
                  <span className="editor-loading-text">正在打开文件</span>
                  <span className="editor-loading-subtext">同步内容与协作状态</span>
                </div>
              </div>
            )}
            {editorError && (
              <div className="editor-loading-overlay">
                <span className="editor-loading-text">{editorError}</span>
              </div>
            )}
    {isExcelFile ? (
              <>
                <div id="univer-container" ref={univerContainerRef} />
                {!canEditFile && <div className="readonly-editor-shield" />}
              </>
            ) : isMarkdownFile ? (
              <div className="document-workspace">
                {renderDocumentToolbar()}
                <div className="markdown-workspace">
                <textarea
                  ref={markdownTextAreaRef}
                  className={`markdown-source ${!canEditFile ? 'readonly' : ''}`}
                  value={textContent}
                  onChange={(e) => handleTextChange(e.target.value)}
                  readOnly={!canEditFile}
                  spellCheck={false}
                  placeholder="# 标题&#10;&#10;开始编写 Markdown..."
                />
                <MarkdownPreview value={textContent} />
                </div>
              </div>
            ) : (
              <div className="document-workspace">
                {renderWordToolbar()}
                <div className="word-workspace">
                  <div ref={wordEditorContainerRef} className="canvas-editor-host" />
                </div>
              </div>
            )}
          </div>

          {/* Comment panel */}
          {showComments && (
            <div className="comment-panel" id="comment-panel">
              <div className="comment-panel-header">
                评论 <span className="count">{comments.length}</span>
              </div>
              <div className="comment-list">
                {isLoadingComments ? (
                  <p className="empty-comments">加载中...</p>
                ) : comments.length === 0 ? (
                  <p className="empty-comments">暂无评论</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="comment-item">
                      <div className="ci-top">
                        <span className="ci-user">用户 {c.user_id}</span>
                        <span className="ci-cell">{c.cell_ref || '全局'}</span>
                      </div>
                      <div className="ci-text">{c.content}</div>
                      <div className="ci-time">
                        {new Date(c.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="comment-input-area">
                {selectedCellRef && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    关联单元格: <strong>{selectedCellRef}</strong>
                    {' '}
                    <button
                      className="btn-tb"
                      style={{ fontSize: '10px', padding: '1px 6px' }}
                      onClick={() => setSelectedCellRef(null)}
                    >
                      取消
                    </button>
                  </div>
                )}
                <textarea
                  placeholder={selectedCellRef ? `在 ${selectedCellRef} 添加评论...` : '输入评论...'}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  readOnly={!canEditFile}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handlePostComment();
                    }
                  }}
                />
                <div className="ci-bottom">
                  <span className="ci-hint">Ctrl+Enter 发送</span>
                  <button
                    className="comment-submit"
                    disabled={!commentText.trim() || !canEditFile}
                    onClick={handlePostComment}
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Permission Modal */}
      {showPermissions && (
        <PermissionModal
          fileId={parseInt(fileId || '0')}
          token={token || ''}
          permissions={permissions}
          isLoading={isLoadingPermissions}
          onClose={() => setShowPermissions(false)}
          onRefresh={() => {
            if (!fileId || !token) return;
            authFetch(`/api/files/${fileId}/permissions`)
              .then((r) => r.json())
              .then((data: PermissionType[]) => setPermissions(data))
              .catch(() => {});
          }}
        />
      )}
    </>
  );
}

/* ===== Permission Modal Component ===== */

interface PermissionModalProps {
  fileId: number;
  token: string;
  permissions: PermissionType[];
  isLoading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

type UserSearchResult = { id: number; username: string; email: string };
type RevokeTarget = { userId: number; username: string; description: string } | null;

function PermissionModal({ fileId, token, permissions, isLoading, onClose, onRefresh }: PermissionModalProps) {
  const permissionLabel = (p: string) => {
    switch (p) {
      case 'view': return '仅查看';
      case 'edit': return '可编辑';
      default: return p;
    }
  };

  const permissionDescription = (p: string) => {
    switch (p) {
      case 'view': return '只能查看文件内容';
      case 'edit': return '可以编辑与评论';
      default: return '';
    }
  };

  const [permLevel, setPermLevel] = useState<'view' | 'edit'>('edit');
  const [error, setError] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const grantedUserIds = new Set(permissions.map((item) => item.user_id));

  const handleGrant = async () => {
    if (!selectedUser) {
      setError('请先搜索并选择一个协作用户');
      return;
    }
    try {
      const resp = await authFetch(`/api/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: selectedUser.id, permission: permLevel }),
      });
      if (resp.ok) {
        setSelectedUser(null);
        setSearchUser('');
        setSearchResults([]);
        setError('');
        onRefresh();
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.detail || '授予权限失败');
      }
    } catch {
      setError('网络错误，请重试');
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      const resp = await authFetch(`/api/files/${fileId}/permissions/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: revokeTarget.userId }),
      });
      if (resp.ok) {
        setRevokeTarget(null);
        onRefresh();
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.detail || '移除权限失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleSearchUser = async () => {
    if (!token) return;
    if (!searchUser.trim()) {
      setError('请输入用户名或邮箱关键词');
      return;
    }
    setError('');
    setIsSearching(true);
    setHasSearched(true);
    try {
      const resp = await authFetch(`/api/files/users/search?q=${encodeURIComponent(searchUser.trim())}`);
      if (resp.ok) {
        const data = await resp.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card permission-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>权限管理</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="permission-content">
          <div className="permission-section">
            <div className="permission-section-head">
              <div>
                <h4>添加协作用户</h4>
                <p>搜索用户后选择权限，即可共享当前文件。</p>
              </div>
            </div>

            <div className="permission-search-row">
              <input
                type="text"
                placeholder="搜索用户名或邮箱"
                value={searchUser}
                onChange={(e) => {
                  setSearchUser(e.target.value);
                  setError('');
                  if (selectedUser) setSelectedUser(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
              />
              <button
                className="btn-tb permission-search-btn"
                onClick={handleSearchUser}
                disabled={isSearching}
              >
                {isSearching ? '搜索中...' : '搜索'}
              </button>
            </div>

            {selectedUser ? (
              <div className="selected-user-card">
                <div className="user-avatar">{selectedUser.username.charAt(0).toUpperCase()}</div>
                <div className="user-summary">
                  <strong>{selectedUser.username}</strong>
                  <span>{selectedUser.email}</span>
                </div>
                <button
                  className="link-button"
                  onClick={() => {
                    setSelectedUser(null);
                    setSearchResults([]);
                  }}
                >
                  重新选择
                </button>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="permission-search-results">
                {searchResults.map((u) => {
                  const alreadyGranted = grantedUserIds.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className="user-result-item"
                      disabled={alreadyGranted}
                      onClick={() => {
                        setSelectedUser(u);
                        setSearchUser(u.username);
                        setError('');
                      }}
                    >
                      <span className="user-avatar">{u.username.charAt(0).toUpperCase()}</span>
                      <span className="user-summary">
                        <strong>{u.username}</strong>
                        <span>{u.email}</span>
                      </span>
                      <span className="user-result-action">{alreadyGranted ? '已添加' : '选择'}</span>
                    </button>
                  );
                })}
              </div>
            ) : hasSearched && !isSearching ? (
              <div className="permission-empty-state">未找到匹配用户</div>
            ) : null}

            <div className="permission-levels">
              {(['edit', 'view'] as const).map((level) => (
                <button
                  type="button"
                  key={level}
                  className={`permission-level ${permLevel === level ? 'active' : ''}`}
                  onClick={() => setPermLevel(level)}
                >
                  <strong>{permissionLabel(level)}</strong>
                  <span>{permissionDescription(level)}</span>
                </button>
              ))}
            </div>

            {error && <div className="form-error permission-error">{error}</div>}

            <button
              className="btn-submit permission-grant-btn"
              onClick={handleGrant}
              disabled={!selectedUser}
            >
              授予权限
            </button>
          </div>

          <div className="permission-section current-permissions">
            <div className="permission-section-head">
              <div>
                <h4>当前权限</h4>
                <p>{permissions.length} 位协作用户</p>
              </div>
            </div>
            {isLoading ? (
              <p className="permission-empty-state">加载中...</p>
            ) : permissions.length === 0 ? (
              <p className="permission-empty-state">暂无共享权限</p>
            ) : (
              <div className="permission-list">
                {permissions.map((p) => (
                  <div key={p.id} className="permission-item">
                    <span className="user-avatar">{(p.username || `用户${p.user_id}`).charAt(0).toUpperCase()}</span>
                    <span className="permission-user">
                      <strong>{p.username || `用户 ${p.user_id}`}</strong>
                      <span>{permissionDescription(p.permission)}</span>
                    </span>
                    <span className={`permission-badge ${p.permission}`}>{permissionLabel(p.permission)}</span>
                    <button
                      className="permission-remove-btn"
                      onClick={() => setRevokeTarget({
                        userId: p.user_id,
                        username: p.username || `用户 ${p.user_id}`,
                        description: permissionDescription(p.permission),
                      })}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer permission-footer">
          <button className="btn-cancel" onClick={onClose}>关闭</button>
        </div>

        </div>
      </div>

      {revokeTarget && (
        <div className="modal-overlay" onClick={() => !isRevoking && setRevokeTarget(null)}>
          <div className="modal-card revoke-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>移除协作权限</h3>
              <button className="modal-close" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>&times;</button>
            </div>
            <div className="revoke-confirm-body">
              <div className="delete-confirm-mark danger">!</div>
              <div>
                <p>移除后，该用户将不能继续访问当前文件。</p>
                <div className="delete-file-summary">
                  <span className="delete-file-name">{revokeTarget.username}</span>
                  <span className="delete-file-meta">{revokeTarget.description}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer permission-footer">
              <button className="btn-cancel" onClick={() => setRevokeTarget(null)} disabled={isRevoking}>
                取消
              </button>
              <button className="btn-submit danger" onClick={handleRevoke} disabled={isRevoking}>
                {isRevoking ? '处理中...' : '确认移除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
