const TYPE_LABELS = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
  other: "その他",
  skip: "スキップ",
};

const TOTAL_QUESTIONS = 10;

const cardEl = document.getElementById("account-card");
const questionCountEl = document.getElementById("question-count");
const correctCountEl = document.getElementById("correct-count");
const feedbackEl = document.getElementById("feedback");
const historyListEl = document.getElementById("history-list");
const historyTemplate = document.getElementById("history-item-template");
const skipButton = document.getElementById("skip-button");
const dropZones = document.querySelectorAll(".drop-zone");
const gradeForm = document.getElementById("grade-form");
const gradeSelect = document.getElementById("grade-select");
const startButton = document.getElementById("start-button");
const activeGradeEl = document.getElementById("active-grade");
const exportButton = document.getElementById("export-button");
const csvFallbackSection = document.getElementById("csv-fallback");
const localCsvButton = document.getElementById("local-csv-button");
const localCsvInput = document.getElementById("local-csv-input");

let allAccounts = [];
let queue = [];
let currentAccount = null;
let totalCount = 0;
let correctCount = 0;
let locked = false;
let activeGrade = null;
let answersLog = [];

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function parseCSV(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(1)
    .map((line) => {
      const [grade, name, type] = line.split(",").map((value) => value.trim());
      return { grade, name, type };
    })
    .filter((row) => row.grade && row.name && row.type);
}

function escapeCsvValue(value) {
  const safe = String(value ?? "");
  return `"${safe.replace(/"/g, '""')}"`;
}

function hideCsvFallback() {
  if (!csvFallbackSection) return;
  csvFallbackSection.hidden = true;
  if (localCsvButton) localCsvButton.disabled = false;
  if (localCsvInput) localCsvInput.value = "";
}

function showCsvFallback() {
  if (!csvFallbackSection) return;
  csvFallbackSection.hidden = false;
  if (localCsvButton) localCsvButton.disabled = false;
}

function handleAccountsLoaded(accounts, sourceMessage = "") {
  allAccounts = accounts;
  if (allAccounts.length === 0) {
    feedbackEl.textContent = "CSVに勘定科目が見つかりませんでした。";
    startButton.disabled = true;
    return;
  }

  hideCsvFallback();
  feedbackEl.textContent = `${sourceMessage}挑戦する級を選び、スタートを押してください`;
  startButton.disabled = false;
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        if (typeof text !== "string") {
          reject(new Error("CSVを文字列として読み込めませんでした"));
          return;
        }
        resolve(parseCSV(text));
      } catch (err) {
        reject(new Error("CSVの解析に失敗しました"));
      }
    };
    reader.onerror = () => reject(new Error("CSVの読み込みに失敗しました"));
    reader.readAsText(file, "utf-8");
  });
}

async function handleLocalCsvSelection(file) {
  try {
    const parsed = await parseCsvFile(file);
    handleAccountsLoaded(parsed, `${file.name}を読み込みました。`);
  } catch (error) {
    feedbackEl.textContent = `${error.message}。別のCSVを選択してください。`;
    startButton.disabled = true;
  }
}

async function loadAccounts() {
  try {
    const response = await fetch("accounts.csv", { cache: "no-store" });
    if (!response.ok) throw new Error("CSVの読み込みに失敗しました");
    const text = await response.text();
    handleAccountsLoaded(parseCSV(text), "CSVを読み込みました。");
  } catch (error) {
    startButton.disabled = true;
    if (window.location.protocol === "file:") {
      showCsvFallback();
      feedbackEl.textContent =
        "ブラウザの制限で自動読み込みができません。下のボタンからaccounts.csvを読み込んでください。";
    } else {
      feedbackEl.textContent = `${error.message}。ファイルを確認してください。`;
    }
  }
}

function setBoardEnabled(enabled) {
  dropZones.forEach((zone) => {
    zone.tabIndex = enabled ? 0 : -1;
    zone.classList.toggle("disabled", !enabled);
  });
  skipButton.disabled = !enabled;
}

function resetGameState() {
  queue = [];
  currentAccount = null;
  totalCount = 0;
  correctCount = 0;
  locked = false;
  cardEl.textContent = "---";
  questionCountEl.textContent = "0";
  correctCountEl.textContent = "0";
  historyListEl.innerHTML = "";
  activeGradeEl.textContent = "-";
  setBoardEnabled(false);
}

function nextAccount() {
  if (queue.length === 0) {
    finishGame();
    return;
  }

  currentAccount = queue.shift();
  cardEl.textContent = currentAccount.name;
  locked = false;
}

function updateHistory(chosenType, isCorrect) {
  const fragment = historyTemplate.content.cloneNode(true);
  const accountEl = fragment.querySelector(".history-account");
  const resultEl = fragment.querySelector(".history-result");

  accountEl.textContent = currentAccount.name;
  const chosenLabel = TYPE_LABELS[chosenType] || chosenType;
  const correctLabel = TYPE_LABELS[currentAccount.type];

  if (isCorrect) {
    resultEl.textContent = `◎ ${correctLabel}`;
    resultEl.classList.add("correct");
  } else if (chosenType === "skip") {
    resultEl.textContent = `→ 正: ${correctLabel}`;
    resultEl.classList.add("skipped");
  } else {
    resultEl.textContent = `× ${chosenLabel} → 正: ${correctLabel}`;
    resultEl.classList.add("wrong");
  }

  historyListEl.prepend(fragment);
  while (historyListEl.children.length > 10) {
    historyListEl.removeChild(historyListEl.lastChild);
  }
}

function logAnswer(chosenType, isCorrect) {
  answersLog.push({
    timestamp: new Date().toISOString(),
    grade: activeGrade,
    questionNumber: totalCount,
    account: currentAccount.name,
    correctType: currentAccount.type,
    chosenType,
    result: isCorrect ? "correct" : chosenType === "skip" ? "skipped" : "wrong",
  });
  if (answersLog.length > 0) {
    exportButton.disabled = false;
  }
}

function evaluateAnswer(selectedType, zone = null) {
  if (!currentAccount || locked) return;
  locked = true;
  totalCount += 1;
  questionCountEl.textContent = String(totalCount);

  const isCorrect = selectedType === currentAccount.type;
  if (isCorrect) {
    correctCount += 1;
    correctCountEl.textContent = String(correctCount);
    feedbackEl.textContent = `正解！「${currentAccount.name}」は${TYPE_LABELS[currentAccount.type]}です。`;
  } else if (selectedType === "skip") {
    feedbackEl.textContent = `スキップ！正解は${TYPE_LABELS[currentAccount.type]}です。`;
  } else {
    feedbackEl.textContent = `残念！「${currentAccount.name}」は${TYPE_LABELS[currentAccount.type]}です。`;
  }

  logAnswer(selectedType, isCorrect);
  updateHistory(selectedType, isCorrect);

  if (zone) {
    zone.classList.add(isCorrect ? "correct" : "wrong");
  }

  setTimeout(() => {
    if (zone) {
      zone.classList.remove("correct", "wrong");
    }
    nextAccount();
  }, 800);
}

function finishGame() {
  feedbackEl.textContent = `お疲れさまでした！${activeGrade}の${TOTAL_QUESTIONS}問が終了しました。`;
  cardEl.textContent = "終了";
  skipButton.disabled = true;
  setBoardEnabled(false);
  currentAccount = null;
  activeGrade = null;
  activeGradeEl.textContent = "-";
}

function startGame(selectedGrade) {
  if (allAccounts.length === 0) return;
  const pool = allAccounts.filter((item) => item.grade === selectedGrade);
  if (pool.length < TOTAL_QUESTIONS) {
    feedbackEl.textContent = `${selectedGrade}の問題が足りません（${pool.length}件）。CSVを増やしてください。`;
    return;
  }

  answersLog = [];
  queue = shuffle(pool).slice(0, TOTAL_QUESTIONS);
  totalCount = 0;
  correctCount = 0;
  locked = false;
  currentAccount = null;
  activeGrade = selectedGrade;
  questionCountEl.textContent = "0";
  correctCountEl.textContent = "0";
  historyListEl.innerHTML = "";
  activeGradeEl.textContent = selectedGrade;
  feedbackEl.textContent = `${selectedGrade}を開始しました。タップで回答してください。`;
  setBoardEnabled(true);
  skipButton.disabled = false;
  exportButton.disabled = true;
  nextAccount();
}

skipButton.addEventListener("click", () => {
  if (!currentAccount || locked) return;
  skipButton.disabled = true;
  evaluateAnswer("skip");
  setTimeout(() => {
    if (currentAccount) {
      skipButton.disabled = false;
    }
  }, 850);
});

function handleZoneSelect(event) {
  if (!currentAccount || locked) return;
  evaluateAnswer(event.currentTarget.dataset.type, event.currentTarget);
}

dropZones.forEach((zone) => {
  zone.addEventListener("click", handleZoneSelect);
  zone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleZoneSelect(event);
  });
});

if (localCsvButton && localCsvInput) {
  localCsvButton.addEventListener("click", () => {
    localCsvInput.click();
  });

  localCsvInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    handleLocalCsvSelection(file);
  });
}

gradeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selectedGrade = gradeSelect.value;
  startGame(selectedGrade);
});

exportButton.addEventListener("click", () => {
  if (answersLog.length === 0) return;
  const header = "timestamp,grade,question,account,correct_type,chosen_type,result";
  const rows = answersLog.map((entry) =>
    [
      entry.timestamp,
      entry.grade,
      entry.questionNumber,
      entry.account,
      entry.correctType,
      entry.chosenType,
      entry.result,
    ]
      .map(escapeCsvValue)
      .join(",")
  );
  const csvContent = [header, ...rows].join("\r\n");
  const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const timestamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\./g, "-");
  link.download = `answers-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

resetGameState();
loadAccounts();
