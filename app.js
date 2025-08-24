/* Endless practice + auto-submit-on-next + SESSION SUMMARY
   Now with robust error handling for JSON loads.
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
  if (q.type === "mcq") return ans === q.answer;
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
  const elapsed = Date.now() - sessionStart;
  const accuracy = answered ? Math.round((score / answered) * 100) : 0;

  els.sumAnswered.textContent = String(answered);
  els.sumCorrect.textContent = String(score);
  els.sumAccuracy.textContent = `${accuracy}%`;
  els.sumMaxStreak.textContent = String(maxStreak);
  els.sumTime.textContent = formatDuration(elapsed);

  els.backdrop.classList.remove("hidden");
  if (typeof els.modal.showModal === "function") els.modal.showModal();
  else els.modal.classList.remove("hidden");
}

function closeSummary() {
  els.backdrop.classList.add("hidden");
  if (typeof els.modal.close === "function") els.modal.close();
  else els.modal.classList.add("hidden");
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

// ---- robust loaders --------------------------------------------------------

async function safeFetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    const hint = location.protocol === "file:" ? "\n\nHint: open via a local server or GitHub Pages (fetch is blocked on file://)." : "";
    throw new Error(`Cannot fetch ${url}. ${e?.message || e}${hint}`);
  }
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`Invalid JSON in ${url}. Remove comments, trailing commas, etc.\n${e?.message || e}`);
  }
}

async function loadAllPacks() {
  const cfg = await safeFetchJson("data/packs.json");
  if (!cfg || !Array.isArray(cfg.packs)) {
    throw new Error("data/packs.json must be: { \"packs\": [ \"data/eng_week1.json\", ... ] }");
  }

  const all = [];
  for (const p of cfg.packs) {
    const blob = await safeFetchJson(p);
    const qs = Array.isArray(blob) ? blob : (blob.questions || []);
    if (!Array.isArray(qs) || !qs.length) {
      console.warn(`No questions found in ${p}`);
      continue;
    }
    all.push(...qs);
  }
  if (!all.length) {
    throw new Error("Loaded 0 questions. Check your pack file paths and contents.");
  }
  return all;
}

// ---- engine ---------------------------------------------------------------

async function start() {
  if (started) return;
  started = true;

  try {
    BANK = await loadAllPacks();
  } catch (err) {
    started = false;
    console.error(err);
    alert(`⚠️ Could not start practice:\n\n${err.message || err}`);
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
    answered++;
    if (ok) {
      score++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
    showFeedback(ok, q);
    submitted = true;
    els.next.textContent = "Continue →";
    updateStatus();
  } else {
    nextIndex();
    paintCurrent();
  }
}

// ---- wire up --------------------------------------------------------------

els.start.addEventListener("click", start);

els.end.addEventListener("click", () => {
  if (!started) return;
  openSummary();
});

els.modalClose.addEventListener("click", () => {
  closeSummary();
  resetStateToLanding();
});

els.modalRestart.addEventListener("click", async () => {
  closeSummary();
  resetStateToLanding();
  await start();
});

// keyboard: Enter = Next (only when started)
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.key === "Enter") {
    e.preventDefault();
    autoSubmitThenAdvance();
  }
});

// clicking backdrop also closes (optional)
els.backdrop.addEventListener("click", () => {
  if (!started) return;
  closeSummary();
  resetStateToLanding();
});
