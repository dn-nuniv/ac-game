const TYPE_LABELS = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
  other: "その他",
  skip: "スキップ",
};

// DOM要素
const cardEl = document.getElementById("account-card");
const questionCountEl = document.getElementById("question-count");
const correctCountEl = document.getElementById("correct-count");
const questionTargetEl = document.getElementById("question-target");
const feedbackEl = document.getElementById("feedback");
const historyListEl = document.getElementById("history-list");
const historyTemplate = document.getElementById("history-item-template");
const skipButton = document.getElementById("skip-button");
const dropZones = document.querySelectorAll(".drop-zone");
const gradeForm = document.getElementById("grade-form");
const gradeSelect = document.getElementById("grade-select");
const startButtons = document.querySelectorAll(".start-button");
const timerDisplayEl = document.getElementById("timer-display");
const exportButton = document.getElementById("export-button");
const csvFallbackSection = document.getElementById("csv-fallback");
const localCsvButton = document.getElementById("local-csv-button");
const localCsvInput = document.getElementById("local-csv-input");

// カウントダウン要素
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumberEl = countdownOverlay ? countdownOverlay.querySelector(".countdown-number") : null;

// 結果画面
const resultOverlay = document.getElementById("result-overlay");
const resultMessageEl = document.getElementById("result-message");
const resultScoreEl = document.getElementById("result-score");
const resultTimeEl = document.getElementById("result-time");
const resultBreakdownEl = document.getElementById("result-breakdown");
const resultCloseButton = document.getElementById("result-close");
const resultRetryButton = document.getElementById("result-retry");
const wrongAnswersSection = document.getElementById("wrong-answers-section");
const wrongAnswersList = document.getElementById("wrong-answers-list");

// 新機能用DOM
const reviewButtons = {
  "3級": document.getElementById("review-3-button"),
  "2級": document.getElementById("review-2-button"),
};
const showStatsButton = document.getElementById("show-stats-button");
const statsOverlay = document.getElementById("stats-overlay");
const statsCloseButton = document.getElementById("stats-close");
const accuracyChartCanvas = document.getElementById("accuracy-chart");
const timeChartCanvas = document.getElementById("time-chart");
const bestListEl = document.getElementById("best-list");
const worstListEl = document.getElementById("worst-list");
const clearDataButton = document.getElementById("clear-data-button");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmOkButton = document.getElementById("confirm-ok");
const confirmCancelButton = document.getElementById("confirm-cancel");
const accuracyTitleEl = document.getElementById("accuracy-title");
const timeTitleEl = document.getElementById("time-title");
const bestTitleEl = document.getElementById("best-title");
const worstTitleEl = document.getElementById("worst-title");

// 状態管理
let allAccounts = [];
let queue = [];
let currentAccount = null;
let totalCount = 0;
let correctCount = 0;
let locked = false;
let activeGrade = null;
let answersLog = [];
let questionGoal = 0;
let timerInterval = null;
let startTimestamp = null;
let lastFinishedGrade = null;
let lastFinishedQuestionGoal = 0;
let subjectStats = { "3級": {}, "2級": {} };
let subjectMemory = { "3級": {}, "2級": {} }; // 科目ごとの最終出題・正誤記録（級別）
let accountsLoaded = false;

// 新機能用状態
let isReviewMode = false;
let reviewQueue = []; // 復習が必要な科目 { name, grade }
let gameHistory = []; // { date, grade, accuracy, time }
let accuracyChartInstance = null;
let timeChartInstance = null;
const defaultTitles = {
  accuracy: accuracyTitleEl ? accuracyTitleEl.textContent : "",
  time: timeTitleEl ? timeTitleEl.textContent : "",
  best: bestTitleEl ? bestTitleEl.textContent : "",
  worst: worstTitleEl ? worstTitleEl.textContent : "",
};

// --- CSV処理 ---

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

function handleAccountsLoaded(accounts, hintMessage = "") {
  allAccounts = accounts;
  accountsLoaded = true;
  if (allAccounts.length === 0) {
    updateFeedback("CSVにデータが見つかりませんでした。", "error");
    setStartButtonsDisabled(true);
    return;
  }

  if (csvFallbackSection) csvFallbackSection.hidden = true;
  updateFeedback(`${hintMessage} 準備完了！級と問題数を選んでスタート！`, "info");
  setStartButtonsDisabled(false);
  updateReviewButtonState();
}

async function loadAccounts() {
  // 1. まず自動読み込みを試みる
  try {
    const response = await fetch("accounts.csv", { cache: "no-store" });
    if (!response.ok) throw new Error("Status not ok");
    const text = await response.text();
    handleAccountsLoaded(parseCSV(text));
  } catch (error) {
    // 2. 失敗した場合 (CORSエラーやファイル無し)
    console.warn("Auto-load failed:", error);
    setStartButtonsDisabled(true);
    accountsLoaded = false;

    if (csvFallbackSection) {
      csvFallbackSection.hidden = false; // 手動選択ボタンを表示
    }

    // エラーの原因がプロトコル(file://)か判定
    if (window.location.protocol === "file:") {
      updateFeedback("セキュリティ制限により自動読み込みできませんでした。", "neutral");
    } else {
      updateFeedback("accounts.csv が見つかりません。", "error");
    }
  }
}

// --- データ保存・読み込み ---

function loadData() {
  try {
    const savedReview = localStorage.getItem("ac_game_review_queue");
    if (savedReview) {
      const parsed = JSON.parse(savedReview);
      if (Array.isArray(parsed)) {
        reviewQueue = parsed.map(item => {
          if (typeof item === "string") return { name: item, grade: null };
          const { name, grade } = item || {};
          return name ? { name, grade: grade || null } : null;
        }).filter(Boolean);
      }
    }

    const savedHistory = localStorage.getItem("ac_game_history");
    if (savedHistory) gameHistory = JSON.parse(savedHistory);

    const savedStats = localStorage.getItem("ac_game_stats");
    if (savedStats) {
      const parsedStats = JSON.parse(savedStats);
      if (parsedStats && typeof parsedStats === "object") {
        // 旧データ: フラットな科目 => grade不明として3級に入れる
        if (!parsedStats["3級"] && !parsedStats["2級"]) {
          subjectStats = { "3級": parsedStats, "2級": {} };
        } else {
          subjectStats = { "3級": parsedStats["3級"] || {}, "2級": parsedStats["2級"] || {} };
        }
      }
    }

    const savedMemory = localStorage.getItem("ac_game_memory");
    if (savedMemory) {
      const parsed = JSON.parse(savedMemory);
      if (parsed && typeof parsed === "object") {
        subjectMemory = {
          "3級": parsed["3級"] || {},
          "2級": parsed["2級"] || {}
        };
      }
    }

    updateReviewButtonState();
  } catch (e) {
    console.error("Save data load failed", e);
  }
}

function saveData() {
  localStorage.setItem("ac_game_review_queue", JSON.stringify(reviewQueue));
  localStorage.setItem("ac_game_history", JSON.stringify(gameHistory));
  localStorage.setItem("ac_game_stats", JSON.stringify(subjectStats));
  localStorage.setItem("ac_game_memory", JSON.stringify(subjectMemory));
  updateReviewButtonState();
}

function updateReviewButtonState() {
  ["3級", "2級"].forEach((grade) => {
    const btn = reviewButtons[grade];
    if (!btn) return;
    const count = reviewQueue.filter(item => item.grade === grade || item.grade === null).length;
    const canPlay = count > 0 && accountsLoaded;
    btn.disabled = !canPlay;
    btn.textContent = `${grade} 復習(${count})`;
  });
}

function clearData() {
  // モーダルを表示
  if (!confirmOverlay) return;
  confirmOverlay.hidden = false;
  setTimeout(() => confirmOverlay.classList.add("visible"), 10);

  // 実際の削除処理は confirmOkButton のイベントリスナーで行う
}

function executeClearData() {
  localStorage.removeItem("ac_game_review_queue");
  localStorage.removeItem("ac_game_history");
  localStorage.removeItem("ac_game_stats");
  localStorage.removeItem("ac_game_memory");
  reviewQueue = [];
  gameHistory = [];
  subjectStats = { "3級": {}, "2級": {} };
  subjectMemory = { "3級": {}, "2級": {} };
  updateReviewButtonState();

  // 画面を閉じずに、その場でグラフとランキングを更新（クリア）する
  renderChart();
  renderRanking();
  updateFeedback("データを消去しました。", "info");

  hideConfirmModal();
}

function hideConfirmModal() {
  if (!confirmOverlay) return;
  confirmOverlay.classList.remove("visible");
  setTimeout(() => {
    confirmOverlay.hidden = true;
  }, 300);
}

// --- 統計・グラフ ---

function updateSubjectStats(accountName, isCorrect) {
  if (!activeGrade) return;
  if (!subjectStats[activeGrade]) subjectStats[activeGrade] = {};
  if (!subjectStats[activeGrade][accountName]) {
    subjectStats[activeGrade][accountName] = { correct: 0, total: 0 };
  }
  subjectStats[activeGrade][accountName].total += 1;
  if (isCorrect) subjectStats[activeGrade][accountName].correct += 1;
}

function updateSubjectMemory(accountName, isCorrect) {
  if (!activeGrade) return;
  if (!subjectMemory[activeGrade]) subjectMemory[activeGrade] = {};
  subjectMemory[activeGrade][accountName] = {
    lastSeen: Date.now(),
    lastCorrect: isCorrect
  };
}

function showStats() {
  if (!statsOverlay) return;
  statsOverlay.hidden = false;
  setTimeout(() => statsOverlay.classList.add("visible"), 10);

  renderChart();
  renderRanking();
}

function hideStats() {
  if (!statsOverlay) return;
  statsOverlay.classList.remove("visible");
  setTimeout(() => {
    statsOverlay.hidden = true;
  }, 300);
}

function renderChart() {
  if (!accuracyChartCanvas || !timeChartCanvas) return;

  // 過去10回分のみ表示
  const currentGrade = gradeSelect ? gradeSelect.value : null;
  updateStatsTitles(currentGrade);
  const recentGames = gameHistory.filter(g => !currentGrade || g.grade === currentGrade).slice(-10);
  const labels = recentGames.map((g, i) => i + 1);
  const accuracyData = recentGames.map(g => g.accuracy);
  const timeData = recentGames.map(g => Math.round(g.time / 1000)); // 秒
  const maxTicks = Math.max(1, Math.min(6, labels.length));

  // 正答率グラフ
  if (accuracyChartInstance) accuracyChartInstance.destroy();
  accuracyChartInstance = new Chart(accuracyChartCanvas.getContext("2d"), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '正答率 (%)',
        data: accuracyData,
        borderColor: '#0ea5e9',
        backgroundColor: '#e0f2fe',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 12, right: 12, bottom: 12 } },
      scales: {
        x: {
          offset: false,
          ticks: {
            autoSkip: true,
            maxTicksLimit: maxTicks,
            minRotation: 0,
            maxRotation: 0,
            padding: 4
          }
        },
        y: {
          min: 0, max: 100,
          title: { display: true, text: '正答率 (%)' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });

  // タイムグラフ
  if (timeChartInstance) timeChartInstance.destroy();
  timeChartInstance = new Chart(timeChartCanvas.getContext("2d"), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'タイム (秒)',
        data: timeData,
        borderColor: '#f59e0b',
        backgroundColor: '#fef3c7',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 12, right: 12, bottom: 12 } },
      scales: {
        x: {
          offset: false,
          ticks: {
            autoSkip: true,
            maxTicksLimit: maxTicks,
            minRotation: 0,
            maxRotation: 0,
            padding: 4
          }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'タイム (秒)' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function renderRanking() {
  if (!bestListEl || !worstListEl) return;
  const currentGrade = gradeSelect ? gradeSelect.value : null;
  updateStatsTitles(currentGrade);
  const gradeStats = (currentGrade && subjectStats[currentGrade]) ? subjectStats[currentGrade] : {};

  const entries = Object.entries(gradeStats).map(([name, stat]) => ({
    name,
    rate: stat.total > 0 ? (stat.correct / stat.total) * 100 : 0,
    count: stat.total
  })).filter(e => e.count >= 1); // 1回以上回答したものを表示

  // ベスト5
  const best = [...entries].sort((a, b) => b.rate - a.rate).slice(0, 5);
  // ワースト5
  const worst = [...entries].sort((a, b) => a.rate - b.rate).slice(0, 5);

  const createList = (list, targetEl) => {
    targetEl.innerHTML = "";
    if (list.length === 0) {
      targetEl.innerHTML = "<li><span class='ranking-name'>データ不足</span></li>";
      return;
    }
    list.forEach((item, index) => {
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.innerHTML = `<span class="ranking-rank">${index + 1}.</span><span class="ranking-name">${item.name}</span>`;
      const val = document.createElement("span");
      val.className = "ranking-val";
      val.textContent = `${Math.round(item.rate)}%`;
      li.appendChild(left);
      li.appendChild(val);
      targetEl.appendChild(li);
    });
  };

  createList(best, bestListEl);
  createList(worst, worstListEl);
}

function updateStatsTitles(gradeLabel) {
  const suffix = gradeLabel ? ` (${gradeLabel})` : "";
  if (accuracyTitleEl) accuracyTitleEl.textContent = `${defaultTitles.accuracy}${suffix}`;
  if (timeTitleEl) timeTitleEl.textContent = `${defaultTitles.time}${suffix}`;
  if (bestTitleEl) bestTitleEl.textContent = `${defaultTitles.best}${suffix}`;
  if (worstTitleEl) worstTitleEl.textContent = `${defaultTitles.worst}${suffix}`;
}

// --- ゲームロジック ---

function updateFeedback(text, type = "neutral") {
  if (!feedbackEl) return;
  feedbackEl.textContent = text;
  if (type === "correct") feedbackEl.style.color = "#10b981";
  else if (type === "wrong") feedbackEl.style.color = "#ef4444";
  else if (type === "info") feedbackEl.style.color = "#0ea5e9";
  else feedbackEl.style.color = "#64748b";
}

function setStartButtonsDisabled(disabled) {
  startButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer() {
  stopTimer();
  startTimestamp = Date.now();
  if (timerDisplayEl) timerDisplayEl.textContent = "00:00";
  timerInterval = window.setInterval(() => {
    if (!startTimestamp || !timerDisplayEl) return;
    timerDisplayEl.textContent = formatDuration(Date.now() - startTimestamp);
  }, 500);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const min = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const sec = String(totalSeconds % 60).padStart(2, "0");
  return `${min}:${sec} `;
}

function setBoardEnabled(enabled) {
  dropZones.forEach((zone) => {
    zone.tabIndex = enabled ? 0 : -1;
    zone.style.pointerEvents = enabled ? "auto" : "none";
    zone.classList.toggle("disabled", !enabled);
  });
  if (skipButton) skipButton.disabled = !enabled;
}

function resetGameState() {
  queue = [];
  currentAccount = null;
  totalCount = 0;
  correctCount = 0;
  locked = false;
  questionGoal = 0;

  cardEl.textContent = "---";
  cardEl.classList.remove("pop-in");

  questionCountEl.textContent = "0";
  correctCountEl.textContent = "0";
  if (questionTargetEl) questionTargetEl.textContent = "0";

  historyListEl.innerHTML = "";
  stopTimer();
  hideResultSummary();
  setBoardEnabled(false);
}

function nextAccount() {
  if (queue.length === 0) {
    finishGame();
    return;
  }
  currentAccount = queue.shift();
  cardEl.textContent = currentAccount.name;
  cardEl.classList.remove("pop-in");
  void cardEl.offsetWidth;
  cardEl.classList.add("pop-in");
  locked = false;
}

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function weightedSample(pool, count, grade) {
  const now = Date.now();
  const mem = (grade && subjectMemory[grade]) ? subjectMemory[grade] : {};
  const weights = pool.map(item => {
    const entry = mem[item.name];
    if (!entry) return { item, weight: 1.2 }; // 未出題は少し高め
    const hours = Math.max(0, (now - entry.lastSeen) / 3600000);
    const timeBoost = 1 + Math.min(72, hours) / 12; // 最大+6倍まで緩やかに上昇
    const wrongBoost = entry.lastCorrect ? 1 : 1.8; // 直近誤答は強めに出題
    const weight = Math.max(0.1, wrongBoost * timeBoost);
    return { item, weight };
  });

  const selected = [];
  const available = [...weights];
  while (selected.length < count && available.length > 0) {
    const totalWeight = available.reduce((sum, w) => sum + w.weight, 0);
    let r = Math.random() * totalWeight;
    let chosenIndex = 0;
    for (let i = 0; i < available.length; i++) {
      r -= available[i].weight;
      if (r <= 0) {
        chosenIndex = i;
        break;
      }
    }
    const [picked] = available.splice(chosenIndex, 1);
    selected.push(picked.item);
  }

  // fallback: もし重み計算で不足した場合は残りをシャッフルで補う
  if (selected.length < count) {
    const remaining = pool.filter(item => !selected.includes(item));
    selected.push(...shuffle(remaining).slice(0, count - selected.length));
  }

  return selected.slice(0, count);
}

// 履歴追加
function updateHistory(chosenType, isCorrect) {
  const fragment = historyTemplate.content.cloneNode(true);
  const accountEl = fragment.querySelector(".history-account");
  const resultEl = fragment.querySelector(".history-result");

  accountEl.textContent = currentAccount.name;
  const chosenLabel = TYPE_LABELS[chosenType] || chosenType;
  const correctLabel = TYPE_LABELS[currentAccount.type];

  if (isCorrect) {
    resultEl.textContent = `⭕️ ${correctLabel} `;
    resultEl.style.color = "#15803d";
  } else if (chosenType === "skip") {
    resultEl.textContent = `⏩ (正: ${correctLabel})`;
    resultEl.style.color = "#f97316";
  } else {
    resultEl.textContent = `❌ ${chosenLabel} (正: ${correctLabel})`;
    resultEl.style.color = "#b91c1c";
  }

  historyListEl.prepend(fragment);
  while (historyListEl.children.length > 20) {
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
    updateFeedback(`⭕️ 正解！${currentAccount.name} は「${TYPE_LABELS[currentAccount.type]}」！`, "correct");
  } else if (selectedType === "skip") {
    updateFeedback(`⏩ パス！正解は「${TYPE_LABELS[currentAccount.type]}」でした。`, "neutral");
  } else {
    updateFeedback(`❌ ざんねん… ${currentAccount.name} は「${TYPE_LABELS[currentAccount.type]}」です。`, "wrong");
  }

  answersLog.push({
    timestamp: new Date().toISOString(),
    grade: activeGrade,
    questionNumber: totalCount,
    account: currentAccount.name,
    correctType: currentAccount.type,
    chosenType: selectedType,
    result: isCorrect ? "correct" : selectedType === "skip" ? "skipped" : "wrong",
  });
  if (exportButton) exportButton.disabled = false;

  updateHistory(selectedType, isCorrect);

  // 統計更新
  updateSubjectStats(currentAccount.name, isCorrect);
  updateSubjectMemory(currentAccount.name, isCorrect);

  // 復習リスト更新
  if (isReviewMode) {
    if (isCorrect) {
      // 復習モードで正解したらリストから削除
      reviewQueue = reviewQueue.filter(item => !(item.name === currentAccount.name && (item.grade === activeGrade || item.grade === null)));
    }
    // 復習モードで間違えたら... そのまま残る（何もしない）
  } else {
    if (!isCorrect && selectedType !== "skip") {
      // 通常モードで間違えたらリストに追加（重複なし）
      const exists = reviewQueue.some(item => item.name === currentAccount.name && item.grade === activeGrade);
      if (!exists) {
        reviewQueue.push({ name: currentAccount.name, grade: activeGrade });
      }
    }
  }
  saveData(); // 毎回保存（中断対策）

  if (zone) zone.classList.add(isCorrect ? "correct" : "wrong");

  setTimeout(() => {
    if (zone) {
      zone.classList.remove("correct", "wrong");
      zone.blur();
    }
    nextAccount();
  }, 700);
}

function startCountdown(onComplete) {
  if (!countdownOverlay || !countdownNumberEl) {
    onComplete();
    return;
  }

  countdownOverlay.hidden = false;
  let count = 3;
  countdownNumberEl.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNumberEl.textContent = count;
      // アニメーションリセット
      countdownNumberEl.style.animation = 'none';
      void countdownNumberEl.offsetWidth;
      countdownNumberEl.style.animation = 'popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    } else {
      clearInterval(interval);
      countdownNumberEl.textContent = "START!";
      setTimeout(() => {
        countdownOverlay.hidden = true;
        onComplete();
      }, 800);
    }
  }, 1000);
}

function startGame(selectedGrade, questionCount, isReview = false) {
  if (allAccounts.length === 0) return;

  let pool = [];
  isReviewMode = isReview;
  const targetGrade = isReviewMode
    ? (selectedGrade || (gradeSelect ? gradeSelect.value : null))
    : selectedGrade;

  if (isReviewMode) {
    // 復習モード: reviewQueueにある科目のみ
    pool = allAccounts.filter(item =>
      item.grade === targetGrade &&
      reviewQueue.some(entry =>
        entry.name === item.name && (entry.grade === targetGrade || entry.grade === null)
      )
    );
    if (pool.length === 0) {
      updateFeedback("復習する科目がありません！", "correct");
      return;
    }
    questionCount = pool.length; // 全て出題
  } else {
    // 通常モード
    pool = allAccounts.filter((item) => item.grade === selectedGrade);
    if (pool.length < questionCount) {
      updateFeedback(`${selectedGrade} の問題が足りません（${pool.length} 件）。`, "wrong");
      return;
    }
  }

  answersLog = [];
  questionGoal = questionCount;
  queue = isReviewMode ? shuffle(pool).slice(0, questionGoal) : weightedSample(pool, questionGoal, targetGrade);
  totalCount = 0;
  correctCount = 0;
  locked = false;
  currentAccount = null;
  activeGrade = targetGrade || selectedGrade;

  questionCountEl.textContent = "0";
  correctCountEl.textContent = "0";
  if (questionTargetEl) questionTargetEl.textContent = String(questionGoal);

  historyListEl.innerHTML = "";

  if (queue.length === 0 || questionGoal === 0) {
    const msg = isReviewMode ? "復習する科目がありません！" : "出題データが不足しています。";
    updateFeedback(msg, "correct");
    setBoardEnabled(false);
    return;
  }

  updateFeedback(`準備中...`, "neutral");
  setBoardEnabled(false); // カウントダウン中は操作不可
  if (exportButton) exportButton.disabled = true;
  hideResultSummary();

  // カウントダウン開始
  startCountdown(() => {
    const modeLabel = isReviewMode ? "復習モード" : `${selectedGrade} チャレンジ`;
    updateFeedback(`🏁 ${modeLabel}！スタート！`, "info");
    setBoardEnabled(true);
    startTimer();
    nextAccount();
  });
}

function finishGame() {
  const finishedGrade = activeGrade;
  const durationMs = startTimestamp ? Date.now() - startTimestamp : 0;
  stopTimer();
  updateFeedback("お疲れさまでした！結果を表示します。", "info");
  cardEl.textContent = "FINISH";
  setBoardEnabled(false);
  currentAccount = null;
  lastFinishedGrade = finishedGrade;
  lastFinishedQuestionGoal = questionGoal;
  activeGrade = null;
  showResultSummary(finishedGrade, durationMs);

  // ゲーム結果保存 (復習モードは履歴に残さない、あるいは区別する？今回は通常のみ履歴に残す)
  if (!isReviewMode) {
    const accuracy = questionGoal > 0 ? Math.round((correctCount / questionGoal) * 100) : 0;
    gameHistory.push({
      timestamp: Date.now(),
      grade: finishedGrade,
      accuracy: accuracy,
      time: durationMs
    });
    saveData();
  } else {
    // 復習モード終了時もデータ保存（reviewQueueの更新のため）
    saveData();
  }
}

function showResultSummary(gradeLabel, durationMs) {
  if (!resultOverlay) return;
  const accuracy = questionGoal > 0 ? Math.round((correctCount / questionGoal) * 100) : 0;
  const skipCount = answersLog.filter((entry) => entry.result === "skipped").length;
  const wrongCount = questionGoal - correctCount - skipCount;

  if (resultMessageEl) resultMessageEl.textContent = `${gradeLabel}コース クリア！`;

  // ★ 修正箇所: 点数ではなく「正答率 XX%」と表示するように変更 ★
  if (resultScoreEl) {
    resultScoreEl.textContent = `正答率 ${accuracy}% (${correctCount}/${questionGoal}問)`;
  }

  if (resultTimeEl) resultTimeEl.textContent = `タイム: ${formatDuration(durationMs)} `;
  if (resultBreakdownEl) resultBreakdownEl.textContent = `ミス ${Math.max(0, wrongCount)} / パス ${skipCount}`;

  // 間違えた問題リストの生成
  if (wrongAnswersList && wrongAnswersSection) {
    wrongAnswersList.innerHTML = "";
    const wrongEntries = answersLog.filter(entry => entry.result === "wrong");

    if (wrongEntries.length > 0) {
      wrongAnswersSection.hidden = false;
      wrongEntries.forEach(entry => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${entry.account}</strong> → 正解: ${TYPE_LABELS[entry.correctType]}`;
        wrongAnswersList.appendChild(li);
      });
    } else {
      wrongAnswersSection.hidden = true;
    }
  }

  const card = resultOverlay.querySelector(".result-card");
  if (card) {
    card.classList.remove("bounce-in");
    void card.offsetWidth;
    card.classList.add("bounce-in");
  }
  resultOverlay.hidden = false;
  setTimeout(() => resultOverlay.classList.add("visible"), 10);
}

function hideResultSummary() {
  if (!resultOverlay) return;
  resultOverlay.classList.remove("visible");
  setTimeout(() => {
    resultOverlay.hidden = true;
    const card = resultOverlay.querySelector(".result-card");
    if (card) card.classList.remove("bounce-in");
  }, 300);
}

// イベントリスナー
if (skipButton) {
  skipButton.addEventListener("click", () => {
    if (!currentAccount || locked) return;
    skipButton.disabled = true;
    evaluateAnswer("skip");
    setTimeout(() => { if (currentAccount && !locked) skipButton.disabled = false; }, 750);
  });
}

dropZones.forEach((zone) => {
  zone.addEventListener("click", (e) => {
    if (!currentAccount || locked) return;
    evaluateAnswer(e.currentTarget.dataset.type, e.currentTarget);
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!currentAccount || locked) return;
      evaluateAnswer(e.currentTarget.dataset.type, e.currentTarget);
    }
  });
});

startButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    startGame(gradeSelect ? gradeSelect.value : "3級", Number(button.dataset.count));
  });
});

if (gradeSelect) {
  gradeSelect.addEventListener("change", updateReviewButtonState);
}

if (localCsvButton && localCsvInput) {
  localCsvButton.addEventListener("click", () => localCsvInput.click());
  localCsvInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      handleAccountsLoaded(parseCSV(text), `「${file.name}」を読み込みました。`);
    } catch (err) {
      updateFeedback("読込失敗", "error");
    }
  });
}

if (gradeForm) gradeForm.addEventListener("submit", (e) => e.preventDefault());
if (resultCloseButton) resultCloseButton.addEventListener("click", hideResultSummary);
if (resultRetryButton) resultRetryButton.addEventListener("click", () => {
  hideResultSummary();
  if (isReviewMode) {
    // 復習モードのリトライ: まだ残っているものがあれば
    if (reviewQueue.length > 0) {
      startGame(lastFinishedGrade || (gradeSelect ? gradeSelect.value : null), 0, true);
    } else {
      updateFeedback("復習完了！", "correct");
    }
  } else if (lastFinishedGrade) {
    startGame(lastFinishedGrade, lastFinishedQuestionGoal);
  }
});

Object.entries(reviewButtons).forEach(([grade, btn]) => {
  if (!btn) return;
  btn.addEventListener("click", () => {
    startGame(grade, 0, true);
  });
});

if (showStatsButton) showStatsButton.addEventListener("click", showStats);
if (statsCloseButton) statsCloseButton.addEventListener("click", hideStats);
if (clearDataButton) clearDataButton.addEventListener("click", clearData);
if (confirmOkButton) confirmOkButton.addEventListener("click", executeClearData);
if (confirmCancelButton) confirmCancelButton.addEventListener("click", hideConfirmModal);

if (exportButton) {
  exportButton.addEventListener("click", () => {
    if (answersLog.length === 0) return;
    const csvContent = ["timestamp,grade,question,account,correct_type,chosen_type,result",
      ...answersLog.map(entry => [
        entry.timestamp, entry.grade, entry.questionNumber, entry.account,
        entry.correctType, entry.chosenType, entry.result
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ].join("\r\n");

    const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `answers-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

// 初期化
resetGameState();
loadData(); // データ読み込み
loadAccounts();
