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

// game-config.js から読み込む設定（無ければ空オブジェクト）
const GAME_CFG = window.ACCOUNTS_GAME_CONFIG || {};

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
const playerStatusEl = document.getElementById("player-status");
const startButtons = document.querySelectorAll(".start-buttons .start-button[data-count]");
const startButtonsWrapper = document.querySelector(".start-buttons");
const timerDisplayEl = document.getElementById("timer-display");
const exportButton = document.getElementById("export-button");
const csvFallbackSection = document.getElementById("csv-fallback");
const localCsvButton = document.getElementById("local-csv-button");
const localCsvInput = document.getElementById("local-csv-input");
const bossIndicatorEl = document.getElementById("boss-indicator");
const bossButton = document.getElementById("boss-button");

// カウントダウン要素
const countdownOverlay = document.getElementById("countdown-overlay");
const countdownNumberEl = countdownOverlay ? countdownOverlay.querySelector(".countdown-number") : null;

// 結果画面
const resultOverlay = document.getElementById("result-overlay");
const resultMessageEl = document.getElementById("result-message");
const resultScoreEl = document.getElementById("result-score");
const resultTimeEl = document.getElementById("result-time");
const resultExpEl = document.getElementById("result-exp");
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
const modeAllButton = document.getElementById("mode-all-button");
const modeRpgButton = document.getElementById("mode-rpg-button");
const rpgLevelSelect = document.getElementById("level-select");
const rpgStartButton = document.getElementById("rpg-start-button");
const rpgStartWrapper = document.querySelector(".rpg-start-wrapper");
const levelButtonsContainer = document.querySelector(".level-buttons");
const statusBarEl = document.querySelector(".status-bar");

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
let currentMode = null;   // "all" | "rpg" | null
let currentLevel = null;   // RPGモード用
let gamePhase = "idle";    // "idle" | "training" | "boss"
let isReviewMode = false;
let reviewQueue = []; // 復習が必要な科目 { name, grade, exam }

// セッション履歴（グラフ等で使う）
let gameHistory = []; // { timestamp, exam, grade, accuracy, time, questionCount, mode?, level?, phase? }

// レベルごとの進捗集計
// key: "exam|grade|level" → value: { sessions, totalQuestions, totalCorrect, bestAccuracy, maxQuestionCount, lastPlayedAt, cleared }
let levelHistory = {};

let accuracyChartInstance = null;
let timeChartInstance = null;
let bossFailOverlay = null;
let bossRemainingQueue = [];
// プレイヤー経験値・レベル（試験/級ごとに保持）
// key: "exam|grade" -> { exp, level }
let playerStatusMap = {};
let lastSessionRecord = null;
let currentLevelButtons = [];
let hasWorldsForSelection = true;

function getPlayerKey(exam, grade) {
  const ex = exam || "日商";
  const gr = grade || "";
  return `${ex}|${gr}`;
}

function getCurrentPlayerStatus(exam = null, grade = null) {
  const key = getPlayerKey(exam ?? (examSelect ? examSelect.value : null), grade ?? (gradeSelect ? gradeSelect.value : null));
  if (!playerStatusMap[key]) {
    playerStatusMap[key] = { exp: 0, level: 1 };
  }
  return { key, status: playerStatusMap[key] };
}
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

// --- モード選択 ---
if (modeAllButton && modeRpgButton) {
  // 起動時は全復習モード
  setMode("all");

  modeAllButton.addEventListener("click", () => setMode("all"));
  modeRpgButton.addEventListener("click", () => setMode("rpg"));
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;

  if (!modeAllButton || !modeRpgButton) return;

  modeAllButton.classList.remove("selected");
  modeRpgButton.classList.remove("selected");

  if (mode === "all") {
    modeAllButton.classList.add("selected");

    // レベル選択は隠す
    if (rpgLevelSelect) {
      rpgLevelSelect.hidden = true;
    }

    // 10/20/30問ボタンを表示
    if (startButtons) {
      startButtons.forEach((btn) => {
        btn.style.display = "";
        btn.disabled = !accountsLoaded;
      });
    }

    // RPGスタートボタンを隠す
    if (rpgStartWrapper) {
      rpgStartWrapper.hidden = true;
    }

    // RPGスタートボタンは非表示扱い
    if (rpgStartButton) {
      rpgStartButton.disabled = true;
    }

    updateFeedback(
      "全復習モードを選択中。問題数を選んでください。",
      "info"
    );
  } else {
    modeRpgButton.classList.add("selected");

    // レベル選択を表示
    if (rpgLevelSelect) {
      rpgLevelSelect.hidden = false;
    }

    // 10/20/30問ボタンを隠す
    if (startButtons) {
      startButtons.forEach((btn) => {
        btn.style.display = "none";
      });
    }

    // RPGスタートボタンを表示（無効化状態）
    if (rpgStartWrapper) {
      rpgStartWrapper.hidden = false;
    }
    updateRpgStartButtonState();
    updateRpgLevelButtonStates();

    updateFeedback(
      "RPGモードを選択中。ワールドを選んでください。",
      "info"
    );
  }
  updateRpgLevelButtonStates();
  updatePlayerStatusView();
  buildLevelButtonsForSelection(examSelect ? examSelect.value : null, gradeSelect ? gradeSelect.value : null);
}

// --- RPGスタートボタン（削除予定、互換性のため残す） ---
if (rpgStartButton) {
  rpgStartButton.addEventListener("click", () => {
    if (currentMode !== "rpg" || currentLevel === null) return;

    const selectedGrade = gradeSelect ? gradeSelect.value : null;
    if (selectedGrade && accountsLoaded) {
      // RPGモードは常に10問（内部で自動調整される）
      startGame(selectedGrade, 10, false);
    } else {
      updateFeedback("級を選択してください。", "wrong");
    }
  });
}

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
    level: headers.indexOf("level"),
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
      const level = idx.level >= 0 ? (Number(cols[idx.level]) || null) : null;
      return { exam, grade, name, type, yomi, level };
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
  buildLevelButtonsForSelection(examSelect ? examSelect.value : null, gradeSelect ? gradeSelect.value : null);
  if (allAccounts.length === 0) {
    updateFeedback("CSVにデータが見つかりませんでした。", "error");
    setStartButtonsDisabled(true);
    return;
  }

  if (csvFallbackSection) csvFallbackSection.hidden = true; // 読み込み成功したら隠す
  updateFeedback(`${hintMessage} 準備完了！級と問題数を選んでスタート！`, "info");
  setStartButtonsDisabled(false);
    updateRpgStartButtonState();
    updateReviewButtonState();
    updateRpgLevelButtonStates();
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
    updateRpgStartButtonState();

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

    const savedLevelHistory = localStorage.getItem("ac_game_level_history");
    if (savedLevelHistory) {
      const parsedLevel = JSON.parse(savedLevelHistory);
      if (parsedLevel && typeof parsedLevel === "object") {
        levelHistory = parsedLevel;
      }
    }

    const savedPlayerStatus = localStorage.getItem("ac_game_player_status");
    if (savedPlayerStatus) {
      const parsedStatus = JSON.parse(savedPlayerStatus);
      if (parsedStatus && typeof parsedStatus === "object") {
        playerStatusMap = parsedStatus;
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
  localStorage.setItem("ac_game_level_history", JSON.stringify(levelHistory)); // ★追加
  localStorage.setItem("ac_game_stats", JSON.stringify(subjectStats));
  localStorage.setItem("ac_game_memory", JSON.stringify(subjectMemory));
  localStorage.setItem("ac_game_mission", JSON.stringify(missionState));
  localStorage.setItem("ac_game_mission_days", JSON.stringify(missionCompletionDays));
  localStorage.setItem("ac_game_player_status", JSON.stringify(playerStatusMap));
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
  localStorage.removeItem("ac_game_level_history");
  localStorage.removeItem("ac_game_stats");
  localStorage.removeItem("ac_game_memory");
  localStorage.removeItem("ac_game_mission");
  localStorage.removeItem("ac_game_mission_days");
  localStorage.removeItem("ac_game_player_status");
  reviewQueue = [];
  gameHistory = [];
  levelHistory = {};
  subjectStats = {};
  subjectMemory = {};
  missionState = { date: null, type: null, target: 0, progress: 0, done: false, description: "" };
  missionCompletionDays = [];
  playerStatusMap = {};
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

function getWorldLevelsForSelection(exam, grade) {
  const levels = new Set();
  allAccounts.forEach((item) => {
    if (exam && item.exam !== exam) return;
    if (grade && item.grade !== grade) return;
    if (typeof item.level === "number" && Number.isFinite(item.level)) {
      levels.add(item.level);
    }
  });
  const arr = Array.from(levels).filter((v) => v > 0).sort((a, b) => a - b);
  if (arr.length === 0) return [];
  return arr;
}

function buildLevelButtonsForSelection(exam, grade) {
  if (!levelButtonsContainer) return;
  const isRpgMode = currentMode === "rpg";
  const levels = getWorldLevelsForSelection(exam, grade);
  levelButtonsContainer.innerHTML = "";
  currentLevelButtons = [];

  if (!isRpgMode || levels.length === 0) {
    currentLevel = null;
    hasWorldsForSelection = false;
    if (rpgLevelSelect) rpgLevelSelect.hidden = true;
    if (bossButton) {
      bossButton.hidden = true;
      bossButton.disabled = true;
    }
    updateRpgStartButtonState();
    updateBossButtonState();
    updateRpgLevelButtonStates();
    updatePlayerStatusView();
    return;
  }

  hasWorldsForSelection = true;
  if (rpgLevelSelect) rpgLevelSelect.hidden = !isRpgMode;
  if (bossButton) bossButton.hidden = !isRpgMode;

  const prevLevel = currentLevel;
  let nextLevel = prevLevel && levels.includes(prevLevel) ? prevLevel : levels[0];

  levels.forEach((lvl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "level-button";
    btn.dataset.level = String(lvl);
    btn.textContent = String(lvl);
    btn.addEventListener("click", () => {
      currentLevel = lvl;
      gamePhase = "training";
      currentLevelButtons.forEach((b) => b.classList.remove("level-active"));
      btn.classList.add("level-active");
      updateRpgStartButtonState();
      updateBossButtonState();
      updateFeedback(`ワールド${lvl}を選択しました。スタートボタンを押して開始してください。`, "neutral");
    });
    levelButtonsContainer.appendChild(btn);
    currentLevelButtons.push(btn);
  });

  currentLevel = nextLevel;
  currentLevelButtons.forEach((btn) => {
    if (Number(btn.dataset.level) === currentLevel) btn.classList.add("level-active");
  });
  updateRpgStartButtonState();
  updateBossButtonState();
  updateRpgLevelButtonStates();
  updatePlayerStatusView();
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
  buildLevelButtonsForSelection(examSelect ? examSelect.value : null, gradeSelect ? gradeSelect.value : null);
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
  buildLevelButtonsForSelection(examSelect ? examSelect.value : null, gradeSelect ? gradeSelect.value : null);
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
  updateStatsPlayerStatusBox();
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
  const isRpgView = currentMode === "rpg";
  if (questionFilterSelect) {
    questionFilterSelect.style.display = isRpgView ? "none" : "block";
  }
  const selectedCount = isRpgView ? "all" : (questionFilterSelect ? questionFilterSelect.value : "all");
  const recentModeFiltered = gameHistory
    .filter(g => (isRpgView ? g.mode === "rpg" : g.mode !== "rpg"));
  updateStatsTitles(currentGrade, currentExam);
  const recentGames = recentModeFiltered
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

  // ボス撃破称号
  const bossWins = new Set();
  Object.entries(levelHistory || {}).forEach(([key, entry]) => {
    if (entry && entry.bossCleared) {
      const parts = key.split("|");
      const lvl = Number(parts[2]);
      if (Number.isFinite(lvl)) bossWins.add(lvl);
    }
  });
  if (bossWins.size > 0) {
    items.push(`ワールド${Array.from(bossWins).sort((a, b) => a - b).join(", ")} ボス撃破！`);
  }

  // RPGレベルのクリア状況（1〜9）
  const currentExam = examSelect ? examSelect.value : null;
  if (currentExam && currentGrade) {
    const cleared = [];
    for (let lvl = 1; lvl <= 9; lvl++) {
      if (isLevelCleared(currentExam, currentGrade, lvl)) {
        cleared.push(lvl);
      }
    }
    if (cleared.length > 0) {
      items.push(`${currentExam} ${currentGrade} ワールド${cleared.join(", ")} クリア`);
    }
  }

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
  const filterWrapper = document.getElementById("chart-filter-wrapper");
  const isRpgView = currentMode === "rpg";
  if (accuracyTitleEl) accuracyTitleEl.textContent = `${defaultTitles.accuracy}${suffix}`;
  if (timeTitleEl) timeTitleEl.textContent = `${defaultTitles.time}${suffix}`;
  if (bestTitleEl) bestTitleEl.textContent = `${defaultTitles.best}${suffix}`;
  if (worstTitleEl) worstTitleEl.textContent = `${defaultTitles.worst}${suffix}`;
  if (filterWrapper) {
    filterWrapper.style.display = isRpgView ? "none" : "flex";
  }
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

function updateRpgStartButtonState() {
  if (!rpgStartButton) return;
  const ready = currentMode === "rpg" && accountsLoaded && currentLevel !== null;
  rpgStartButton.disabled = !ready;
}

function updateBossButtonState() {
  if (!bossButton) return;
  const currentExam = examSelect ? examSelect.value : null;
  const currentGrade = gradeSelect ? gradeSelect.value : null;
  const enabledMode = currentMode === "rpg";
  const canCheck = enabledMode && currentExam && currentGrade && currentLevel !== null;
  const bossUnlocked = canCheck ? isLevelCleared(currentExam, currentGrade, currentLevel) : false;

  bossButton.hidden = !enabledMode || currentLevel === null;
  bossButton.disabled = !bossUnlocked;
  bossButton.classList.toggle("locked", !bossUnlocked);
  const labelCore = currentLevel ? `ボス戦 (W${currentLevel})` : "ボス戦";
  bossButton.textContent = bossUnlocked ? labelCore : "ボス戦";
}

function updateLevelButtonStates() {
  if (!rpgLevelSelect) return;
  const currentExam = examSelect ? examSelect.value : null;
  const currentGrade = gradeSelect ? gradeSelect.value : null;
  const maxClearedLevel = getMaxClearedLevel(currentExam, currentGrade);
  const buttons = rpgLevelSelect.querySelectorAll(".level-button");

  buttons.forEach((btn) => {
    const level = Number(btn.dataset.level);
    if (!btn.dataset.label) {
      btn.dataset.label = btn.textContent.trim();
    }
    const baseLabel = btn.dataset.label || btn.textContent.trim();
    let label = baseLabel;

    const cleared = currentExam && currentGrade && Number.isFinite(level) && isLevelCleared(currentExam, currentGrade, level);
    btn.classList.toggle("level-button-cleared", !!cleared);

    const prevBossCleared = Number.isFinite(level) && level >= 2
      ? isBossCleared(currentExam, currentGrade, level - 1)
      : true;
    const locked = Number.isFinite(level) && level >= 2 && (!prevBossCleared);
    btn.disabled = !!locked;
    btn.classList.toggle("level-locked", !!locked);

    if (btn.textContent !== label) {
      btn.textContent = label;
    }
  });
  updateBossButtonState();
}

function updateRpgLevelButtonStates() {
  updateLevelButtonStates();
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

  if (questionCountEl) questionCountEl.textContent = "0";
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

/**
 * RPGモード用の問題セット作成関数
 * 指定されたレベルから10問を作成し、足りない場合は下位レベルから補充する
 * @param {Array} allAccounts - 全問題の配列
 * @param {string} exam - 試験名
 * @param {string} grade - 級
 * @param {number} targetLevel - 選択されたレベル
 * @returns {Array} 最大10問の問題配列（シャッフル済み）
 */
function buildRPGQuestionPool(allAccounts, exam, grade, targetLevel) {
  const TARGET_COUNT = 10;
  const result = [];
  const usedNames = new Set(); // 重複防止用

  // 指定されたレベルの問題を取得してシャッフル
  let currentLevelQuestions = allAccounts.filter(
    (item) => item.exam === exam && item.grade === grade && item.level === targetLevel
  );
  currentLevelQuestions = shuffle(currentLevelQuestions);

  // まず指定レベルの問題を追加
  for (const q of currentLevelQuestions) {
    if (result.length >= TARGET_COUNT) break;
    if (!usedNames.has(q.name)) {
      result.push(q);
      usedNames.add(q.name);
    }
  }

  // 10問に満たない場合、下位レベル全体からシャッフルして補充
  if (result.length < TARGET_COUNT) {
    let lowerLevelQuestions = allAccounts.filter(
      (item) => item.exam === exam && item.grade === grade && typeof item.level === "number" && item.level < targetLevel
    );
    lowerLevelQuestions = shuffle(lowerLevelQuestions);

    for (const q of lowerLevelQuestions) {
      if (result.length >= TARGET_COUNT) break;
      if (!usedNames.has(q.name)) {
        result.push(q);
        usedNames.add(q.name);
      }
    }
  }

  // 注: レベル1まで見ても10問に満たない場合は、その時点で揃っている問題数だけ返す
  // エラーにはせず、startGame側で件数チェックを行う

  return result;
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
  if (questionCountEl) questionCountEl.textContent = String(Math.max(0, questionGoal - totalCount));

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

  // ボス戦は1問でもミスで終了
  if (gamePhase === "boss" && !isCorrect) {
    handleBossFailure([...queue], currentAccount);
    return;
  }

  answersLog.push({
    timestamp: new Date().toISOString(),
    grade: activeGrade,
    exam: activeExam,
    mode: isReviewMode ? "review" : (currentMode || "all"),
    sessionLevel: (isReviewMode ? null : (currentMode === "rpg" ? (currentLevel ?? null) : null)),
    accountLevel: currentAccount && typeof currentAccount.level !== "undefined"
      ? currentAccount.level
      : null,
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

  if (gamePhase === "boss" && !isCorrect) {
    handleBossFailure([...queue], currentAccount);
    return;
  }

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
  if (questionCountEl) questionCountEl.textContent = String(Math.max(0, questionGoal - totalCount));

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
    mode: isReviewMode ? "review" : (currentMode || "all"),
    sessionLevel: (isReviewMode ? null : (currentMode === "rpg" ? (currentLevel ?? null) : null)),
    accountLevel: currentAccount && typeof currentAccount.level !== "undefined"
      ? currentAccount.level
      : null,
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

  // ボス戦は1問でもミスで終了
  if (gamePhase === "boss" && !isCorrect) {
    handleBossFailure([...queue]);
    return;
  }

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
  const requestedCount = Number.isFinite(Number(questionCount)) ? Number(questionCount) : 10;
  const selectedExam = examSelect ? examSelect.value : null;
  const targetGrade = isReviewMode
    ? (selectedGrade || (gradeSelect ? gradeSelect.value : null))
    : selectedGrade;
  activeExam = selectedExam;
  gamePhase = currentMode === "rpg" ? "training" : "idle";

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
  } else if (currentMode === "rpg") {
    // RPGモード: 専用の問題セット作成ロジック
    if (currentLevel === null) {
      updateFeedback("ワールドを選択してください。", "wrong");
      return;
    }

    // RPGモードは常に10問
    questionCount = 10;

    pool = buildRPGQuestionPool(allAccounts, selectedExam, selectedGrade, currentLevel);

    if (pool.length === 0) {
      updateFeedback(`レベル${currentLevel}の問題が見つかりません。`, "wrong");
      return;
    }

    // 10問未満でも開始可能（下位レベルから補充した結果）
    if (pool.length < 10) {
      updateFeedback(`ワールド${currentLevel}から${pool.length}問を出題します（下位レベルを含む）。`, "info");
    }
  } else {
    // 通常モード（全復習モードなど）
    pool = allAccounts.filter((item) => item.grade === selectedGrade && (!selectedExam || item.exam === selectedExam));

    if (pool.length < requestedCount) {
      updateFeedback(`${selectedExam || ""} ${selectedGrade} の問題が足りません（${pool.length} 件）。`, "wrong");
      return;
    }
  }

  answersLog = [];

  // RPGモードの場合、poolは既にbuildRPGQuestionPool()でシャッフル済み
  if (currentMode === "rpg") {
    queue = pool; // 既にシャッフル済みなのでそのまま使う
  } else if (isReviewMode) {
    queue = shuffle(pool).slice(0, questionCount);
  } else {
    queue = weightedSample(pool, requestedCount, targetGrade, selectedExam);
  }
  questionGoal = queue.length;
  totalCount = 0;
  correctCount = 0;
  locked = false;
  currentAccount = null;
  activeGrade = targetGrade || selectedGrade;
  currentStreak = 0;

  if (questionCountEl) questionCountEl.textContent = String(Math.max(0, questionGoal));
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
  updateBossIndicator(null, false);

  // カウントダウン開始
  startCountdown(() => {
    const modeLabel = isReviewMode
      ? "復習モード"
      : `${selectedGrade} チャレンジ`;
    updateFeedback(`🏁 ${modeLabel}！スタート！`, "info");
    setBoardEnabled(true);
    updateBossIndicator(currentLevel, gamePhase === "boss");
    if (statusBarEl && typeof statusBarEl.scrollIntoView === "function") {
      statusBarEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    startTimer();
    nextAccount();
  });
}

function startBossBattle() {
  if (!bossButton) return;
  if (currentMode !== "rpg") {
    updateFeedback("RPGモードに切り替えてください。", "wrong");
    return;
  }
  setStartButtonsDisabled(true);
  if (rpgStartButton) rpgStartButton.disabled = true;
  if (currentLevel === null) {
    updateFeedback("ワールドを選択してください。", "wrong");
    return;
  }

  const selectedExam = examSelect ? examSelect.value : null;
  const selectedGrade = gradeSelect ? gradeSelect.value : null;
  if (!selectedGrade || !accountsLoaded) {
    updateFeedback("級を選択してください。", "wrong");
    return;
  }

  if (!isLevelCleared(selectedExam, selectedGrade, currentLevel)) {
    updateFeedback("このレベルはまだボス戦を解放していません。", "wrong");
    return;
  }

  const pool = shuffle(allAccounts.filter(
    (item) => item.exam === selectedExam && item.grade === selectedGrade && item.level === currentLevel
  ));
  if (pool.length === 0) {
    updateFeedback(`ワールド${currentLevel}のボス戦データが見つかりません。`, "wrong");
    return;
  }

  const bossQueue = pool; // そのレベルの全問をシャッフルして出題

  startBossFromQueue(bossQueue, selectedGrade, selectedExam);
}

function startBossFromQueue(bossQueue, selectedGrade, selectedExam) {
  if (!bossQueue || bossQueue.length === 0) {
    updateFeedback("ボス戦の問題がありません。", "wrong");
    return;
  }
  bossRemainingQueue = [];
  isReviewMode = false;
  answersLog = [];
  queue = bossQueue;
  questionGoal = queue.length;
  totalCount = 0;
  correctCount = 0;
  locked = false;
  currentAccount = null;
  activeGrade = selectedGrade;
  activeExam = selectedExam;
  currentStreak = 0;
  gamePhase = "boss";

  if (questionCountEl) questionCountEl.textContent = String(Math.max(0, questionGoal));
  correctCountEl.textContent = "0";
  if (questionTargetEl) questionTargetEl.textContent = String(questionGoal);

  historyListEl.innerHTML = "";
  setCardText("---");
  setYomiText(null);
  cardEl.classList.remove("pop-in");

  updateFeedback(`ワールド${currentLevel}のボス戦を開始します。全問正解でクリア！`, "info");
  setBoardEnabled(false);
  setStartButtonsDisabled(true);
  if (rpgStartButton) rpgStartButton.disabled = true;
  if (bossButton) bossButton.disabled = true;
  if (exportButton) exportButton.disabled = true;
  hideResultSummary();
  updateBossIndicator(currentLevel, true);

  startCountdown(() => {
    updateFeedback(`🏁 ワールド${currentLevel} ボス戦スタート！`, "info");
    setBoardEnabled(true);
    startTimer();
    if (statusBarEl && typeof statusBarEl.scrollIntoView === "function") {
      statusBarEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    nextAccount();
  });
}

function handleBossFailure(remainingQueue, wrongAccount = null) {
  stopTimer();
  setBoardEnabled(false);
  clearDropZoneStates();
  locked = true;
  const pending = [];
  const wrong = wrongAccount || currentAccount;
  if (wrong) pending.push(wrong);
  if (Array.isArray(remainingQueue)) pending.push(...remainingQueue);
  queue = [];
  bossRemainingQueue = pending;
  questionGoal = bossRemainingQueue.length;
  if (questionCountEl) questionCountEl.textContent = String(Math.max(0, questionGoal));
  correctCountEl.textContent = "0";
  if (questionTargetEl) questionTargetEl.textContent = String(questionGoal);
  answersLog = [];
  historyListEl.innerHTML = "";
  updateFeedback("ボスに倒されました。作戦を立て直そう。", "wrong");
  updateBossIndicator(currentLevel, true);
  setStartButtonsDisabled(true);
  if (rpgStartButton) rpgStartButton.disabled = true;
  if (bossButton) bossButton.disabled = true;
  showBossFailOverlay(bossRemainingQueue.length > 0);
}

// --- レベル進捗集計＆クリア判定 ---

function getLevelKey(exam, grade, level) {
  if (level == null) return null;
  const ex = exam || "日商";
  const gr = grade || "";
  return `${ex}|${gr}|${level}`;
}

/**
 * 1セッションぶんの結果から levelHistory を更新する
 * record: gameHistory に積んでいる1件と同じ形を想定
 */
function updateLevelHistoryForSession(record) {
  if (!record) return;
  if (record.mode !== "rpg") return;
  if (record.level == null) return;

  const key = getLevelKey(record.exam, record.grade, record.level);
  if (!key) return;

  const questionCount = record.questionCount || 0;
  const accuracyPercent = record.accuracy || 0; // 0〜100
  const accuracyRatio = questionCount > 0 ? (accuracyPercent / 100) : 0;
  const correctCount = Math.round(questionCount * accuracyRatio);

  const existing = levelHistory[key] || {
    sessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    bestAccuracy: 0,
    maxQuestionCount: 0,
    lastPlayedAt: null,
    cleared: false
  };

  const updated = { ...existing };
  updated.sessions += 1;
  updated.totalQuestions += questionCount;
  updated.totalCorrect += correctCount;
  updated.bestAccuracy = Math.max(existing.bestAccuracy || 0, accuracyPercent);
  updated.maxQuestionCount = Math.max(existing.maxQuestionCount || 0, questionCount);
  updated.lastPlayedAt = record.timestamp || Date.now();
  if (record.phase === "boss" && record.bossResult === "clear") {
    updated.bossCleared = true;
  }

  // --- クリア判定（config のデフォルト値を使用） ---
  const bossCfgBase = (GAME_CFG && GAME_CFG.bossUnlock && GAME_CFG.bossUnlock.default) || {};
  const minQuestions = bossCfgBase.minQuestionsPerSession ?? 10;
  const minSessions = bossCfgBase.minSessions ?? 2;
  const minBestAccuracy = (bossCfgBase.minBestAccuracy ?? 0.8) * 100; // 0.8 → 80%

  const enoughSessions = updated.sessions >= minSessions;
  const enoughQuestions = updated.maxQuestionCount >= minQuestions;
  const enoughAccuracy = updated.bestAccuracy >= minBestAccuracy;

  updated.cleared = !!(enoughSessions && enoughQuestions && enoughAccuracy);

  levelHistory[key] = updated;
}

/**
 * レベルがクリア済みかどうかを返す
 */
function isLevelCleared(exam, grade, level) {
  const key = getLevelKey(exam, grade, level);
  if (!key) return false;
  const entry = levelHistory[key];
  return !!(entry && entry.cleared);
}

function getMaxClearedLevel(exam, grade) {
  let max = 0;
  for (let lvl = 1; lvl <= 9; lvl++) {
    if (isLevelCleared(exam, grade, lvl)) {
      max = lvl;
    }
  }
  return max;
}

function isBossCleared(exam, grade, level) {
  const key = getLevelKey(exam, grade, level);
  if (!key) return false;
  const entry = levelHistory[key];
  return !!(entry && entry.bossCleared);
}

function updateBossIndicator(level, isBossPhase) {
  if (!bossIndicatorEl) return;
  if (isBossPhase && level != null) {
    bossIndicatorEl.hidden = false;
    bossIndicatorEl.textContent = `👑 ボス戦: ワールド${level}`;
  } else {
    bossIndicatorEl.hidden = true;
    bossIndicatorEl.textContent = "👑 ボス戦";
  }
}

function getExpConfig() {
  return (GAME_CFG && GAME_CFG.exp) || {};
}

function computeLevelInfo(exp, baseRequired, growthRate) {
  let level = 1;
  let threshold = baseRequired;
  let remainingExp = exp;
  while (remainingExp >= threshold) {
    remainingExp -= threshold;
    level += 1;
    threshold = Math.round(threshold * growthRate);
  }
  const expToNext = Math.max(0, threshold - remainingExp);
  return { level, expToNext, remainder: remainingExp, nextThreshold: threshold };
}

function getRecommendedPlayerLevelForWorld(exam, grade, worldLevel) {
  const expCfg = getExpConfig();
  const worldCfg = expCfg.worldRecommendedLevel || {};
  const byWorldKey = worldCfg.byWorldKey || {};
  const defaultByLevel = worldCfg.defaultByLevel || {};

  if (!worldLevel) return null;

  const ex = exam || "日商";
  const gr = grade || "";
  const key = ex + "|" + gr + "|" + String(worldLevel);

  if (Object.prototype.hasOwnProperty.call(byWorldKey, key)) {
    return byWorldKey[key];
  }

  const keyLevel = String(worldLevel);
  if (Object.prototype.hasOwnProperty.call(defaultByLevel, keyLevel)) {
    return defaultByLevel[keyLevel];
  }

  return null;
}

function getExpMultiplierFromPlayerLevel(exam, grade, worldLevel) {
  const expCfg = getExpConfig();
  const decayCfg = expCfg.worldExpDecay || {};
  if (decayCfg.enabled === false) return 1.0;

  const recommended = getRecommendedPlayerLevelForWorld(exam, grade, worldLevel);
  if (recommended == null) return 1.0;

  const { status } = getCurrentPlayerStatus(exam, grade);
  const gap = status.level - recommended;
  if (gap <= 0) {
    return decayCfg.multiplierWhenGapLE0 ?? 1.0;
  } else if (gap === 1) {
    return decayCfg.multiplierWhenGapEQ1 ?? 0.5;
  } else {
    return decayCfg.multiplierWhenGapGE2 ?? 0.1;
  }
}

function calculateSessionExp(record, correctCount, questionGoal) {
  const expCfg = getExpConfig();
  const baseExp = expCfg.baseExpPerCorrect ?? 10;
  const useLevelBonus = expCfg.useLevelBonus ?? true;
  const levelBonusFactor = expCfg.levelBonusFactor ?? 0.05;
  const wrongPenaltyEnabled = expCfg.wrongPenaltyEnabled ?? false;
  const wrongPenaltyPerQuestion = expCfg.wrongPenaltyPerQuestion ?? 5;

  const level = record.level != null ? record.level : 0;
  const worldLevel = record.level != null ? record.level : null;
  const isBoss = record.phase === "boss";
  const isBossClear = record.bossResult === "clear";

  let perCorrect = baseExp;
  if (useLevelBonus && level > 0) {
    perCorrect = perCorrect * (1 + levelBonusFactor * level);
  }

  let exp = Math.round(correctCount * perCorrect);

  if (wrongPenaltyEnabled && questionGoal > correctCount) {
    const wrongCount = questionGoal - correctCount;
    exp -= wrongCount * wrongPenaltyPerQuestion;
  }

  if (isBoss && isBossClear) {
    exp = Math.round(exp * 1.5);
  }

  const multiplier = getExpMultiplierFromPlayerLevel(record.exam, record.grade, worldLevel);
  exp = Math.round(exp * multiplier);

  if (exp < 0) exp = 0;
  return exp;
}

function recalcPlayerLevelFromExp() {
  const expCfg = getExpConfig();
  const baseRequired = expCfg.levelUp?.baseRequiredExp ?? 100;
  const growthRate = expCfg.levelUp?.growthRate ?? 1.2;

  Object.keys(playerStatusMap || {}).forEach((key) => {
    const entry = playerStatusMap[key] || { exp: 0, level: 1 };
    const info = computeLevelInfo(entry.exp || 0, baseRequired, growthRate);
    playerStatusMap[key] = { ...entry, level: info.level, exp: entry.exp || 0 };
  });
}

function updatePlayerStatusView() {
  if (!playerStatusEl) return;
  if (currentMode !== "rpg" || !hasWorldsForSelection) {
    playerStatusEl.textContent = "";
    playerStatusEl.style.visibility = "hidden";
    return;
  }
  playerStatusEl.style.visibility = "visible";
  const expCfg = getExpConfig();
  const baseRequired = expCfg.levelUp?.baseRequiredExp ?? 100;
  const growthRate = expCfg.levelUp?.growthRate ?? 1.2;
  const { status } = getCurrentPlayerStatus();
  const info = computeLevelInfo(status.exp || 0, baseRequired, growthRate);
  const level = info.level || status.level || 1;
  const expToNext = info.expToNext;
  const examLabel = examSelect ? examSelect.value : "";
  const gradeLabel = gradeSelect ? gradeSelect.value : "";
  const prefix = [examLabel, gradeLabel].filter(Boolean).join(" ");
  playerStatusEl.textContent = prefix
    ? `プレイヤーLv.${level}（${prefix} 次のレベルまで ${expToNext} EXP）`
    : `プレイヤーLv.${level}（次のレベルまで ${expToNext} EXP）`;
}

function showLevelUpEffect(newLevel) {
  const toast = document.createElement("div");
  toast.className = "levelup-toast";
  const chip = document.createElement("div");
  chip.className = "levelup-chip";
  chip.textContent = `LEVEL UP! Lv.${newLevel}`;
  toast.appendChild(chip);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2100);
}

function ensureBossFailOverlay() {
  if (bossFailOverlay) return bossFailOverlay;
  const overlay = document.createElement("div");
  overlay.className = "result-overlay boss-fail-overlay";
  overlay.hidden = true;
  const card = document.createElement("div");
  card.className = "result-card";
  const title = document.createElement("h2");
  title.textContent = "👑 ボス戦 失敗";
  const msg = document.createElement("p");
  msg.id = "boss-fail-message";
  msg.textContent = "ボスに倒されました...";
  const actions = document.createElement("div");
  actions.className = "result-actions";

  const resumeBtn = document.createElement("button");
  resumeBtn.type = "button";
  resumeBtn.className = "primary-button push-btn";
  resumeBtn.id = "boss-resume-btn";
  resumeBtn.textContent = "残りから再挑戦";

  const restartBtn = document.createElement("button");
  restartBtn.type = "button";
  restartBtn.className = "ghost-button";
  restartBtn.id = "boss-restart-btn";
  restartBtn.textContent = "最初から再挑戦";

  const giveupBtn = document.createElement("button");
  giveupBtn.type = "button";
  giveupBtn.className = "ghost-button danger-text";
  giveupBtn.id = "boss-giveup-btn";
  giveupBtn.textContent = "あきらめる";

  actions.append(resumeBtn, restartBtn, giveupBtn);
  card.append(title, msg, actions);
  overlay.append(card);
  document.body.appendChild(overlay);
  bossFailOverlay = {
    overlay,
    resumeBtn,
    restartBtn,
    giveupBtn,
    msg
  };
  return bossFailOverlay;
}

function hideBossFailOverlay() {
  const ref = ensureBossFailOverlay();
  ref.overlay.classList.remove("visible");
  setTimeout(() => { ref.overlay.hidden = true; }, 200);
}

function showBossFailOverlay(canResume) {
  const ref = ensureBossFailOverlay();
  ref.resumeBtn.disabled = !canResume;
  ref.resumeBtn.classList.toggle("disabled", !canResume);
  ref.overlay.hidden = false;
  setTimeout(() => ref.overlay.classList.add("visible"), 10);
}

function clearDropZoneStates() {
  dropZones.forEach((zone) => {
    zone.classList.remove("correct", "wrong");
    zone.blur();
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
  const baseMode = isReviewMode ? "review" : (currentMode || "all");
  const currentPhase = gamePhase;
  const bossResult = currentPhase === "boss" ? (accuracy === 1 ? "clear" : "fail") : undefined;
  const latestRecord = lastSessionRecord || (gameHistory.length ? gameHistory[gameHistory.length - 1] : null);
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
    mode: baseMode,
  };

  if (baseMode === "rpg") {
    summary.level = currentLevel ?? null;
    summary.phase = currentPhase;
    if (currentPhase === "boss") {
      summary.bossResult = bossResult;
    }
  }

  if (latestRecord && latestRecord.mode === "rpg") {
    summary.sessionExp = latestRecord.sessionExp ?? null;
    summary.totalExpAfter = latestRecord.totalExpAfter ?? null;
    summary.playerLevelAfter = latestRecord.playerLevelAfter ?? null;
  }

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
  const finishedPhase = gamePhase;
  const isBossPhase = finishedPhase === "boss";
  const accuracy = questionGoal > 0 ? Math.round((correctCount / questionGoal) * 100) : 0;
  const isBossClear = isBossPhase && correctCount === questionGoal;
  const { status: currentStatus } = getCurrentPlayerStatus(finishedExam, finishedGrade);
  const prevPlayerLevel = currentStatus.level || 1;

  // ゲーム結果保存 (復習モードは履歴に残さない、あるいは区別する？今回は通常のみ履歴に残す)
  if (!isReviewMode) {
    const baseMode = currentMode || "all";

    const record = {
      timestamp: Date.now(),
      exam: finishedExam,
      grade: finishedGrade,
      accuracy: accuracy,
      time: durationMs,
      questionCount: questionGoal,
      mode: baseMode,
      phase: finishedPhase
    };

    if (baseMode === "rpg") {
      record.level = currentLevel ?? null;
      if (isBossPhase) {
        record.bossResult = isBossClear ? "clear" : "fail";
      }
    }

    if (baseMode === "rpg") {
      const sessionExp = calculateSessionExp(record, correctCount, questionGoal);
      const { key, status } = getCurrentPlayerStatus(finishedExam, finishedGrade);
      const nextExp = Math.max(0, (status.exp || 0) + sessionExp);
      playerStatusMap[key] = { ...status, exp: nextExp };
      recalcPlayerLevelFromExp();
      const updated = playerStatusMap[key] || { exp: nextExp, level: 1 };
      record.sessionExp = sessionExp;
      record.totalExpAfter = updated.exp;
      record.playerLevelAfter = updated.level;
    }

    gameHistory.push(record);
    lastSessionRecord = record;

    // RPGモード時はレベル進捗も更新
    if (record.mode === "rpg" && record.level != null) {
      updateLevelHistoryForSession(record);
      if (isBossPhase && isBossClear) {
        const key = getLevelKey(record.exam, record.grade, record.level);
        if (key) {
          const existing = levelHistory[key] || {};
          levelHistory[key] = { ...existing, bossCleared: true };
        }
      }
      updateRpgLevelButtonStates();
      updateBossButtonState();
    }

    saveData();
  } else {
    // 復習モード終了時もデータ保存（reviewQueueの更新のため）
    saveData();
  }
  updatePlayerStatusView();
  logSessionToFirestore(durationMs);
  if (isBossPhase) {
    updateFeedback(isBossClear ? "👑 ボスを撃破しました！" : "ボス戦失敗。もう一度挑戦できます。", isBossClear ? "correct" : "wrong");
  }
  updateBossIndicator(null, false);
  gamePhase = "idle";
  setStartButtonsDisabled(!accountsLoaded);
  updateRpgStartButtonState();
  updateBossButtonState();
  if (!isReviewMode && currentMode === "rpg") {
    const { status: latestStatus } = getCurrentPlayerStatus(finishedExam, finishedGrade);
    if ((latestStatus.level || 1) > prevPlayerLevel) {
      showLevelUpEffect(latestStatus.level);
    }
  }
  updateStatsPlayerStatusBox();
  showResultSummary(finishedGrade, durationMs);
  updateMissionProgressGame(avgSeconds);
}

function updateStatsPlayerStatusBox() {
  const expBox = document.getElementById("player-exp-stats");
  if (!expBox) return;
  const expCfg = getExpConfig();
  const baseRequired = expCfg.levelUp?.baseRequiredExp ?? 100;
  const growthRate = expCfg.levelUp?.growthRate ?? 1.2;
  const exam = examSelect ? examSelect.value : "";
  const grade = gradeSelect ? gradeSelect.value : "";
  const { status } = getCurrentPlayerStatus(exam, grade);
  const info = computeLevelInfo(status.exp || 0, baseRequired, growthRate);
  const level = info.level || status.level || 1;
  expBox.textContent = `${exam || "-"} ${grade || ""} Lv.${level} / 累計EXP ${status.exp || 0} / 次Lvまで ${info.expToNext} EXP`;
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

  if (resultExpEl && lastSessionRecord && !isReviewMode) {
    const gained = lastSessionRecord.sessionExp ?? 0;
    const total = lastSessionRecord.totalExpAfter ?? playerStatusMap[getPlayerKey(lastSessionRecord.exam, lastSessionRecord.grade)]?.exp ?? 0;
    resultExpEl.textContent = `獲得EXP: +${gained}（累計 ${total}）`;
  } else if (resultExpEl) {
    resultExpEl.textContent = "";
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

  if (resultExpEl && lastSessionRecord && !isReviewMode) {
    const gained = lastSessionRecord.sessionExp ?? 0;
    const total = lastSessionRecord.totalExpAfter ?? playerStatusMap[getPlayerKey(lastSessionRecord.exam, lastSessionRecord.grade)]?.exp ?? 0;
    resultExpEl.textContent = `獲得EXP: +${gained}（累計 ${total}）`;
  } else if (resultExpEl) {
    resultExpEl.textContent = "";
  }

  if (resultExpEl) {
    if (lastSessionRecord && lastSessionRecord.mode === "rpg") {
      const gained = lastSessionRecord.sessionExp ?? 0;
      const total = lastSessionRecord.totalExpAfter ?? playerExp;
      resultExpEl.textContent = `獲得EXP: +${gained}（累計 ${total}）`;
    } else {
      resultExpEl.textContent = "";
    }
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
      updateStatsPlayerStatusBox();
    } else {
      renderDictionary();
    }
    updateStatsButtonLabel();
    updatePlayerStatusView();
  });
}

if (gradeSelect) {
  gradeSelect.addEventListener("change", () => {
    updateReviewButtonState();
    buildLevelButtonsForSelection(examSelect ? examSelect.value : null, gradeSelect ? gradeSelect.value : null);
    if (statsOverlay && !statsOverlay.hidden) {
      renderChart();
      renderRanking();
      renderDictionary();
      renderAchievements();
      updateMissionUI();
      renderMissionCalendar();
      updateStatsPlayerStatusBox();
    }
    updateRpgLevelButtonStates();
    setYomiText(currentAccount);
    updateStatsButtonLabel();
    updatePlayerStatusView();
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

if (bossButton) {
  bossButton.addEventListener("click", () => startBossBattle());
}

const bossFailRefs = ensureBossFailOverlay();
if (bossFailRefs.resumeBtn) {
  bossFailRefs.resumeBtn.addEventListener("click", () => {
    hideBossFailOverlay();
    if (bossRemainingQueue.length === 0) return;
    const selectedGrade = activeGrade || (gradeSelect ? gradeSelect.value : null);
    const selectedExam = activeExam || (examSelect ? examSelect.value : null);
    startBossFromQueue(shuffle(bossRemainingQueue), selectedGrade, selectedExam);
  });
}
if (bossFailRefs.restartBtn) {
  bossFailRefs.restartBtn.addEventListener("click", () => {
    hideBossFailOverlay();
    bossRemainingQueue = [];
    startBossBattle();
  });
}
  if (bossFailRefs.giveupBtn) {
    bossFailRefs.giveupBtn.addEventListener("click", () => {
      hideBossFailOverlay();
      resetGameState();
      gamePhase = "idle";
      updateBossIndicator(null, false);
      setStartButtonsDisabled(!accountsLoaded);
      updateRpgStartButtonState();
      updateBossButtonState();
      updatePlayerStatusView();
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
updateRpgLevelButtonStates();
updatePlayerStatusView();
updateStatsPlayerStatusBox();
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
