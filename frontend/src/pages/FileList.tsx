import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { useFileStore } from '@/stores/fileStore';
import Navbar from '@/components/Navbar';
import CreateModal from '@/components/CreateModal';
import Toast, { type ToastData } from '@/components/Toast';
import type { FileItem } from '@/types';

type Tab = 'owned' | 'shared' | 'trashed';
type DocFilter = 'all' | 'excel' | 'word' | 'markdown';
type SortKey = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc';
type DeleteIntent = { kind: 'trash' | 'permanent'; file: FileItem } | null;
type UploadFeedback = { tone: 'loading' | 'error'; text: string } | null;

const allowedExtensions = ['.xlsx', '.xls', '.csv', '.md', '.markdown', '.txt', '.docx'];
const displayExtensions = ['.xlsx', '.xls', '.csv', '.md', '.markdown', '.txt', '.docx'];

function getDisplayFileName(name: string) {
  const lowerName = name.toLowerCase();
  const matchedExt = displayExtensions.find((ext) => lowerName.endsWith(ext));
  return matchedExt ? name.slice(0, -matchedExt.length) : name;
}

function getFilePresentation(documentType?: string) {
  switch (documentType) {
    case 'word':
      return { label: 'Word', icon: 'W', className: 'word' };
    case 'markdown':
      return { label: 'Markdown', icon: 'M', className: 'markdown' };
    case 'excel':
    default:
      return { label: 'Excel', icon: 'X', className: 'excel' };
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export default function FileListPage() {
  const navigate = useNavigate();
  const fetchFiles = useFileStore((s) => s.fetchFiles);
  const fetchSharedFiles = useFileStore((s) => s.fetchSharedFiles);
  const fetchTrashedFiles = useFileStore((s) => s.fetchTrashedFiles);
  const files = useFileStore((s) => s.files);
  const sharedFiles = useFileStore((s) => s.sharedFiles);
  const trashedFiles = useFileStore((s) => s.trashedFiles);
  const setSelectedFile = useFileStore((s) => s.setSelectedFile);
  const createFile = useFileStore((s) => s.createFile);
  const uploadFile = useFileStore((s) => s.uploadFile);
  const uploadWordDocx = useFileStore((s) => s.uploadWordDocx);
  const deleteFile = useFileStore((s) => s.deleteFile);
  const restoreFile = useFileStore((s) => s.restoreFile);
  const permanentDeleteFile = useFileStore((s) => s.permanentDeleteFile);
  const downloadFile = useFileStore((s) => s.downloadFile);
  const loading = useFileStore((s) => s.loading);
  const ownedFiles = Array.isArray(files) ? files : [];
  const incomingSharedFiles = Array.isArray(sharedFiles) ? sharedFiles : [];
  const deletedFiles = Array.isArray(trashedFiles) ? trashedFiles : [];

  const [tab, setTab] = useState<Tab>('owned');
  const [selectedTypes, setSelectedTypes] = useState<Array<'excel' | 'word' | 'markdown'>>(() => {
    try {
      const saved = localStorage.getItem('opencollab-doc-types');
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        return parsed.filter((x): x is 'excel' | 'word' | 'markdown' => x === 'excel' || x === 'word' || x === 'markdown');
      }
    } catch {}
    const legacy = localStorage.getItem('opencollab-doc-filter');
    if (legacy === 'excel' || legacy === 'word' || legacy === 'markdown') return [legacy];
    return [];
  });
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const saved = localStorage.getItem('opencollab-sort-key');
    return saved === 'updated_desc' || saved === 'updated_asc' || saved === 'name_asc' || saved === 'name_desc' ? saved : 'updated_desc';
  });
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<ToastData | null>(null);

  const toggleTypeFilter = (type: 'excel' | 'word' | 'markdown') => {
    setSelectedTypes((prev) => prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]);
  };
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedback>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const sidebar = root.querySelector('.workbench-sidebar');
      const content = root.querySelectorAll('.filelist-topbar, .filelist-metrics, .workbench-controls, .file-table, .empty-state, .loading-panel');
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (sidebar) intro.from(sidebar, { autoAlpha: 0, x: -16, duration: 0.42 });
      if (content.length) intro.from(content, { autoAlpha: 0, y: 14, duration: 0.38, stagger: 0.07 }, sidebar ? '-=0.2' : 0);
      return () => intro.kill();
    });
    return () => media.revert();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchFiles(), fetchSharedFiles(), fetchTrashedFiles()])
      .finally(() => {
        if (!cancelled) setIsWorkspaceLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchFiles, fetchSharedFiles, fetchTrashedFiles]);

  useEffect(() => {
    localStorage.setItem('opencollab-doc-types', JSON.stringify(selectedTypes));
  }, [selectedTypes]);

  useEffect(() => {
    localStorage.setItem('opencollab-sort-key', sortKey);
  }, [sortKey]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sortMenuOpen]);

  const sortOptions: Array<{ value: SortKey; label: string }> = useMemo(() => ([
    { value: 'updated_desc', label: '最近修改' },
    { value: 'updated_asc', label: '最早修改' },
    { value: 'name_asc', label: '名称 A-Z' },
    { value: 'name_desc', label: '名称 Z-A' },
  ]), []);
  const currentSortLabel = sortOptions.find((item) => item.value === sortKey)?.label ?? '最近修改';

  const handleCreate = async (name: string, description?: string) => {
    try {
      const created = await createFile(name, description);
      setToast({ tone: 'success', text: `「${created.name}」已创建` });
      setSelectedFile(created);
      navigate(`/editor/${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '创建失败，请稍后重试';
      setToast({ tone: 'error', text: message });
      throw err instanceof Error ? err : new Error(message);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      setToast({ tone: 'error', text: '仅支持 Word / Markdown / Excel 文件' });
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setToast({ tone: 'error', text: '文件大小不能超过 50MB' });
      e.target.value = '';
      return;
    }
    setUploadFeedback({ tone: 'loading', text: `正在导入「${file.name}」` });
    setToast({ tone: 'loading', text: `正在导入「${file.name}」` });
    try {
      const uploaded = ext === '.docx' ? await uploadWordDocx(file) : await uploadFile(file);
      setSelectedFile(uploaded);
      setToast({ tone: 'success', text: `「${uploaded.name}」导入成功` });
      setUploadFeedback(null);
      navigate(`/editor/${uploaded.id}`);
    } catch (err) {
      console.error('文件导入失败：', err);
      setUploadFeedback({ tone: 'error', text: '文件导入失败，请确认文件没有损坏后重试' });
      setToast({ tone: 'error', text: '文件导入失败，请稍后重试' });
    } finally {
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number) => {
    const file = ownedFiles.find((f) => f.id === id);
    if (file) setDeleteIntent({ kind: 'trash', file });
  };

  const handleRestore = async (id: number) => {
    try {
      await restoreFile(id);
      setToast({ tone: 'success', text: '文件已恢复' });
    } catch {
      setToast({ tone: 'error', text: '恢复失败，请稍后重试' });
    }
  };

  const handlePermanentDelete = async (id: number) => {
    const file = deletedFiles.find((f) => f.id === id);
    if (file) setDeleteIntent({ kind: 'permanent', file });
  };

  const handleConfirmDelete = async () => {
    if (!deleteIntent) return;
    setIsDeleting(true);
    try {
      if (deleteIntent.kind === 'trash') {
        await deleteFile(deleteIntent.file.id);
      } else {
        await permanentDeleteFile(deleteIntent.file.id);
      }
      setToast({ tone: 'success', text: deleteIntent.kind === 'permanent' ? '文件已永久删除' : '文件已移入回收站' });
      setDeleteIntent(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (id: number, name: string) => {
    try {
      setToast({ tone: 'loading', text: `正在下载「${name}」` });
      await downloadFile(id, name);
      setToast({ tone: 'success', text: `「${name}」下载完成` });
    } catch (err) {
      const message = err instanceof Error ? err.message : '下载失败，请稍后重试';
      setToast({ tone: 'error', text: message });
    }
  };

  const activeFiles = tab === 'owned'
    ? ownedFiles
    : tab === 'shared'
      ? incomingSharedFiles
      : deletedFiles;
  const typeCounts = activeFiles.reduce<Record<DocFilter, number>>(
    (acc, file) => {
      acc.all += 1;
      if (file.document_type === 'excel' || file.document_type === 'word' || file.document_type === 'markdown') {
        acc[file.document_type] += 1;
      }
      return acc;
    },
    { all: 0, excel: 0, word: 0, markdown: 0 },
  );

  const displayedFiles = (activeFiles ?? [])
    .filter((f) => {
      const displayName = getDisplayFileName(f.name).toLowerCase();
      const searchText = search.toLowerCase();
      const matchesSearch = displayName.includes(searchText) || f.name.toLowerCase().includes(searchText);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(f.document_type as 'excel' | 'word' | 'markdown');
      return matchesSearch && matchesType;
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'name_asc' || sortKey === 'name_desc') {
        const an = getDisplayFileName(a.name).localeCompare(getDisplayFileName(b.name), 'zh-CN');
        return sortKey === 'name_asc' ? an : -an;
      }
      const at = new Date(a.updated_at).getTime();
      const bt = new Date(b.updated_at).getTime();
      return sortKey === 'updated_asc' ? at - bt : bt - at;
    });

  const emptyText = tab === 'trashed'
    ? '回收站为空'
    : tab === 'shared'
      ? '暂无分享给你的文件'
      : '没有找到文件。创建或上传一个文件开始使用。';
  const pageTitle = tab === 'owned' ? '我的文件' : tab === 'shared' ? '分享给我' : '回收站';
  const pageDescription = tab === 'owned'
    ? `显示当前用户创建的文件，共 ${ownedFiles.length} 个。`
    : tab === 'shared'
      ? `其他用户分享给你的文件，共 ${incomingSharedFiles.length} 个。`
      : `仅显示你创建文件的回收信息，共 ${deletedFiles.length} 个。`;
  const currentFilterLabel = selectedTypes.length === 0
    ? '全部类型'
    : selectedTypes.map((type) => getFilePresentation(type).label).join(' / ');
  const visibleSummary = `${displayedFiles.length} / ${activeFiles.length}`;

  return (
    <>
      <Navbar />
      <div className="filelist-page workbench-page" ref={pageRef}>
        <div className="workbench-shell">
          <aside className="workbench-sidebar">
            <div className="side-brand">
              <span>OpenCollab</span>
              <strong>文件</strong>
            </div>
            <p className="side-title">空间</p>
            <button className={`side-item ${tab === 'owned' ? 'active' : ''}`} onClick={() => setTab('owned')}>
              <span>我的文件</span>
              <strong>{ownedFiles.length}</strong>
            </button>
            <button className={`side-item ${tab === 'shared' ? 'active' : ''}`} onClick={() => setTab('shared')}>
              <span>分享给我</span>
              <strong>{incomingSharedFiles.length}</strong>
            </button>
            <button className={`side-item ${tab === 'trashed' ? 'active' : ''}`} onClick={() => setTab('trashed')}>
              <span>回收站</span>
              <strong>{deletedFiles.length}</strong>
            </button>

            <p className="side-title side-title-spaced">类型（可多选）</p>
            <button className={`side-static ${selectedTypes.length === 0 ? 'active' : ''}`} onClick={() => setSelectedTypes([])}>
              <span>全部类型</span>
              <strong>{typeCounts.all}</strong>
            </button>
            <button className={`side-static ${selectedTypes.includes('excel') ? 'active' : ''}`} onClick={() => toggleTypeFilter('excel')}>
              <span>Excel</span>
              <strong>{typeCounts.excel}</strong>
            </button>
            <button className={`side-static ${selectedTypes.includes('word') ? 'active' : ''}`} onClick={() => toggleTypeFilter('word')}>
              <span>Word</span>
              <strong>{typeCounts.word}</strong>
            </button>
            <button className={`side-static ${selectedTypes.includes('markdown') ? 'active' : ''}`} onClick={() => toggleTypeFilter('markdown')}>
              <span>Markdown</span>
              <strong>{typeCounts.markdown}</strong>
            </button>

            <div className="side-note">
              <span>当前范围</span>
              <strong>{pageTitle}</strong>
              <small>{currentFilterLabel} · {visibleSummary}</small>
            </div>
          </aside>

          <section className="workbench-main">
            <div className="filelist-topbar">
              <div>
                <h1>{pageTitle}</h1>
                <p>{pageDescription}</p>
              </div>
              <div className="filelist-actions">
                <button className="btn-action primary create-action" onClick={() => setShowCreateModal(true)}>
                  <span className="create-action-plus" aria-hidden="true">+</span>
                  新建文件
                </button>
                <button
                  className="btn-action"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadFeedback?.tone === 'loading'}
                >
                  {uploadFeedback?.tone === 'loading' ? '导入中...' : '上传文件'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.md,.markdown,.txt,.docx"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {uploadFeedback && (
              <p className={`upload-feedback ${uploadFeedback.tone}`} role="status">
                {uploadFeedback.text}
              </p>
            )}

            <div className="filelist-metrics" aria-label="文件概览">
              <div>
                <span>当前视图</span>
                <strong>{visibleSummary}</strong>
              </div>
              <div>
                <span>Excel</span>
                <strong>{typeCounts.excel}</strong>
              </div>
              <div>
                <span>Word</span>
                <strong>{typeCounts.word}</strong>
              </div>
              <div>
                <span>Markdown</span>
                <strong>{typeCounts.markdown}</strong>
              </div>
            </div>

            <div className="workbench-controls">
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="搜索文件名"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="filter-summary">
                <span>{pageTitle}</span>
                <strong>{currentFilterLabel}</strong>
                {search && <em>搜索：{search}</em>}
              </div>
              <div className={`sort-select${sortMenuOpen ? ' open' : ''}`} ref={sortMenuRef}>
                <span className="sort-select-label">排序</span>
                <button
                  type="button"
                  className="sort-select-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={sortMenuOpen}
                  aria-label="文件排序"
                  onClick={() => setSortMenuOpen((open) => !open)}
                >
                  <span>{currentSortLabel}</span>
                  <span className="sort-select-caret" aria-hidden="true">▾</span>
                </button>
                {sortMenuOpen && (
                  <div className="sort-select-menu" role="listbox" aria-label="排序方式">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={sortKey === option.value}
                        className={`sort-select-option${sortKey === option.value ? ' active' : ''}`}
                        onClick={() => {
                          setSortKey(option.value);
                          setSortMenuOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {sortKey === option.value && <span className="sort-select-check" aria-hidden="true">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          {loading || isWorkspaceLoading ? (
              <div className="file-table skeleton-table" aria-live="polite" aria-label="正在加载文件">
                <div className="file-row header">
                  <div>类型</div>
                  <div>文件名</div>
                  <div>权限</div>
                  <div>修改时间</div>
                  <div>操作</div>
                </div>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div className="file-row skeleton-row" key={idx}>
                    <div className="skeleton-block icon" />
                    <div className="skeleton-lines">
                      <span className="skeleton-block line wide" />
                      <span className="skeleton-block line" />
                    </div>
                    <div className="skeleton-block pill" />
                    <div className="skeleton-block line short" />
                    <div className="skeleton-actions">
                      <span className="skeleton-block btn" />
                      <span className="skeleton-block btn" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedFiles.length === 0 ? (
              <div className="empty-state empty-state-card">
                <strong>{search ? `${pageTitle}中没有匹配文件` : emptyText}</strong>
                <p>
                  {search
                    ? '试试更换关键词，或切换左侧类型筛选。'
                    : tab === 'trashed'
                      ? '删除的文件会出现在这里，可恢复或永久删除。'
                      : tab === 'shared'
                        ? '当有人把文件分享给你时，会显示在这里。'
                        : '创建第一个文档，或上传现有 Word / Markdown / Excel 文件。'}
                </p>
                {!search && tab === 'owned' && (
                  <div className="empty-state-actions">
                    <button className="btn-action primary create-action" onClick={() => setShowCreateModal(true)}>
                      <span className="create-action-plus" aria-hidden="true">+</span>
                      新建文件
                    </button>
                    <button className="btn-action" onClick={() => fileInputRef.current?.click()}>上传文件</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="file-table">
                <div className="file-row header">
                  <div>类型</div>
                  <div>文件名</div>
                  <div>权限</div>
                  <div>修改时间</div>
                  <div>操作</div>
                </div>
                {displayedFiles.map((file) => {
                  const presentation = getFilePresentation(file.document_type);
                  const isTrashed = tab === 'trashed';
                  return (
                    <div
                      key={file.id}
                      className={`file-row ${isTrashed ? 'trashed' : ''}`}
                      onClick={() => {
                        if (!isTrashed) {
                          setSelectedFile(file);
                          navigate(`/editor/${file.id}`);
                        }
                      }}
                    >
                      <div className={`file-icon ${isTrashed ? 'deleted' : presentation.className}`}>
                        {isTrashed ? '×' : presentation.icon}
                      </div>
                      <div className="file-name">
                        <strong>{getDisplayFileName(file.name)}</strong>
                        <span>{isTrashed ? '文件已移入回收站' : `${presentation.label} 文件`}</span>
                      </div>
                      <div>
                        <span className={`permission-pill ${tab === 'owned' ? 'owner' : file.current_permission === 'edit' ? 'editable' : 'readonly'}`}>
                          {isTrashed ? '已删除' : tab === 'owned' ? '所有者' : file.current_permission === 'edit' ? '可编辑' : '仅查看'}
                        </span>
                      </div>
                      <div className="file-meta">
                        <strong>{formatDate(file.updated_at)}</strong>
                      </div>
                      <div className="inline-actions" onClick={(e) => e.stopPropagation()}>
                        {isTrashed ? (
                          <>
                            <button className="mini-btn" onClick={() => handleRestore(file.id)}>恢复</button>
                            <button className="mini-btn danger" onClick={() => handlePermanentDelete(file.id)}>永久删除</button>
                          </>
                        ) : (
                          <>
                            <button
                              className="mini-btn primary"
                              onClick={() => {
                                setSelectedFile(file);
                                navigate(`/editor/${file.id}`);
                              }}
                            >
                              打开
                            </button>
                            <button className="mini-btn" onClick={() => handleDownload(file.id, file.name)}>下载</button>
                            {tab === 'owned' && (
                              <button className="mini-btn danger" onClick={() => handleDelete(file.id)}>删除</button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
      {showCreateModal && (
        <CreateModal
          title="新建文件"
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {deleteIntent && (
        <DeleteConfirmModal
          intent={deleteIntent}
          isDeleting={isDeleting}
          onCancel={() => !isDeleting && setDeleteIntent(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}

interface DeleteConfirmModalProps {
  intent: NonNullable<DeleteIntent>;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ intent, isDeleting, onCancel, onConfirm }: DeleteConfirmModalProps) {
  const isPermanent = intent.kind === 'permanent';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className={`delete-confirm-mark ${isPermanent ? 'danger' : 'soft'}`}>
          {isPermanent ? '!' : '×'}
        </div>
        <div className="delete-confirm-content">
          <h3>{isPermanent ? '永久删除文件' : '删除文件'}</h3>
          <p>
            {isPermanent
              ? '此操作会彻底删除文件，删除后无法恢复。'
              : '文件会移入回收站，之后仍可恢复。'}
          </p>
          <div className="delete-file-summary">
            <span className="delete-file-name">{getDisplayFileName(intent.file.name)}</span>
            <span className="delete-file-meta">
              {formatDate(intent.file.updated_at)}
            </span>
          </div>
        </div>
        <div className="delete-confirm-actions">
          <button className="btn-cancel" onClick={onCancel} disabled={isDeleting}>
            取消
          </button>
          <button
            className={`btn-submit ${isPermanent ? 'danger' : ''}`}
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? '处理中...' : isPermanent ? '永久删除' : '移入回收站'}
          </button>
        </div>
      </div>
    </div>
  );
}
