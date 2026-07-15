import { useEffect, useRef, useState, type FormEvent } from 'react';

type DocumentType = 'excel' | 'markdown' | 'word';

interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void | Promise<void>;
  initialType?: DocumentType;
}

const defaultExtensions: Record<DocumentType, string> = {
  excel: '.xlsx',
  markdown: '.md',
  word: '.docx',
};

const typeMeta: Record<DocumentType, { label: string; icon: string; desc: string; example: string }> = {
  excel: {
    label: 'Excel',
    icon: 'X',
    desc: '表格协作与数据整理',
    example: '例如：月度报表',
  },
  markdown: {
    label: 'Markdown',
    icon: 'M',
    desc: '笔记、方案与技术文档',
    example: '例如：会议纪要',
  },
  word: {
    label: 'Word',
    icon: 'W',
    desc: '正式文稿与项目方案',
    example: '例如：项目方案',
  },
};

function ensureExtension(name: string, type: DocumentType) {
  if (/\.[^/.]+$/.test(name)) return name;
  return `${name}${defaultExtensions[type]}`;
}

export default function CreateModal({ title, onClose, onSubmit, initialType = 'excel' }: ModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>(initialType);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('文件名不能为空');
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(ensureExtension(name.trim(), documentType), description.trim() || '');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请稍后重试');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !submitting && onClose()}>
      <div className="modal-card create-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="create-modal-subtitle">选择类型并命名，创建后可立即开始协作编辑。</p>
          </div>
          <button className="modal-close" onClick={onClose} disabled={submitting} aria-label="关闭">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>文件类型</label>
            <div className="doc-type-options create-type-options">
              {(Object.keys(typeMeta) as DocumentType[]).map((type) => {
                const meta = typeMeta[type];
                return (
                  <button
                    key={type}
                    type="button"
                    className={`doc-type-option create-type-option ${documentType === type ? 'active' : ''}`}
                    onClick={() => setDocumentType(type)}
                    disabled={submitting}
                  >
                    <span className={`doc-type-icon ${type}`}>{meta.icon}</span>
                    <span className="create-type-copy">
                      <strong>{meta.label}</strong>
                      <small>{meta.desc}</small>
                    </span>
                    <em>{defaultExtensions[type]}</em>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label>文件名</label>
            <div className="create-name-field">
              <input
                ref={inputRef}
                type="text"
                placeholder={typeMeta[documentType].example}
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                maxLength={255}
                disabled={submitting}
              />
              <span className="create-ext-chip">{defaultExtensions[documentType]}</span>
            </div>
            <p className="field-hint">未填写后缀时会自动补全为 {defaultExtensions[documentType]}</p>
          </div>
          <div className="form-group">
            <label>描述 <span className="optional-mark">选填</span></label>
            <input
              type="text"
              placeholder="补充用途说明，方便团队检索"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              disabled={submitting}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>取消</button>
            <button type="submit" className="btn-submit create-submit" disabled={submitting || !name.trim()}>
              {submitting ? '创建中...' : '创建并打开'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
