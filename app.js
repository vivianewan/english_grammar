/* Endless practice with auto-submit, session summary, and schema repair */

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
const enc = s => (s ?? "").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

/* ----------- schema normalizer (self-healing) ----------- */
function normalizeQuestion(raw) {
  const q = { ...raw };

  // unify field names
  const typeRaw = (q.type || q.kind || q.format || "").toString().toLowerCase();
  let type;
  if (["mcq","choice","multiple","multiple-choice","multiple_choice","select"].includes(typeRaw)) type = "mcq";
  else if (["fill","text","short","gap","cloze","input"].includes(typeRaw)) type = "fill";
  else type = undefined; // infer below

  let options = q.options || q.choices || q.opts || q.choice;
  if (Array.isArray(options)) options = options.map(v => v == null ? "" : String(v));

  // preferred answer fields
  let ans = q.answer ?? q.answers ?? q.correct ?? q.key ?? q.solution ?? q.ans;

  // infer type if missing
  if (!type) type = Array.isArray(options) && options.length > 0 ? "mcq" : "fill";

  if (type === "mcq") {
    // if MCQ but no usable options, degrade to fill
    if (!Array.isArray(options) || options.length < 2) {
      // treat the answer as acceptable text(s)
      const fillAns = Array.isArray(ans) ? ans : (ans == null ? [""] : [String(ans)]);
      return { question: q.question, type: "fill", answer: fillAns.map(String), explanation: q.explanation };
    }
    // map string answer to index (allow 'A'/'B'... too)
    let idx = 0;
    if (typeof ans === "number") idx = Math.max(0, Math.min(options.length - 1, ans));
    else if (typeof ans === "string") {
      const a = ans.trim().toLowerCase();
      const letter = "abcdefghijklmnopqrstuvwxyz".indexOf(a);
      if (letter >= 0 && letter < options.length && a.length === 1) idx = letter;
      else {
        const found = options.findIndex(o => o.trim().toLowerCase() === a);
        idx = found >= 0 ? found : 0;
      }
    } else if (Array.isArray(ans) && ans.length) {
      if (typeof ans[0] === "number") idx = ans[0];
      else if (typeof ans[0] === "string") {
        const a0 = ans[0].trim().toLowerCase();
        const found = options.findIndex(o => o.trim().toLowerCase() === a0);
        idx = found >= 0 ? found : 0;
      }
    }
    return { question: q.question, type: "mcq", options, answer: idx, explanation: q.explanation };
  }

  // fill-in
  let accept = [];
  if (typeof ans === "string") accept = [ans];
  else if (Array.isArray(ans) && ans.length) accept = ans.map(String);
  else accept = [""];
  return { question: q.question, type: "fill", answer: accept, explanation: q.explanation };
}

/* ---------------- rendering ---------------- */

function renderQuestion(raw) {
  const q = normalizeQuestion(raw);

  els.prompt.innerHTML = enc(q.question || "(No prompt)");
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
        <span>${enc(opt)}</span>
      `;
      els.choices.appendChild(w);
    });
  } else { // fill
    const w = document.createElement("div");
    w.className = "fillin";
    w.innerHTML = `<input id="fill-answer" type="text" placeholder="Type your answer, then press Enter" autocomplete="off">`;
    els.choices.appendChild(w);
    setTimeout(() => document.getElementById("fill-answer")?.focus(), 0);
  }
}

function getUserAnswer(raw) {
  const q = normalizeQuestion(raw);
  if (q.type === "mcq") {
    const c = els.choices.querySelector('input[name="choice"]:checked');
    return c ? Number(c.value) : null;
  }
  const v = document.getElementById("fill-answer")?.value ?? "";
  return v.trim();
}

function isCorrect(raw, ans) {
  const q = normalizeQuestion(raw);
  if (q.type === "mcq") return ans === q.answer;
  const gold = q.answer.map(s => s.trim().toLowerCase());
  return gold.includes((ans ?? "").toLowerCase());
}

function showFeedback(ok, raw) {
  const q = normalizeQuestion(raw);
  const prefix = ok ? "✅ Correct." : "❌ Not quite.";
  const reveal = q.type === "mcq"
    ? `Answer: <strong>${enc(q.options[q.answer])}</strong>`
    : `Answer: <strong>${enc(q.answer.join(" / "))}</strong>`;
  const expl = q.explanation ? `<div class="explain">${enc(q.explanation)}</div>` : "";
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

/* ---------------- summary ---------------- */

function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}
function openSummary(){
  const acc = answered ? Math.round((score/answered)*100) : 0;
  els.sumAnswered.textContent = String(answered);
  els.sumCorrect.textContent = String(score);
  els.sumAccuracy.textContent = `${acc}%`;
  els.sumMaxStreak.textContent = String(maxStreak);
  els.sumTime.textContent = fmt(Date.now()-sessionStart);
  els.backdrop.classList.remove("hidden");
  if (typeof els.modal.showModal === "function") els.modal.showModal(); else els.modal.classList.remove("hidden");
}
function closeSummary(){ els.backdrop.classList.add("hidden"); if (typeof els.modal.close==="function") els.modal.close(); else els.modal.classList.add("hidden"); }
function resetToLanding(){
  started=false; BANK=[]; order=[]; i=0; answered=0; score=0; streak=0; maxStreak=0; submitted=false; sessionStart=0;
  els.qnum.textContent="0"; els.correct.textContent="0"; els.streak.textContent="0";
  hide(els.card); show(els.empty);
}

/* ---------------- loaders ---------------- */

async function safeJson(u){ const r=await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(`HTTP ${r.status} for ${u}`); return r.json(); }
async function loadAllPacks(){
  const cfg = await safeJson("data/packs.json");
  if (!cfg || !Array.isArray(cfg.packs)) throw new Error("packs.json should be { \"packs\": [ ... ] }");
  const all=[]; for (const p of cfg.packs){ try{
      const blob = await safeJson(p);
      const qs = Array.isArray(blob) ? blob : (blob.questions || []);
      all.push(...qs);
    }catch(e){ console.warn(`Pack load failed: ${p}`, e); }
  }
  if (!all.length) throw new Error("No questions loaded from packs.json.");
  return all;
}

/* ---------------- engine ---------------- */

async function start(){
  if (started) return;
  try{
    BANK = await loadAllPacks();
  }catch(e){
    alert(`Could not start practice:\n${e.message || e}`);
    return;
  }
  started = true;
  order = shuffle([...Array(BANK.length).keys()]);
  i=0; answered=0; score=0; streak=0; maxStreak=0; submitted=false; sessionStart=Date.now();
  els.next.disabled = false;  // ensure button usable
  hide(els.empty); show(els.card);
  paint();
}
function paint(){
  const q = BANK[order[i]];
  renderQuestion(q);
  submitted=false;
  updateStatus();
  // keep whatever button text you have in HTML
}
function submitOrAdvance(){
  if (!started) return;
  const q = BANK[order[i]];
  if (!submitted){
    const ans = getUserAnswer(q);
    const ok = isCorrect(q, ans);
    answered++; if (ok){ score++; streak++; maxStreak=Math.max(maxStreak,streak); } else { streak=0; }
    showFeedback(ok, q);
    submitted = true;
    updateStatus();
  } else {
    nextIndex();
    paint();
  }
}

/* ---------------- events ---------------- */

els.start.addEventListener("click", start);
els.next.addEventListener("click", (e)=>{ e.preventDefault(); submitOrAdvance(); });
document.addEventListener("keydown", (e)=>{ if (e.key==="Enter"){ e.preventDefault(); submitOrAdvance(); }});
els.end.addEventListener("click", ()=>{ if(!started) return; openSummary(); });
els.modalClose.addEventListener("click", ()=>{ closeSummary(); resetToLanding(); });
els.modalRestart.addEventListener("click", async ()=>{ closeSummary(); resetToLanding(); await start(); });
els.backdrop.addEventListener("click", ()=>{ closeSummary(); resetToLanding(); });
