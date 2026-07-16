import { useEffect, useRef, useState } from 'react';
import { authFetch } from '@/services/authFetch';
import { aiContext } from '@/services/aiContext';

type Role = 'user' | 'assistant';

/**
 * Global, draggable AI assistant.
 * Lives at the App root so it works on every page (not just the editor).
 * The current document context is published by pages via the shared aiContext holder.
 */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: Role; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // FAB drag state (pointer based, no external deps)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 24, y: 24 });
  const draggingRef = useRef(false);
  const dragOffRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const movedRef = useRef(false);
  const downPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const resp = await authFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: aiContext.current || '',
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!resp.ok) throw new Error(`请求失败 (${resp.status})`);
      const reply = await resp.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '（无内容返回）' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '与 AI 服务通信失败');
    } finally {
      setLoading(false);
      scrollDown();
    }
  };

  const DRAG_THRESHOLD = 5;
  const onFabPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    movedRef.current = false;
    downPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onFabPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    if (!movedRef.current) {
      const ddx = e.clientX - downPosRef.current.x;
      const ddy = e.clientY - downPosRef.current.y;
      if (Math.hypot(ddx, ddy) > DRAG_THRESHOLD) movedRef.current = true;
    }
    if (!movedRef.current) return;
    const x = Math.max(8, Math.min(window.innerWidth - 64, e.clientX - dragOffRef.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - 64, e.clientY - dragOffRef.current.dy));
    setPos({ x, y });
  };
  const onFabPointerUp = () => {
    draggingRef.current = false;
  };

  return (
    <>
      <button
        type="button"
        className="ai-fab"
        aria-label="打开 AI 助手"
        title="AI 助手"
        style={{ right: pos.x, bottom: pos.y }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onClick={() => {
          if (movedRef.current) { movedRef.current = false; return; }
          setOpen((v) => !v);
        }}
      >
        AI
      </button>

      {open && (
        <aside className="ai-panel ai-floating" aria-label="AI 助手">
          <div className="ai-panel-header">
            <span>AI 助手</span>
            <button className="ai-panel-close" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">&times;</button>
          </div>
          <div className="ai-list" ref={listRef}>
            {messages.length === 0 ? (
              <p className="ai-empty">向 AI 提问吧。在编辑页中，当前文件内容会自动作为上下文。</p>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`ai-msg ai-${m.role}`}>
                  <div className="ai-role">{m.role === 'user' ? '我' : 'AI'}</div>
                  <div className="ai-bubble">{m.content}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="ai-msg ai-assistant">
                <div className="ai-role">AI</div>
                <div className="ai-bubble ai-thinking">思考中…</div>
              </div>
            )}
            {error && <p className="ai-error">{error}</p>}
          </div>
          <div className="ai-input-area">
            <textarea
              placeholder="输入问题，AI 将基于当前文件内容回答…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="ai-bottom">
              <span className="ai-hint">Enter 发送 · Shift+Enter 换行</span>
              <button className="ai-send" disabled={!input.trim() || loading} onClick={send}>
                {loading ? '发送中…' : '发送'}
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
