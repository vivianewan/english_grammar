/* Endless practice with auto-submit + session summary
   Robust to varied question schemas and unknown types.
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

let BANK = [];
let order = [];
let i = 0;
let started = false;
let answered = 0;
let score = 0;
let streak = 0;
let maxStreak = 0;
let submitted = false;
let sessionStart = 0;

/* ---------------- helpers ---------------- */

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

/* ------ schema normalizer (the fix you need) ------ */
function normalizeQuestion(raw) {
  const q = { ...raw };

  // infer type if missing/unknown
  let type = (q.type || "").toLowerCase();
  if (type !== "mcq" && type !== "fill") {
    if (Array.isArray(q.options) && q.options.length) type = "mcq";
    else type = "fill";
  }

  // unify answer field
  let ans = q.answer ?? q.answers ?? q.correct ?? q.key;

  if (type === "mcq") {
    const opts = Array.isArray(q.options) ? q.options : [];
    // if answer is a string, map to option index (case-insensitive)
    if (typeof ans === "string") {
      const idx = opts.findIndex(
        (o) => (o ?? "").toString().trim().toLowerCase() === ans.trim().toLowerCase()
      );
      ans = idx >= 0 ? idx : 0; // default to first option if not found
    }
    // if answer is array like ["B"] or ["option text"], map first element
    if (Array.isArray(ans) && ans.length) {
      if (typeof ans[0] === "number") ans = ans[0];
      else if (typeof ans[0] === "string") {
        const idx = opts.findIndex(
          (o) => (o ?? "").toString().trim().toLowerCase() === ans[0].trim().toLowerCase()
        );
        ans = idx >= 0 ? idx : 0;
      }
    }
    if (typeof ans !== "number") ans = 0;
    return { ...q, type: "mcq", options: opts, answer: ans };
  } else {
    // fill-in: allow string or array of strings
    if (typeof ans === "string") ans = [ans];
    if (!Array.isArray(ans) || ans.length === 0) ans = [""];
    ans = ans.map((s) => (s ?? "").toString());
    return { ...q, type: "fill", answer: ans };
  }
}

/* -------------- rendering --------------- */

function renderQuestion(qraw) {
  const q = normalizeQuestion(qraw);

  els.prompt.innerHTML = encodeHTML(q.question || "(No prompt provided)");
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
  } else {
    const w = document.createElement("div");
    w.className = "fillin";
    w.innerHTML = `
      <input id="fill-answer" type="text" placeholder="Type your answer, then press Enter" autocomplete="off">
    `;
    els.choices.appendChild(w);
    setTimeout(() => document.getElementById("fill-answer")?.focus(), 0);
  }
}

function getUserAnswer(qraw) {
  const q = normalizeQuestion(qraw);
  if (q.type === "mcq") {
    const checked = els.choices.querySelector('input[name="choice"]:checked');
    return checked ? Number(checked.value) : null;
  } else {
    const v = document.getElementById("fill-answer")?.value ?? "";
    return v.trim();
  }
}

function isCorrect(qraw, ans) {
  const q = normalizeQuestion(qraw);
  if (q.type === "mcq") return ans === q.answer;
  const gold = q.answer.map((s) => s.trim().toLowerCase());
  return gold.includes((ans ?? "").toLowerCase());
}

function showFeedback(ok, qraw) {
  const q = normalizeQuestion(qraw);
  const prefix = ok ? "✅ Correct." : "❌ Not quite.";
  const reveal =
    q.type === "mcq"
      ? `Answer: <strong>${encodeHTML(q.options[q.answer])}</strong>`
      : `Answer: <strong>${encodeHTML(q.answer.join(" / "))}</strong>`;
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

/* -------------- summary --------------- */

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

/* -------------- loaders --------------- */

async function safeFetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  return await res.json();
}

async function loadAllPacks() {
  const { packs } = await safeFetchJson("data/packs.json");
  const all = [];
  for (const p of packs) {
    const blob = await safeFetchJson(p);
    const qs = Array.isArray(blob) ? blob : (blob.questions || []);
    all.push(...qs);
  }
  if (!all.length) throw new Error("No questions loaded.");
  return all;
}

/* -------------- engine --------------- */

async function start() {
  if (started) return;
  started = true;

  try {
    BANK = await loadAllPacks();
  } catch (err) {
    started = false;
    alert(`Could not start practice:\n${err.message || err}`);
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
  // keep whatever label your HTML uses (e.g., “Next →” or “Press Enter →”)
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
    updateStatus();
  } else {
    nextIndex();
    paintCurrent();
  }
}

/* -------------- events --------------- */

els.start.addEventListener("click", start);

// make the visible button behave like Enter
els.next.addEventListener("click", (e) => {
  e.preventDefault();
  if (!started) return;
  autoSubmitThenAdvance();
});

document.addEventListener("keydown", (e) => {
  if (!started) return;
  if (e.key === "Enter") {
    e.preventDefault();
    autoSubmitThenAdvance();
  }
});

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

els.backdrop.addEventListener("click", () => {
  if (!started) return;
  closeSummary();
  resetStateToLanding();
});
