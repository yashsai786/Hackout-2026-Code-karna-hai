import type { ReactNode } from 'react';

// A deliberately small, safe subset. No markdown dependency and no dangerouslySetInnerHTML: this
// returns React nodes, so nothing the model emits can become markup.
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function inline(text: string, keyBase: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part, i) => {
      const key = `${keyBase}-${i}`;
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return (
          <code key={key} className="mono">
            {part.slice(1, -1)}
          </code>
        );
      if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
      return <span key={key}>{part}</span>;
    });
}

export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim());
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.every(l => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul className="copilot-list" key={b}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*•]\s+/, ''), `${b}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol className="copilot-list ordered" key={b}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''), `${b}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        if (/^#{1,3}\s+/.test(lines[0])) {
          return (
            <p key={b}>
              <strong>{inline(lines[0].replace(/^#{1,3}\s+/, ''), `${b}-h`)}</strong>
              {lines.slice(1).map((l, i) => (
                <span key={i}>
                  {'\n'}
                  {inline(l, `${b}-${i}`)}
                </span>
              ))}
            </p>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <span key={i}>
                {i ? ' ' : ''}
                {inline(l, `${b}-${i}`)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}
