// 把 docs/knowledge-base/*.md 解析后导入数据库 lessons 表（替换全部）
import { readFileSync, readdirSync } from 'fs';

const DIR = 'E:/学习/ai-learning-app/docs/knowledge-base';
const PAT = readFileSync('E:/学习/ai-learning-app/.secrets/pat.txt', 'utf8').trim();
const REF = 'fqaxzfsbqjaevoqnfddr';

const units = [];
let curUnit = null, curLesson = null, mode = 'content';

// 可选参数：只导入指定文件（如 node import-lessons.mjs s1-会用AI.md），默认导入全部
const only = process.argv[2] || '';
for (const f of readdirSync(DIR).filter(x => x.endsWith('.md') && (!only || x === only)).sort()) {
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
      curLesson = { title: lm[1].trim().replace(/^第\d+课\s*[·．]\s*/, ''), content: '', task: '', terms: '', quizLines: [] };
      curUnit.lessons.push(curLesson);
      mode = 'content';
      continue;
    }
    // 测验块：以「测验：」开头，收集 Q:/A:/B:/C:/答案:/解析: 行
    if (line === '测验：' && curLesson) {
      mode = 'quiz';
      continue;
    }
    if (mode === 'quiz' && curLesson) {
      if (/^(Q|A|B|C|D|答案|解析)[:：]/.test(line)) {
        curLesson.quizLines.push(line);
        continue;
      }
      if (!line) continue; // 测验块内空行忽略
      mode = 'content'; // 遇到其他内容视为测验块结束
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
const parseQuiz = (lines) => {
  if (!lines.length) return null;
  const get = (key) => (lines.find((l) => l.startsWith(key + ':')) || '').slice(key.length + 1).trim();
  const q = get('Q');
  if (!q) return null;
  const o = ['A', 'B', 'C', 'D'].map((k) => get(k)).filter(Boolean);
  const ansLetter = get('答案');
  const a = ['A', 'B', 'C', 'D'].indexOf(ansLetter);
  const e = get('解析');
  if (o.length < 2 || a < 0) return null;
  return { q, o, a, e };
};
const rows = [];
for (const u of units) {
  u.lessons.forEach((l, i) => {
    const quiz = parseQuiz(l.quizLines);
    rows.push(`(${u.id},${i + 1},'${esc(l.title)}','${esc(l.content.trim())}','${esc(l.task.trim())}','${esc(l.terms.trim())}',${quiz ? `'${esc(JSON.stringify(quiz))}'` : 'null'}::jsonb)`);
  });
}

// 原地更新（upsert）：课程 ID 保持稳定，用户的进度/打卡/测验数据不丢失
const sqlInsert = `insert into lessons (unit_id, ord, title, content, task, terms, quiz) values ${rows.join(',\n')}
on conflict (unit_id, ord) do update set
  title = excluded.title,
  content = excluded.content,
  task = excluded.task,
  terms = excluded.terms,
  quiz = excluded.quiz;`;
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

// 原地更新（upsert，不再清空），ID 稳定则用户学习进度不丢
const r2 = await api(sqlInsert);
console.log('导入完成:', r2);
console.log(`共 ${units.length} 个单元 / ${rows.length} 课`);
