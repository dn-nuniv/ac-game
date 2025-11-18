const TYPE_LABELS = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
  other: "その他",
};

const ACCOUNT_POOL = [
  { name: "現金", type: "asset" },
  { name: "普通預金", type: "asset" },
  { name: "売掛金", type: "asset" },
  { name: "棚卸資産", type: "asset" },
  { name: "建物", type: "asset" },
  { name: "備品", type: "asset" },
  { name: "未収収益", type: "asset" },
  { name: "借入金", type: "liability" },
  { name: "買掛金", type: "liability" },
  { name: "未払金", type: "liability" },
  { name: "未払費用", type: "liability" },
  { name: "社債", type: "liability" },
  { name: "資本金", type: "equity" },
  { name: "利益剰余金", type: "equity" },
  { name: "自己株式", type: "equity" },
  { name: "売上高", type: "revenue" },
  { name: "受取利息", type: "revenue" },
  { name: "雑収入", type: "revenue" },
  { name: "仕入", type: "expense" },
  { name: "給料", type: "expense" },
  { name: "支払利息", type: "expense" },
  { name: "減価償却費", type: "expense" },
  { name: "旅費交通費", type: "expense" },
  { name: "雑損失", type: "expense" },
  { name: "仮受金", type: "other" },
  { name: "仮払金", type: "other" },
  { name: "差入保証金", type: "other" },
];

const cardEl = document.getElementById("account-card");
const questionCountEl = document.getElementById("question-count");
const correctCountEl = document.getElementById("correct-count");
const feedbackEl = document.getElementById("feedback");
const historyListEl = document.getElementById("history-list");
const historyTemplate = document.getElementById("history-item-template");
const skipButton = document.getElementById("skip-button");
const dropZones = document.querySelectorAll(".drop-zone");

let queue = [];
let currentAccount = null;
let totalCount = 0;
let correctCount = 0;
let locked = false;

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function nextAccount() {
  if (queue.length === 0) {
    currentAccount = null;
    cardEl.textContent = "お疲れさま！";
    cardEl.setAttribute("draggable", "false");
    feedbackEl.textContent = "全問終了。ページを再読み込みすると再挑戦できます。";
    skipButton.disabled = true;
    return;
  }

  currentAccount = queue.shift();
  cardEl.textContent = currentAccount.name;
  cardEl.dataset.type = currentAccount.type;
  cardEl.setAttribute("draggable", "true");
  cardEl.setAttribute("aria-grabbed", "false");
  skipButton.disabled = false;
  locked = false;
}

function updateHistory(chosenType, isCorrect) {
  const fragment = historyTemplate.content.cloneNode(true);
  const accountEl = fragment.querySelector(".history-account");
  const resultEl = fragment.querySelector(".history-result");

  accountEl.textContent = currentAccount.name;
  const chosenLabel = TYPE_LABELS[chosenType] || "スキップ";
  const correctLabel = TYPE_LABELS[currentAccount.type];

  if (isCorrect) {
    resultEl.textContent = `◎ ${correctLabel}`;
    resultEl.classList.add("correct");
  } else {
    resultEl.textContent = `× ${chosenLabel} → 正: ${correctLabel}`;
    resultEl.classList.add("wrong");
  }

  historyListEl.prepend(fragment);
  while (historyListEl.children.length > 10) {
    historyListEl.removeChild(historyListEl.lastChild);
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

  updateHistory(selectedType, isCorrect);

  if (zone) {
    zone.classList.add(isCorrect ? "correct" : "wrong");
  }

  setTimeout(() => {
    if (zone) {
      zone.classList.remove("correct", "wrong");
    }
    nextAccount();
  }, 1000);
}

cardEl.addEventListener("dragstart", (event) => {
  if (!currentAccount || locked) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("text/plain", currentAccount.name);
  cardEl.classList.add("dragging");
  cardEl.setAttribute("aria-grabbed", "true");
});

cardEl.addEventListener("dragend", () => {
  cardEl.classList.remove("dragging");
  cardEl.setAttribute("aria-grabbed", "false");
});

skipButton.addEventListener("click", () => {
  if (!currentAccount || locked) return;
  skipButton.disabled = true;
  evaluateAnswer("skip");
});

dropZones.forEach((zone) => {
  zone.addEventListener("dragover", (event) => {
    if (!currentAccount || locked) return;
    event.preventDefault();
    zone.classList.add("accepting");
  });

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("accepting");
  });

  zone.addEventListener("drop", (event) => {
    if (!currentAccount || locked) return;
    event.preventDefault();
    zone.classList.remove("accepting");
    evaluateAnswer(zone.dataset.type, zone);
  });

  zone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!currentAccount || locked) return;
    evaluateAnswer(zone.dataset.type, zone);
  });
});

function init() {
  queue = shuffle(ACCOUNT_POOL);
  totalCount = 0;
  correctCount = 0;
  questionCountEl.textContent = "0";
  correctCountEl.textContent = "0";
  historyListEl.innerHTML = "";
  feedbackEl.textContent = "ドラッグしてスタート！";
  nextAccount();
}

init();
