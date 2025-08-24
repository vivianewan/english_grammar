/* Endless practice + auto-submit-on-next
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
};

let BANK = [];          // all questions
let order = [];         // shuffled indices
let i = 0;              // position in order
let started = false;
let score = 0;
let streak = 0;
let submitted = false;  // has the current question been auto-submitted yet?

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
    // case-insensitive, trim; allow any of an array of answers
    const gold = Array.isArray(q.answer) ? q.answer : [q.answer];
    return gold.map(s => s.trim().toLowerCase()).includes((ans ?? "").toLowerCase());
  }
  return false;
}

function showFeedback(ok, q) {
  const prefix = ok ? "✅ Correct." : "❌ Not quite.";
  const reveal = (q.type === "mcq") ?
    `Answer: <strong>${encodeHTML(q.options[q.answer])}</strong>` :
    `Answer: <strong>${encodeHTML(Array.isArray(q.answer) ? q.answer.join(" / ") : q.answer)}</strong>`;
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
    return;
  }

  order = shuffle([...Array(BANK.length).keys()]);
  i = 0; score = 0; streak = 0; submitted = false;

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
    if (ok) { score++; streak++; } else { streak = 0; }
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
  started = false;
  hide(els.card);
  show(els.empty);
});
els.next.addEventListener("click", autoSubmitThenAdvance);

// keyboard: Enter = Next
document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.key === "Enter") {
    e.preventDefault();
    autoSubmitThenAdvance();
  }
});
