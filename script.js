const TYPE_LABELS = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
  other: "その他",
  skip: "スキップ",
};
const TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense", "other", "skip"];

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
const examSelect = document.getElementById("exam-select");
const showYomiCheckbox = document.getElementById("show-yomi");
const startButtons = document.querySelectorAll(".start-button");
const startButtonsWrapper = document.querySelector(".start-buttons");
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
const resultSpeedCommentEl = document.getElementById("result-speed-comment");
const resultTimeBonusEl = document.getElementById("result-time-bonus");
const accountYomiEl = document.getElementById("account-yomi");
const accountCardTextEl = document.getElementById("account-card-text");
const resultCloseButton = document.getElementById("result-close");
const resultRetryButton = document.getElementById("result-retry");
const wrongAnswersSection = document.getElementById("wrong-answers-section");
const wrongAnswersList = document.getElementById("wrong-answers-list");

// 新機能用DOM
let reviewButtons = {};
const showStatsButton = document.getElementById("show-stats-button");
const statsOverlay = document.getElementById("stats-overlay");
const statsCloseButton = document.getElementById("stats-close");
const accuracyChartCanvas = document.getElementById("accuracy-chart");
const timeChartCanvas = document.getElementById("time-chart");
const bestListEl = document.getElementById("best-list");
const worstListEl = document.getElementById("worst-list");
const dictionaryListEl = document.getElementById("dictionary-list");
const dictionaryTitleEl = document.getElementById("dictionary-title");
const missionTextEl = document.getElementById("mission-text");
const achievementListEl = document.getElementById("achievement-list");
const calendarGridEl = document.getElementById("mission-calendar");
const calendarMonthEl = document.getElementById("calendar-month");
const calendarPrevEl = document.getElementById("calendar-prev");
const calendarNextEl = document.getElementById("calendar-next");
const clearDataButton = document.getElementById("clear-data-button");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmOkButton = document.getElementById("confirm-ok");
const confirmCancelButton = document.getElementById("confirm-cancel");
const accuracyTitleEl = document.getElementById("accuracy-title");
const timeTitleEl = document.getElementById("time-title");
const bestTitleEl = document.getElementById("best-title");
const worstTitleEl = document.getElementById("worst-title");
const questionFilterSelect = document.getElementById("question-filter");

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
let lastFinishedExam = null;
let lastFinishedQuestionGoal = 0;
let subjectStats = {}; // { gradeKey: { accountName: {correct,total} } }
let subjectMemory = {}; // { gradeKey: { accountName: {lastSeen,lastCorrect} } }
let accountsLoaded = false;
let availableGrades = [];
let availableExams = [];
let gradesByExam = {};
let activeExam = null;

if (availableGrades.length === 0 && gradeSelect) {
  availableGrades = Array.from(gradeSelect.options).map(opt => opt.value).filter(Boolean);
}
if (availableExams.length === 0 && examSelect) {
  availableExams = Array.from(examSelect.options).map(opt => opt.value).filter(Boolean);
}
let currentStreak = 0;
let missionState = { date: null, type: null, target: 0, progress: 0, done: false, description: "" };
let missionCompletionDays = [];
let calendarView = { year: null, month: null }; // 月送り用

// 匿名プレイヤーIDを生成・取得
function getOrCreatePlayerId() {
  const key = "acGamePlayerId";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

// 新機能用状態
let isReviewMode = false;
let reviewQueue = []; // 復習が必要な科目 { name, grade, exam }
let gameHistory = []; // { date, grade, accuracy, time, questionCount }
let accuracyChartInstance = null;
let timeChartInstance = null;
const defaultTitles = {
  accuracy: accuracyTitleEl ? accuracyTitleEl.textContent : "",
  time: timeTitleEl ? timeTitleEl.textContent : "",
  best: bestTitleEl ? bestTitleEl.textContent : "",
  worst: worstTitleEl ? worstTitleEl.textContent : "",
};

// Service Worker 登録（PWA用）
// Service Worker 登録（PWA用） - ローカルでのアイコン点滅防止のため無効化
// if ("serviceWorker" in navigator) {
//   window.addEventListener("load", () => {
//     navigator.serviceWorker.register("sw.js").catch((err) => {
//       console.warn("Service worker registration failed:", err);
//     });
//   });
// }

// --- CSV処理 ---

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headerLine = lines.shift().replace(/^\uFEFF/, "");
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    exam: headers.indexOf("exam"),
    grade: headers.indexOf("grade"),
    name: headers.indexOf("name"),
    type: headers.indexOf("type"),
    yomi: headers.indexOf("yomi"),
  };

  return lines
    .map((line) => {
      const cols = line.split(",").map((value) => value.trim());

      // ヘッダーが無い/足りない場合のフォールバック: 先頭から順に割り当て
      const fallback = {
        exam: cols[0],
        grade: cols[0],
        name: cols[1],
        type: cols[2],
        yomi: cols[3] || ""
      };

      const exam = idx.exam >= 0 ? cols[idx.exam] : (headers.includes("grade") ? "日商" : fallback.exam || "日商");
      const grade = idx.grade >= 0 ? cols[idx.grade] : fallback.grade;
      const name = idx.name >= 0 ? cols[idx.name] : fallback.name;
      const type = idx.type >= 0 ? cols[idx.type] : fallback.type;
      const yomi = idx.yomi >= 0 ? cols[idx.yomi] : fallback.yomi;
      return { exam, grade, name, type, yomi };
    })
    .filter((row) => row.exam && row.grade && row.name && row.type);
}

function ensureCsvPickerVisible() {
  if (csvFallbackSection) csvFallbackSection.hidden = false;
}

function getGradeKey(grade, exam) {
  return `${exam || "default"}|${grade || "unknown"}`;
}

function normalizeGradeKeyedObject(obj) {
  const normalized = {};
  const defaultExam = (examSelect && examSelect.value) || availableExams[0] || "日商";
  Object.entries(obj || {}).forEach(([key, val]) => {
    const targetKey = key.includes("|") ? key : getGradeKey(key, defaultExam);
    normalized[targetKey] = val;
  });
  return normalized;
}

function handleAccountsLoaded(accounts, hintMessage = "") {
  allAccounts = accounts;
  accountsLoaded = true;
  const exams = Array.from(new Set(allAccounts.map(a => a.exam || "日商"))).filter(Boolean);
  availableExams = exams.length > 0 ? exams : availableExams;
  gradesByExam = {};
  allAccounts.forEach(acc => {
    const ex = acc.exam || "日商";
    if (!gradesByExam[ex]) gradesByExam[ex] = new Set();
    if (acc.grade) gradesByExam[ex].add(acc.grade);
  });
  Object.keys(gradesByExam).forEach(ex => {
    gradesByExam[ex] = Array.from(gradesByExam[ex]);
  });
  setupExams(availableExams);
  if (allAccounts.length === 0) {
    updateFeedback("CSVにデータが見つかりませんでした。", "error");
    setStartButtonsDisabled(true);
    return;
  }

  if (csvFallbackSection) csvFallbackSection.hidden = true; // 読み込み成功したら隠す
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
    ensureCsvPickerVisible(); // 最初から手動選択を許可
    const savedReview = localStorage.getItem("ac_game_review_queue");
    if (savedReview) {
      const parsed = JSON.parse(savedReview);
      if (Array.isArray(parsed)) {
        reviewQueue = parsed.map(item => {
          if (typeof item === "string") return { name: item, grade: null, exam: null };
          const { name, grade, exam } = item || {};
          return name ? { name, grade: grade || null, exam: exam || null } : null;
        }).filter(Boolean);
      }
    }

    const savedHistory = localStorage.getItem("ac_game_history");
    if (savedHistory) {
      const parsedHistory = JSON.parse(savedHistory);
      if (Array.isArray(parsedHistory)) {
        gameHistory = parsedHistory.map((item) => {
          const count = item ? (item.questionCount ?? item.count) : null;
          const normalizedCount = (count !== undefined && count !== null && count !== "")
            ? Number(count)
            : null;
          return {
            ...item,
            questionCount: Number.isFinite(normalizedCount) ? normalizedCount : null,
            exam: item && item.exam ? item.exam : null
          };
        });
      } else {
        gameHistory = [];
      }
    }

    const savedStats = localStorage.getItem("ac_game_stats");
    if (savedStats) {
      const parsedStats = JSON.parse(savedStats);
      if (parsedStats && typeof parsedStats === "object") subjectStats = parsedStats;
    }

    const savedMemory = localStorage.getItem("ac_game_memory");
    if (savedMemory) {
      const parsed = JSON.parse(savedMemory);
      if (parsed && typeof parsed === "object") subjectMemory = parsed;
    }

    const savedMission = localStorage.getItem("ac_game_mission");
    if (savedMission) {
      const parsed = JSON.parse(savedMission);
      if (parsed && typeof parsed === "object") {
        missionState = { date: null, type: null, target: 0, progress: 0, done: false, description: "", ...parsed };
      }
    }

    const savedMissionDays = localStorage.getItem("ac_game_mission_days");
    if (savedMissionDays) {
      const parsedDays = JSON.parse(savedMissionDays);
      if (Array.isArray(parsedDays)) {
        missionCompletionDays = parsedDays;
      }
    }

    subjectStats = normalizeGradeKeyedObject(subjectStats);
    subjectMemory = normalizeGradeKeyedObject(subjectMemory);

    if (Object.keys(gradesByExam).length === 0) {
      Object.keys(subjectStats || {}).forEach((k) => {
        const [examPart, gradePart] = k.includes("|") ? k.split("|") : ["日商", k];
        if (!gradesByExam[examPart]) gradesByExam[examPart] = new Set();
        if (gradePart) gradesByExam[examPart].add(gradePart);
      });
      Object.keys(gradesByExam).forEach(ex => gradesByExam[ex] = Array.from(gradesByExam[ex]));
    }

    if (availableGrades.length === 0) {
      const fromStats = Object.keys(subjectStats || {}).map((k) => k.includes("|") ? k.split("|")[1] : k);
      const fromSelect = gradeSelect ? Array.from(gradeSelect.options).map(opt => opt.value).filter(Boolean) : [];
      const derived = (fromStats.length ? fromStats : fromSelect).filter(Boolean);
      availableGrades = derived.length ? Array.from(new Set(derived)) : availableGrades;
    }
    if (availableExams.length === 0) {
      const fromStats = Object.keys(subjectStats || {}).map((k) => k.includes("|") ? k.split("|")[0] : "日商");
      const fromSelectExam = examSelect ? Array.from(examSelect.options).map(opt => opt.value).filter(Boolean) : [];
      const derived = (fromStats.length ? fromStats : fromSelectExam).filter(Boolean);
      availableExams = derived.length ? Array.from(new Set(derived)) : availableExams;
    }
    if (availableExams.length > 0) setupExams(availableExams);

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
  localStorage.setItem("ac_game_mission", JSON.stringify(missionState));
  localStorage.setItem("ac_game_mission_days", JSON.stringify(missionCompletionDays));
  updateReviewButtonState();
}

function updateReviewButtonState() {
  availableGrades.forEach((grade) => {
    const btn = reviewButtons[grade];
    if (!btn) return;
    const currentExam = examSelect ? examSelect.value : null;
    const count = reviewQueue.filter(item =>
      (item.grade === grade || item.grade === null) &&
      (!currentExam || !item.exam || item.exam === currentExam)
    ).length;
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
  localStorage.removeItem("ac_game_mission");
  localStorage.removeItem("ac_game_mission_days");
  reviewQueue = [];
  gameHistory = [];
  subjectStats = {};
  subjectMemory = {};
  missionState = { date: null, type: null, target: 0, progress: 0, done: false, description: "" };
  missionCompletionDays = [];
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
  const key = getGradeKey(activeGrade, activeExam);
  if (!subjectStats[key]) subjectStats[key] = {};
  if (!subjectStats[key][accountName]) {
    subjectStats[key][accountName] = { correct: 0, total: 0 };
  }
  subjectStats[key][accountName].total += 1;
  if (isCorrect) subjectStats[key][accountName].correct += 1;
}

function updateSubjectMemory(accountName, isCorrect) {
  if (!activeGrade) return;
  const key = getGradeKey(activeGrade, activeExam);
  if (!subjectMemory[key]) subjectMemory[key] = {};
  subjectMemory[key][accountName] = {
    lastSeen: Date.now(),
    lastCorrect: isCorrect
  };
}

function getGradesForExam(exam) {
  if (exam && gradesByExam[exam]) return gradesByExam[exam];
  // フォールバック: 既存のavailableGrades
  return availableGrades.length ? availableGrades : [];
}

function setupExams(exams) {
  if (!exams || exams.length === 0) return;
  availableExams = exams;
  if (examSelect) {
    const current = examSelect.value;
    examSelect.innerHTML = "";
    exams.forEach((exam) => {
      const opt = document.createElement("option");
      opt.value = exam;
      opt.textContent = exam;
      examSelect.appendChild(opt);
    });
    if (exams.includes(current)) {
      examSelect.value = current;
    } else {
      examSelect.value = exams[0];
    }
  }
  const grades = getGradesForExam(examSelect ? examSelect.value : null);
  setupGrades(grades);
  updateStatsButtonLabel();
}

function setupGrades(grades) {
  if (!grades || grades.length === 0) return;
  availableGrades = grades;

  if (gradeSelect) {
    const current = gradeSelect.value;
    gradeSelect.innerHTML = "";
    grades.forEach((grade) => {
      const opt = document.createElement("option");
      opt.value = grade;
      opt.textContent = grade;
      gradeSelect.appendChild(opt);
    });
    if (grades.includes(current)) {
      gradeSelect.value = current;
    } else {
      gradeSelect.value = grades[0];
    }
    updateStatsButtonLabel();
  }

  grades.forEach((grade) => {
    const key = getGradeKey(grade, examSelect ? examSelect.value : null);
    if (!subjectStats[key]) subjectStats[key] = {};
    if (!subjectMemory[key]) subjectMemory[key] = {};
  });

  buildReviewButtons(grades);
  updateReviewButtonState();
}

function buildReviewButtons(grades) {
  if (!startButtonsWrapper) return;
  Object.values(reviewButtons).forEach(btn => btn.remove());
  reviewButtons = {};
  grades.forEach((grade) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "start-button push-btn review-btn";
    btn.textContent = `${grade} 復習`;
    btn.disabled = true;
    btn.addEventListener("click", () => startGame(grade, 0, true));
    startButtonsWrapper.appendChild(btn);
    reviewButtons[grade] = btn;
  });
}

function showStats() {
  if (!statsOverlay) return;
  statsOverlay.hidden = false;
  setTimeout(() => statsOverlay.classList.add("visible"), 10);

  ensureDailyMission(); // ミッションが未生成の場合でもここで確実に生成
  renderChart();
  renderRanking();
  renderDictionary();
  renderAchievements();
  updateMissionUI();
  renderMissionCalendar();
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
  const currentExam = examSelect ? examSelect.value : null;
  const selectedCount = questionFilterSelect ? questionFilterSelect.value : "all";
  updateStatsTitles(currentGrade, currentExam);
  const recentGames = gameHistory
    .filter(g => (!currentGrade || g.grade === currentGrade) && (!currentExam || !g.exam || g.exam === currentExam))
    .filter(g => selectedCount === "all" || g.questionCount === Number(selectedCount))
    .slice(-10);
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
  const currentExam = examSelect ? examSelect.value : null;
  updateStatsTitles(currentGrade, currentExam);
  const key = getGradeKey(currentGrade, currentExam);
  const gradeStats = subjectStats[key] || {};

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


// 最新版: CSVの並び順を保持し、種別ごとにまとめる
function renderDictionary() {
  if (!dictionaryListEl) return;

  const currentGrade = gradeSelect ? gradeSelect.value : null;
  const currentExam = examSelect ? examSelect.value : null;
  const gradeLabel = currentGrade || "";
  const titleSuffix = [currentExam, gradeLabel].filter(Boolean).join(" / ");
  if (dictionaryTitleEl) {
    dictionaryTitleEl.textContent = `📚 勘定科目辞書${titleSuffix ? " (" + titleSuffix + ")" : ""}`;
  }

  if (!currentGrade) {
    dictionaryListEl.innerHTML = "<li><span class='ranking-name'>級を選択してください</span></li>";
    return;
  }

  const gradeAccounts = allAccounts.filter((a) => a.grade === currentGrade && (!currentExam || a.exam === currentExam));
  const key = getGradeKey(currentGrade, currentExam);
  const gradeStats = subjectStats[key] || {};
  const gradeMemory = subjectMemory[key] || {};

  const entriesByType = {};
  gradeAccounts.forEach((acc) => {
    const stat = gradeStats[acc.name] || { correct: 0, total: 0 };
    const mem = gradeMemory[acc.name];
    const total = stat.total || 0;
    const correct = stat.correct || 0;
    const rate = total > 0 ? Math.round((correct / total) * 100) : null;
    const lastSeen = mem && mem.lastSeen ? new Date(mem.lastSeen) : null;

    const entry = {
      name: acc.name,
      yomi: acc.yomi,
      type: acc.type,
      typeLabel: TYPE_LABELS[acc.type] || acc.type,
      correct,
      total,
      rate,
      lastSeen,
    };
    if (!entriesByType[acc.type]) entriesByType[acc.type] = [];
    entriesByType[acc.type].push(entry);
  });

  dictionaryListEl.innerHTML = "";
  let totalEntries = 0;

  TYPE_ORDER.forEach((typeKey) => {
    const list = entriesByType[typeKey];
    if (!list || list.length === 0) return;
    totalEntries += list.length;

    const header = document.createElement("li");
    header.className = `dictionary-group type-${typeKey}`;
    header.textContent = TYPE_LABELS[typeKey] || typeKey;
    dictionaryListEl.appendChild(header);

    list.forEach((entry) => {
      const li = document.createElement("li");

      const left = document.createElement("div");
      left.className = "dictionary-row-main";
      const nameSpan = document.createElement("span");
      nameSpan.className = "ranking-name";
      nameSpan.textContent = formatNameWithYomi(entry.name, entry.yomi);
      const typeSpan = document.createElement("span");
      typeSpan.className = "dictionary-type";
      typeSpan.textContent = `[${entry.typeLabel}]`;
      left.appendChild(nameSpan);
      left.appendChild(typeSpan);

      const right = document.createElement("div");
      right.className = "dictionary-right";

      let badge = null;
      if (entry.total === 0) {
        badge = document.createElement("span");
        badge.className = "badge-new";
        badge.textContent = "未学習";
      } else if (entry.total >= 3 && entry.rate !== null && entry.rate >= 80) {
        badge = document.createElement("span");
        badge.className = "badge-master";
        badge.textContent = "マスター";
      }

      const statLine = document.createElement("div");
      statLine.className = "dictionary-meta";
      if (entry.total === 0) {
        statLine.textContent = "まだ出題されていません";
      } else {
        statLine.textContent = `正解 ${entry.correct}/${entry.total}` + (entry.rate !== null ? ` (${entry.rate}%)` : "");
      }

      const lastLine = document.createElement("div");
      lastLine.className = "dictionary-meta";
      if (entry.lastSeen) {
        lastLine.textContent = `最終出題: ${entry.lastSeen.toLocaleDateString("ja-JP")}`;
      } else {
        lastLine.textContent = "";
      }

      if (badge) right.appendChild(badge);
      right.appendChild(statLine);
      if (lastLine.textContent) right.appendChild(lastLine);

      li.appendChild(left);
      li.appendChild(right);
      dictionaryListEl.appendChild(li);
    });
  });

  if (totalEntries === 0) {
    dictionaryListEl.innerHTML = "<li><span class='ranking-name'>この級の科目がありません</span></li>";
  }
}

function ensureDailyMission() {
  const today = new Date().toISOString().slice(0, 10);
  if (missionState.date === today && missionState.type) {
    updateMissionUI();
    renderMissionCalendar();
    return;
  }
  const missionPool = [
    { type: "asset-correct", target: 5, description: "資産を5問正解しよう" },
    { type: "streak5", target: 5, description: "5連続正解を達成しよう" },
    { type: "total-answers", target: 15, description: "15問こなそう" },
    { type: "time-clear", target: 5, description: "平均5秒以内でクリアしよう" },
  ];
  const pick = missionPool[Math.floor(Math.random() * missionPool.length)];
  missionState = {
    date: today,
    type: pick.type,
    target: pick.target,
    progress: 0,
    done: false,
    description: pick.description,
  };
  saveData();
  updateMissionUI();
}

function updateMissionProgressAnswer(isCorrect, correctType) {
  if (!missionState || missionState.done) return;
  if (!missionState.type) return;

  if (missionState.type === "asset-correct") {
    if (isCorrect && correctType === "asset") missionState.progress += 1;
  } else if (missionState.type === "total-answers") {
    missionState.progress += 1;
  } else if (missionState.type === "streak5") {
    // progressは最大連続数を保持
    missionState.progress = Math.max(missionState.progress, currentStreak);
    if (currentStreak >= missionState.target) missionState.done = true;
  }

  if (missionState.type !== "streak5" && missionState.progress >= missionState.target) {
    missionState.done = true;
  }
  if (missionState.done) {
    const today = missionState.date || new Date().toISOString().slice(0, 10);
    if (!missionCompletionDays.includes(today)) missionCompletionDays.push(today);
  }
  saveData();
  updateMissionUI();
  renderMissionCalendar();
}

function updateMissionProgressGame(avgSecondsPerQuestion) {
  if (!missionState || missionState.done) return;
  if (missionState.type === "time-clear" && avgSecondsPerQuestion !== null) {
    if (avgSecondsPerQuestion <= missionState.target) {
      missionState.done = true;
      const today = missionState.date || new Date().toISOString().slice(0, 10);
      if (!missionCompletionDays.includes(today)) missionCompletionDays.push(today);
    }
  }
  saveData();
  updateMissionUI();
  renderMissionCalendar();
}

function updateMissionUI() {
  if (!missionTextEl) return;
  if (!missionState || !missionState.type) {
    missionTextEl.textContent = "ミッションなし";
    return;
  }
  const progressText = missionState.type === "time-clear"
    ? (missionState.done ? "達成！" : `目標: ${missionState.target}秒以内 / 未達`)
    : `${Math.min(missionState.progress, missionState.target)}/${missionState.target}`;
  missionTextEl.textContent = `${missionState.description} ${missionState.done ? "✅ 達成" : `(${progressText})`}`;
}

function renderMissionCalendar() {
  if (!calendarGridEl) return;
  const now = new Date();
  const viewYear = calendarView.year ?? now.getFullYear();
  const viewMonth = calendarView.month ?? now.getMonth(); // 0-based
  const year = viewYear;
  const month = viewMonth;
  if (calendarMonthEl) {
    calendarMonthEl.textContent = `${year}年 ${month + 1}月`;
  }
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const completedSet = new Set(missionCompletionDays || []);
  const todayStr = new Date().toISOString().slice(0, 10);

  calendarGridEl.innerHTML = "";
  for (let i = 0; i < firstDay; i++) {
    const filler = document.createElement("div");
    filler.className = "calendar-day";
    filler.textContent = "";
    calendarGridEl.appendChild(filler);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (completedSet.has(dateStr)) cell.classList.add("done");
    if (dateStr === todayStr) cell.classList.add("today");
    cell.textContent = d;
    calendarGridEl.appendChild(cell);
  }
}

function calcPlayStreakDays(history) {
  if (!history || history.length === 0) return 0;
  const days = Array.from(new Set(history.map(g => {
    const d = new Date(g.timestamp || g.date || Date.now());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }))).sort((a, b) => b - a);
  let streak = 0;
  let cursor = days[0];
  for (let i = 0; i < days.length; i++) {
    if (i === 0 || days[i] === cursor) {
      streak += (i === 0) ? 1 : 0;
      continue;
    }
    const diffDays = Math.round((cursor - days[i]) / 86400000);
    if (diffDays === streak) {
      streak += 1;
    } else if (diffDays === 1) {
      streak += 1;
      cursor = days[i];
    } else {
      break;
    }
  }
  return streak;
}

function renderAchievements() {
  if (!achievementListEl) return;
  const currentGrade = gradeSelect ? gradeSelect.value : null;
  const items = [];

  if (currentGrade) {
    const gradeAccounts = allAccounts.filter(a => a.grade === currentGrade);
    const stats = subjectStats[currentGrade] || {};
    ["asset", "liability", "equity", "revenue", "expense"].forEach((typeKey) => {
      const targets = gradeAccounts.filter(a => a.type === typeKey);
      if (targets.length === 0) return;
      const mastered = targets.every(acc => {
        const st = stats[acc.name] || {};
        const total = st.total || 0;
        const rate = total > 0 ? (st.correct / st.total) * 100 : 0;
        return total >= 3 && rate >= 80;
      });
      if (mastered) items.push(`${currentGrade} ${TYPE_LABELS[typeKey]}マスター`);
    });
  }

  const streakDays = calcPlayStreakDays(gameHistory);
  if (streakDays >= 3) items.push(`連続プレイ ${streakDays}日`);

  if (gameHistory.some(g => g.accuracy >= 90)) items.push("ハイスコア(90%+)");

  achievementListEl.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "achievement-empty";
    li.textContent = "まだ称号はありません";
    achievementListEl.appendChild(li);
    return;
  }
  items.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    achievementListEl.appendChild(li);
  });
}

function updateStatsTitles(gradeLabel, examLabel) {
  const suffixParts = [];
  if (examLabel) suffixParts.push(examLabel);
  if (gradeLabel) suffixParts.push(gradeLabel);
  const suffix = suffixParts.length ? ` (${suffixParts.join(" / ")})` : "";
  if (accuracyTitleEl) accuracyTitleEl.textContent = `${defaultTitles.accuracy}${suffix}`;
  if (timeTitleEl) timeTitleEl.textContent = `${defaultTitles.time}${suffix}`;
  if (bestTitleEl) bestTitleEl.textContent = `${defaultTitles.best}${suffix}`;
  if (worstTitleEl) worstTitleEl.textContent = `${defaultTitles.worst}${suffix}`;
}

function updateStatsButtonLabel() {
  if (!showStatsButton) return;
  const exam = examSelect ? examSelect.value : "";
  const grade = gradeSelect ? gradeSelect.value : "";
  const labelCore = `${exam || ""}${grade || ""}`;
  showStatsButton.textContent = labelCore ? `📊 ${labelCore}データ` : "📊 データ";
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

function getComboMessage(streak) {
  if (streak >= 5) return "🚀 5コンボ！すごい！";
  if (streak >= 3) return "🔥 3コンボ！";
  return "";
}

function getSpeedComment(secondsPerQuestion) {
  if (secondsPerQuestion === null || Number.isNaN(secondsPerQuestion)) return "";
  if (secondsPerQuestion < 3) return "超スピード解答！";
  if (secondsPerQuestion <= 6) return "ちょうど良いペース";
  return "正確さ重視のプレイですね";
}

function getTimeBonusText(secondsPerQuestion) {
  if (secondsPerQuestion === null || Number.isNaN(secondsPerQuestion)) return "";
  if (secondsPerQuestion < 3) return "⚡ タイムボーナス: 超速クリア！";
  if (secondsPerQuestion <= 6) return "⏱️ タイムボーナス: ナイスペース";
  return "";
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

function setCardText(text) {
  if (accountCardTextEl) {
    accountCardTextEl.textContent = text;
  } else {
    cardEl.textContent = text;
  }
}

function isYomiEnabled() {
  return showYomiCheckbox ? showYomiCheckbox.checked : false;
}

function setYomiText(account) {
  if (!accountYomiEl) return;
  if (account && isYomiEnabled() && account.yomi) {
    accountYomiEl.textContent = account.yomi;
    accountYomiEl.hidden = false;
  } else {
    accountYomiEl.textContent = "";
    accountYomiEl.hidden = true;
  }
}

function formatNameWithYomi(name, yomi) {
  if (isYomiEnabled() && yomi) return `${name} (${yomi})`;
  return name;
}

function resetGameState() {
  queue = [];
  currentAccount = null;
  totalCount = 0;
  correctCount = 0;
  locked = false;
  questionGoal = 0;
  currentStreak = 0;

  setCardText("---");
  cardEl.classList.remove("pop-in");
  setYomiText(null);

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
  setCardText(currentAccount.name);
  setYomiText(currentAccount);
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

function weightedSample(pool, count, grade, exam) {
  const now = Date.now();
  const key = getGradeKey(grade, exam);
  const mem = (key && subjectMemory[key]) ? subjectMemory[key] : {};
  const unseen = [];
  const seenWeights = [];

  pool.forEach(item => {
    const entry = mem[item.name];
    if (!entry) {
      unseen.push(item);
      return;
    }
    const hours = Math.max(0, (now - entry.lastSeen) / 3600000);
    const timeBoost = 1 + Math.min(72, hours) / 12; // 最大+6倍まで緩やかに上昇
    const wrongBoost = entry.lastCorrect ? 1 : 1.8; // 直近誤答は強めに出題
    const weight = Math.max(0.1, wrongBoost * timeBoost);
    seenWeights.push({ item, weight });
  });

  const selected = [];

  // 1. 未出題を優先的に詰める
  if (unseen.length > 0) {
    const shuffledUnseen = shuffle(unseen);
    selected.push(...shuffledUnseen.slice(0, count));
  }

  // 2. まだ足りない分を重み付きで補う
  let remaining = count - selected.length;
  const available = [...seenWeights];
  while (remaining > 0 && available.length > 0) {
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
    remaining -= 1;
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
    exam: activeExam,
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
      reviewQueue = reviewQueue.filter(item =>
        !(item.name === currentAccount.name &&
          (item.grade === activeGrade || item.grade === null) &&
          (!item.exam || item.exam === activeExam))
      );
    }
    // 復習モードで間違えたら... そのまま残る（何もしない）
  } else {
    if (!isCorrect && selectedType !== "skip") {
      // 通常モードで間違えたらリストに追加（重複なし）
      const exists = reviewQueue.some(item =>
        item.name === currentAccount.name &&
        item.grade === activeGrade &&
        (!item.exam || item.exam === activeExam)
      );
      if (!exists) {
        reviewQueue.push({ name: currentAccount.name, grade: activeGrade, exam: activeExam });
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

// 最新版 evaluateAnswer: コンボ演出とスピードコメント用
evaluateAnswer = function (selectedType, zone = null) {
  if (!currentAccount || locked) return;
  locked = true;
  totalCount += 1;
  questionCountEl.textContent = String(totalCount);

  const isCorrect = selectedType === currentAccount.type;
  let feedbackText = "";

  if (isCorrect) {
    correctCount += 1;
    correctCountEl.textContent = String(correctCount);
    currentStreak += 1;
    const comboMessage = getComboMessage(currentStreak);
    feedbackText = `✅ 正解！${currentAccount.name} は『${TYPE_LABELS[currentAccount.type]}』！`;
    if (comboMessage) feedbackText += ` ${comboMessage}`;
    updateFeedback(feedbackText, "correct");
    if (comboMessage && feedbackEl) {
      feedbackEl.classList.add("feedback-combo");
      setTimeout(() => feedbackEl.classList.remove("feedback-combo"), 450);
    }
  } else if (selectedType === "skip") {
    currentStreak = 0;
    updateFeedback(`⏭ パス！正解は『${TYPE_LABELS[currentAccount.type]}』でした。`, "neutral");
  } else {
    currentStreak = 0;
    updateFeedback(`❌ 残念… ${currentAccount.name} は『${TYPE_LABELS[currentAccount.type]}』です。`, "wrong");
  }

  answersLog.push({
    timestamp: new Date().toISOString(),
    grade: activeGrade,
    exam: activeExam,
    questionNumber: totalCount,
    account: currentAccount.name,
    correctType: currentAccount.type,
    chosenType: selectedType,
    result: isCorrect ? "correct" : selectedType === "skip" ? "skipped" : "wrong",
  });
  if (exportButton) exportButton.disabled = false;

  updateHistory(selectedType, isCorrect);
  updateSubjectStats(currentAccount.name, isCorrect);
  updateSubjectMemory(currentAccount.name, isCorrect);
  updateMissionProgressAnswer(isCorrect, currentAccount.type);

  if (isReviewMode) {
    if (isCorrect) {
      reviewQueue = reviewQueue.filter(item =>
        !(item.name === currentAccount.name &&
          (item.grade === activeGrade || item.grade === null) &&
          (!item.exam || item.exam === activeExam))
      );
    }
  } else {
    if (!isCorrect && selectedType !== "skip") {
      const exists = reviewQueue.some(item =>
        item.name === currentAccount.name &&
        item.grade === activeGrade &&
        (!item.exam || item.exam === activeExam)
      );
      if (!exists) {
        reviewQueue.push({ name: currentAccount.name, grade: activeGrade, exam: activeExam });
      }
    }
  }
  saveData();

  if (zone) zone.classList.add(isCorrect ? "correct" : "wrong");

  setTimeout(() => {
    if (zone) {
      zone.classList.remove("correct", "wrong");
      zone.blur();
    }
    nextAccount();
  }, 700);
};

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
  const selectedExam = examSelect ? examSelect.value : null;
  const targetGrade = isReviewMode
    ? (selectedGrade || (gradeSelect ? gradeSelect.value : null))
    : selectedGrade;
  activeExam = selectedExam;

  if (isReviewMode) {
    // 復習モード: reviewQueueにある科目のみ
    pool = allAccounts.filter(item =>
      item.grade === targetGrade &&
      (!selectedExam || item.exam === selectedExam) &&
      reviewQueue.some(entry =>
        entry.name === item.name &&
        (entry.grade === targetGrade || entry.grade === null) &&
        (!entry.exam || entry.exam === selectedExam)
      )
    );
    if (pool.length === 0) {
      updateFeedback("復習する科目がありません！", "correct");
      return;
    }
    questionCount = pool.length; // 全て出題
  } else {
    // 通常モード
    pool = allAccounts.filter((item) => item.grade === selectedGrade && (!selectedExam || item.exam === selectedExam));
    if (pool.length < questionCount) {
      updateFeedback(`${selectedExam || ""} ${selectedGrade} の問題が足りません（${pool.length} 件）。`, "wrong");
      return;
    }
  }

  answersLog = [];
  questionGoal = questionCount;
  queue = isReviewMode ? shuffle(pool).slice(0, questionGoal) : weightedSample(pool, questionGoal, targetGrade, selectedExam);
  totalCount = 0;
  correctCount = 0;
  locked = false;
  currentAccount = null;
  activeGrade = targetGrade || selectedGrade;
  currentStreak = 0;

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

async function logSessionToFirestore(durationMs) {
  if (!window.saveLogsToFirestore) return;
  if (!answersLog || answersLog.length === 0) return;

  const total = answersLog.length;
  const correctCount = answersLog.filter(e => e.result === "correct").length;
  const wrongCount = answersLog.filter(e => e.result === "wrong").length;
  const skipCount = answersLog.filter(e => e.result === "skipped").length;
  const accuracy = total > 0 ? correctCount / total : 0;

  const playerId = getOrCreatePlayerId();
  const exam = lastFinishedExam || activeExam || null;
  const summary = {
    appId: "accounts_quiz",
    grade: lastFinishedGrade || activeGrade || null,
    exam,
    questionCount: total,
    correctCount,
    wrongCount,
    skipCount,
    accuracy,
    playerId,
    mode: isReviewMode ? "review" : "normal",
  };

  if (typeof durationMs === "number") {
    summary.durationMs = durationMs;
  }

  try {
    await window.saveLogsToFirestore(summary, answersLog);
    console.log("Session log saved to Firestore", { summary });

    if (window.updateMistakesFromRows) {
      console.log("Calling updateMistakesFromRows...");
      await window.updateMistakesFromRows(summary, answersLog);
      console.log("Mistakes update finished");
    } else {
      console.warn("updateMistakesFromRows is NOT defined on window");
    }
  } catch (err) {
    console.error("Failed to save logs or mistakes:", err);
  }
}

function finishGame() {
  const finishedGrade = activeGrade;
  const finishedExam = activeExam;
  const durationMs = startTimestamp ? Date.now() - startTimestamp : 0;
  const avgSeconds = questionGoal > 0 ? (durationMs / questionGoal) / 1000 : null;
  stopTimer();
  updateFeedback("お疲れさまでした！結果を表示します。", "info");
  setCardText("FINISH");
  setYomiText(null);
  setBoardEnabled(false);
  currentAccount = null;
  lastFinishedGrade = finishedGrade;
  lastFinishedExam = finishedExam;
  lastFinishedQuestionGoal = questionGoal;
  activeGrade = null;
  activeExam = null;
  showResultSummary(finishedGrade, durationMs);
  updateMissionProgressGame(avgSeconds);

  // ゲーム結果保存 (復習モードは履歴に残さない、あるいは区別する？今回は通常のみ履歴に残す)
  if (!isReviewMode) {
    const accuracy = questionGoal > 0 ? Math.round((correctCount / questionGoal) * 100) : 0;
    gameHistory.push({
      timestamp: Date.now(),
      exam: finishedExam,
      grade: finishedGrade,
      accuracy: accuracy,
      time: durationMs,
      questionCount: questionGoal
    });
    saveData();
  } else {
    // 復習モード終了時もデータ保存（reviewQueueの更新のため）
    saveData();
  }
  logSessionToFirestore(durationMs);
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

// 最新版 showResultSummary: スピードコメントを追加
showResultSummary = function (gradeLabel, durationMs) {
  if (!resultOverlay) return;
  const accuracy = questionGoal > 0 ? Math.round((correctCount / questionGoal) * 100) : 0;
  const skipCount = answersLog.filter((entry) => entry.result === "skipped").length;
  const wrongCount = questionGoal - correctCount - skipCount;

  if (resultMessageEl) resultMessageEl.textContent = `${gradeLabel}コース クリア！`;

  if (resultScoreEl) {
    resultScoreEl.textContent = `正答率 ${accuracy}% (${correctCount}/${questionGoal}問)`;
  }

  if (resultTimeEl) resultTimeEl.textContent = `タイム: ${formatDuration(durationMs)} `;
  if (resultBreakdownEl) resultBreakdownEl.textContent = `ミス ${Math.max(0, wrongCount)} / パス ${skipCount}`;
  if (resultSpeedCommentEl) {
    const avgSeconds = questionGoal > 0 ? (durationMs / questionGoal) / 1000 : null;
    const comment = getSpeedComment(avgSeconds);
    resultSpeedCommentEl.textContent = comment ? `⏱️ ${comment}` : "";
  }
  if (resultTimeBonusEl) {
    const avgSeconds = questionGoal > 0 ? (durationMs / questionGoal) / 1000 : null;
    const bonus = getTimeBonusText(avgSeconds);
    resultTimeBonusEl.textContent = bonus;
  }

  if (wrongAnswersList && wrongAnswersSection) {
    wrongAnswersList.innerHTML = "";
    const wrongEntries = answersLog.filter(entry => entry.result === "wrong");

    if (wrongEntries.length > 0) {
      wrongAnswersSection.hidden = false;
      wrongEntries.forEach(entry => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${entry.account}</strong> の 正解: ${TYPE_LABELS[entry.correctType]}`;
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
};

function hideResultSummary() {
  if (!resultOverlay) return;
  resultOverlay.classList.remove("visible");
  setTimeout(() => {
    resultOverlay.hidden = true;
    const card = resultOverlay.querySelector(".result-card");
    if (card) card.classList.remove("bounce-in");
    if (resultSpeedCommentEl) resultSpeedCommentEl.textContent = "";
    if (resultTimeBonusEl) resultTimeBonusEl.textContent = "";
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

if (examSelect) {
  examSelect.addEventListener("change", () => {
    const grades = getGradesForExam(examSelect.value);
    setupGrades(grades);
    updateReviewButtonState();
    if (statsOverlay && !statsOverlay.hidden) {
      renderChart();
      renderRanking();
      renderDictionary();
      renderAchievements();
      updateMissionUI();
      renderMissionCalendar();
    } else {
      renderDictionary();
    }
    updateStatsButtonLabel();
  });
}

if (gradeSelect) {
  gradeSelect.addEventListener("change", () => {
    updateReviewButtonState();
    if (statsOverlay && !statsOverlay.hidden) {
      renderChart();
      renderRanking();
      renderDictionary();
      renderAchievements();
      updateMissionUI();
      renderMissionCalendar();
    }
    setYomiText(currentAccount);
    updateStatsButtonLabel();
  });
}

if (showYomiCheckbox) {
  showYomiCheckbox.addEventListener("change", () => {
    setYomiText(currentAccount);
    renderDictionary();
  });
}

if (questionFilterSelect) {
  questionFilterSelect.addEventListener("change", () => {
    if (statsOverlay && !statsOverlay.hidden) {
      renderChart();
    }
  });
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
ensureDailyMission();
renderMissionCalendar();
updateStatsButtonLabel();
loadAccounts();

if (calendarPrevEl) {
  calendarPrevEl.addEventListener("click", () => {
    const base = calendarView.month === null ? new Date() : new Date(calendarView.year, calendarView.month, 1);
    base.setMonth(base.getMonth() - 1);
    calendarView = { year: base.getFullYear(), month: base.getMonth() };
    renderMissionCalendar();
  });
}

if (calendarNextEl) {
  calendarNextEl.addEventListener("click", () => {
    const base = calendarView.month === null ? new Date() : new Date(calendarView.year, calendarView.month, 1);
    base.setMonth(base.getMonth() + 1);
    calendarView = { year: base.getFullYear(), month: base.getMonth() };
    renderMissionCalendar();
  });
}
