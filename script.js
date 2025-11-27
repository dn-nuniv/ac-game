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
    if (allAccounts.length === 0) {
      updateFeedback("CSVにデータが見つかりませんでした。", "error");
      setStartButtonsDisabled(true);
      return;
    }
  
    if(csvFallbackSection) csvFallbackSection.hidden = true;
    updateFeedback(`${hintMessage} 準備完了！級と問題数を選んでスタート！`, "info");
    setStartButtonsDisabled(false);
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
    return `${min}:${sec}`;
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
  
  // 履歴追加
  function updateHistory(chosenType, isCorrect) {
    const fragment = historyTemplate.content.cloneNode(true);
    const accountEl = fragment.querySelector(".history-account");
    const resultEl = fragment.querySelector(".history-result");
  
    accountEl.textContent = currentAccount.name;
    const chosenLabel = TYPE_LABELS[chosenType] || chosenType;
    const correctLabel = TYPE_LABELS[currentAccount.type];
  
    if (isCorrect) {
      resultEl.textContent = `⭕️ ${correctLabel}`;
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
      updateFeedback(`⭕️ 正解！${currentAccount.name}は「${TYPE_LABELS[currentAccount.type]}」！`, "correct");
    } else if (selectedType === "skip") {
      updateFeedback(`⏩ パス！正解は「${TYPE_LABELS[currentAccount.type]}」でした。`, "neutral");
    } else {
      updateFeedback(`❌ ざんねん… ${currentAccount.name}は「${TYPE_LABELS[currentAccount.type]}」です。`, "wrong");
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

  function startGame(selectedGrade, questionCount) {
    if (allAccounts.length === 0) return;
    const pool = allAccounts.filter((item) => item.grade === selectedGrade);
    
    if (pool.length < questionCount) {
      updateFeedback(`${selectedGrade}の問題が足りません（${pool.length}件）。`, "wrong");
      return;
    }
  
    answersLog = [];
    questionGoal = questionCount;
    queue = shuffle(pool).slice(0, questionGoal);
    totalCount = 0;
    correctCount = 0;
    locked = false;
    currentAccount = null;
    activeGrade = selectedGrade;
  
    questionCountEl.textContent = "0";
    correctCountEl.textContent = "0";
    if (questionTargetEl) questionTargetEl.textContent = String(questionGoal);
    
    historyListEl.innerHTML = "";
    
    updateFeedback(`準備中...`, "neutral");
    setBoardEnabled(false); // カウントダウン中は操作不可
    if (exportButton) exportButton.disabled = true;
    hideResultSummary();

    // カウントダウン開始
    startCountdown(() => {
      updateFeedback(`🏁 ${selectedGrade}チャレンジ！スタート！`, "info");
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
    
    if (resultTimeEl) resultTimeEl.textContent = `タイム: ${formatDuration(durationMs)}`;
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
      setTimeout(() => { if(currentAccount && !locked) skipButton.disabled = false; }, 750);
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
    if (lastFinishedGrade) startGame(lastFinishedGrade, lastFinishedQuestionGoal);
  });
  
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
  loadAccounts();
