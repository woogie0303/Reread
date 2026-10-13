/**
 * 개인정보 처리방침 페이지를 만든다 — docs/privacy-policy.md → site/privacy/index.html.
 *
 * 방침의 원본은 마크다운 한 곳이다. 고칠 때는 그 문서만 고치고 이 스크립트를 다시 돌린다
 * (`node site/build.mjs`). 배포 워크플로가 올리기 전에 같은 일을 하므로, 생성된 HTML은
 * 저장소에 넣지 않는다.
 *
 * 방침이 쓰는 마크다운만 다룬다 — ##, 굵게, 링크, 목록, 표, 문단. 그 밖의 문법이 필요해지면
 * 라이브러리를 들이기 전에 먼저 문서를 단순하게 고친다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'docs', 'privacy-policy.md'), 'utf8');

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 글 안의 꾸밈 — 이스케이프를 먼저 하고, 그 위에 태그를 얹는다 */
function inline(raw) {
  return escape(raw)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="noopener">$2</a>')
    .replace(
      /(^|[\s(:])([\w.+-]+@[\w-]+\.[\w.-]+)/g,
      '$1<a href="mailto:$2">$2</a>',
    );
}

const rows = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

function render(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      i += 1;
    } else if (line.trimStart().startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        block.push(lines[i]);
        i += 1;
      }
      const [head, , ...body] = block;
      out.push(
        '<div class="table-scroll"><table><thead><tr>' +
          rows(head).map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body
            .map((r) => `<tr>${rows(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('') +
          '</tbody></table></div>',
      );
    } else if (/^\s*- /.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*- /, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
    } else {
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith('## ') &&
        !lines[i].trimStart().startsWith('|') &&
        !/^\s*- /.test(lines[i])
      ) {
        para.push(lines[i].trim());
        i += 1;
      }
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

const updated = source.match(/시행일자:\s*([^\n]+)/)?.[1]?.trim();

const page = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>개인정보 처리방침 — Reread</title>
  <meta name="description" content="Reread 앱의 개인정보 처리방침입니다." />
  <meta name="theme-color" content="#fdfbf7" />
  <link rel="icon" href="/favicon.png" />
  <link rel="canonical" href="https://reread.cloud/privacy" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <div class="wrap">
    <header class="top">
      <a class="wordmark" href="/">Reread</a>
      <nav><a href="/">홈</a></nav>
    </header>

    <main class="doc">
      <h1>개인정보 처리방침</h1>
      ${updated ? `<p class="updated">시행일 ${escape(updated)}</p>` : ''}
${render(source)}
    </main>

    <footer>
      <p><a href="/">Reread 홈</a> · <a href="mailto:support.woogie@gmail.com">support.woogie@gmail.com</a></p>
      <p>© 2026 woogie · Reread</p>
    </footer>
  </div>
</body>
</html>
`;

const outDir = join(here, 'privacy');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), page);
console.log(`site/privacy/index.html (${page.length} bytes)`);
