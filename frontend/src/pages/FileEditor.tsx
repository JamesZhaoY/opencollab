import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import type * as Y from 'yjs';
import CanvasEditor, {
  EditorMode,
  ListStyle,
  ListType,
  PageMode,
  TitleLevel,
  type IEditorData,
  type IEditorResult,
} from '@hufe921/canvas-editor';
import type { Comment, FileVersion, Permission as PermissionType } from '@/types';
import { authFetch } from '@/services/authFetch';
import { aiContext } from '@/services/aiContext';
import { parseWorkbookSnapshot, workbookToPersistedSheets } from '@/utils/univerAdapter';
import { applyTheme, getStoredTheme, resolveTheme, toggleTheme, type ThemeMode } from '@/utils/theme';

const MilkdownMarkdownEditor = lazy(() => import('@/components/MilkdownMarkdownEditor'));

function formatShanghaiDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(date);
}

function getVersionRemark(remark: string | null) {
  if (!remark || remark.trim().toLowerCase() === 'save') return '手动保存';
  return remark;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type UniverHandle = ReturnType<typeof createUniver>;
type CanvasEditorHandle = InstanceType<typeof CanvasEditor>;
type DisposableLike = { dispose: () => void };
type DocumentType = 'excel' | 'markdown' | 'word' | string;
type OnlineCollaborator = { id: number | string; name: string };
type ExcelCellLock = {
  clientId: number;
  username: string;
  sheetId: string;
  row: number;
  column: number;
};
type ExcelLockTarget = Omit<ExcelCellLock, 'clientId' | 'username'>;
type ExcelCellPatch = {
  sheetId: string;
  row: number;
  column: number;
  value: unknown | null;
};
type ExcelPatch = {
  changes: ExcelCellPatch[];
  dimensions: Array<{ sheetId: string; rowCount?: number; columnCount?: number }>;
};
type DocxCommand = CanvasEditorHandle['command'] & {
  executeImportDocx?: (options: { arrayBuffer: ArrayBuffer }) => Promise<void> | void;
  executeExportDocx?: (options: { fileName: string }) => void;
};
type CanvasEditorPlugin = (editor: CanvasEditorHandle) => void;

function disposeUniver(handle: UniverHandle | null) {
  if (!handle) return;
  try {
    handle.univer.dispose();
  } catch (err) {
    console.warn('Failed to dispose Univer:', err);
  }
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

/** Build a compact change set; workbook snapshots are only used for persistence. */
function buildExcelPatch(previous: IWorkbookData, next: IWorkbookData): ExcelPatch | null {
  if (
    previous.sheetOrder.length !== next.sheetOrder.length
    || previous.sheetOrder.some((sheetId, index) => sheetId !== next.sheetOrder[index])
  ) return null;

  const changes: ExcelCellPatch[] = [];
  const dimensions: ExcelPatch['dimensions'] = [];
  for (const sheetId of next.sheetOrder) {
    const previousSheet = previous.sheets[sheetId];
    const nextSheet = next.sheets[sheetId];
    if (!previousSheet || !nextSheet) return null;
    dimensions.push({ sheetId, rowCount: nextSheet.rowCount, columnCount: nextSheet.columnCount });

    const previousCells = previousSheet.cellData || {};
    const nextCells = nextSheet.cellData || {};
    const coordinates = new Set<string>();
    for (const [row, columns] of Object.entries(previousCells)) {
      for (const column of Object.keys(columns || {})) coordinates.add(`${row}:${column}`);
    }
    for (const [row, columns] of Object.entries(nextCells)) {
      for (const column of Object.keys(columns || {})) coordinates.add(`${row}:${column}`);
    }
    for (const coordinate of coordinates) {
      const [rowText, columnText] = coordinate.split(':');
      const row = Number(rowText);
      const column = Number(columnText);
      const previousCell = previousCells[row]?.[column];
      const nextCell = nextCells[row]?.[column];
      if (JSON.stringify(previousCell) !== JSON.stringify(nextCell)) {
        changes.push({ sheetId, row, column, value: nextCell || null });
      }
    }
  }
  return { changes, dimensions };
}

/** Apply only the changed range so each Word keystroke stays a small Yjs update. */
function replaceYTextContent(yText: Y.Text, nextValue: string) {
  const currentValue = yText.toString();
  if (currentValue === nextValue) return;

  let start = 0;
  const commonLength = Math.min(currentValue.length, nextValue.length);
  while (start < commonLength && currentValue.charCodeAt(start) === nextValue.charCodeAt(start)) {
    start++;
  }

  let currentEnd = currentValue.length;
  let nextEnd = nextValue.length;
  while (
    currentEnd > start
    && nextEnd > start
    && currentValue.charCodeAt(currentEnd - 1) === nextValue.charCodeAt(nextEnd - 1)
  ) {
    currentEnd--;
    nextEnd--;
  }

  yText.doc?.transact(() => {
    if (currentEnd > start) yText.delete(start, currentEnd - start);
    if (nextEnd > start) yText.insert(start, nextValue.slice(start, nextEnd));
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

export default function FileEditorPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.user);
  const downloadFile = useFileStore((s) => s.downloadFile);
  const selectedFile = useFileStore((s) => s.selectedFile);
  const setSelectedFile = useFileStore((s) => s.setSelectedFile);

  const univerContainerRef = useRef<HTMLDivElement | null>(null);
  const wordEditorContainerRef = useRef<HTMLDivElement | null>(null);
  const collabRef = useRef<CollaborationManager | null>(null);
  const univerRef = useRef<UniverHandle | null>(null);
  const canvasEditorRef = useRef<CanvasEditorHandle | null>(null);
  const workbookRef = useRef<{ save: () => IWorkbookData } | null>(null);
  const univerDisposablesRef = useRef<DisposableLike[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excelSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastDataRef = useRef<string>('');
  const lastExcelSnapshotRef = useRef<IWorkbookData | null>(null);
  const localExcelLockRef = useRef<ExcelLockTarget | null>(null);
  const localExcelLockGrantedRef = useRef(false);
  const excelLockRenewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRemoteExcelSnapshotRef = useRef<IWorkbookData | null>(null);
  const isApplyingRemoteExcelRef = useRef(false);
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
  const [commentLoadError, setCommentLoadError] = useState('');
  const [selectedCellRef, setSelectedCellRef] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [theme, setTheme] = useState<ThemeMode>(() => resolveTheme(getStoredTheme()));
  const [downloadHint, setDownloadHint] = useState('');
  useEffect(() => { applyTheme(theme); }, [theme]);

  const [showPermissions, setShowPermissions] = useState(false);
  const [permissions, setPermissions] = useState<PermissionType[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<number | null>(null);
  const [versionPendingRestore, setVersionPendingRestore] = useState<FileVersion | null>(null);
  const [collaborators, setCollaborators] = useState<Map<number | string, string>>(new Map());
  const [excelLocks, setExcelLocks] = useState<ExcelCellLock[]>([]);
  const [excelLockHint, setExcelLockHint] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [wordPluginBusy, setWordPluginBusy] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [markdownEditorSession, setMarkdownEditorSession] = useState(0);

  // Publish the current editor content as the AI assistant context.
  useEffect(() => {
    aiContext.current = textContentRef.current || '';
  }, [textContent]);
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

  const persistFile = async (createVersion = false) => {
    if (!canEditFileRef.current) return;
    const currentFileId = fileIdRef.current;
    const currentToken = tokenRef.current;
    const currentDocumentType = documentTypeRef.current;
    if (!currentFileId || !currentToken) return;
    if (currentDocumentType === 'excel' && !workbookRef.current) return;
    if (savingRef.current) return;

    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const payload = currentDocumentType === 'excel'
        ? workbookToPersistedSheets(workbookRef.current!.save())
        : textContentRef.current;
      const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (!createVersion && dataStr === lastDataRef.current) {
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
            body: JSON.stringify({ sheets: payload, create_version: createVersion }),
          });
          if (!saveResponse.ok) throw new Error('保存失败');
          const savedFile = await saveResponse.json();
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
          await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
        }
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      clearSaveStatus();
    } finally {
      savingRef.current = false;
    }
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

    saveTimerRef.current = setTimeout(() => {
      if (savingRef.current) {
        scheduleSave();
        return;
      }
      void persistFile();
    }, 800);
  };

  const publishExcelSnapshot = () => {
    if (!canEditFileRef.current || !workbookRef.current) return;
    if (excelSyncTimerRef.current) clearTimeout(excelSyncTimerRef.current);
    excelSyncTimerRef.current = setTimeout(() => {
      const collab = collabRef.current;
      const workbook = workbookRef.current;
      if (!collab || !workbook || documentTypeRef.current !== 'excel') return;
      const data = workbookToPersistedSheets(workbook.save());
      const previous = lastExcelSnapshotRef.current;
      if (!previous) {
        lastExcelSnapshotRef.current = data;
        return;
      }
      const patch = buildExcelPatch(previous, data);
      if (!patch) {
        lastExcelSnapshotRef.current = data;
        collab.getMap('excel').set('snapshot', {
          data,
          clientId: collab.getClientId(),
          updatedAt: Date.now(),
        });
        return;
      }
      lastExcelSnapshotRef.current = data;
      if (patch.changes.length === 0) return;
      collab.getMap('excel').set('patch', {
        patch,
        clientId: collab.getClientId(),
        updatedAt: Date.now(),
      });
    }, 250);
  };

  const getRemoteExcelLock = (sheetId: string, row: number, column: number) => {
    const collab = collabRef.current;
    if (!collab) return null;
    try {
      const ownClientId = collab.getClientId();
      for (const [clientId, state] of collab.getAwareness().getStates()) {
        if (clientId === ownClientId) continue;
        const record = state as Record<string, unknown>;
        const lock = record.excelLock as Partial<ExcelCellLock> | undefined;
        if (lock?.sheetId === sheetId && lock.row === row && lock.column === column) {
          const user = record.user as { name?: string } | undefined;
          return user?.name || (record.username as string | undefined) || '其他用户';
        }
      }
    } catch { /* awareness is still connecting */ }
    return null;
  };

  const setLocalExcelLock = (lock: Omit<ExcelCellLock, 'clientId' | 'username'> | null) => {
    try {
      collabRef.current?.getAwareness().setLocalStateField('excelLock', lock);
    } catch { /* awareness is still connecting */ }
  };

  const sameExcelLock = (left: ExcelLockTarget | null, right: ExcelLockTarget) => Boolean(
    left && left.sheetId === right.sheetId && left.row === right.row && left.column === right.column,
  );

  const releaseExcelLock = () => {
    const lock = localExcelLockRef.current;
    if (!lock) return;
    localExcelLockRef.current = null;
    localExcelLockGrantedRef.current = false;
    if (excelLockRenewTimerRef.current) {
      clearTimeout(excelLockRenewTimerRef.current);
      excelLockRenewTimerRef.current = null;
    }
    setLocalExcelLock(null);
    const currentFileId = fileIdRef.current;
    if (!currentFileId) return;
    void authFetch(`/api/files/${currentFileId}/excel-locks/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lock),
    });
  };

  const acquireExcelLock = (lock: ExcelLockTarget) => {
    if (sameExcelLock(localExcelLockRef.current, lock)) return;
    releaseExcelLock();
    localExcelLockRef.current = lock;
    localExcelLockGrantedRef.current = false;
    const currentFileId = fileIdRef.current;
    if (!currentFileId) return;

    void authFetch(`/api/files/${currentFileId}/excel-locks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lock),
    }).then(async (response) => {
      if (!response.ok) throw new Error('锁定请求失败');
      return response.json() as Promise<{ acquired: boolean; ownerUsername?: string }>;
    }).then((result) => {
      if (!sameExcelLock(localExcelLockRef.current, lock)) {
        if (result.acquired) {
          void authFetch(`/api/files/${currentFileId}/excel-locks/release`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lock),
          });
        }
        return;
      }
      if (!result.acquired) {
        localExcelLockRef.current = null;
        setExcelLockHint(`${result.ownerUsername || '其他用户'}正在编辑 ${columnToName(lock.column)}${lock.row + 1}`);
        window.setTimeout(() => setExcelLockHint(''), 3000);
        return;
      }
      localExcelLockGrantedRef.current = true;
      setLocalExcelLock(lock);
      const renew = () => {
        if (!sameExcelLock(localExcelLockRef.current, lock)) return;
        void authFetch(`/api/files/${currentFileId}/excel-locks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lock),
        }).then((response) => response.ok ? response.json() as Promise<{ acquired: boolean }> : { acquired: false })
          .then((renewed) => {
            if (!renewed.acquired && sameExcelLock(localExcelLockRef.current, lock)) {
              releaseExcelLock();
              return;
            }
            if (sameExcelLock(localExcelLockRef.current, lock)) {
              excelLockRenewTimerRef.current = setTimeout(renew, 20_000);
            }
          });
      };
      excelLockRenewTimerRef.current = setTimeout(renew, 20_000);
    }).catch(() => {
      if (sameExcelLock(localExcelLockRef.current, lock)) {
        localExcelLockRef.current = null;
        setExcelLockHint('无法确认单元格锁定，请稍后重试');
      }
    });
  };

  const applyRemoteExcelSnapshot = (snapshot: IWorkbookData) => {
    const univerAPI = univerRef.current?.univerAPI;
    const currentWorkbook = workbookRef.current?.save();
    const workbook = univerAPI?.getActiveWorkbook();
    if (!univerAPI || !currentWorkbook || !workbook) return false;

    isApplyingRemoteExcelRef.current = true;
    try {
      const expectedSheetIds = new Set(snapshot.sheetOrder);
      const currentSheetIds = new Set(currentWorkbook.sheetOrder);
      // Structural changes operate on individual sheets, preserving the mounted
      // Univer instance and everything outside the changed sheet.
      for (const sheetId of snapshot.sheetOrder) {
        if (currentSheetIds.has(sheetId)) continue;
        const sheet = snapshot.sheets[sheetId];
        if (!sheet) return false;
        workbook.create(
          sheet.name || `Sheet${workbook.getSheets().length + 1}`,
          sheet.rowCount || 100,
          sheet.columnCount || 26,
          { index: snapshot.sheetOrder.indexOf(sheetId), sheet },
        );
      }
      for (const worksheet of workbook.getSheets()) {
        if (!expectedSheetIds.has(worksheet.getSheetId())) {
          workbook.deleteSheet(worksheet);
        }
      }

      for (const sheetId of snapshot.sheetOrder) {
        const worksheet = workbook.getSheets().find((sheet) => sheet.getSheetId() === sheetId);
        const previousSheet = currentWorkbook.sheets[sheetId] || {};
        const nextSheet = snapshot.sheets[sheetId];
        if (!worksheet || !nextSheet) return false;

        if (nextSheet.name && worksheet.getSheetName() !== nextSheet.name) {
          worksheet.setName(nextSheet.name);
        }

        if (nextSheet.rowCount && nextSheet.rowCount !== previousSheet.rowCount) {
          worksheet.setRowCount(nextSheet.rowCount);
        }
        if (nextSheet.columnCount && nextSheet.columnCount !== previousSheet.columnCount) {
          worksheet.setColumnCount(nextSheet.columnCount);
        }

        const previousCells = previousSheet.cellData || {};
        const nextCells = nextSheet.cellData || {};
        const coordinates = new Set<string>();
        for (const [row, columns] of Object.entries(previousCells)) {
          for (const column of Object.keys(columns || {})) coordinates.add(`${row}:${column}`);
        }
        for (const [row, columns] of Object.entries(nextCells)) {
          for (const column of Object.keys(columns || {})) coordinates.add(`${row}:${column}`);
        }

        for (const coordinate of coordinates) {
          const [rowText, columnText] = coordinate.split(':');
          const row = Number(rowText);
          const column = Number(columnText);
          const previousCell = previousCells[row]?.[column];
          const nextCell = nextCells[row]?.[column];
          if (JSON.stringify(previousCell) === JSON.stringify(nextCell)) continue;
          worksheet.getRange(row, column, 1, 1).setValues([[nextCell || null]]);
        }
      }
      return true;
    } finally {
      window.setTimeout(() => {
        isApplyingRemoteExcelRef.current = false;
      }, 0);
    }
  };

  const applyRemoteExcelPatch = (patch: ExcelPatch) => {
    const workbook = univerRef.current?.univerAPI.getActiveWorkbook();
    if (!workbook) return false;

    isApplyingRemoteExcelRef.current = true;
    try {
      for (const dimension of patch.dimensions) {
        const worksheet = workbook.getSheets().find((sheet) => sheet.getSheetId() === dimension.sheetId);
        if (!worksheet) return false;
        const currentSheet = lastExcelSnapshotRef.current?.sheets[dimension.sheetId];
        if (dimension.rowCount && dimension.rowCount !== currentSheet?.rowCount) {
          worksheet.setRowCount(dimension.rowCount);
        }
        if (dimension.columnCount && dimension.columnCount !== currentSheet?.columnCount) {
          worksheet.setColumnCount(dimension.columnCount);
        }
      }
      for (const change of patch.changes) {
        const worksheet = workbook.getSheets().find((sheet) => sheet.getSheetId() === change.sheetId);
        if (!worksheet) return false;
        worksheet.getRange(change.row, change.column, 1, 1).setValues([[change.value as never]]);
      }
      const snapshot = workbookToPersistedSheets(workbookRef.current!.save());
      lastExcelSnapshotRef.current = snapshot;
      lastDataRef.current = JSON.stringify(snapshot);
      return true;
    } finally {
      window.setTimeout(() => {
        isApplyingRemoteExcelRef.current = false;
      }, 0);
    }
  };

  const handleCreateVersion = () => {
    if (!canEditFile || savingRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persistFile(true);
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
          setMarkdownEditorSession((session) => session + 1);
          setEditorLoadedFileId(fileId);
        }
      } catch { /* ignore */ }
    };
    loadFile();
  }, [fileId, token, setSelectedFile]);

  // Load comments when comment panel opens
  useEffect(() => {
    if (!showComments || !fileId || !token) return;
    let cancelled = false;
    setIsLoadingComments(true);
    setCommentLoadError('');
    authFetch(`/api/files/${fileId}/comments`)
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || '加载评论失败');
        }
        return response.json();
      })
      .then((data: Comment[]) => {
        if (!cancelled) {
          setComments(data);
          setIsLoadingComments(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCommentLoadError(error instanceof Error ? error.message : '加载评论失败，请稍后重试');
          setIsLoadingComments(false);
        }
      });
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

  // Load history snapshots when the version dialog opens.
  useEffect(() => {
    if (!showVersionHistory || !fileId || !token) return;
    let cancelled = false;
    setIsLoadingVersions(true);
    authFetch(`/api/files/${fileId}/versions`)
      .then((response) => {
        if (!response.ok) throw new Error('加载历史版本失败');
        return response.json();
      })
      .then((data: FileVersion[]) => {
        if (!cancelled) setVersions(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error('加载历史版本失败:', error);
        if (!cancelled) setVersions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVersions(false);
      });
    return () => { cancelled = true; };
  }, [showVersionHistory, fileId, token]);

  // Effect: setup collaboration presence.
  useEffect(() => {
    if (!fileId || !token) return;
    fileIdRef.current = fileId;
    const getCurrentToken = () => getAccessToken() || tokenRef.current;
    tokenRef.current = getAccessToken() || token;

    const collab = new CollaborationManager(parseInt(fileId));
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
        const locks: ExcelCellLock[] = [];
        for (const [clientId, state] of states.entries()) {
          const record = state as Record<string, unknown>;
          const user = record.user as { id?: number; name?: string } | undefined;
          const username = user?.name || (record.username as string | undefined);
          const stableUserId = user?.id ?? (record.userId as number | string | undefined);
          if (username) {
            map.set(stableUserId ?? `client:${clientId}`, username);
          }
          const lock = record.excelLock as Partial<ExcelCellLock> | undefined;
          if (
            clientId !== collab.getClientId()
            && username
            && lock
            && typeof lock.sheetId === 'string'
            && Number.isInteger(lock.row)
            && Number.isInteger(lock.column)
          ) {
            locks.push({
              clientId,
              username,
              sheetId: lock.sheetId,
              row: lock.row!,
              column: lock.column!,
            });
          }
        }
        if (currentUser) {
          map.set(currentUser.id, currentUser.username);
        }
        setCollaborators(map);
        setExcelLocks(locks);
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
      releaseExcelLock();
      collab.disconnect();
      collabRef.current = null;
      setExcelLocks([]);
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
  const activeExcelLock = isExcelFile ? excelLocks[0] : null;
  const markdownCollab = isMarkdownFile ? collabRef.current : null;
  const markdownDoc = markdownCollab?.getDoc() || null;
  let markdownAwareness = null;
  try { markdownAwareness = markdownCollab?.getAwareness() || null; } catch { /* provider is still connecting */ }

  useEffect(() => {
    if (!isExcelFile) return;
    const collab = collabRef.current;
    if (!collab) return;

    const excelMap = collab.getMap<{
      data?: unknown;
      patch?: ExcelPatch;
      clientId?: number;
      updatedAt?: number;
    }>('excel');
    const handleExcelUpdate = (event: { keys: Map<string, unknown> }) => {
      const remotePatch = excelMap.get('patch');
      if (event.keys.has('patch') && remotePatch?.patch && remotePatch.clientId !== collab.getClientId()) {
        if (!applyRemoteExcelPatch(remotePatch.patch)) {
          // The editor is still mounting; the saved document remains the source
          // of truth until an editable workbook is available.
          pendingRemoteExcelSnapshotRef.current = null;
        }
        setSaveStatus('saved');
        clearSaveStatus();
        return;
      }
      if (!event.keys.has('snapshot')) return;
      const remoteSnapshot = excelMap.get('snapshot');
      if (!remoteSnapshot?.data) return;
      if (remoteSnapshot.clientId === collab.getClientId()) return;

      const snapshot = parseWorkbookSnapshot(
        JSON.stringify(remoteSnapshot.data),
        selectedFile?.name || 'Untitled',
        `file-${fileId}`,
      );
      const dataStr = JSON.stringify(snapshot);
      if (dataStr === lastDataRef.current) return;
      lastDataRef.current = dataStr;
      if (!applyRemoteExcelSnapshot(snapshot)) {
        pendingRemoteExcelSnapshotRef.current = snapshot;
      } else {
        lastExcelSnapshotRef.current = snapshot;
      }
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
    if (selectedFile.document_type === 'markdown') {
      textContentRef.current = content;
      setTextContent(content);
      return;
    }
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
    disposeUniver(univerRef.current);
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
                replaceYTextContent(yText, nextValue);
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
      lastExcelSnapshotRef.current = snapshot;

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
      if (pendingRemoteExcelSnapshotRef.current) {
        applyRemoteExcelSnapshot(pendingRemoteExcelSnapshotRef.current);
        lastExcelSnapshotRef.current = pendingRemoteExcelSnapshotRef.current;
        pendingRemoteExcelSnapshotRef.current = null;
      }

      const selectionChanged = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.SelectionChanged,
        (params) => {
          setSelectedCellRef(rangeToCellRef(params.selections[0]));
        },
      );
      const commandExecuted = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.CommandExecuted,
        () => {
          if (canEditFile && !isApplyingRemoteExcelRef.current) {
            publishExcelSnapshot();
            scheduleSave();
          }
        },
      );
      const beforeSheetEditStart = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.BeforeSheetEditStart,
        (params) => {
          if (!canEditFileRef.current) return;
          const sheetId = params.worksheet.getSheetId();
          const lockedBy = getRemoteExcelLock(sheetId, params.row, params.column);
          if (lockedBy) {
            params.cancel = true;
            return;
          }
          acquireExcelLock({ sheetId, row: params.row, column: params.column });
        },
      );
      const beforeSheetEditEnd = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.BeforeSheetEditEnd,
        (params) => {
          if (!localExcelLockGrantedRef.current) {
            params.cancel = true;
            setExcelLockHint('正在确认该单元格的编辑锁…');
          }
        },
      );
      const sheetEditEnded = univerHandle.univerAPI.addEvent(
        univerHandle.univerAPI.Event.SheetEditEnded,
        () => releaseExcelLock(),
      );
      univerDisposablesRef.current = [
        selectionChanged, commandExecuted, beforeSheetEditStart, beforeSheetEditEnd, sheetEditEnded,
      ];
    } catch (err) {
      console.error('Failed to initialize Univer:', err);
      setEditorError(err instanceof Error ? err.message : '编辑器初始化失败');
    } finally {
      setEditorLoading(false);
    }

    return () => {
      univerDisposablesRef.current.forEach((item) => item.dispose());
      univerDisposablesRef.current = [];
      releaseExcelLock();
      workbookRef.current = null;
      canvasEditorCleanupRef.current?.();
      canvasEditorCleanupRef.current = null;
      canvasEditorRef.current?.destroy();
      canvasEditorRef.current = null;
      disposeUniver(univerRef.current);
      univerRef.current = null;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (excelSyncTimerRef.current) {
        clearTimeout(excelSyncTimerRef.current);
        excelSyncTimerRef.current = null;
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

  const handleDownload = async () => {
    if (!selectedFile) return;
    try {
      setDownloadHint('导出中...');
      if (documentType === 'word') {
        const command = canvasEditorRef.current?.command as DocxCommand | undefined;
        if (command?.executeExportDocx) {
          const nameResponse = await authFetch(`/api/files/${selectedFile.id}/download-name`);
          const filename = nameResponse.ok ? await nameResponse.json() : selectedFile.name;
          command.executeExportDocx({ fileName: typeof filename === 'string' ? filename : selectedFile.name });
          setDownloadHint('已导出 Word');
          window.setTimeout(() => setDownloadHint(''), 1800);
          return;
        }
      }
      await downloadFile(selectedFile.id, selectedFile.name);
      setDownloadHint('下载完成');
      window.setTimeout(() => setDownloadHint(''), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载失败';
      setDownloadHint(message);
      window.setTimeout(() => setDownloadHint(''), 2400);
    }
  };

  const handleBack = () => {
    navigate('/files');
  };

  const handleMarkdownChange = (value: string) => {
    if (!canEditFile) return;
    setTextContent(value);
    textContentRef.current = value;
    scheduleSave(value);
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

  const handleRestoreVersion = (version: FileVersion) => {
    if (!fileId || !canEditFile || restoringVersionId !== null) return;
    setShowVersionHistory(false);
    setVersionPendingRestore(version);
  };

  const cancelRestoreVersion = () => {
    if (restoringVersionId !== null) return;
    setVersionPendingRestore(null);
    setShowVersionHistory(true);
  };

  const confirmRestoreVersion = async () => {
    if (!fileId || !versionPendingRestore || restoringVersionId !== null) return;
    const version = versionPendingRestore;
    setVersionPendingRestore(null);
    setRestoringVersionId(version.id);
    try {
      const response = await authFetch(`/api/files/${fileId}/versions/${version.id}/restore`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || '恢复历史版本失败');
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // A new Yjs document must be created so an outdated in-memory state cannot
      // overwrite the restored snapshot after the request completes.
      window.location.reload();
    } catch (error) {
      window.alert('恢复历史版本失败，请稍后重试');
      setRestoringVersionId(null);
    }
  };

  return (
    <>
      <div className="editor-page">
        {/* Toolbar */}
        <div className="editor-toolbar">
          <div className="toolbar-left">
            <button className="btn-back" onClick={handleBack} title="返回文件列表">←</button>
            <span className="file-title">{selectedFile?.name || '正在加载...'}</span>
            <span className={`doc-type-pill ${documentType}`}>{getDocumentTypeLabel(documentType)}</span>
            <span className={`permission-pill ${canEditFile ? 'editable' : 'readonly'}`}>
              {getPermissionLabel(selectedFile?.current_permission)}
            </span>
            {canEditFile && <span className={`sync-status ${isSynced ? 'synced' : 'connecting'}`}>
              <span className="sync-dot"></span>
              {isSynced ? '已同步' : '连接中...'}
            </span>}
            {canEditFile && saveStatus !== 'idle' && (
              <span className={`save-status ${saveStatus}`}>
                {saveStatus === 'saving' && '保存中...'}
                {saveStatus === 'saved' && '已同步保存'}
                {saveStatus === 'error' && '保存失败'}
              </span>
            )}
            {activeExcelLock && (
              <span className="excel-lock-status">
                {activeExcelLock.username} 正在编辑 {columnToName(activeExcelLock.column)}{activeExcelLock.row + 1}
              </span>
            )}
            {!activeExcelLock && excelLockHint && (
              <span className="excel-lock-status">{excelLockHint}</span>
            )}
          </div>
          <div className="toolbar-right">
            {canEditFile && <button
              type="button"
              className="theme-toggle editor-theme-toggle"
              onClick={() => setTheme(toggleTheme())}
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
              title={theme === 'dark' ? '浅色模式' : '深色模式'}
            >
              {theme === 'dark' ? '浅色' : '深色'}
            </button>}
            {canEditFile && <div className="collaborators">
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
            </div>}
            {downloadHint && <span className="download-hint">{downloadHint}</span>}
            <button className="btn-tb" onClick={handleDownload} disabled={wordPluginBusy || downloadHint === '导出中...'}>
              {documentType === 'word' ? '导出 Word' : '下载'}
            </button>
            {canEditFile && <button
              className="btn-tb"
              onClick={handleCreateVersion}
              disabled={!canEditFile || saveStatus === 'saving'}
              title="创建可恢复的历史版本"
            >
              保存版本
            </button>}
            {canEditFile && <button
              className={`btn-tb ${showVersionHistory ? 'active' : ''}`}
              onClick={() => setShowVersionHistory(true)}
            >
              历史版本
            </button>}
            {canManagePermissions && (
              <button className="btn-tb" onClick={() => setShowPermissions(true)}>权限</button>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className={`editor-body ${isMarkdownFile ? 'markdown-editor-body' : ''}`}>
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
                <div className="milkdown-editor-bar">
                  <span>Markdown</span>
                  <span>{canEditFile ? '所见即所得 · 自动保存 · 多人协作' : '仅查看'}</span>
                </div>
                <Suspense fallback={<div className="milkdown-loading">正在加载 Markdown 编辑器…</div>}>
                  <MilkdownMarkdownEditor
                    key={`${fileId}:${markdownEditorSession}`}
                    initialMarkdown={selectedFile?.sheet_data || ''}
                    doc={markdownDoc}
                    awareness={markdownAwareness}
                    readOnly={!canEditFile}
                    onChange={handleMarkdownChange}
                    onError={setEditorError}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="document-workspace">
                {canEditFile && renderWordToolbar()}
                <div className="word-workspace">
                  <div ref={wordEditorContainerRef} className="canvas-editor-host" />
                </div>
              </div>
            )}
          </div>

          {/* Comment panel */}
          {showComments && (
            <aside className="comment-panel" id="comment-panel" aria-label="评论区">
              <div className="comment-panel-header">
                <span>评论 <span className="count">{comments.length}</span></span>
                <button className="comment-panel-close" onClick={() => setShowComments(false)} aria-label="关闭评论区">&times;</button>
              </div>
              <div className="comment-list">
                {isLoadingComments ? (
                  <p className="empty-comments">加载中...</p>
                ) : commentLoadError ? (
                  <p className="empty-comments">{commentLoadError}</p>
                ) : comments.length === 0 ? (
                  <p className="empty-comments">暂无评论</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="comment-item">
                      <div className="ci-top">
                        <span className="ci-user">{c.username || '未知用户'}</span>
                        <span className="ci-cell">{c.cell_ref || '全局'}</span>
                      </div>
                      <div className="ci-text">{c.content}</div>
                      <div className="ci-time">
                        {formatShanghaiDate(c.created_at)}
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
            </aside>
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
      {showVersionHistory && (
        <VersionHistoryModal
          versions={versions}
          isLoading={isLoadingVersions}
          canRestore={canEditFile}
          restoringVersionId={restoringVersionId}
          onClose={() => setShowVersionHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}
      {versionPendingRestore && (
        <RestoreVersionConfirmModal
          version={versionPendingRestore}
          isRestoring={restoringVersionId !== null}
          onCancel={cancelRestoreVersion}
          onConfirm={confirmRestoreVersion}
        />
      )}
    </>
  );
}

interface VersionHistoryModalProps {
  versions: FileVersion[];
  isLoading: boolean;
  canRestore: boolean;
  restoringVersionId: number | null;
  onClose: () => void;
  onRestore: (version: FileVersion) => void;
}

function VersionHistoryModal({
  versions,
  isLoading,
  canRestore,
  restoringVersionId,
  onClose,
  onRestore,
}: VersionHistoryModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card version-history-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>历史版本</h3>
            <p className="version-history-subtitle">自动保存只更新当前文档；“保存版本”会创建可恢复的快照。</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="关闭历史版本">&times;</button>
        </div>
        <div className="version-history-list">
          {isLoading ? (
            <p className="version-history-empty">正在加载历史版本...</p>
          ) : versions.length === 0 ? (
            <p className="version-history-empty">还没有可恢复的历史版本。可在工具栏点击“保存版本”创建快照。</p>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="version-history-item">
                <div className="version-badge">V{version.version}</div>
                <div className="version-history-details">
                  <strong>{getVersionRemark(version.remark)}</strong>
                  <span>{formatShanghaiDate(version.created_at)}</span>
                  <span>保存者：{version.created_by_name || '未知用户'}</span>
                </div>
                {canRestore ? (
                  <button
                    className="version-restore-btn"
                    disabled={restoringVersionId !== null}
                    onClick={() => onRestore(version)}
                  >
                    {restoringVersionId === version.id ? '恢复中...' : '恢复此版本'}
                  </button>
                ) : (
                  <span className="version-view-only">仅查看</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface RestoreVersionConfirmModalProps {
  version: FileVersion;
  isRestoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function RestoreVersionConfirmModal({
  version,
  isRestoring,
  onCancel,
  onConfirm,
}: RestoreVersionConfirmModalProps) {
  return (
    <div className="modal-overlay restore-version-overlay" onClick={isRestoring ? undefined : onCancel}>
      <div className="modal-card restore-version-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="restore-version-title">
        <div className="restore-version-header">
          <div className="restore-version-icon" aria-hidden="true">V</div>
          <span>版本回滚</span>
        </div>
        <div className="restore-version-content">
          <h3 id="restore-version-title">确认恢复到 V{version.version}？</h3>
          <p>恢复前会自动保留当前内容，已有历史记录不会丢失。</p>
          <div className="restore-version-summary">
            <span>目标版本</span>
            <strong>V{version.version}</strong>
            <em>{getVersionRemark(version.remark)}</em>
          </div>
          <div className="restore-version-actions">
            <button className="restore-version-cancel" disabled={isRestoring} onClick={onCancel}>取消</button>
            <button className="restore-version-confirm" disabled={isRestoring} onClick={onConfirm}>
              {isRestoring ? '正在恢复...' : '确认回滚'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
                    <span className="user-avatar">{(p.username || '未知用户').charAt(0).toUpperCase()}</span>
                    <span className="permission-user">
                      <strong>{p.username || '未知用户'}</strong>
                      <span>{permissionDescription(p.permission)}</span>
                    </span>
                    <span className={`permission-badge ${p.permission}`}>{permissionLabel(p.permission)}</span>
                    <button
                      className="permission-remove-btn"
                      onClick={() => setRevokeTarget({
                        userId: p.user_id,
                        username: p.username || '未知用户',
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
