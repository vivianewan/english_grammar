// English Grammar Sprint – client-side quiz engine

const els = {
  home: document.getElementById('view-home'),
  quiz: document.getElementById('quiz'),
  results: document.getElementById('results'),
  packSelect: document.getElementById('pack-select'),
  modeSelect: document.getElementById('mode-select'),
  qcount: document.getElementById('qcount'),
  btnStart: document.getElementById('btn-start'),
  btnResume: document.getElementById('btn-resume'),
  btnSubmit: document.getElementById('btn-submit'),
  btnNext: document.getElementById('btn-next'),
  btnShow: document.getElementById('btn-show'),
  progress: document.getElementById('progress'),
  score: document.getElementById('score'),
  finalScore: document.getElementById('final-score'),
  finalTotal: document.getElementById('final-total'),
  questionContainer: document.getElementById('question-container'),
  feedback: document.getElementById('feedback'),
  review: document.getElementById('review'),
};

let packs = [];
let state = null; // persisted

const STORAGE_KEY = 'eng_grammar_sprint_v1';

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

// Fisher–Yates shuffle
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadPacksList() {
  const res = await fetch('data/packs.json');
  packs = await res.json();
  els.packSelect.innerHTML = packs.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
}

async function loadPackData(packId) {
  const meta = packs.find(p => p.id === packId);
  if (!meta) throw new Error('Pack not found');
  const res = await fetch(meta.path);
  return res.json();
}

function renderQuestion(q) {
  els.questionContainer.innerHTML = '';
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';

  const card = document.createElement('div');
  card.className = 'card';

  const stem = document.createElement('div');
  stem.innerHTML = `<strong>${q.id}.</strong> ${q.question}`;
  card.appendChild(stem);

  if (q.type === 'mcq') {
    q._inputEls = q.choices.map((choice, idx) => {
      const row = document.createElement('label');
      row.className = 'choice';
      const input = document.createElement('input');
      input.type = q.multi ? 'checkbox' : 'radio';
      input.name = 'q';
      input.value = idx;
      row.appendChild(input);
      row.appendChild(document.createTextNode(choice));
      card.appendChild(row);
      return input;
    });
  } else if (q.type === 'cloze') {
    // underscores indicate a blank: replace first "____" with input
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'type here';
    inp.style.minWidth = '180px';
    const html = q.question.replace('____', inp.outerHTML);
    stem.innerHTML = `<strong>${q.id}.</strong> ${html}`;
    // re-query input after insertion
    q._textEl = null;
    setTimeout(() => q._textEl = card.querySelector('input[type="text"]'));
  } else if (q.type === 'transform') {
    const prompt = document.createElement('div');
    prompt.className = 'explanation';
    prompt.textContent = q.prompt || 'Rewrite as instructed.';
    card.appendChild(prompt);
    const ta = document.createElement('textarea');
    ta.rows = 3; ta.style.width = '100%'; ta.placeholder = 'Rewrite here';
    card.appendChild(ta);
    q._textEl = ta;
  } else if (q.type === 'match') {
    // simple dropdown matching (left terms, right options)
    q._selectEls = q.pairs.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'choice';
      const left = document.createElement('span');
      left.textContent = p.left + ' →';
      const sel = document.createElement('select');
      sel.innerHTML = ['<option value="">— choose —</option>']
        .concat(q.options.map(o => `<option>${o}</option>`)).join('');
      row.appendChild(left); row.appendChild(sel);
      card.appendChild(row);
      return sel;
    });
  }

  els.questionContainer.appendChild(card);
}

function getUserAnswer(q) {
  if (q.type === 'mcq') {
    const chosen = q._inputEls.filter(i => i.checked).map(i => Number(i.value));
    return chosen.sort((a,b)=>a-b);
  }
  if (q.type === 'cloze' || q.type === 'transform') {
    return (q._textEl?.value || '').trim();
  }
  if (q.type === 'match') {
    return q._selectEls.map(s => s.value);
  }
  return null;
}

function arraysEqual(a,b){ return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]); }

function grade(q, userAnswer) {
  let correct = false, feedback = '', expected = q.answer;

  if (q.type === 'mcq') {
    correct = arraysEqual(userAnswer, q.answer);
    feedback = correct ? 'Correct.' : `Answer: ${q.answer.map(i=>q.choices[i]).join(', ')}`;
  } else if (q.type === 'cloze' || q.type === 'transform') {
    const normalize = s => s.toLowerCase().replace(/\s+/g,' ').trim();
    if (Array.isArray(expected)) {
      correct = expected.some(acc => normalize(userAnswer) === normalize(acc));
      feedback = correct ? 'Correct.' : `Acceptable answers: ${expected.join(' | ')}`;
    } else {
      correct = normalize(userAnswer) === normalize(expected);
      feedback = correct ? 'Correct.' : `Answer: ${expected}`;
    }
  } else if (q.type === 'match') {
    correct = arraysEqual(userAnswer, q.answer);
    feedback = correct ? 'Correct.' : 'Check the matches shown in the review.';
  }

  if (q.explanation) feedback += `\n${q.explanation}`;
  return { correct, feedback };
}

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }

function updateTopbar() {
  els.progress.textContent = `${state.idx+1}/${state.total}`;
  els.score.textContent = state.score;
}

function startSession(packJson, count, mode) {
  const qs = shuffle(packJson.questions).slice(0, count);
  state = {
    packId: packJson.meta.id,
    packTitle: packJson.meta.title,
    mode,
    qs,
    idx: 0,
    score: 0,
    total: qs.length,
    answers: [], // {id, userAnswer, correct}
  };
  saveState();
  hide(els.results); show(els.quiz);
  renderQuestion(state.qs[state.idx]);
  updateTopbar();
}

function submitCurrent() {
  const q = state.qs[state.idx];
  const ua = getUserAnswer(q);
  const { correct, feedback } = grade(q, ua);
  state.answers[state.idx] = { id: q.id, userAnswer: ua, correct, expected: q.answer, explanation: q.explanation, q };
  if (correct) state.score++;
  saveState();

  if (state.mode === 'practice') {
    els.feedback.textContent = feedback;
    els.feedback.className = 'feedback ' + (correct ? 'good' : 'bad');
  }
}

function nextQuestion() {
  if (state.idx < state.total - 1) {
    state.idx++;
    saveState();
    renderQuestion(state.qs[state.idx]);
    updateTopbar();
    els.feedback.textContent = '';
  } else {
    finish();
  }
}

function showAnswer() {
  const q = state.qs[state.idx];
  if (q.type === 'mcq') {
    els.feedback.textContent = `Answer: ${q.answer.map(i=>q.choices[i]).join(', ')}${q.explanation ? '\n'+q.explanation : ''}`;
  } else if (q.type === 'match') {
    els.feedback.textContent = `Answer: ${q.pairs.map((p,i)=>`${p.left} → ${q.answer[i]}`).join(' | ')}${q.explanation ? '\n'+q.explanation : ''}`;
  } else {
    const ans = Array.isArray(q.answer) ? q.answer.join(' | ') : q.answer;
    els.feedback.textContent = `Answer: ${ans}${q.explanation ? '\n'+q.explanation : ''}`;
  }
  els.feedback.className = 'feedback';
}

function finish() {
  hide(els.quiz); show(els.results);
  els.finalScore.textContent = state.score;
  els.finalTotal.textContent = state.total;

  els.review.innerHTML = state.qs.map((q, i) => {
    const a = state.answers[i];
    const expected = Array.isArray(q.answer) ? q.answer.join(' | ') : (
      q.type === 'match' ? q.pairs.map((p,idx)=>`${p.left} → ${q.answer[idx]}`).join(' | ') : q.answer
    );
    const user = (() => {
      if (!a) return '(no answer)';
      if (q.type === 'mcq') return a.userAnswer.map(i=>q.choices[i]).join(', ');
      if (q.type === 'match') return q.pairs.map((p,idx)=>`${p.left} → ${a.userAnswer[idx]||'—'}`).join(' | ');
      return String(a.userAnswer || '');
    })();
    return `
      <div class="review-item">
        <div><strong>${q.id}.</strong> ${q.question}</div>
        <div><em>Your answer:</em> ${user || '(blank)'} — ${a && a.correct ? '<span style="color:#0a7a20">Correct</span>' : '<span style="color:#b00020">Incorrect</span>'}</div>
        <div><em>Answer:</em> ${expected}</div>
        ${q.explanation ? `<div class="explanation">${q.explanation}</div>` : ''}
      </div>
    `;
  }).join('');

  saveState();
}

function retryWrong() {
  const wrong = state.qs.filter((q,i)=> !(state.answers[i] && state.answers[i].correct));
  if (wrong.length === 0) return alert('No wrong answers to retry!');
  state.qs = wrong;
  state.idx = 0;
  state.total = wrong.length;
  state.score = 0;
  state.answers = [];
  saveState();
  hide(els.results); show(els.quiz);
  renderQuestion(state.qs[state.idx]);
  updateTopbar();
}

function restart() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
  hide(els.quiz); hide(els.results);
}

els.btnStart.addEventListener('click', async () => {
  const packId = els.packSelect.value;
  const mode = els.modeSelect.value;
  const count = Math.max(5, Math.min(100, Number(els.qcount.value) || 10));
  const pack = await loadPackData(packId);
  startSession(pack, count, mode);
});

els.btnResume.addEventListener('click', async () => {
  const prev = loadState();
  if (!prev) return alert('No saved session found.');
  const pack = await loadPackData(prev.packId);
  prev.qs = prev.qs.map(idOrObj => (typeof idOrObj === 'object' ? idOrObj : pack.questions.find(q=>q.id===idOrObj)));
  state = prev;
  show(els.quiz); hide(els.results);
  renderQuestion(state.qs[state.idx]);
  updateTopbar();
});

els.btnSubmit.addEventListener('click', submitCurrent);
els.btnNext.addEventListener('click', nextQuestion);
els.btnShow.addEventListener('click', showAnswer);
document.getElementById('btn-retry-wrong').addEventListener('click', retryWrong);
document.getElementById('btn-restart').addEventListener('click', ()=>{ restart(); show(els.home); });
document.getElementById('btn-export').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'results.json'; a.click();
  URL.revokeObjectURL(url);
});

loadPacksList();
