import { useState, type FormEvent } from 'react';

type DocumentType = 'excel' | 'markdown' | 'word';

interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => void;
}

const defaultExtensions: Record<DocumentType, string> = {
  excel: '.xlsx',
  markdown: '.md',
  word: '.docx',
};

const typeExamples: Record<DocumentType, string> = {
  excel: '例如：月度报表.xlsx',
  markdown: '例如：会议纪要.md',
  word: '例如：项目方案.docx',
};

function ensureExtension(name: string, type: DocumentType) {
  if (/\.[^/.]+$/.test(name)) return name;
  return `${name}${defaultExtensions[type]}`;
}

export default function CreateModal({ title, onClose, onSubmit }: ModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('excel');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('文件名不能为空');
      return;
    }
    onSubmit(ensureExtension(name.trim(), documentType), description.trim() || '');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>文件类型 *</label>
            <div className="doc-type-options">
              <button
                type="button"
                className={`doc-type-option ${documentType === 'excel' ? 'active' : ''}`}
                onClick={() => setDocumentType('excel')}
              >
                <span className="doc-type-icon excel">X</span>
                <span>Excel</span>
              </button>
              <button
                type="button"
                className={`doc-type-option ${documentType === 'markdown' ? 'active' : ''}`}
                onClick={() => setDocumentType('markdown')}
              >
                <span className="doc-type-icon markdown">M</span>
                <span>Markdown</span>
              </button>
              <button
                type="button"
                className={`doc-type-option ${documentType === 'word' ? 'active' : ''}`}
                onClick={() => setDocumentType('word')}
              >
                <span className="doc-type-icon word">W</span>
                <span>Word</span>
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>文件名 *</label>
            <input
              type="text"
              placeholder={typeExamples[documentType]}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              autoFocus
              maxLength={255}
            />
          </div>
          <div className="form-group">
            <label>描述</label>
            <input
              type="text"
              placeholder="选填，添加文件描述"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>取消</button>
            <button type="submit" className="btn-submit">确定</button>
          </div>
        </form>
      </div>
    </div>
  );
}
