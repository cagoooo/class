/**
 * zodiac-slot.js
 * 🧧 十二生肖・新年拉霸機 —— 開學破冰遊戲
 * @version 3.2.0
 *
 * 設計理念：
 *   開學第一堂課，用「拉霸試手氣」的儀式感快速帶動班級氣氛。
 *   每位同學輪流上台拉一把，三個生肖轉輪滾動後，得到：
 *     1) 一句過年祝福詞語（含白話小解釋，溫暖又應景）
 *     2) 一個有趣的獎項 / 禮物（混入大量「互動式破冰任務」）
 *   人人有獎，三連得頭獎、兩同得二獎、全不同也有參加獎。
 *
 * 純前端、零相依：自行注入 CSS、用 Web Audio 產生音效、重用主程式的
 *   triggerConfetti()（若存在）並自帶金幣雨。對外只暴露三個全域函式：
 *     window.zodiacSpin()        拉霸
 *     window.zodiacPickStudent() 抽一位同學上台
 *     window.zodiacInit()        進入區塊時初始化（由 showSection 呼叫）
 */
(function () {
    'use strict';

    // ───────────────────────── 資料 ─────────────────────────

    // 十二生肖
    const ZODIACS = [
        { emoji: '🐭', name: '鼠' },
        { emoji: '🐮', name: '牛' },
        { emoji: '🐯', name: '虎' },
        { emoji: '🐰', name: '兔' },
        { emoji: '🐲', name: '龍' },
        { emoji: '🐍', name: '蛇' },
        { emoji: '🐴', name: '馬' },
        { emoji: '🐑', name: '羊' },
        { emoji: '🐵', name: '猴' },
        { emoji: '🐔', name: '雞' },
        { emoji: '🐶', name: '狗' },
        { emoji: '🐷', name: '豬' }
    ];

    // 過年祝福詞語（四字吉祥話 + 一句白話小解釋，給國小學生看也懂）
    const BLESSINGS = [
        { word: '恭喜發財', emoji: '🧧', note: '新的一年福氣旺旺，紅包滿滿！' },
        { word: '新年快樂', emoji: '✨', note: '開開心心過新年，天天都有好心情！' },
        { word: '學業進步', emoji: '📚', note: '功課越來越棒，學什麼都上手！' },
        { word: '心想事成', emoji: '🌟', note: '心裡許的願望，今年通通實現！' },
        { word: '金榜題名', emoji: '🎯', note: '考試順順利利，成績亮眼！' },
        { word: '步步高升', emoji: '🚀', note: '一步一步往上爬，越來越厲害！' },
        { word: '福星高照', emoji: '☀️', note: '有福星罩著你，做什麼都順！' },
        { word: '好運連連', emoji: '🍀', note: '好運一個接一個，停不下來～' },
        { word: '萬事如意', emoji: '🎊', note: '每件事都照你的意思發展！' },
        { word: '笑口常開', emoji: '😄', note: '每天都笑嘻嘻，快樂滿出來！' },
        { word: '龍馬精神', emoji: '🐎', note: '活力十足、精神百倍一整年！' },
        { word: '虎虎生風', emoji: '🔥', note: '做事超有勁，威風又帥氣！' },
        { word: '聰明伶俐', emoji: '🧠', note: '頭腦動得快，反應一級棒！' },
        { word: '平安健康', emoji: '💪', note: '身體頭好壯壯，平平安安每一天！' },
        { word: '五福臨門', emoji: '🎁', note: '五種福氣一起來敲你家的門！' },
        { word: '招財進寶', emoji: '💰', note: '財神爺來報到，存錢撲滿滿出來！' },
        { word: '鴻運當頭', emoji: '🌈', note: '超級好運正當頭，運氣擋不住！' },
        { word: '出類拔萃', emoji: '🏆', note: '比別人更出色，閃閃發光！' },
        { word: '才華洋溢', emoji: '🎨', note: '才藝滿滿，走到哪裡都發光！' },
        { word: '勤學向上', emoji: '📖', note: '認真學習向上衝，進步看得見！' },
        { word: '日新又新', emoji: '🌱', note: '每天都進步一點點，越來越好！' },
        { word: '喜氣洋洋', emoji: '🏮', note: '到處都是喜氣，開心又熱鬧！' },
        { word: '大吉大利', emoji: '🍊', note: '超級吉利，做什麼都大成功！' },
        { word: '友愛同學', emoji: '🤝', note: '和同學相親相愛，朋友一大堆！' }
    ];

    // 獎項與禮物 —— 分三級。大量「互動任務」讓開學破冰更熱鬧。
    const PRIZES = {
        jackpot: [   // 頭獎：三個生肖一樣（最稀有最興奮）
            { emoji: '🎁', text: '免寫一次回家功課券！' },
            { emoji: '👑', text: '當一天班級小老師' },
            { emoji: '🍿', text: '全班一起看 10 分鐘影片' },
            { emoji: '🎮', text: '下課延長 5 分鐘（全班同享）' },
            { emoji: '⭐', text: '榮譽加 10 分！' },
            { emoji: '🎤', text: '點一首歌全班一起聽' },
            { emoji: '🏆', text: '老師神秘小禮物一份' },
            { emoji: '🪑', text: '自由選座位一整週' }
        ],
        pair: [      // 二獎：兩個生肖一樣
            { emoji: '⭐', text: '榮譽加 5 分！' },
            { emoji: '🙌', text: '全班為你鼓掌 10 秒' },
            { emoji: '🤝', text: '跟老師擊掌＋拍一張帥照／美照' },
            { emoji: '🍬', text: '糖果一顆' },
            { emoji: '✏️', text: '文具小禮物一份' },
            { emoji: '🎫', text: '免值日生一次券' },
            { emoji: '🌟', text: '自由選座位一天' },
            { emoji: '📢', text: '當一節課的小幫手' }
        ],
        consolation: [   // 參加獎：三個都不同（人人有獎，全是破冰互動任務）
            { emoji: '🌟', text: '榮譽加 1 分，新年好彩頭！' },
            { emoji: '😄', text: '大聲說出一個「新年新希望」' },
            { emoji: '🕺', text: '帶全班一起做一個搞笑動作' },
            { emoji: '👏', text: '跟左右同學擊掌說「新年快樂」' },
            { emoji: '🗣️', text: '自我介紹一句話＋分享一個興趣' },
            { emoji: '🤗', text: '給隔壁同學一句真心讚美' },
            { emoji: '🎵', text: '哼一句你最愛的歌給大家聽' },
            { emoji: '🔄', text: '好運在路上，下次再接再厲！' }
        ]
    };

    // 生肖專屬吉祥話（三連時當作彩蛋祝福，更有儀式感）
    const ZODIAC_BLESSING = {
        '鼠': '鼠來寶 · 數錢數到手抽筋！',
        '牛': '牛轉乾坤 · 好運牛年年！',
        '虎': '生龍活虎 · 虎力全開！',
        '兔': '揚眉兔氣 · 前途似錦！',
        '龍': '龍騰虎躍 · 一飛沖天！',
        '蛇': '金蛇獻瑞 · 靈活有智慧！',
        '馬': '馬到成功 · 一路領先！',
        '羊': '三羊開泰 · 吉祥如意！',
        '猴': '靈猴獻瑞 · 機靈又聰明！',
        '雞': '金雞報喜 · 好事連連！',
        '狗': '旺旺好運 · 忠誠又勇敢！',
        '豬': '豬事大吉 · 福氣滿滿！'
    };

    // 中獎吶喊（頭獎連線成功時的大字橫幅，活潑搶眼）
    const JACKPOT_SHOUTS = ['🎉 中獎啦！', '✨ 好運到！', '💰 財運滾滾來！', '🧧 大吉大利！', '🌈 旺到不行！', '🍀 福氣滿滿！', '🎊 事事順心！', '🔥 財運爆棚！'];

    // 開運籤：20 支籤詩（籤運 + 古文籤詩 + 老師說白話），參考日本淺草觀音寺一百籤改寫成國小白話版
    const FORTUNES = [
        { type: '大吉', poem: '七寶浮圖塔　高峰頂上安<br>眾人皆仰望　莫作等閒看', desc: '就像看到美麗閃亮的寶石塔一樣，會有很棒的事情發生喔！只要你認真做好每一件事，不隨便敷衍，大家都會稱讚你、相信你，為你帶來更多好運氣！' },
        { type: '小吉', poem: '月被浮雲翳　立事自昏迷<br>幸乞陰公祐　何慮不開眉', desc: '你心裡可能有一個很想實現的願望，但如果只有想卻不去做，是沒辦法成功的喔。只要你下定決心去努力，試著多幫助別人，開心的事情就會發生，不用太擔心未來！' },
        { type: '吉', poem: '累有興雲志　君恩祿未封<br>若逢侯手印　好事始總總', desc: '看得出來你很努力想要變得很厲害！雖然現在可能還沒被老師或大人誇獎，但只要你好好表現、把想法勇敢說出來，好事就會一個接一個發生喔！' },
        { type: '大吉', poem: '勿頭中見尾　文華須得理<br>禾刀自偶然　當遇非常喜', desc: '不要害怕失敗！抬起胸膛、勇敢朝著目標前進吧。不管是讀書還是運動都要用心。就像農夫拿鐮刀收割稻子一樣，你的努力一定會有滿滿收穫，幸福自然會來！' },
        { type: '大吉', poem: '有名須得遇　三望一朝遷<br>貴人來指處　華果應時鮮', desc: '你的夢想會成真，大家都會知道你很棒喔！就像一次可以實現三個願望一樣幸運。老師或長輩也會帶給你驚喜。只要每天認真，好運會像花草按著季節開花結果一樣一直來！' },
        { type: '大吉', poem: '舊用多成破　新更始見財<br>改求雲外望　枯木遭春開', desc: '過去不開心的事情都會不見，好事即將發生囉！勇敢地許下一個大大的新願望吧。就像春天一到，原本枯掉的樹枝也會開出美麗的花朵，你一定會變得越來越棒！' },
        { type: '大吉', poem: '有祿興家業　文華達帝都<br>雲中乘好箭　兼得貴人扶', desc: '你會過得很開心，家裡也充滿歡笑！你的才華會被大家看見並得到稱讚。就像向天空射箭也能射中目標一樣，不管做什麼都會成功，還會得到老師和長輩的幫忙喔！' },
        { type: '大吉', poem: '手把太陽輝　東君發舊枝<br>稼苗方欲秀　猶更上雲梯', desc: '鼓起勇氣認真做事吧，生活會過得很充實喔！就像春天來了，老樹枝會長新芽、小草充滿活力地長大一樣。只要一直持續努力，就能爬上高高的雲梯，變得超級厲害！' },
        { type: '吉', poem: '離暗出明時　麻衣變綠衣<br>舊憂終是退　遇祿應交輝', desc: '就像天空的烏雲慢慢散開，終於看到明亮的月亮啦！換上輕鬆的好心情，每天做一件好事，難過的事情就會消失。好運會自然而然變多，讓你的人生閃閃發光！' },
        { type: '吉', poem: '漸漸濃雲散　看看月再明<br>逢春華菓秀　雨過竹重青', desc: '問題都解決啦，心情也變得輕鬆愉快！就像雨後洗乾淨的竹子，或是春天裡生氣蓬勃、開滿鮮花的草木一樣，你的生活會變得多采多姿，充滿滿滿的幸福喔！' },
        { type: '吉', poem: '紅雲隨步起　一箭中青霄<br>鹿行千里遠　爭知去路遙', desc: '已經看到好運的影子囉！你可以像朝著青天射箭一樣，勇敢去做想做的事，願望都會實現的！但是千萬不要驕傲，要看清楚目標一步步踏實地走，才不會因為太自信而跌倒！' },
        { type: '大吉', poem: '望祿應重山　花紅喜悅顏<br>舉頭看皎月　漸出黑雲間', desc: '雖然之前覺得有些辛苦，但只要克服困難，馬上就能得到大大的幸福！就像看到美麗的紅花綻放充滿喜悅，也像月亮從黑雲中跑出來一樣，煩惱都過去了。不過還是要小心，不能粗心大意喔！' },
        { type: '吉', poem: '似玉藏深石　休將故眼看<br>一朝良匠別　方見寶光寒', desc: '你就像藏在石頭裡的寶石，如果不努力振作，大家就看不到你的才華。但只要你一直認真，總有一天會被好老師或朋友發現，到時候你就會像被磨亮的寶石一樣閃閃發光喔！' },
        { type: '吉', poem: '射鹿須乘箭　故僧引路歸<br>遇道同仙籍　光華映晚暉', desc: '只要好好瞄準目標，努力就會直接通往成功！聽從老師或聰明人的好建議，會讓你得到很大的進步。大家對你的評價也會越來越高，就像夕陽下的花朵一樣閃耀動人！' },
        { type: '小吉', poem: '中正方成道　姦邪恐惹愆<br>壺中盛妙藥　非久去煩煎', desc: '只要你做正確、公平的事情，就能趕走壞運氣！如果有了壞念頭就會帶來麻煩。把你真誠善良的心當作隨身攜帶的「神奇靈藥」，煩惱就會趕快離開，災難也會消失啦！' },
        { type: '吉', poem: '月桂將相滿　追鹿映山溪<br>貴人乘遠箭　好事始相宜', desc: '好運快要像滿月一樣圓滿囉！雖然現在還沒得到最棒的獎勵，但未來一定會有的。多向優秀的人學習他們的優點，願望就會開始實現，變得非常幸福！但是記得不能驕傲喔！' },
        { type: '大吉', poem: '修進甚功辛　勞生未得時<br>騰身遊碧漢　方得遇高枝', desc: '你一直都很勤勞努力，雖然現在可能只覺得辛苦還沒看到成果。但請你懷抱著一飛沖天的大大決心，勇敢挑戰吧！你一定能夠得到想要的成功，讓自己開心又安心！' },
        { type: '大吉', poem: '但存公道正　何愁理去忠<br>松柏蒼蒼翠　前山祿馬重', desc: '要多為大家做好事，不要只想到自己喔！就算覺得委屈或不順利，也不要難過。保持真誠善良的心，就像松樹一年四季都翠綠一樣。堅持下去，最後一定會有滿滿的福氣等著你！' },
        { type: '大吉', poem: '一片無瑕玉　從今好琢磨<br>得遇高人識　方逢喜氣多', desc: '石頭經過用心的打磨，才會變成美麗的玉石。你也是一樣，只要誠心誠意地加倍努力，就會變成更棒的人！到時候一定會有很厲害的人發現你的優點，讓你充滿驚喜與快樂！' },
        { type: '大吉', poem: '改變前途去　月桂又逢圓<br>雲中乘祿至　凡事可宜先', desc: '把以前的壞習慣改掉，用全新的態度向前邁進，事情就會變得更好喔！過去的缺點會消失，就像缺角的月亮又變圓了一樣。幸運會從天而降，只要你積極主動不落後，就能得到好結果！' }
    ];

    // ───────────────────────── 狀態 ─────────────────────────
    let spinning = false;
    let fortuneDrawing = false;          // 開運籤抽籤中
    let currentFortuneText = '';         // 目前籤的分享文字
    let playCount = 0;
    let currentPlayer = null;
    let pickedIds = [];          // 本輪已抽過的學生 id，確保人人有機會輪到

    // ───────────────────────── CSS 注入 ─────────────────────────
    function injectCSS() {
        if (document.getElementById('zodiac-slot-style')) return;
        const css = `
        #zodiac-section .zslot-subtitle{color:#9a3412;font-weight:600}
        /* 抽同學上台 */
        .zslot-stage{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;
            background:linear-gradient(135deg,#fff7ed,#fef2f2);border:2px dashed #fca5a5;
            border-radius:1rem;padding:.9rem 1.1rem;margin-bottom:1.25rem}
        .zslot-pick-btn{background:linear-gradient(135deg,#f43f5e,#e11d48);color:#fff;
            font-weight:700;padding:.6rem 1.1rem;border-radius:9999px;box-shadow:0 4px 0 #9f1239;
            transition:transform .1s ease,box-shadow .1s ease;white-space:nowrap}
        .zslot-pick-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #9f1239}
        .zslot-player{font-size:1.05rem;font-weight:700;color:#b91c1c}
        .zslot-player .nm{font-size:1.45rem;background:linear-gradient(90deg,#dc2626,#f59e0b);
            -webkit-background-clip:text;background-clip:text;color:transparent;padding:0 .15em}

        /* 機台外框 */
        .zslot-machine-wrap{display:flex;justify-content:center;perspective:900px}
        .zslot-machine{position:relative;width:min(440px,100%);
            background:linear-gradient(160deg,#dc2626 0%,#b91c1c 55%,#991b1b 100%);
            border-radius:26px;padding:18px 20px 24px;
            box-shadow:0 18px 40px rgba(127,29,29,.45),inset 0 2px 6px rgba(255,255,255,.25);
            border:4px solid #fbbf24}
        /* 跑馬燈頂飾 */
        .zslot-marquee{display:flex;align-items:center;justify-content:center;gap:.4rem;
            background:linear-gradient(90deg,#7f1d1d,#b91c1c,#7f1d1d);border-radius:14px;
            padding:8px 10px;margin-bottom:14px;border:2px solid #fcd34d;position:relative;overflow:hidden}
        .zslot-marquee .ttl{font-weight:800;letter-spacing:.15em;color:#fde68a;
            text-shadow:0 1px 2px rgba(0,0,0,.4);font-size:1.05rem}
        .zslot-bulbs{position:absolute;inset:0;pointer-events:none}
        .zslot-bulbs span{position:absolute;top:3px;width:7px;height:7px;border-radius:50%;
            background:#fde047;box-shadow:0 0 6px #fde047;animation:zbulb 1s infinite}
        @keyframes zbulb{0%,100%{opacity:.25}50%{opacity:1}}
        /* 轉輪視窗 */
        .zslot-screen{background:#1f2937;border-radius:16px;padding:14px;
            border:3px solid #fbbf24;box-shadow:inset 0 4px 14px rgba(0,0,0,.6)}
        .zslot-reels{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        .zslot-reel{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;
            font-size:clamp(2.6rem,12vw,3.6rem);line-height:1;
            background:radial-gradient(circle at 50% 30%,#fffbeb,#fde68a);
            border-radius:12px;box-shadow:inset 0 -6px 10px rgba(180,83,9,.35),inset 0 4px 8px rgba(255,255,255,.8);
            user-select:none;transition:transform .15s ease}
        .zslot-reel.spinning{animation:zshake .12s linear infinite;filter:blur(1px)}
        @keyframes zshake{0%{transform:translateY(-4px)}50%{transform:translateY(4px)}100%{transform:translateY(-4px)}}
        .zslot-reel.landed{animation:zland .45s cubic-bezier(.2,1.6,.4,1)}
        @keyframes zland{0%{transform:scale(.7)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
        .zslot-reel.win-glow{box-shadow:0 0 0 4px #f59e0b,0 0 22px 6px #fbbf24,inset 0 4px 8px rgba(255,255,255,.8)}

        /* 底座 + 拉霸鈕 */
        .zslot-base{margin-top:16px;text-align:center}
        .zslot-spin-btn{background:linear-gradient(180deg,#fbbf24,#f59e0b);color:#7f1d1d;
            font-weight:900;font-size:1.2rem;letter-spacing:.05em;padding:.7rem 2.2rem;border-radius:9999px;
            box-shadow:0 6px 0 #b45309,0 10px 18px rgba(0,0,0,.25);transition:transform .1s ease,box-shadow .1s ease}
        .zslot-spin-btn:active:not(:disabled){transform:translateY(4px);box-shadow:0 2px 0 #b45309}
        .zslot-spin-btn:disabled{opacity:.6;cursor:not-allowed}
        /* 側邊拉桿 */
        .zslot-lever{position:absolute;right:-26px;top:78px;width:18px;height:120px;cursor:pointer}
        .zslot-lever .rod{position:absolute;left:6px;top:18px;width:6px;height:100px;
            background:linear-gradient(90deg,#9ca3af,#e5e7eb,#9ca3af);border-radius:4px;transform-origin:bottom}
        .zslot-lever .knob{position:absolute;left:-4px;top:0;width:26px;height:26px;border-radius:50%;
            background:radial-gradient(circle at 35% 30%,#fca5a5,#dc2626);box-shadow:0 3px 6px rgba(0,0,0,.4);
            transition:transform .25s cubic-bezier(.3,1.4,.5,1)}
        .zslot-lever.pulled .knob{transform:translateY(70px)}
        .zslot-lever-hint{position:absolute;right:-34px;top:206px;font-size:.62rem;color:#fecaca;
            writing-mode:vertical-rl;letter-spacing:.1em}

        /* 結果卡（春聯風） */
        .zslot-result{margin-top:1.5rem;opacity:0;transform:translateY(12px);
            transition:opacity .4s ease,transform .4s ease}
        .zslot-result.show{opacity:1;transform:translateY(0)}
        .zslot-card{max-width:520px;margin:0 auto;border-radius:20px;padding:1.4rem 1.5rem;text-align:center;
            background:linear-gradient(160deg,#fff7ed,#fee2e2);border:3px solid #fbbf24;
            box-shadow:0 12px 30px rgba(127,29,29,.25)}
        .zslot-badge{display:inline-block;font-weight:800;padding:.25rem 1rem;border-radius:9999px;
            font-size:.95rem;color:#fff;margin-bottom:.6rem}
        .zslot-badge.jackpot{background:linear-gradient(90deg,#f59e0b,#dc2626);animation:zpulse 1s infinite}
        .zslot-badge.pair{background:linear-gradient(90deg,#f97316,#ea580c)}
        .zslot-badge.consolation{background:linear-gradient(90deg,#10b981,#059669)}
        @keyframes zpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
        .zslot-combo{font-size:2rem;letter-spacing:.2em;margin:.2rem 0 .6rem}
        .zslot-bless{font-size:1.9rem;font-weight:900;color:#b91c1c;letter-spacing:.12em;margin:.2rem 0}
        .zslot-bless-note{color:#92400e;font-size:.95rem;margin-bottom:.9rem}
        .zslot-prize{display:inline-flex;align-items:center;gap:.5rem;background:#fff;border:2px dashed #f87171;
            border-radius:14px;padding:.7rem 1.1rem;font-size:1.15rem;font-weight:700;color:#b91c1c;
            box-shadow:0 4px 10px rgba(0,0,0,.08)}
        .zslot-prize .pe{font-size:1.5rem}
        .zslot-result-for{color:#9a3412;font-weight:700;margin-bottom:.5rem}

        /* 統計列 */
        .zslot-stats{text-align:center;color:#9a3412;font-weight:600;margin-top:1.1rem}

        /* 金幣雨 */
        .zslot-coin{position:fixed;top:-40px;font-size:1.8rem;z-index:1001;pointer-events:none;
            animation:zcoin linear forwards}
        @keyframes zcoin{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(108vh) rotate(540deg)}}

        /* === v3.7.1 視覺升級：圓體字、連線、煙火閃光、星星愛心金幣 === */
        .zslot-bless,.zslot-combo{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif}
        .zslot-spin-btn,.zslot-pick-btn,.zslot-lever{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        /* 中獎吶喊橫幅 */
        .zslot-shout{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;
            font-size:clamp(1.6rem,6vw,2.6rem);letter-spacing:.06em;margin-bottom:.4rem;
            background:linear-gradient(90deg,#dc2626,#f59e0b,#dc2626);-webkit-background-clip:text;background-clip:text;color:transparent;
            animation:zshout .6s cubic-bezier(.2,1.7,.4,1)}
        .zslot-shout.pair{font-size:clamp(1.3rem,5vw,2rem);background:linear-gradient(90deg,#f97316,#ea580c);
            -webkit-background-clip:text;background-clip:text}
        @keyframes zshout{0%{transform:scale(.3) rotate(-8deg);opacity:0}60%{transform:scale(1.15) rotate(3deg)}100%{transform:scale(1) rotate(0);opacity:1}}
        /* 連線發光線（拉霸連線成功） */
        .zslot-reels{position:relative}
        .zslot-winline{position:absolute;top:50%;height:0;transform:translateY(-50%);pointer-events:none;z-index:5;
            border-top:5px solid #fde047;border-radius:6px;box-shadow:0 0 12px 4px #fbbf24,0 0 26px 8px rgba(245,158,11,.6);
            animation:zline .5s ease both}
        @keyframes zline{0%{opacity:0;transform:translateY(-50%) scaleX(.1)}100%{opacity:1;transform:translateY(-50%) scaleX(1)}}
        /* 機台中獎閃光 + 跑馬燈加速 */
        .zslot-machine.flash{animation:zflash .6s ease}
        @keyframes zflash{0%,100%{box-shadow:0 18px 40px rgba(127,29,29,.45),inset 0 2px 6px rgba(255,255,255,.25)}
            40%{box-shadow:0 0 0 6px #fde047,0 0 44px 14px #fbbf24,inset 0 0 30px rgba(255,255,255,.6)}}
        .zslot-bulbs.win span{animation-duration:.32s}
        /* 星星 / 愛心 / 金幣 上飄 */
        .zslot-spark{position:fixed;z-index:1002;pointer-events:none;font-size:1.6rem;animation:zspark 1.3s ease-out forwards}
        @keyframes zspark{0%{opacity:0;transform:translateY(0) scale(.4) rotate(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-130px) scale(1.3) rotate(25deg)}}

        /* === 開運籤（求籤） === */
        .zf-area{margin-top:1.6rem;background:linear-gradient(160deg,#fff7ed,#fee2e2);border:3px solid #fbbf24;border-radius:20px;padding:1.2rem 1rem 1.3rem}
        .zf-title{font-size:1.2rem;font-weight:900;color:#b91c1c;text-align:center}
        .zf-title .zf-sub{font-size:.85rem;font-weight:600;color:#9a3412}
        .zf-stage{display:flex;flex-direction:column;align-items:center;gap:1rem;margin:1rem 0 .4rem}
        /* 籤筒 */
        .zf-tube{position:relative;width:84px;height:118px;cursor:pointer;transition:transform .1s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .zf-tube:hover{transform:translateY(-2px)}
        .zf-sticks{position:absolute;top:-16px;left:0;right:0;display:flex;justify-content:center;align-items:flex-end;gap:4px;height:42px}
        .zf-sticks i{width:6px;height:34px;border-radius:3px;background:linear-gradient(180deg,#fde68a,#d97706);box-shadow:0 1px 2px rgba(0,0,0,.2)}
        .zf-sticks i:nth-child(2){height:42px}.zf-sticks i:nth-child(3){height:30px}.zf-sticks i:nth-child(4){height:40px}.zf-sticks i:nth-child(5){height:32px}
        .zf-cup{position:absolute;bottom:0;left:0;right:0;height:94px;border-radius:14px 14px 18px 18px;
            background:linear-gradient(160deg,#dc2626,#991b1b);border:3px solid #fbbf24;
            box-shadow:0 8px 18px rgba(127,29,29,.4),inset 0 3px 6px rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center}
        .zf-cup span{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;color:#fde68a;font-size:1.5rem;letter-spacing:.15em;writing-mode:vertical-rl}
        .zf-tube.zf-shaking{animation:zfShake .4s linear infinite}
        @keyframes zfShake{0%,100%{transform:translate(1px,1px) rotate(-3deg)}25%{transform:translate(-2px,0) rotate(3deg)}50%{transform:translate(2px,1px) rotate(-2deg)}75%{transform:translate(-1px,-1px) rotate(3deg)}}
        .zf-draw-btn{background:linear-gradient(180deg,#fbbf24,#f59e0b);color:#7f1d1d;font-weight:900;font-size:1.1rem;
            padding:.7rem 1.9rem;border:none;border-radius:9999px;box-shadow:0 5px 0 #b45309;cursor:pointer;transition:transform .1s,box-shadow .1s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        .zf-draw-btn:active:not(:disabled){transform:translateY(4px);box-shadow:0 1px 0 #b45309}
        .zf-draw-btn:disabled{opacity:.6;cursor:not-allowed}
        /* 結果卡 */
        .zf-result{opacity:0;transform:translateY(12px);transition:opacity .4s ease,transform .4s ease;margin-top:.4rem}
        .zf-result.show{opacity:1;transform:translateY(0)}
        .zf-card{max-width:560px;margin:0 auto;background:#fff;border:3px solid #ef4444;border-radius:18px;padding:1.3rem;text-align:center;box-shadow:0 12px 30px rgba(127,29,29,.2)}
        .zf-type-wrap{display:flex;justify-content:center;margin-bottom:1rem}
        .zf-type{font-family:'Mochiyochi Pop One','Noto Sans TC',sans-serif;font-weight:900;letter-spacing:.15em;line-height:1;
            font-size:clamp(40px,9vw,60px);padding:.12em .45em .22em;border-radius:14px;color:#fde68a;animation:zland .5s cubic-bezier(.2,1.6,.4,1)}
        .zf-type.daji{background:linear-gradient(135deg,#dc2626,#b91c1c);border:2px solid #7f1d1d}
        .zf-type.ji{background:linear-gradient(135deg,#f97316,#ea580c);border:2px solid #9a3412}
        .zf-type.xiaoji{background:linear-gradient(135deg,#16a34a,#15803d);border:2px solid #14532d}
        .zf-poem{display:inline-block;background:#fff7ed;border:1px solid #fecaca;border-radius:12px;padding:.8rem 1.2rem;
            color:#b91c1c;font-weight:700;font-size:clamp(18px,3.6vw,24px);line-height:1.7;margin-bottom:1rem}
        .zf-teacher{text-align:left;background:#fef9c3;border:2px solid #fde68a;border-radius:12px;padding:1rem}
        .zf-tag{display:inline-block;background:#f59e0b;color:#fff;font-size:.78rem;font-weight:800;padding:.2rem .7rem;border-radius:9999px;margin-bottom:.5rem}
        .zf-teacher p{color:#374151;font-size:clamp(15px,2.6vw,17px);line-height:1.7;font-weight:600}
        .zf-actions{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1rem}
        .zf-actions button{border:none;border-radius:9999px;padding:.6rem 1.2rem;font-weight:800;cursor:pointer;font-size:.95rem;touch-action:manipulation}
        .zf-act-redraw{background:#fee2e2;color:#b91c1c}
        .zf-act-copy{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;box-shadow:0 3px 0 #15803d;transition:background .15s}
        .zf-act-copy.zf-copied{background:linear-gradient(135deg,#15803d,#166534);box-shadow:0 3px 0 #14532d;animation:zfCopied .45s cubic-bezier(.2,1.6,.4,1)}
        @keyframes zfCopied{0%{transform:scale(1)}45%{transform:scale(1.14)}100%{transform:scale(1)}}
        .zf-credit{text-align:center;font-size:.72rem;color:#9ca3af;margin-top:.9rem}

        @media (max-width:480px){.zslot-lever{display:none}}
        `;
        const style = document.createElement('style');
        style.id = 'zodiac-slot-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ───────────────────────── 音效（Web Audio） ─────────────────────────
    function getCtx() {
        if (window.audioContext) return window.audioContext;
        try {
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { return null; }
        return window.audioContext;
    }
    function tone(freq, dur, type, vol, when) {
        const ctx = getCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + (when || 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(vol || 0.15, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }
    function sndTick() { tone(660, 0.05, 'square', 0.05); }
    function sndStop() { tone(180, 0.12, 'sine', 0.22); }
    function sndWin(level) {
        const seq = level === 'jackpot'
            ? [523, 659, 784, 1047, 1319]
            : level === 'pair'
                ? [523, 659, 784]
                : [659, 784];
        seq.forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, i * 0.12));
        if (level === 'jackpot') tone(1568, 0.5, 'triangle', 0.18, seq.length * 0.12);
    }

    // ───────────────────────── 金幣雨 ─────────────────────────
    function coinRain(count) {
        const coins = ['🪙', '💰', '🧧', '🟡'];
        for (let i = 0; i < count; i++) {
            const c = document.createElement('div');
            c.className = 'zslot-coin';
            c.textContent = coins[i % coins.length];
            c.style.left = Math.random() * 100 + 'vw';
            c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
            c.style.animationDelay = (Math.random() * 0.5) + 's';
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 3500);
        }
    }
    // 星星 / 愛心 / 金幣 從機台往上飄（療癒亮晶晶）
    function sparkleFloat(count) {
        const marks = ['✨', '💖', '🌟', '⭐', '🪙', '💛'];
        const wrap = document.querySelector('.zslot-machine-wrap');
        const r = wrap ? wrap.getBoundingClientRect() : { left: window.innerWidth / 2 - 100, top: window.innerHeight / 2, width: 200, height: 200 };
        for (let i = 0; i < count; i++) {
            const s = document.createElement('div');
            s.className = 'zslot-spark';
            s.textContent = marks[i % marks.length];
            s.style.left = (r.left + Math.random() * r.width) + 'px';
            s.style.top = (r.top + r.height * 0.25 + Math.random() * 50) + 'px';
            s.style.animationDelay = (Math.random() * 0.4) + 's';
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 1800);
        }
    }
    // 機台閃光 + 跑馬燈加速
    function flashMachine() {
        const m = document.querySelector('.zslot-machine');
        if (m) { m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 700); }
        const bulbs = document.querySelector('.zslot-bulbs');
        if (bulbs) { bulbs.classList.add('win'); setTimeout(() => bulbs.classList.remove('win'), 1300); }
    }
    // 連線發光線：跨越中獎的轉輪（3 欄，第 i 顆中心約 (i+0.5)/3）
    function showWinLine(indices) {
        const reelsEl = document.querySelector('.zslot-reels');
        if (!reelsEl || !indices || !indices.length) return;
        reelsEl.querySelectorAll('.zslot-winline').forEach(e => e.remove());
        const a = Math.min.apply(null, indices), b = Math.max.apply(null, indices);
        const center = i => (i + 0.5) / 3 * 100;
        const line = document.createElement('div');
        line.className = 'zslot-winline';
        line.style.left = center(a) + '%';
        line.style.width = (center(b) - center(a)) + '%';
        if (a === b) { line.style.width = '14%'; line.style.left = (center(a) - 7) + '%'; }
        reelsEl.appendChild(line);
    }

    function celebrate(level) {
        if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
        if (level === 'jackpot') { coinRain(28); flashMachine(); sparkleFloat(16); }
        else if (level === 'pair') { coinRain(12); flashMachine(); sparkleFloat(8); }
        else { sparkleFloat(4); }   // 參加獎也來幾顆星星，療癒不冷場
    }

    // ───────────────────────── 工具 ─────────────────────────
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    function shuffle(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    function pickN(arr, n) { return shuffle(arr).slice(0, n); }

    // 先決定中獎等級（加權，讓頭獎在班上夠常出現、人人有獎）
    function decideLevel() {
        const r = Math.random();
        if (r < 0.12) return 'jackpot';      // 三連 ~12%
        if (r < 0.50) return 'pair';         // 兩同 ~38%
        return 'consolation';                // 全不同 ~50%
    }
    // 依等級產生三個轉輪的目標生肖
    function buildTargets(level) {
        if (level === 'jackpot') {
            const z = rand(ZODIACS);
            return [z, z, z];
        }
        if (level === 'pair') {
            const [a, b] = pickN(ZODIACS, 2);
            return shuffle([a, a, b]);
        }
        return pickN(ZODIACS, 3);            // 三個都不同
    }

    // ───────────────────────── 拉霸主流程 ─────────────────────────
    window.zodiacSpin = function () {
        if (spinning) return;
        spinning = true;
        getCtx();                            // 在使用者點擊當下解鎖音訊

        const btn = document.getElementById('zslot-spin-btn');
        const lever = document.getElementById('zslot-lever');
        const result = document.getElementById('zslot-result');
        if (btn) { btn.disabled = true; btn.textContent = '🎰 轉動中…'; }
        if (lever) { lever.classList.add('pulled'); setTimeout(() => lever.classList.remove('pulled'), 600); }
        if (result) { result.classList.remove('show'); result.classList.add('hidden'); }
        // 清掉上一輪的連線發光線與機台閃光
        document.querySelectorAll('.zslot-winline').forEach(e => e.remove());
        const machineEl = document.querySelector('.zslot-machine');
        if (machineEl) machineEl.classList.remove('flash');

        const level = decideLevel();
        const targets = buildTargets(level);
        const reels = [0, 1, 2].map(i => document.getElementById('zslot-reel-' + i));

        // 啟動三個轉輪的快速跳動
        const intervals = reels.map((reel) => {
            if (!reel) return null;
            reel.classList.remove('landed', 'win-glow');
            reel.classList.add('spinning');
            let tickToggle = 0;
            return setInterval(() => {
                reel.textContent = rand(ZODIACS).emoji;
                if (tickToggle++ % 2 === 0) sndTick();
            }, 70);
        });

        // 依序停下：0 → 1 → 2
        const stopTimes = [900, 1500, 2200];
        reels.forEach((reel, i) => {
            setTimeout(() => {
                if (intervals[i]) clearInterval(intervals[i]);
                if (!reel) return;
                reel.classList.remove('spinning');
                reel.textContent = targets[i].emoji;
                reel.classList.add('landed');
                sndStop();
                if (i === reels.length - 1) {
                    setTimeout(() => revealResult(level, targets, reels), 350);
                }
            }, stopTimes[i]);
        });
    };

    function revealResult(level, targets, reels) {
        // 祝福詞：頭獎用該生肖專屬吉祥話當主標，其餘隨機
        let blessWord, blessNote, blessEmoji;
        let matchedIdx = [];        // 連線（相同生肖）的轉輪索引
        if (level === 'jackpot') {
            const z = targets[0];
            blessWord = ZODIACS && ZODIAC_BLESSING[z.name] ? ZODIAC_BLESSING[z.name].split(' · ')[0] : rand(BLESSINGS).word;
            blessNote = ZODIAC_BLESSING[z.name] || '';
            blessEmoji = z.emoji;
            matchedIdx = [0, 1, 2];
            reels.forEach(r => r && r.classList.add('win-glow'));
        } else if (level === 'pair') {
            const b = rand(BLESSINGS);
            blessWord = b.word; blessNote = b.note; blessEmoji = b.emoji;
            // 標出相同的兩個輪子
            const counts = {};
            targets.forEach((t, i) => { (counts[t.name] = counts[t.name] || []).push(i); });
            Object.values(counts).forEach(idxs => {
                if (idxs.length === 2) { matchedIdx = idxs.slice(); idxs.forEach(i => reels[i] && reels[i].classList.add('win-glow')); }
            });
        } else {
            const b = rand(BLESSINGS);
            blessWord = b.word; blessNote = b.note; blessEmoji = b.emoji;
        }
        // 中獎吶喊橫幅
        const shout = level === 'jackpot' ? rand(JACKPOT_SHOUTS) : (level === 'pair' ? '✨ 喜相逢！' : '');

        const prize = rand(PRIZES[level]);
        const meta = {
            jackpot: { cls: 'jackpot', label: '🎉 頭獎・三連發 🎉' },
            pair: { cls: 'pair', label: '✨ 二獎・喜相逢 ✨' },
            consolation: { cls: 'consolation', label: '🎊 參加獎・好彩頭 🎊' }
        }[level];

        const combo = targets.map(t => t.emoji).join(' ');
        const forWho = currentPlayer
            ? `<div class="zslot-result-for">🙋 ${escapeHtml(currentPlayer)} 同學的手氣</div>` : '';

        const result = document.getElementById('zslot-result');
        if (result) {
            result.innerHTML = `
                <div class="zslot-card">
                    ${forWho}
                    ${shout ? `<div class="zslot-shout ${level === 'pair' ? 'pair' : ''}">${shout}</div>` : ''}
                    <div class="zslot-badge ${meta.cls}">${meta.label}</div>
                    <div class="zslot-combo">${combo}</div>
                    <div class="zslot-bless">${blessEmoji} ${blessWord}</div>
                    <div class="zslot-bless-note">${escapeHtml(blessNote)}</div>
                    <div class="zslot-prize"><span class="pe">${prize.emoji}</span>${escapeHtml(prize.text)}</div>
                </div>`;
            result.classList.remove('hidden');
            // 觸發進場動畫
            requestAnimationFrame(() => result.classList.add('show'));
            setTimeout(() => result.classList.add('show'), 30); // 隱藏分頁 rAF 不跑時的保險
            // ✨ 自動捲動到結果卡，讓全班立刻看到中獎結果（只在結果未完整露出時才捲，避免已可見時亂跳）
            setTimeout(() => {
                try {
                    const rect = result.getBoundingClientRect();
                    const vh = window.innerHeight || document.documentElement.clientHeight;
                    const fullyVisible = rect.top >= 0 && rect.bottom <= vh;
                    if (!fullyVisible) result.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {
                    try { result.scrollIntoView(); } catch (e2) { /* ignore */ }
                }
            }, 150);
        }

        // 拉霸連線成功：畫出發光連線
        showWinLine(matchedIdx);

        sndWin(level);
        celebrate(level);

        playCount++;
        updateCount();

        const btn = document.getElementById('zslot-spin-btn');
        if (btn) { btn.disabled = false; btn.textContent = '🧧 再拉一把！'; }
        spinning = false;
    }

    // ───────────────────────── 抽一位同學上台 ─────────────────────────
    window.zodiacPickStudent = function () {
        const list = Array.isArray(window.students) ? window.students : [];
        const playerEl = document.getElementById('zslot-current-player');
        if (list.length === 0) {
            if (typeof window.NotificationSystem !== 'undefined' && NotificationSystem.warning) {
                NotificationSystem.warning('還沒有學生名單喔！可先到「學生管理」新增，或老師直接拉霸。');
            } else {
                alert('還沒有學生名單，請先到「學生管理」新增。');
            }
            return;
        }
        // 過濾掉本輪已抽過的；全抽完就重置（人人輪一次）
        let pool = list.filter(s => !pickedIds.includes(s.id));
        if (pool.length === 0) {
            pickedIds = [];
            pool = list.slice();
            if (typeof window.NotificationSystem !== 'undefined' && NotificationSystem.info) {
                NotificationSystem.info('全班都輪過一次囉！重新開始新一輪 🎉');
            }
        }
        const chosen = rand(pool);
        pickedIds.push(chosen.id);
        currentPlayer = chosen.name;

        // 小小抽人動畫：名字快速跳動後定格
        if (playerEl) {
            let ticks = 0;
            const flicker = setInterval(() => {
                const tmp = rand(list);
                playerEl.innerHTML = `🎲 <span class="nm">${escapeHtml(tmp.name)}</span>`;
                sndTick();
                if (++ticks >= 12) {
                    clearInterval(flicker);
                    playerEl.innerHTML = `✨ 請 <span class="nm">${escapeHtml(chosen.name)}</span> 同學上台拉霸！`;
                    sndStop();
                }
            }, 80);
        }
    };

    // ───────────────────────── 小工具 ─────────────────────────
    function updateCount() {
        const el = document.getElementById('zslot-count');
        if (el) el.textContent = playCount;
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ───────────────────────── 開運籤（求籤） ─────────────────────────
    function renderFortune(f) {
        const result = document.getElementById('zf-result');
        if (!result) return;
        const cls = f.type === '大吉' ? 'daji' : (f.type === '吉' ? 'ji' : 'xiaoji');
        result.innerHTML = `
            <div class="zf-card">
                <div class="zf-type-wrap"><div class="zf-type ${cls}">${escapeHtml(f.type)}</div></div>
                <div class="zf-poem">${f.poem}</div>
                <div class="zf-teacher"><span class="zf-tag">老師說</span><p>${escapeHtml(f.desc)}</p></div>
                <div class="zf-actions">
                    <button class="zf-act-redraw" onclick="zodiacDrawFortune()">🎋 再求一支</button>
                    <button class="zf-act-copy" onclick="zodiacCopyFortune(this)">📋 複製分享</button>
                </div>
            </div>`;
        result.classList.remove('hidden');
        requestAnimationFrame(() => result.classList.add('show'));
        setTimeout(() => result.classList.add('show'), 30);   // 隱藏分頁 rAF 不跑時的保險
        currentFortuneText = `【開運籤】我抽到了「${f.type}」！\n${f.poem.replace(/<br\s*\/?>/g, ' ')}\n老師說：${f.desc}`;
        // 自動捲到結果卡（沿用 UX：未完整露出才捲）
        setTimeout(() => {
            try {
                const r = result.getBoundingClientRect();
                const vh = window.innerHeight || document.documentElement.clientHeight;
                if (!(r.top >= 0 && r.bottom <= vh)) result.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) { try { result.scrollIntoView(); } catch (e2) { } }
        }, 150);
    }

    window.zodiacDrawFortune = function () {
        if (fortuneDrawing) return;
        fortuneDrawing = true;
        getCtx();                                   // 點擊當下解鎖音訊
        const tube = document.getElementById('zf-tube');
        const btn = document.getElementById('zf-draw-btn');
        const result = document.getElementById('zf-result');
        if (btn) { btn.disabled = true; btn.textContent = '🎋 求籤中…'; }
        if (result) { result.classList.remove('show'); result.classList.add('hidden'); }
        if (tube) tube.classList.add('zf-shaking');
        let t = 0;
        const shakeSnd = setInterval(() => { sndTick(); if (++t >= 7) clearInterval(shakeSnd); }, 130);
        setTimeout(() => {
            clearInterval(shakeSnd);
            if (tube) tube.classList.remove('zf-shaking');
            const f = rand(FORTUNES);
            renderFortune(f);
            sndWin('pair');
            if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
            if (btn) { btn.disabled = false; btn.textContent = '🎋 再求一支'; }
            fortuneDrawing = false;
        }, 1000);
    };

    window.zodiacCopyFortune = function (btn) {
        if (!currentFortuneText) return;
        // 多重回饋：按鈕變「✅ 已複製！」+ 綠色彈跳 + 提示音 + 通知，1.6 秒後復原
        const flash = () => {
            try { tone(880, 0.08, 'sine', 0.16); tone(1320, 0.12, 'sine', 0.13, 0.08); } catch (e) { }
            if (typeof window.NotificationSystem !== 'undefined' && NotificationSystem.success) NotificationSystem.success('已複製開運籤，可貼給家人朋友分享！');
            if (btn && !btn.__copyBusy) {
                btn.__copyBusy = true;
                const orig = btn.innerHTML;
                btn.innerHTML = '✅ 已複製！';
                btn.classList.add('zf-copied');
                setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('zf-copied'); btn.__copyBusy = false; }, 1600);
            }
        };
        const fallback = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = currentFortuneText; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); flash();
            } catch (e) { /* ignore */ }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(currentFortuneText).then(flash).catch(fallback);
        } else { fallback(); }
    };

    // 進入區塊時呼叫（由 showSection 觸發）
    window.zodiacInit = function () {
        injectCSS();
        updateCount();
    };

    // 確保樣式就緒（即使尚未進入區塊）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCSS);
    } else {
        injectCSS();
    }
})();
