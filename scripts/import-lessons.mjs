// 把 docs/knowledge-base/*.md 解析后导入数据库 lessons 表（替换全部）
import { readFileSync, readdirSync } from 'fs';

const DIR = 'E:/学习/ai-learning-app/docs/knowledge-base';
const PAT = readFileSync('E:/学习/ai-learning-app/.secrets/pat.txt', 'utf8').trim();
const REF = 'fqaxzfsbqjaevoqnfddr';

const units = [];
let curUnit = null, curLesson = null, mode = 'content';

for (const f of readdirSync(DIR).filter(x => x.endsWith('.md')).sort()) {
  const lines = readFileSync(`${DIR}/${f}`, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    const um = line.match(/^## \[(\d+)\]\s*(.*)$/);
    if (um) {
      curUnit = { id: +um[1], lessons: [] };
      units.push(curUnit);
      curLesson = null;
      continue;
    }
    const lm = line.match(/^###\s+(.*)$/);
    if (lm) {
      curLesson = { title: lm[1].trim().replace(/^第\d+课\s*[·．]\s*/, ''), content: '', task: '', terms: '' };
      curUnit.lessons.push(curLesson);
      mode = 'content';
      continue;
    }
    const tm = line.match(/^任务[:：]\s*(.*)$/);
    if (tm && curLesson) {
      curLesson.task += (curLesson.task ? '\n' : '') + tm[1];
      mode = 'task';
      continue;
    }
    const termLine = line.match(/^术语[:：]\s*(.*)$/);
    if (termLine && curLesson) {
      curLesson.terms += (curLesson.terms ? '\n' : '') + termLine[1];
      mode = 'terms';
      continue;
    }
    if (!curLesson || !line) continue;
    if (mode === 'content') curLesson.content += (curLesson.content ? '\n' : '') + line;
    else if (mode === 'task') curLesson.task += (curLesson.task ? '\n' : '') + line;
    else curLesson.terms += (curLesson.terms ? '\n' : '') + line;
  }
}

const esc = (s) => String(s).replace(/'/g, "''");
const rows = [];
for (const u of units) {
  u.lessons.forEach((l, i) => {
    rows.push(`(${u.id},${i + 1},'${esc(l.title)}','${esc(l.content.trim())}','${esc(l.task.trim())}','${esc(l.terms.trim())}')`);
  });
}

const sqlInsert = `insert into lessons (unit_id, ord, title, content, task, terms) values ${rows.join(',\n')};`;
const api = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  return text;
};

// 先清空再导入
const r1 = await api('delete from lessons;');
console.log('清空 lessons:', r1);
const r2 = await api(sqlInsert);
console.log('导入完成:', r2);
console.log(`共 ${units.length} 个单元 / ${rows.length} 课`);
