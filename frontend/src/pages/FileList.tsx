import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileStore } from '@/stores/fileStore';
import Navbar from '@/components/Navbar';
import CreateModal from '@/components/CreateModal';
import type { FileItem } from '@/types';

type Tab = 'owned' | 'shared' | 'trashed';
type DocFilter = 'all' | 'excel' | 'word' | 'markdown';
type DeleteIntent = { kind: 'trash' | 'permanent'; file: FileItem } | null;

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
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
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
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'owned') {
      fetchFiles();
    } else if (tab === 'shared') {
      fetchSharedFiles();
    } else {
      fetchTrashedFiles();
    }
  }, [tab, fetchFiles, fetchSharedFiles, fetchTrashedFiles]);

  const handleCreate = async (name: string, description?: string) => {
    await createFile(name, description);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      alert('仅支持上传 Word / Markdown / Excel 文件（.docx / .md / .xlsx / .xls / .csv / .txt）');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('文件大小不能超过 50MB');
      e.target.value = '';
      return;
    }
    const uploaded = ext === '.docx' ? await uploadWordDocx(file) : await uploadFile(file);
    if (uploaded.document_type === 'word') {
      setSelectedFile(uploaded);
      navigate(`/editor/${uploaded.id}`);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: number) => {
    const file = ownedFiles.find((f) => f.id === id);
    if (file) setDeleteIntent({ kind: 'trash', file });
  };

  const handleRestore = async (id: number) => {
    await restoreFile(id);
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
      setDeleteIntent(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (id: number, name: string) => {
    await downloadFile(id, name);
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

  const displayedFiles = (activeFiles ?? []).filter((f) => {
    const displayName = getDisplayFileName(f.name).toLowerCase();
    const searchText = search.toLowerCase();
    const matchesSearch = displayName.includes(searchText) || f.name.toLowerCase().includes(searchText);
    const matchesType = docFilter === 'all' || f.document_type === docFilter;
    return matchesSearch && matchesType;
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
  const currentFilterLabel = docFilter === 'all' ? '全部类型' : getFilePresentation(docFilter).label;
  const visibleSummary = `${displayedFiles.length} / ${activeFiles.length}`;

  return (
    <>
      <Navbar />
      <div className="filelist-page workbench-page">
        <div className="workbench-shell">
          <aside className="workbench-sidebar">
            <div className="side-brand">
              <span>OpenCollab</span>
              <strong>Files</strong>
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

            <p className="side-title side-title-spaced">类型</p>
            <button className={`side-static ${docFilter === 'all' ? 'active' : ''}`} onClick={() => setDocFilter('all')}>
              <span>全部类型</span>
              <strong>{typeCounts.all}</strong>
            </button>
            <button className={`side-static ${docFilter === 'excel' ? 'active' : ''}`} onClick={() => setDocFilter('excel')}>
              <span>Excel</span>
              <strong>{typeCounts.excel}</strong>
            </button>
            <button className={`side-static ${docFilter === 'word' ? 'active' : ''}`} onClick={() => setDocFilter('word')}>
              <span>Word</span>
              <strong>{typeCounts.word}</strong>
            </button>
            <button className={`side-static ${docFilter === 'markdown' ? 'active' : ''}`} onClick={() => setDocFilter('markdown')}>
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
                <button className="btn-action primary" onClick={() => setShowCreateModal(true)}>
                  新建
                </button>
                <button className="btn-action" onClick={() => fileInputRef.current?.click()}>
                  上传文件
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
            </div>

            {loading ? (
              <div className="loading-panel" aria-live="polite">
                <span className="loader-mark" />
                <span className="loading-title">正在加载文件</span>
                <span className="loading-subtitle">同步列表与权限状态</span>
              </div>
            ) : displayedFiles.length === 0 ? (
              <p className="empty-state">{search ? `${pageTitle}中没有匹配文件` : emptyText}</p>
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
                        <span>{isTrashed ? '删除于' : '修改于'}</span>
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
              修改于 {new Date(intent.file.updated_at).toLocaleDateString('zh-CN')}
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
