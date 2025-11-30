// game-config.js
// 勘定科目ゲーム（accounts game）用のパラメータ定義ファイル
// ----------------------------------------------
// ・問題データ（勘定科目・level など）は CSV 側で管理
// ・ゲームバランスに関する数値・フラグはすべてここで管理
// ・script.js からは window.ACCOUNTS_GAME_CONFIG 経由で参照する
// ----------------------------------------------

window.ACCOUNTS_GAME_CONFIG = {
    // 設定ファイルのバージョン管理用（任意）
    meta: {
        version: "2025-11-30-01",
        note: "初期版：RPGモード向けのクリア条件／出題ロジック／経験値パラメータを定義"
    },

    // ------------------------------------------
    // 1. RPGモードの出題ロジック
    // ------------------------------------------
    rpgQuestionSelection: {
        // 1回のセッションで「何問を目標にするか」
        // ※実際には、問題が足りなければ script.js 側で自動的に縮小してよい
        targetQuestionsPerSession: 10,

        // 選択レベルの問題数が targetQuestionsPerSession に満たない場合の挙動
        // true：下位レベル全体から補充してシャッフル
        // false：不足していても補充せず、そのレベルだけで出題
        fallbackToLowerLevels: true,

        // fallbackToLowerLevels が true の場合、
        // 下位レベルをどこまで含めるか
        // "all"   : レベル1〜(選択レベル)まで全部を候補にする
        // "range" : minLowerLevel～(選択レベル)までの範囲に限定
        lowerLevelMode: "all",

        // lowerLevelMode が "range" の場合のみ使用
        // 例：minLowerLevel = 3, 選択レベル = 7 のとき
        //     レベル 3〜7 の問題だけを候補にする
        minLowerLevel: 1
    },

    // ------------------------------------------
    // 2. ボス戦解放条件（クリア判定）
    // ------------------------------------------
    bossUnlock: {
        // デフォルトの解放条件
        // 「この条件を満たしたら、そのレベルのボス戦ボタンを解放する」
        default: {
            // 対象とする“RPGトレーニング”セッションの最低問題数
            // → これ未満のセッションは練習扱いで、解放判定に使わない
            minQuestionsPerSession: 10,

            // 解放判定に必要なセッション数
            // （例：2 なら「10問以上解いたセッションが2回以上必要」）
            minSessions: 2,

            // そのセッション群のうち、最も高い正答率（ベストスコア）が
            // この値以上ならボス解放
            // 例：0.8 → 80％以上
            minBestAccuracy: 0.8
        },

        // レベルごとの個別設定（必要な場合だけ上書き）
        // キーの形式："exam|grade|level"
        // 例：日商3級レベル1なら "日商|3級|1"
        byLevelKey: {
            // 例1：日商3級 レベル1はかなり甘く（最初の導入用）
            // "日商|3級|1": {
            //   minQuestionsPerSession: 5,
            //   minSessions: 1,
            //   minBestAccuracy: 0.7
            // },

            // 例2：日商3級 レベル9は少し厳しめにしたい場合
            // "日商|3級|9": {
            //   minQuestionsPerSession: 10,
            //   minSessions: 3,
            //   minBestAccuracy: 0.85
            // }
        }
    },

    // ------------------------------------------
    // 3. 経験値（EXP）とプレイヤーレベル
    //    ※まだ使わない場合は script.js 側で無視してOK
    // ------------------------------------------
    exp: {
        // 1問正解あたりの基礎EXP
        baseExpPerCorrect: 10,

        // レベル補正をかけるかどうか
        // true の場合： baseExpPerCorrect * (1 + levelBonusFactor * level)
        useLevelBonus: true,

        // レベル補正の強さ
        levelBonusFactor: 0.05, // 例：レベル5なら 1 + 0.25 = 1.25倍

        // 不正解時に経験値ペナルティを付けるか
        wrongPenaltyEnabled: false,
        wrongPenaltyPerQuestion: 5,

        worldRecommendedLevel: {
            defaultByLevel: {
                "1": 1,
                "2": 2,
                "3": 3,
                "4": 4,
                "5": 5,
                "6": 6,
                "7": 7,
                "8": 8,
                "9": 9
            },
            byWorldKey: {
                // 例: "日商|3級|1": 1
            }
        },

        worldExpDecay: {
            enabled: true,
            multiplierWhenGapLE0: 1.0,
            multiplierWhenGapEQ1: 0.5,
            multiplierWhenGapGE2: 0.1
        },

        // 解答時間ボーナス（将来用のプレースホルダ）
        // timeSec <= fastThreshold のときボーナス倍率をかける、など
        timeBonus: {
            enabled: false,
            fastThresholdSec: 5,
            fastBonusMultiplier: 1.2
        },

        // プレイヤーレベルアップに必要な累計EXPの計算式を
        // 「n倍」の形で指定（例：100, 150, 200, ...）
        levelUp: {
            baseRequiredExp: 100,   // Lv1→2 に必要なEXP
            growthRate: 1.2         // レベルごとに必要EXPを増やす倍率
            // 必要なら：requiredExp(level) = base * growthRate^(level-1)
        }
    },

    // ------------------------------------------
    // 4. 復習（review）モード用のパラメータ（将来用）
    // ------------------------------------------
    review: {
        // 1回の復習セッションで出題する上限問題数
        maxQuestionsPerSession: 30,

        // 「苦手科目」とみなすための最低誤答数
        minMistakeCountForWeakTag: 2,

        // Firestoreの履歴から「最近◯日分を重視するか」
        // 0 の場合は期間制限なし
        focusDays: 30
    }
};
