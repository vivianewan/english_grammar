/* Endless practice + auto-submit-on-next + SESSION SUMMARY
   Loads all packs listed in data/packs.json and continuously cycles through them.
*/

const els = {
  start: document.getElementById("btn-start"),
  end: document.getElementById("btn-end"),
  next: document.getElementById("btn-next"),
  card: document.getElementById("card"),
  empty: document.getElementById("empty"),
  prompt: document.getElementById("prompt"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  qnum: document.getElementById("q-number"),
  correct: document.getElementById("q-correct"),
  streak: document.getElementById("q-streak"),
  // summary modal
  modal: document.getElementById("summary-modal"),
  backdrop: document.getElementById("summary-backdrop"),
  sumAnswered: document.getElementById("sum-answered"),
  sumCorrect: document.getElementById("sum-correct"),
  sumAccuracy: document.getElementById("sum-accuracy"),
  sumMaxStreak: document.getElementById("sum-maxstreak"),
  sumTime: document.getElementById("sum-time"),
  modalClose: document.getElementById("summary-close"),
  modalRestart: document.getElementById("summary-restart"),
};

let BANK = [];          // all questions
let order = [];         // shuffled indices
let i = 0;              // position in order
let started = false;
let answered = 0;
let score = 0;
let streak = 0;
let maxStreak = 0;
let submitted = false;  // has the current question been auto-submitted yet?
let sessionStart = 0;

// ---- helpers ---------------------------------------------------------------

function shuffle(a) {
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

function encodeHTML(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function renderQuestion(q) {
  els.prompt.innerHTML = encodeHTML(q.question);
  els.choices.innerHTML = "";
  els.feedback.innerHTML = "";
  hide(els.feedback);

  if (q.type === "mcq") {
    q.options.forEach((opt, idx) => {
      const id = `opt-${idx}`;
      const w = document.createElement("label");
      w.className = "choice";
      w.innerHTML = `
        <input type="radio" name="choice" value="${idx}" id="${id}">
        <span>${encodeHTML(opt)}</span>
      `;
      els.choices.appendChild(w);
    });
  } else if (q.type === "fill") {
    const w = document.createElement("div");
    w.className = "fillin";
    w.innerHTML = `
      <input id="fill-answer" type="text" placeholder="Type your answer" autocomplete="off">
    `;
    els.choices.appendChild(w);
    // focus for faster typing
    setTimeout(() => document.getElementById("fill-answer")?.focus(), 0);
  }
}

function getUserAnswer(q) {
  if (q.type === "mcq") {
    const checked = els.choices.querySelector('input[name="choice"]:checked');
    return checked ? Number(checked.value) : null;
  } else if (q.type === "fill") {
    const v = document.getElementById("fill-answer")?.value ?? "";
    return v.trim();
  }
  return null;
}

function isCorrect(q, ans) {
  if (q.type === "mcq") return ans === q.answer;                // answer is index
  if (q.type === "fill") {
    const gold = Array.isArray(q.answer) ? q.answer : [q.answer];
    return gold.map(s => s.trim().toLowerCase()).includes((ans ?? "").toLowerCase());
  }
  return false;
}

function showFeedback(ok, q) {
  const prefix = ok ? "✅ Correct." : "❌ Not quite.";
  const reveal = (q.type === "mcq")
    ? `Answer: <strong>${encodeHTML(q.options[q.answer])}</strong>`
    : `Answer: <strong>${encodeHTML(Array.isArray(q.answer) ? q.answer.join(" / ") : q.answer)}</strong>`;
  const expl = q.explanation ? `<div class="explain">${encodeHTML(q.explanation)}</div>` : "";
  els.feedback.innerHTML = `${prefix} ${reveal}${expl}`;
  show(els.feedback);
}

function updateStatus() {
  els.qnum.textContent = (i + 1).toString();
  els.correct.textContent = score.toString();
  els.streak.textContent = streak.toString();
}

function nextIndex() {
  i++;
  if (i >= order.length) {
    // finished one pass -> reshuffle for endless mode
    order = shuffle([...Array(BANK.length).keys()]);
    i = 0;
  }
}

// ---- session summary -------------------------------------------------------

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function openSummary() {
  // compute stats
  const elapsed = Date.now() - sessionStart;
  const accuracy = answered ? Math.round((score / answered) * 100) : 0;

  els.sumAnswered.textContent = String(answered);
  els.sumCorrect.textContent = String(score);
  els.sumAccuracy.textContent = `${accuracy}%`;
  els.sumMaxStreak.textContent = String(maxStreak);
  els.sumTime.textContent = formatDuration(elapsed);

  // show modal
  els.backdrop.classList.remove("hidden");
  if (typeof els.modal.showModal === "function") {
    els.modal.showModal();
  } else {
    // fallback if <dialog> unsupported
    els.modal.classList.remove("hidden");
  }
}

function closeSummary() {
  els.backdrop.classList.add("hidden");
  if (typeof els.modal.close === "function") {
    els.modal.close();
  } else {
    els.modal.classList.add("hidden");
  }
}

function resetStateToLanding() {
  started = false;
  BANK = [];
  order = [];
  i = 0;
  answered = 0;
  score = 0;
  streak = 0;
  maxStreak = 0;
  submitted = false;
  sessionStart = 0;
  els.qnum.textContent = "0";
  els.correct.textContent = "0";
  els.streak.textContent = "0";
  hide(els.card);
  show(els.empty);
}

// ---- engine ---------------------------------------------------------------

async function loadAllPacks() {
  // packs.json = { "packs": ["data/eng_week1.json", ...] }
  const res = await fetch("data/packs.json");
  const { packs } = await res.json();

  const all = [];
  for (const p of packs) {
    const r = await fetch(p);
    const blob = await r.json();
    // each file can be {meta, questions:[...]} or plain array [...]
    const qs = Array.isArray(blob) ? blob : (blob.questions || []);
    all.push(...qs);
  }
  return all;
}

async function start() {
  if (started) return;
  started = true;

  BANK = await loadAllPacks();
  if (!BANK.length) {
    alert("No questions found. Check data/packs.json.");
    started = false;
    return;
  }

  order = shuffle([...Array(BANK.length).keys()]);
  i = 0;
  answered = 0;
  score = 0;
  streak = 0;
  maxStreak = 0;
  submitted = false;
  sessionStart = Date.now();

  hide(els.empty);
  show(els.card);
  paintCurrent();
}

function paintCurrent() {
  const q = BANK[order[i]];
  renderQuestion(q);
  updateStatus();
  submitted = false;
  els.next.textContent = "Next →";
}

function autoSubmitThenAdvance() {
  const q = BANK[order[i]];
  if (!submitted) {
    const ans = getUserAnswer(q);
    const ok = isCorrect(q, ans);
    // update stats once per question
    answered++;
    if (ok) {
      score++;
