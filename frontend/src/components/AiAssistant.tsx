import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authFetch } from '@/services/authFetch';
import { aiContext } from '@/services/aiContext';

type Role = 'user' | 'assistant';
type Provider = 'ollama' | 'agnes';
type Message = { id: number; role: Role; content: string; reasoning?: string; streaming?: boolean };
type StreamPayload = { choices?: Array<{ delta?: Record<string, unknown>; message?: Record<string, unknown> }>; error?: { message?: string }; message?: string };

const FAB_SIZE = 52;
const EDGE = 16;
const CODE_TOKENS = /(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|SELECT|FROM|WHERE|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;

function safeHref(value: string) {
  return /^(https?:|mailto:)/i.test(value) ? value : undefined;
}

function renderInline(value: string, prefix: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*[^*]+\*|_[^_]+_)/g).filter(Boolean).map((part, index) => {
    const key = `${prefix}-${index}`;
    if (part.startsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~')) return <del key={key}>{part.slice(2, -2)}</del>;
    if (part.startsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith('[')) {
      const match = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      if (match) return <a key={key} href={safeHref(match[2])} target="_blank" rel="noreferrer">{match[1]}</a>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) return <em key={key}>{part.slice(1, -1)}</em>;
    return <span key={key}>{part}</span>;
  });
}

function renderCode(value: string) {
  return value.split('\n').map((line, lineIndex) => (
    <span className="ai-code-line" key={lineIndex}>
      {line.split(CODE_TOKENS).filter(Boolean).map((part, index) => (
        <span key={index} className={part.startsWith('//') || part.startsWith('#') ? 'token-comment' : /^['"`]/.test(part) ? 'token-string' : /^\d/.test(part) ? 'token-number' : /^(const|let|var|function|return|if|else|for|while|class|import|from|export|async|await|def|SELECT|FROM|WHERE|true|false|null|undefined)$/.test(part) ? 'token-keyword' : undefined}>{part}</span>
      ))}
      {lineIndex < value.split('\n').length - 1 && '\n'}
    </span>
  ));
}

function MarkdownMessage({ value }: { value: string }) {
  const nodes: ReactNode[] = [];
  const lines = value.split('\n');
  let code: string[] = [];
  let language = '';
  let inCode = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = line.match(/^```\s*([^\s]*)/);
    if (fence) {
      if (inCode) {
        nodes.push(<pre key={`code-${index}`}><code className={language ? `language-${language}` : undefined}>{renderCode(code.join('\n'))}</code></pre>);
        code = [];
        language = '';
      } else {
        language = fence[1];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as keyof JSX.IntrinsicElements;
      nodes.push(<Tag key={index}>{renderInline(heading[2], `h-${index}`)}</Tag>);
    } else if (/^\s*([-*+] |\d+\. )/.test(line)) {
      nodes.push(<div className="ai-md-list" key={index}>• {renderInline(line.replace(/^\s*(?:[-*+] |\d+\. )/, ''), `l-${index}`)}</div>);
    } else if (line.startsWith('>')) {
      nodes.push(<blockquote key={index}>{renderInline(line.replace(/^>\s?/, ''), `q-${index}`)}</blockquote>);
    } else if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={index} />);
    } else {
      nodes.push(<p key={index}>{renderInline(line, `p-${index}`)}</p>);
    }
  }
  if (inCode) nodes.push(<pre key="code-tail"><code className={language ? `language-${language}` : undefined}>{renderCode(code.join('\n'))}</code></pre>);
  return <div className="ai-markdown">{nodes}</div>;
}

/** Global, draggable AI assistant with incremental OpenAI-compatible SSE output. */
export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState<Provider>(() => localStorage.getItem('opencollab-ai-provider') === 'ollama' ? 'ollama' : 'agnes');
  const [pos, setPos] = useState(() => ({ x: Math.max(EDGE, window.innerWidth - FAB_SIZE - 24), y: Math.max(EDGE, window.innerHeight - FAB_SIZE - 24) }));
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messageIdRef = useRef(0);
  const draggingRef = useRef(false);
  const dragOffRef = useRef({ dx: 0, dy: 0 });
  const movedRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => { localStorage.setItem('opencollab-ai-provider', provider); }, [provider]);
  useEffect(() => { if (open) requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }); }, [open, messages]);

  const append = (id: number, content = '', reasoning = '') => {
    if (!content && !reasoning) return;
    setMessages((current) => current.map((message) => message.id === id ? { ...message, content: message.content + content, reasoning: (message.reasoning || '') + reasoning } : message));
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const user = { id: ++messageIdRef.current, role: 'user' as const, content: text };
    const assistantId = ++messageIdRef.current;
    const history = [...messages, user].map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, user, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setError('');
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await authFetch('/api/ai/chat/stream', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ provider, context: aiContext.current || '', messages: history }),
      });
      if (!response.ok || !response.body) throw new Error(`请求失败 (${response.status})`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const consume = (event: string) => {
        const type = event.match(/^event:\s*(.+)$/m)?.[1];
        const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n') || event.trim();
        if (!data || data === '[DONE]') return;
        let payload: StreamPayload;
        try { payload = JSON.parse(data) as StreamPayload; } catch { return; }
        if (type === 'error' || payload.error) throw new Error(payload.error?.message || payload.message || 'AI 服务响应失败');
        const delta = payload.choices?.[0]?.delta || payload.choices?.[0]?.message || {};
        append(assistantId, String(delta.content || ''), String(delta.reasoning_content || delta.reasoning || ''));
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r/g, '');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          consume(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '与 AI 服务通信失败');
    } finally {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, streaming: false } : message));
      setLoading(false);
      abortRef.current = null;
    }
  };

  const onFabPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    downPosRef.current = { x: event.clientX, y: event.clientY };
    dragOffRef.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onFabPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    if (Math.hypot(event.clientX - downPosRef.current.x, event.clientY - downPosRef.current.y) > 5) movedRef.current = true;
    if (!movedRef.current) return;
    setPos({ x: Math.max(EDGE, Math.min(window.innerWidth - FAB_SIZE - EDGE, event.clientX - dragOffRef.current.dx)), y: Math.max(EDGE, Math.min(window.innerHeight - FAB_SIZE - EDGE, event.clientY - dragOffRef.current.dy)) });
  };
  const stopDragging = () => { draggingRef.current = false; };
  const panelLeft = Math.max(8, Math.min(pos.x - 288, window.innerWidth - 356));
  const panelTop = Math.max(8, Math.min(pos.y - 520, window.innerHeight - 160));

  return <>
    <button type="button" className="ai-fab" aria-label="打开 AI 助手" title="拖动或打开 AI 助手" style={{ left: pos.x, top: pos.y }} onPointerDown={onFabPointerDown} onPointerMove={onFabPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging} onClick={() => { if (movedRef.current) { movedRef.current = false; return; } setOpen((value) => !value); }}>AI</button>
    {open && <aside className="ai-panel ai-floating" aria-label="AI 助手" style={{ left: panelLeft, top: panelTop }}>
      <div className="ai-panel-header"><span>AI 助手 <small>流式响应</small></span><label className="ai-provider"><span className="sr-only">AI 模型</span><select value={provider} disabled={loading} onChange={(event) => setProvider(event.target.value as Provider)}><option value="ollama">本地 Ollama</option><option value="agnes">Agnes 2.0 Flash</option></select></label><button className="ai-panel-close" onClick={() => setOpen(false)} aria-label="关闭 AI 助手">&times;</button></div>
      <div className="ai-list" ref={listRef}>
        {messages.length === 0 ? <p className="ai-empty">向 AI 提问吧。在编辑页中，当前文件内容会自动作为上下文。</p> : messages.map((message) => <div key={message.id} className={`ai-msg ai-${message.role}`}><div className="ai-role">{message.role === 'user' ? '我' : 'AI'}</div><div className="ai-bubble">{message.reasoning && <details className="ai-reasoning"><summary>思考过程</summary><div>{message.reasoning}</div></details>}{message.streaming && !message.content ? <span className="ai-thinking"><i />正在思考…</span> : <MarkdownMessage value={message.content || '（无内容返回）'} />}</div></div>)}
        {error && <p className="ai-error">{error}</p>}
      </div>
      <div className="ai-input-area"><textarea placeholder="输入问题，AI 将基于当前文件内容回答…" value={input} disabled={loading} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} />
        <div className="ai-bottom"><span className="ai-hint">Enter 发送 · Shift+Enter 换行</span>{loading ? <button className="ai-send ai-stop" onClick={() => abortRef.current?.abort()}>停止</button> : <button className="ai-send" disabled={!input.trim()} onClick={send}>发送</button>}</div>
      </div>
    </aside>}
  </>;
}
