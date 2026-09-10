// v70 B127 2026-08-30：小猪佩奇句子测试效应（1/2/4/7/15/30天）+ S1E02 全量导入 + 逐句知识点。
(function () {
  'use strict';

  const STORAGE_KEY = 'word-memory-trainer:peppa-zone:v1';
  const PENDING_KEY = 'word-memory-trainer:peppa-zone:pending:v1';
  const VERSION = 4;
  const CONTENT_SEED_REVISION = 3;
  const PRONUNCIATION_PASS_SCORE = 90;
  const REVIEW_DAYS = [1, 2, 4, 7, 15, 30];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const S1E1_COMPLETED_AT = '2026-08-29T17:02:00+08:00';
  const B127_CONTENT = window.PEPPA_B127_CONTENT || { episode2:null, knowledge:{} };
  const root = document.querySelector('#peppaZoneApp');
  if (!root) return;

  const nowIso = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const clean = (value) => String(value ?? '').trim();


  const LEARNED_SENTENCES_S1E1 = [
    {
        "english": "Muddy Puddles.",
        "chinese": "泥水坑。",
        "note": "本集标题（按你提供的第一集清单保留）。"
    },
    {
        "english": "I'm Peppa Pig.",
        "chinese": "我是小猪佩奇。",
        "note": "I'm = I am；介绍自己的常用句型。"
    },
    {
        "english": "This is my little brother, George.",
        "chinese": "这是我的弟弟乔治。",
        "note": "This is my + 人；little brother = 弟弟。"
    },
    {
        "english": "This is Mummy Pig.",
        "chinese": "这是猪妈妈。",
        "note": "Mummy 是英式英语中亲昵的“妈妈”。"
    },
    {
        "english": "And this is Daddy Pig.",
        "chinese": "这是猪爸爸。",
        "note": "And 承接上一句；Daddy = 爸爸。"
    },
    {
        "english": "Peppa Pig.",
        "chinese": "小猪佩奇。",
        "note": "片头 / 角色名。"
    },
    {
        "english": "Muddy Puddles.",
        "chinese": "泥水坑。",
        "note": "片头后的本集标题；与资料首行重复，按原顺序保留。"
    },
    {
        "english": "It is raining today.",
        "chinese": "今天下雨了。",
        "note": "现在进行时：be + doing。"
    },
    {
        "english": "So, Peppa and George cannot play outside.",
        "chinese": "所以，佩奇和乔治不能出去玩。",
        "note": "cannot + 动词原形；play outside = 在外面玩。"
    },
    {
        "english": "Daddy, it's stopped raining.",
        "chinese": "爸爸，雨停了。",
        "note": "这里 it's = it has；has stopped 表示“已经停了”。"
    },
    {
        "english": "Can we go out to play?",
        "chinese": "我们可以出去玩吗？",
        "note": "Can we...? 用来询问许可；go out to play = 出去玩。"
    },
    {
        "english": "Alright, run along you two.",
        "chinese": "好吧，你们两个去玩吧。",
        "note": "run along = 去吧 / 快去玩吧；you two = 你们两个。"
    },
    {
        "english": "Peppa loves jumping in muddy puddles.",
        "chinese": "佩奇喜欢在泥水坑里跳。",
        "note": "love doing = 喜欢做某事。"
    },
    {
        "english": "I love muddy puddles.",
        "chinese": "我喜欢泥水坑。",
        "note": "I love + 名词 = 我很喜欢……。"
    },
    {
        "english": "Peppa, if you jump in muddy puddles, you must wear your boots.",
        "chinese": "佩奇，如果你要在泥水坑里跳，就必须穿上靴子。",
        "note": "if 条件句；must + 动词原形 = 必须……。"
    },
    {
        "english": "Sorry, Mummy.",
        "chinese": "对不起，妈妈。",
        "note": "Sorry 是日常道歉高频表达。"
    },
    {
        "english": "George likes to jump in muddy puddles, too.",
        "chinese": "乔治也喜欢在泥水坑里跳。",
        "note": "like to do = 喜欢做；too 放句末表示“也”。"
    },
    {
        "english": "George, if you jump in muddy puddles, you must wear your boots.",
        "chinese": "乔治，如果你要在泥水坑里跳，就必须穿上靴子。",
        "note": "与上一条规则相同：if + 条件，must + 动词原形。"
    },
    {
        "english": "Peppa likes to look after her little brother, George.",
        "chinese": "佩奇喜欢照顾她的弟弟乔治。",
        "note": "look after = 照顾。"
    },
    {
        "english": "George, let's find some more puddles.",
        "chinese": "乔治，我们再找些水坑吧。",
        "note": "Let's + 动词原形 = 我们……吧；some more = 再一些。"
    },
    {
        "english": "Peppa and George are having a lot of fun.",
        "chinese": "佩奇和乔治玩得很开心。",
        "note": "have a lot of fun = 玩得很开心。"
    },
    {
        "english": "Peppa has found a little puddle.",
        "chinese": "佩奇发现了一个小水坑。",
        "note": "has found 是现在完成时；find → found → found。"
    },
    {
        "english": "George has found a big puddle.",
        "chinese": "乔治发现了一个大水坑。",
        "note": "has found = 已经发现了。"
    },
    {
        "english": "Look, George. There's a really big puddle.",
        "chinese": "看，乔治。那儿有一个特别大的水坑。",
        "note": "There's = There is；really 修饰 big，加强程度。"
    },
    {
        "english": "George wants to jump into the big puddle first.",
        "chinese": "乔治想第一个跳进那个大水坑。",
        "note": "want to do；jump into = 跳进；first = 先 / 第一个。"
    },
    {
        "english": "Stop, George. I must check if it's safe for you.",
        "chinese": "停下，乔治。我必须检查一下对你来说是否安全。",
        "note": "check if... = 检查是否……；safe for you = 对你安全。"
    },
    {
        "english": "Good. It is safe for you.",
        "chinese": "好，可以。对你来说是安全的。",
        "note": "be safe for + 人 = 对某人安全。"
    },
    {
        "english": "Sorry, George. It's only mud.",
        "chinese": "对不起，乔治。那只是一滩泥。",
        "note": "only = 只是；mud = 泥。"
    },
    {
        "english": "Peppa and George love jumping in muddy puddles.",
        "chinese": "佩奇和乔治喜欢在泥水坑里跳。",
        "note": "love doing = 喜欢做某事。"
    },
    {
        "english": "Come on, George. Let's go and show Daddy.",
        "chinese": "来吧，乔治。我们去给爸爸看看。",
        "note": "Come on = 来吧；go and show = 去给……看。"
    },
    {
        "english": "Goodness me.",
        "chinese": "天哪。",
        "note": "英式口语感叹语。"
    },
    {
        "english": "Daddy! Daddy! Guess what we've been doing.",
        "chinese": "爸爸！爸爸！猜猜我们刚才一直在干什么。",
        "note": "Guess what... = 猜猜……；we've been doing = we have been doing。"
    },
    {
        "english": "Let me think...",
        "chinese": "让我想想……",
        "note": "Let me + 动词原形 = 让我……。"
    },
    {
        "english": "Have you been watching television?",
        "chinese": "你们刚才一直在看电视吗？",
        "note": "现在完成进行时：have been doing。"
    },
    {
        "english": "No. No, Daddy.",
        "chinese": "没有，没有，爸爸。",
        "note": "口语中的简短回答。"
    },
    {
        "english": "Have you just had a bath?",
        "chinese": "你们刚洗过澡吗？",
        "note": "have just done = 刚刚做完；have a bath = 洗澡。"
    },
    {
        "english": "No. No.",
        "chinese": "没有，没有。",
        "note": "简短否定回答。"
    },
    {
        "english": "I know. You've been jumping in muddy puddles.",
        "chinese": "我知道了。你们一直在泥水坑里跳。",
        "note": "You've = You have；have been jumping = 一直在跳。"
    },
    {
        "english": "Yes. Yes, Daddy. We've been jumping in muddy puddles.",
        "chinese": "是的，是的，爸爸。我们一直在泥水坑里跳。",
        "note": "We've = We have；现在完成进行时。"
    },
    {
        "english": "Ho! Ho! And look at the mess you're in.",
        "chinese": "哈哈！看看你们弄得这一身脏。",
        "note": "look at the mess you're in = 看看你们现在这一身狼狈 / 脏乱。"
    },
    {
        "english": "Oh, well, it's only mud.",
        "chinese": "哦，好吧，只是泥而已。",
        "note": "Oh, well 常用于接受现状；it's only... = 只是……而已。"
    },
    {
        "english": "Let's clean up quickly before Mummy sees the mess.",
        "chinese": "趁妈妈看到这一团乱之前，我们赶快清理干净吧。",
        "note": "clean up = 清理干净；before + 从句 = 在……之前。"
    },
    {
        "english": "Daddy, when we've cleaned up, will you and Mummy come and play, too?",
        "chinese": "爸爸，等我们清理干净后，你和妈妈也会来一起玩吗？",
        "note": "when we've cleaned up = 等我们清理完；will you...? = 你会……吗？"
    },
    {
        "english": "Yes, we can all play in the garden.",
        "chinese": "好，我们大家都可以在花园里玩。",
        "note": "all = 都；in the garden = 在花园里。"
    },
    {
        "english": "Peppa and George are wearing their boots.",
        "chinese": "佩奇和乔治穿着他们的靴子。",
        "note": "be wearing = 正穿着 / 穿着。"
    },
    {
        "english": "Mummy and Daddy are wearing their boots.",
        "chinese": "妈妈和爸爸也穿着他们的靴子。",
        "note": "be wearing 表示当前穿着的状态。"
    },
    {
        "english": "Peppa loves jumping up and down in muddy puddles.",
        "chinese": "佩奇喜欢在泥水坑里蹦上蹦下。",
        "note": "up and down = 上上下下；jump up and down = 蹦上蹦下。"
    },
    {
        "english": "Everyone loves jumping up and down in muddy puddles.",
        "chinese": "大家都喜欢在泥水坑里蹦上蹦下。",
        "note": "everyone 作主语时谓语用第三人称单数 loves。"
    },
    {
        "english": "Oh, Daddy Pig, look at the mess you're in.",
        "chinese": "哦，猪爸爸，看看你弄得这一身脏。",
        "note": "look at... = 看看……。"
    },
    {
        "english": "It's only mud.",
        "chinese": "只是泥而已。",
        "note": "It's = It is；only = 只是。"
    }
];

  const LEARNED_WORDS_S1E1 = [
    {
        "term": "Muddy Puddles",
        "meaning": "泥水坑；泥坑",
        "phonetic": "/ˈmʌdi ˈpʌdəlz/",
        "note": "第1集标题"
    },
    {
        "term": "muddy",
        "meaning": "泥泞的；沾满泥的",
        "phonetic": "/ˈmʌdi/",
        "note": "mud → muddy"
    },
    {
        "term": "puddle",
        "meaning": "小水坑；水洼",
        "phonetic": "/ˈpʌdəl/",
        "note": "复数 puddles"
    },
    {
        "term": "puddles",
        "meaning": "水坑；小水洼（复数）",
        "phonetic": "/ˈpʌdəlz/",
        "note": ""
    },
    {
        "term": "I'm",
        "meaning": "我是（I am 的缩写）",
        "phonetic": "/aɪm/",
        "note": ""
    },
    {
        "term": "Peppa Pig",
        "meaning": "小猪佩奇",
        "phonetic": "/ˈpepə pɪɡ/",
        "note": "角色名"
    },
    {
        "term": "little brother",
        "meaning": "弟弟；小弟弟",
        "phonetic": "/ˈlɪtəl ˈbrʌðə/",
        "note": "高频语块"
    },
    {
        "term": "Mummy",
        "meaning": "妈妈",
        "phonetic": "/ˈmʌmi/",
        "note": "英式家庭口语"
    },
    {
        "term": "Daddy",
        "meaning": "爸爸",
        "phonetic": "/ˈdædi/",
        "note": "亲昵口语"
    },
    {
        "term": "rain",
        "meaning": "雨；下雨",
        "phonetic": "/reɪn/",
        "note": ""
    },
    {
        "term": "raining",
        "meaning": "正在下雨",
        "phonetic": "/ˈreɪnɪŋ/",
        "note": "rain 的 -ing 形式"
    },
    {
        "term": "today",
        "meaning": "今天",
        "phonetic": "/təˈdeɪ/",
        "note": ""
    },
    {
        "term": "cannot",
        "meaning": "不能",
        "phonetic": "/ˈkænɒt/",
        "note": "cannot + 动词原形"
    },
    {
        "term": "play outside",
        "meaning": "在外面玩；出去玩",
        "phonetic": "/pleɪ ˌaʊtˈsaɪd/",
        "note": "高频语块"
    },
    {
        "term": "stop raining",
        "meaning": "停止下雨",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "it's stopped raining",
        "meaning": "雨已经停了",
        "phonetic": "",
        "note": "这里 it's = it has"
    },
    {
        "term": "go out to play",
        "meaning": "出去玩",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "run along",
        "meaning": "去吧；快去玩吧",
        "phonetic": "",
        "note": "口语表达"
    },
    {
        "term": "you two",
        "meaning": "你们两个",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "love doing",
        "meaning": "喜欢做某事",
        "phonetic": "",
        "note": "love + doing"
    },
    {
        "term": "jump in",
        "meaning": "在……里跳；跳入某处",
        "phonetic": "",
        "note": "结合语境理解"
    },
    {
        "term": "jump in muddy puddles",
        "meaning": "在泥水坑里跳",
        "phonetic": "",
        "note": "本集核心语块"
    },
    {
        "term": "must",
        "meaning": "必须",
        "phonetic": "/mʌst/",
        "note": "must + 动词原形"
    },
    {
        "term": "wear",
        "meaning": "穿；戴",
        "phonetic": "/weə/",
        "note": ""
    },
    {
        "term": "boots",
        "meaning": "靴子（复数）",
        "phonetic": "/buːts/",
        "note": "单数 boot"
    },
    {
        "term": "sorry",
        "meaning": "对不起；抱歉",
        "phonetic": "/ˈsɒri/",
        "note": ""
    },
    {
        "term": "too",
        "meaning": "也",
        "phonetic": "/tuː/",
        "note": "常放句末"
    },
    {
        "term": "look after",
        "meaning": "照顾",
        "phonetic": "",
        "note": "高频短语"
    },
    {
        "term": "let's",
        "meaning": "让我们……吧",
        "phonetic": "/lets/",
        "note": "let us 的缩写"
    },
    {
        "term": "some more",
        "meaning": "再一些；更多一些",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "find",
        "meaning": "找到；发现",
        "phonetic": "/faɪnd/",
        "note": "过去式 / 过去分词 found"
    },
    {
        "term": "have a lot of fun",
        "meaning": "玩得很开心",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "found",
        "meaning": "找到；发现（find 的过去式/过去分词）",
        "phonetic": "/faʊnd/",
        "note": ""
    },
    {
        "term": "little puddle",
        "meaning": "小水坑",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "big puddle",
        "meaning": "大水坑",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "really",
        "meaning": "真正地；非常",
        "phonetic": "/ˈrɪəli/",
        "note": "这里加强程度"
    },
    {
        "term": "want to",
        "meaning": "想要做……",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "jump into",
        "meaning": "跳进",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "first",
        "meaning": "首先；第一个",
        "phonetic": "/fɜːst/",
        "note": ""
    },
    {
        "term": "stop",
        "meaning": "停下；停止",
        "phonetic": "/stɒp/",
        "note": ""
    },
    {
        "term": "check",
        "meaning": "检查；确认",
        "phonetic": "/tʃek/",
        "note": ""
    },
    {
        "term": "safe",
        "meaning": "安全的",
        "phonetic": "/seɪf/",
        "note": ""
    },
    {
        "term": "safe for you",
        "meaning": "对你来说安全",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "only",
        "meaning": "只是；仅仅",
        "phonetic": "/ˈəʊnli/",
        "note": ""
    },
    {
        "term": "mud",
        "meaning": "泥；泥巴",
        "phonetic": "/mʌd/",
        "note": ""
    },
    {
        "term": "come on",
        "meaning": "来吧；快点",
        "phonetic": "",
        "note": "高频口语"
    },
    {
        "term": "show Daddy",
        "meaning": "给爸爸看",
        "phonetic": "",
        "note": "show + 人"
    },
    {
        "term": "Goodness me",
        "meaning": "天哪",
        "phonetic": "",
        "note": "英式感叹语"
    },
    {
        "term": "guess",
        "meaning": "猜",
        "phonetic": "/ɡes/",
        "note": ""
    },
    {
        "term": "Guess what",
        "meaning": "猜猜……",
        "phonetic": "",
        "note": "高频口语"
    },
    {
        "term": "have been doing",
        "meaning": "一直在做……",
        "phonetic": "",
        "note": "现在完成进行时结构"
    },
    {
        "term": "let me think",
        "meaning": "让我想想",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "watch television",
        "meaning": "看电视",
        "phonetic": "",
        "note": "英式常用 television"
    },
    {
        "term": "just",
        "meaning": "刚刚；刚才",
        "phonetic": "/dʒʌst/",
        "note": ""
    },
    {
        "term": "have a bath",
        "meaning": "洗澡",
        "phonetic": "",
        "note": "英式常用搭配"
    },
    {
        "term": "know",
        "meaning": "知道",
        "phonetic": "/nəʊ/",
        "note": ""
    },
    {
        "term": "have been jumping",
        "meaning": "一直在跳",
        "phonetic": "",
        "note": "现在完成进行时"
    },
    {
        "term": "mess",
        "meaning": "脏乱；一团糟",
        "phonetic": "/mes/",
        "note": ""
    },
    {
        "term": "look at the mess",
        "meaning": "看看这一团乱",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "clean up",
        "meaning": "清理；收拾干净",
        "phonetic": "",
        "note": "高频短语"
    },
    {
        "term": "quickly",
        "meaning": "迅速地；赶快",
        "phonetic": "/ˈkwɪkli/",
        "note": ""
    },
    {
        "term": "before",
        "meaning": "在……之前",
        "phonetic": "/bɪˈfɔː/",
        "note": ""
    },
    {
        "term": "when",
        "meaning": "当……时；等到",
        "phonetic": "/wen/",
        "note": ""
    },
    {
        "term": "come and play",
        "meaning": "过来一起玩",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "garden",
        "meaning": "花园",
        "phonetic": "/ˈɡɑːdən/",
        "note": ""
    },
    {
        "term": "wearing",
        "meaning": "正穿着；穿着",
        "phonetic": "/ˈweərɪŋ/",
        "note": "wear 的 -ing 形式"
    },
    {
        "term": "up and down",
        "meaning": "上上下下",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "jump up and down",
        "meaning": "蹦上蹦下",
        "phonetic": "",
        "note": ""
    },
    {
        "term": "everyone",
        "meaning": "每个人；大家",
        "phonetic": "/ˈevriwʌn/",
        "note": "作主语时谓语通常用第三人称单数"
    }
];

  function seedState() {
    const created = nowIso();
    const episode2 = B127_CONTENT.episode2 || { id:'peppa-s1e2', season:1, episode:2, title:'Mr. Dinosaur is Lost', titleZh:'恐龙先生弄丢了', sentences:[], words:[] };
    const s1e1 = {
      id: 'peppa-s1e1', season: 1, episode: 1,
      title: 'Muddy Puddles', titleZh: '泥水坑',
      createdAt: created, updatedAt: created,
      sentences: LEARNED_SENTENCES_S1E1.map((x, i) => {
        const item = normalizeItem({
          id:`peppa-s1e1-full-s${i+1}`, ...x,
          status:'mastered', attempts:1, remembered:1,
          dictationPassed:true, dictationPassedAt:S1E1_COMPLETED_AT,
          createdAt:created, updatedAt:created
        }, 'sentences');
        initializeSpellingSchedule(item, S1E1_COMPLETED_AT);
        return item;
      }),
      words: LEARNED_WORDS_S1E1.map((x, i) => normalizeItem({ id:`peppa-s1e1-w${i+1}`, ...x, createdAt:created, updatedAt:created }, 'words'))
    };
    const s1e2 = normalizeEpisode({
      id: episode2.id || 'peppa-s1e2',
      season: episode2.season || 1,
      episode: episode2.episode || 2,
      title: episode2.title || 'Mr. Dinosaur is Lost',
      titleZh: episode2.titleZh || '恐龙先生弄丢了',
      createdAt: created, updatedAt: created,
      sentences: (episode2.sentences || []).map((x, i) => ({ id:`peppa-s1e2-s${i+1}`, ...x, createdAt:created, updatedAt:created })),
      words: (episode2.words || []).map((x, i) => ({ id:`peppa-s1e2-w${i+1}`, ...x, createdAt:created, updatedAt:created }))
    }, 1);
    return {
      version: VERSION,
      contentSeedRevision: CONTENT_SEED_REVISION,
      updatedAt: created,
      activeEpisodeId: 'peppa-s1e1',
      activeTab: 'sentences',
      episodes: [s1e1, s1e2]
    };
  }

  function normalizeItem(item, type) {
    const isSentence = type === 'sentences';
    return {
      id: clean(item?.id) || uid(isSentence ? 'sentence' : 'word'),
      ...(isSentence ? {
        english: clean(item?.english), chinese: clean(item?.chinese), note: clean(item?.note)
      } : {
        term: clean(item?.term), meaning: clean(item?.meaning), phonetic: clean(item?.phonetic), note: clean(item?.note)
      }),
      status: ['new','learning','mastered'].includes(item?.status) ? item.status : 'new',
      attempts: Number(item?.attempts) || 0,
      remembered: Number(item?.remembered) || 0,
      forgotten: Number(item?.forgotten) || 0,
      dictationPassed: Boolean(item?.dictationPassed),
      dictationPassedAt: item?.dictationPassedAt || '',
      spellingAnchorAt: item?.spellingAnchorAt || '',
      spellingReviewIndex: Math.max(0, Math.min(REVIEW_DAYS.length, Number(item?.spellingReviewIndex) || 0)),
      spellingNextReviewAt: item?.spellingNextReviewAt || '',
      spellingGraduated: Boolean(item?.spellingGraduated),
      spellingNeedsRetry: Boolean(item?.spellingNeedsRetry),
      spellingAttempts: Number(item?.spellingAttempts) || 0,
      spellingCorrect: Number(item?.spellingCorrect) || 0,
      spellingIncorrect: Number(item?.spellingIncorrect) || 0,
      spellingLastAt: item?.spellingLastAt || '',
      listeningPassed: Boolean(item?.listeningPassed),
      listeningAttempts: Number(item?.listeningAttempts) || 0,
      listeningPassedAt: item?.listeningPassedAt || '',
      lastListeningAt: item?.lastListeningAt || '',
      pronunciationPassed: Boolean(item?.pronunciationPassed),
      pronunciationAttempts: Number(item?.pronunciationAttempts) || 0,
      pronunciationBestScore: Math.max(0, Math.min(100, Number(item?.pronunciationBestScore) || 0)),
      pronunciationLastScore: Math.max(0, Math.min(100, Number(item?.pronunciationLastScore) || 0)),
      pronunciationLastTranscript: clean(item?.pronunciationLastTranscript),
      pronunciationPassedAt: item?.pronunciationPassedAt || '',
      lastPronunciationAt: item?.lastPronunciationAt || '',
      lastStudiedAt: item?.lastStudiedAt || '',
      createdAt: item?.createdAt || nowIso(), updatedAt: item?.updatedAt || nowIso()
    };
  }

  function normalizeEpisode(ep, index) {
    return {
      id: clean(ep?.id) || uid('episode'),
      season: Math.max(1, Number(ep?.season) || 1),
      episode: Math.max(1, Number(ep?.episode) || index + 1),
      title: clean(ep?.title) || `Episode ${index + 1}`,
      titleZh: clean(ep?.titleZh),
      createdAt: ep?.createdAt || nowIso(), updatedAt: ep?.updatedAt || nowIso(),
      sentences: Array.isArray(ep?.sentences) ? ep.sentences.map((x) => normalizeItem(x, 'sentences')).filter((x) => x.english) : [],
      words: Array.isArray(ep?.words) ? ep.words.map((x) => normalizeItem(x, 'words')).filter((x) => x.term) : []
    };
  }

  function normalizeState(raw) {
    const base = raw && typeof raw === 'object' ? raw : seedState();
    const episodes = Array.isArray(base.episodes) && base.episodes.length
      ? base.episodes.map(normalizeEpisode)
      : seedState().episodes;
    const active = episodes.some((e) => e.id === base.activeEpisodeId) ? base.activeEpisodeId : episodes[0].id;
    return {
      version: VERSION,
      contentSeedRevision: Number(base.contentSeedRevision) || 0,
      updatedAt: base.updatedAt || nowIso(),
      activeEpisodeId: active,
      activeTab: base.activeTab === 'words' ? 'words' : 'sentences',
      episodes
    };
  }

  function reviewDueIso(baseTime, days) {
    const d = new Date(baseTime || nowIso());
    if (Number.isNaN(d.getTime())) return '';
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Math.max(0, Number(days) || 0));
    return d.toISOString();
  }

  function initializeSpellingSchedule(item, fallbackTime = '') {
    if (!item?.dictationPassed || item.spellingGraduated || item.spellingNextReviewAt || item.spellingAnchorAt) return item;
    const anchor = item.dictationPassedAt || fallbackTime || item.updatedAt || nowIso();
    item.spellingAnchorAt = anchor;
    item.spellingReviewIndex = 0;
    item.spellingNextReviewAt = reviewDueIso(anchor, REVIEW_DAYS[0]);
    return item;
  }

  function seedOrMigrateEpisode(next, definition, options = {}) {
    let ep = next.episodes.find((x) => x.id === definition.id)
      || next.episodes.find((x) => x.season === definition.season && x.episode === definition.episode);
    if (!ep) {
      ep = normalizeEpisode({ id:definition.id, season:definition.season, episode:definition.episode, title:definition.title, titleZh:definition.titleZh, sentences:[], words:[] }, next.episodes.length);
      next.episodes.push(ep);
    }

    const sentenceBuckets = new Map();
    ep.sentences.forEach((item) => {
      const key = canonicalSpeechText(item.english);
      if (!sentenceBuckets.has(key)) sentenceBuckets.set(key, []);
      sentenceBuckets.get(key).push(item);
    });
    const consumedSentenceIds = new Set();
    const seededSentences = (definition.sentences || []).map((content, i) => {
      const key = canonicalSpeechText(content.english);
      const bucket = sentenceBuckets.get(key) || [];
      const previous = bucket.find((x) => !consumedSentenceIds.has(x.id));
      if (previous) consumedSentenceIds.add(previous.id);
      const base = {
        ...(previous || {}),
        id: definition.id === 'peppa-s1e1' ? `peppa-s1e1-full-s${i+1}` : `${definition.id}-s${i+1}`,
        ...content,
        updatedAt: previous?.updatedAt || nowIso()
      };
      if (options.forceDictationPassed) {
        base.status = 'mastered';
        base.attempts = Math.max(1, Number(previous?.attempts) || 0);
        base.remembered = Math.max(1, Number(previous?.remembered) || 0);
        base.dictationPassed = true;
        base.dictationPassedAt = previous?.dictationPassedAt || S1E1_COMPLETED_AT;
      }
      const item = normalizeItem(base, 'sentences');
      initializeSpellingSchedule(item, item.dictationPassedAt);
      return item;
    });
    const seededSentenceKeys = new Set((definition.sentences || []).map((x) => canonicalSpeechText(x.english)));
    const customSentences = ep.sentences.filter((x) => !consumedSentenceIds.has(x.id) && !seededSentenceKeys.has(canonicalSpeechText(x.english)));
    ep.sentences = [...seededSentences, ...customSentences.map((x) => {
      const item = normalizeItem(x, 'sentences');
      initializeSpellingSchedule(item);
      return item;
    })];

    const wordMap = new Map(ep.words.map((x) => [clean(x.term).toLowerCase().replace('’', "'"), x]));
    const seededWordKeys = new Set();
    const seededWords = (definition.words || []).map((content, i) => {
      const key = clean(content.term).toLowerCase().replace('’', "'");
      seededWordKeys.add(key);
      const previous = wordMap.get(key);
      return normalizeItem({ ...(previous || {}), id:previous?.id || (definition.id === 'peppa-s1e1' ? `peppa-s1e1-full-w${i+1}` : `${definition.id}-w${i+1}`), ...content, updatedAt:previous?.updatedAt || nowIso() }, 'words');
    });
    const customWords = ep.words.filter((x) => !seededWordKeys.has(clean(x.term).toLowerCase().replace('’', "'")));
    ep.words = [...seededWords, ...customWords];

    ep.id = definition.id;
    ep.season = definition.season;
    ep.episode = definition.episode;
    ep.title = definition.title;
    ep.titleZh = definition.titleZh;
    ep.updatedAt = nowIso();
    return ep;
  }

  function migrateLearnedContent(input) {
    const next = normalizeState(input);
    if (next.contentSeedRevision >= CONTENT_SEED_REVISION) {
      next.episodes.forEach((ep) => ep.sentences.forEach((item) => initializeSpellingSchedule(item)));
      return next;
    }

    seedOrMigrateEpisode(next, {
      id:'peppa-s1e1', season:1, episode:1, title:'Muddy Puddles', titleZh:'泥水坑',
      sentences:LEARNED_SENTENCES_S1E1, words:LEARNED_WORDS_S1E1
    }, { forceDictationPassed:true });

    const e2 = B127_CONTENT.episode2 || {};
    seedOrMigrateEpisode(next, {
      id:'peppa-s1e2', season:1, episode:2,
      title:e2.title || 'Mr. Dinosaur is Lost', titleZh:e2.titleZh || '恐龙先生弄丢了',
      sentences:e2.sentences || [], words:e2.words || []
    });

    next.contentSeedRevision = CONTENT_SEED_REVISION;
    next.updatedAt = nowIso();
    return next;
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const next = parsed ? migrateLearnedContent(parsed) : seedState();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    } catch { return seedState(); }
  }

  let state = load();
  let study = null;
  let pronunciationPractice = null;
  let listeningPractice = null;
  let spellingPractice = null;
  let knowledgePractice = null;
  let activeRecognition = null;

  function save() {
    state.updatedAt = nowIso();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn('Peppa save failed', e); }
    window.dispatchEvent(new CustomEvent('peppa-zone-updated', { detail: exportState() }));
  }

  function activeEpisode() {
    return state.episodes.find((e) => e.id === state.activeEpisodeId) || state.episodes[0];
  }

  function allItems(ep) { return [...ep.sentences, ...ep.words]; }
  function masteredCount(items) { return items.filter((x) => x.status === 'mastered').length; }
  function pct(done, total) { return total ? Math.round(done / total * 100) : 0; }
  function statusLabel(status) { return status === 'mastered' ? '已掌握' : status === 'learning' ? '学习中' : '未学'; }

  function canonicalDictationText(value) {
    return clean(value)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9']+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSpellingDue(item, now = Date.now()) {
    if (!item) return false;
    if (!item.dictationPassed || item.spellingNeedsRetry) return true;
    if (item.spellingGraduated) return false;
    if (!item.spellingNextReviewAt) return false;
    const t = new Date(item.spellingNextReviewAt).getTime();
    return Number.isFinite(t) && t <= now;
  }

  function spellingDueCount(items) { return items.filter((x) => isSpellingDue(x)).length; }
  function spellingGraduatedCount(items) { return items.filter((x) => x.spellingGraduated).length; }

  function spellingScheduleLabel(item) {
    if (!item.dictationPassed) return '首轮待测';
    if (item.spellingNeedsRetry) return '错题重测';
    if (item.spellingGraduated) return 'D30 已毕业';
    const index = Math.max(0, Math.min(REVIEW_DAYS.length - 1, Number(item.spellingReviewIndex) || 0));
    const day = REVIEW_DAYS[index];
    if (!item.spellingNextReviewAt) return `D${day} 待安排`;
    const due = new Date(item.spellingNextReviewAt);
    if (isSpellingDue(item)) return `D${day} 今日复习`;
    const date = Number.isNaN(due.getTime()) ? '' : due.toLocaleDateString('zh-CN', { month:'numeric', day:'numeric' });
    return `D${day}${date ? ` · ${date}` : ''}`;
  }

  function knowledgeFor(item, ep = activeEpisode()) {
    const episodeMap = B127_CONTENT?.knowledge?.[ep?.id] || {};
    if (episodeMap[item?.english]) return episodeMap[item.english];
    const key = canonicalDictationText(item?.english);
    for (const [english, data] of Object.entries(episodeMap)) {
      if (canonicalDictationText(english) === key) return data;
    }
    return null;
  }

  function spellingQueue(ep) {
    const now = Date.now();
    return ep.sentences.filter((item) => isSpellingDue(item, now)).map((item) => item.id);
  }

  function beginSpelling(itemIds = null) {
    const ep = activeEpisode();
    const queue = Array.isArray(itemIds) ? itemIds.filter((id) => ep.sentences.some((x) => x.id === id)) : spellingQueue(ep);
    spellingPractice = queue.length
      ? { episodeId:ep.id, queueIds:queue, index:0, itemId:queue[0], typed:'', checked:false, correct:false, empty:false }
      : { episodeId:ep.id, queueIds:[], index:0, itemId:'', typed:'', checked:false, correct:false, empty:true };
    render();
  }

  function currentSpellingItem() {
    if (!spellingPractice || spellingPractice.empty) return null;
    const ep = state.episodes.find((x) => x.id === spellingPractice.episodeId) || activeEpisode();
    return ep.sentences.find((x) => x.id === spellingPractice.itemId) || null;
  }

  function recordSpellingResult(item, correct) {
    const now = nowIso();
    item.spellingAttempts += 1;
    item.spellingLastAt = now;
    item.lastStudiedAt = now;
    item.updatedAt = now;
    item.attempts += 1;

    if (!correct) {
      item.spellingIncorrect += 1;
      item.forgotten += 1;
      item.spellingNeedsRetry = true;
      item.status = 'learning';
      activeEpisode().updatedAt = now;
      return;
    }

    item.spellingCorrect += 1;
    item.remembered += 1;
    item.status = 'mastered';

    if (!item.dictationPassed) {
      item.dictationPassed = true;
      item.dictationPassedAt = now;
      item.spellingAnchorAt = now;
      item.spellingReviewIndex = 0;
      item.spellingNextReviewAt = reviewDueIso(now, REVIEW_DAYS[0]);
      item.spellingGraduated = false;
      item.spellingNeedsRetry = false;
    } else if (item.spellingNeedsRetry) {
      // A failed review is relearned immediately; after the correct retry, restart from D1.
      item.spellingAnchorAt = now;
      item.spellingReviewIndex = 0;
      item.spellingNextReviewAt = reviewDueIso(now, REVIEW_DAYS[0]);
      item.spellingGraduated = false;
      item.spellingNeedsRetry = false;
    } else if (isSpellingDue(item, new Date(now).getTime())) {
      const index = Math.max(0, Math.min(REVIEW_DAYS.length - 1, Number(item.spellingReviewIndex) || 0));
      if (index >= REVIEW_DAYS.length - 1) {
        item.spellingGraduated = true;
        item.spellingReviewIndex = REVIEW_DAYS.length;
        item.spellingNextReviewAt = '';
      } else {
        const nextIndex = index + 1;
        item.spellingReviewIndex = nextIndex;
        const intervalDays = REVIEW_DAYS[nextIndex] - REVIEW_DAYS[index];
        item.spellingNextReviewAt = reviewDueIso(now, intervalDays);
      }
    }
    activeEpisode().updatedAt = now;
  }

  function checkSpelling() {
    if (!spellingPractice || spellingPractice.empty) return;
    const item = currentSpellingItem();
    const input = root.querySelector('#peppaSpellingInput');
    if (!item || !input) return;
    const typed = input.value;
    if (!clean(typed)) {
      input.focus();
      return;
    }
    const correct = canonicalDictationText(typed) === canonicalDictationText(item.english);
    spellingPractice.typed = typed;
    spellingPractice.checked = true;
    spellingPractice.correct = correct;
    recordSpellingResult(item, correct);
    save();
    render();
  }

  function advanceSpelling() {
    if (!spellingPractice || spellingPractice.empty) return;
    if (!spellingPractice.checked) return checkSpelling();
    if (!spellingPractice.correct) {
      spellingPractice.checked = false;
      spellingPractice.correct = false;
      spellingPractice.typed = '';
      render();
      return;
    }
    const nextIndex = spellingPractice.index + 1;
    if (nextIndex >= spellingPractice.queueIds.length) {
      spellingPractice = null;
      render();
      return;
    }
    spellingPractice.index = nextIndex;
    spellingPractice.itemId = spellingPractice.queueIds[nextIndex];
    spellingPractice.typed = '';
    spellingPractice.checked = false;
    spellingPractice.correct = false;
    render();
  }


  function speak(text) {
    const value = clean(text);
    if (!value || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(value);
    utter.lang = 'en-GB';
    utter.rate = 0.88;
    const voices = speechSynthesis.getVoices();
    const uk = voices.find((v) => /^en-GB/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
    if (uk) utter.voice = uk;
    speechSynthesis.speak(utter);
  }

  function extractWords(sentence) {
    const matches = clean(sentence).match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
    const seen = new Set();
    return matches.filter((word) => {
      const key = word.toLowerCase().replace('’', "'");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function canonicalSpeechText(value) {
    let text = clean(value).toLowerCase().replace(/[’]/g, "'");
    const contractions = [
      [/\bi'm\b/g, 'i am'], [/\bit's\b/g, 'it is'], [/\bthat's\b/g, 'that is'], [/\bthis's\b/g, 'this is'],
      [/\bcan't\b/g, 'cannot'], [/\bcouldn't\b/g, 'could not'], [/\bwon't\b/g, 'will not'], [/\bdon't\b/g, 'do not'],
      [/\bdoesn't\b/g, 'does not'], [/\bdidn't\b/g, 'did not'], [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'],
      [/\bwe're\b/g, 'we are'], [/\bthey're\b/g, 'they are'], [/\byou're\b/g, 'you are'], [/\bi've\b/g, 'i have']
    ];
    contractions.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
    return text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function compareSpeech(target, transcript) {
    const expected = canonicalSpeechText(target).split(' ').filter(Boolean);
    const spoken = canonicalSpeechText(transcript).split(' ').filter(Boolean);
    const n = expected.length, m = spoken.length;
    const dp = Array.from({length:n+1}, () => Array(m+1).fill(0));
    const back = Array.from({length:n+1}, () => Array(m+1).fill(''));
    for (let i=1;i<=n;i++){ dp[i][0]=i; back[i][0]='del'; }
    for (let j=1;j<=m;j++){ dp[0][j]=j; back[0][j]='ins'; }
    for (let i=1;i<=n;i++) {
      for (let j=1;j<=m;j++) {
        if (expected[i-1] === spoken[j-1]) { dp[i][j]=dp[i-1][j-1]; back[i][j]='ok'; continue; }
        const sub=dp[i-1][j-1]+1, del=dp[i-1][j]+1, ins=dp[i][j-1]+1;
        const best=Math.min(sub,del,ins); dp[i][j]=best;
        back[i][j]=best===sub?'sub':best===del?'del':'ins';
      }
    }
    const ops=[]; let i=n,j=m;
    while(i>0||j>0){
      const op=back[i][j];
      if(op==='ok'){ops.push({type:'ok',expected:expected[i-1],spoken:spoken[j-1]});i--;j--;}
      else if(op==='sub'){ops.push({type:'sub',expected:expected[i-1],spoken:spoken[j-1]});i--;j--;}
      else if(op==='del'){ops.push({type:'del',expected:expected[i-1],spoken:''});i--;}
      else {ops.push({type:'ins',expected:'',spoken:spoken[j-1]});j--;}
    }
    ops.reverse();
    const score = Math.max(0, Math.round((1 - dp[n][m] / Math.max(1,n,m)) * 100));
    return { score, expected, spoken, ops };
  }

  function recognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function pronunciationPassedCount(items) { return items.filter((x) => x.pronunciationPassed).length; }
  function dictationPassedCount(items) { return items.filter((x) => x.dictationPassed).length; }
  function listeningPassedCount(items) { return items.filter((x) => x.listeningPassed).length; }
  function pronunciationLabel(item) {
    if (item.pronunciationPassed) return `发音已通过${item.pronunciationBestScore ? ` · 最佳 ${item.pronunciationBestScore}%` : ''}`;
    if (item.pronunciationAttempts) return `发音待通过 · 最佳 ${item.pronunciationBestScore}%`;
    return '发音未检测';
  }
  function listeningLabel(item) {
    if (item.listeningPassed) return `裸听已通过${item.listeningAttempts ? ` · ${item.listeningAttempts} 次` : ''}`;
    if (item.listeningAttempts) return `裸听待通过 · ${item.listeningAttempts} 次`;
    return '裸听未检测';
  }

  function stats() {
    const episodes = state.episodes;
    const sentences = episodes.flatMap((e) => e.sentences);
    const words = episodes.flatMap((e) => e.words);
    return {
      episodes: episodes.length,
      sentences: sentences.length,
      words: words.length,
      masteredSentences: masteredCount(sentences),
      masteredWords: masteredCount(words),
      dictationPassedSentences: dictationPassedCount(sentences),
      listeningPassedSentences: listeningPassedCount(sentences),
      pronunciationPassedSentences: pronunciationPassedCount(sentences),
      pronunciationPassedWords: pronunciationPassedCount(words)
    };
  }

  function render() {
    if (!Array.isArray(state.episodes) || !state.episodes.length) state = seedState();
    const ep = activeEpisode();
    const s = stats();
    const epSentenceDictationDone = dictationPassedCount(ep.sentences);
    const epSentenceListeningDone = listeningPassedCount(ep.sentences);
    const epPronDone = pronunciationPassedCount(ep.sentences);
    const epDue = spellingDueCount(ep.sentences);
    const epGraduated = spellingGraduatedCount(ep.sentences);
    root.innerHTML = `
      <div class="peppa-hero">
        <div>
          <p class="eyebrow">Peppa Pig English</p>
          <h2>小猪佩奇英语专区</h2>
          <p>按集背句子、记单词、练英音。句子拼写采用测试效应复习：D1 → D2 → D4 → D7 → D15 → D30。</p>
        </div>
        <div class="peppa-hero-actions">
          <button class="secondary-button" data-peppa-action="new-episode">＋ 新建一集</button>
          <button class="secondary-button" data-peppa-action="study-episode">▶ 背本集</button>
          <button class="primary-button" data-peppa-action="spelling-test">✍ 句子测试 ${epDue ? `<b>${epDue}</b>` : ''}</button>
        </div>
      </div>
      <div class="peppa-review-strip">
        <strong>测试效应复习</strong>
        <span>首次拼对后：1天 → 2天 → 4天 → 7天 → 15天 → 30天</span>
        <em>今天本集应测 ${epDue} 句 · D30 毕业 ${epGraduated}/${ep.sentences.length}</em>
      </div>
      <div class="peppa-stats">
        <article><span>已建集数</span><strong>${s.episodes}</strong></article>
        <article><span>本集台词</span><strong>${ep.sentences.length}</strong><small>按原顺序收录</small></article>
        <article><span>今日应测</span><strong>${epDue}</strong><small>首轮 / 到期 / 错题</small></article>
        <article><span>默写首轮通过</span><strong>${epSentenceDictationDone}/${ep.sentences.length}</strong><small>首次完整拼对</small></article>
        <article><span>D30 毕业</span><strong>${epGraduated}/${ep.sentences.length}</strong><small>完成全部间隔复习</small></article>
        <article><span>发音通过</span><strong>${epPronDone}/${ep.sentences.length}</strong><small>英音检测</small></article>
        <article><span>裸听通过</span><strong>${epSentenceListeningDone}/${ep.sentences.length}</strong><small>不看字幕听懂</small></article>
        <article><span>单词/短语</span><strong>${masteredCount(ep.words)}/${ep.words.length}</strong><small>已掌握 / 本集总数</small></article>
      </div>
      <div class="peppa-layout">
        <aside class="peppa-episode-panel">
          <div class="peppa-panel-title"><strong>剧集</strong><small>按集保存，互不串进度</small></div>
          <div class="peppa-episode-list">
            ${state.episodes
              .slice()
              .sort((a,b) => a.season - b.season || a.episode - b.episode)
              .map((item) => {
                const total = item.sentences.length;
                const done = dictationPassedCount(item.sentences);
                const pronDone = pronunciationPassedCount(item.sentences);
                const listenDone = listeningPassedCount(item.sentences);
                const due = spellingDueCount(item.sentences);
                return `<button class="peppa-episode-card ${item.id === ep.id ? 'active' : ''}" data-episode-id="${esc(item.id)}">
                  <span class="peppa-episode-no">S${item.season} · E${String(item.episode).padStart(2,'0')}</span>
                  <strong>${esc(item.title)}</strong>
                  ${item.titleZh ? `<small>${esc(item.titleZh)}</small>` : ''}
                  <span class="peppa-mini-progress"><i style="width:${pct(done,total)}%"></i></span>
                  <em>首轮 ${done}/${total} · 今日 ${due} · 发音 ${pronDone}/${total} · 裸听 ${listenDone}/${total}</em>
                </button>`;
              }).join('')}
          </div>
        </aside>
        <section class="peppa-episode-workspace">
          <header class="peppa-episode-head">
            <div>
              <p>第 ${ep.season} 季 · 第 ${ep.episode} 集</p>
              <h3>${esc(ep.title)}</h3>
              ${ep.titleZh ? `<span>${esc(ep.titleZh)}</span>` : ''}
            </div>
            <div class="peppa-head-actions">
              <button class="secondary-button" data-peppa-action="speak-title">🔊 标题英音</button>
              <button class="primary-button" data-peppa-action="spelling-test">✍ 今日句子测试</button>
              <button class="secondary-button" data-peppa-action="edit-episode">编辑本集</button>
            </div>
          </header>
          <div class="peppa-add-row">
            <button class="primary-button" data-peppa-action="add-sentence">＋ 添加一句台词</button>
            <button class="secondary-button" data-peppa-action="add-word">＋ 添加单词/短语</button>
          </div>
          <div class="peppa-tabs" role="tablist">
            <button class="${state.activeTab === 'sentences' ? 'active' : ''}" data-peppa-tab="sentences">句子 <b>${ep.sentences.length}</b></button>
            <button class="${state.activeTab === 'words' ? 'active' : ''}" data-peppa-tab="words">单词 / 短语 <b>${ep.words.length}</b></button>
          </div>
          <div class="peppa-list">
            ${state.activeTab === 'sentences' ? renderSentences(ep) : renderWords(ep)}
          </div>
        </section>
      </div>
      ${renderStudyOverlay()}
      ${renderSpellingOverlay()}
      ${renderKnowledgeOverlay()}
      ${renderListeningOverlay()}
      ${renderPronunciationOverlay()}
      ${renderEditor()}
    `;
    bind();
  }

  function renderSentences(ep) {
    if (!ep.sentences.length) return `<div class="peppa-empty"><strong>这一集还没有录入台词</strong><p>你学到一句就加一句。添加时可自动把句中的单词拆到本集单词区。</p><button class="primary-button" data-peppa-action="add-sentence">添加第一句</button></div>`;
    return ep.sentences.map((item, index) => {
      const knowledge = knowledgeFor(item, ep);
      return `
      <article class="peppa-item ${item.status}" data-item-id="${esc(item.id)}">
        <div class="peppa-item-index">${index + 1}</div>
        <div class="peppa-item-main">
          <div class="peppa-item-line"><strong>${esc(item.english)}</strong><button data-speak="${esc(item.english)}" title="播放英式发音">🔊</button></div>
          <p class="peppa-translation">${item.chinese ? esc(item.chinese) : '<span class="peppa-muted">暂未填写中文</span>'}</p>
          ${item.note ? `<small class="peppa-note">${esc(item.note)}</small>` : ''}
          <div class="peppa-item-meta">
            <span class="status-${item.status}">${statusLabel(item.status)}</span>
            <span class="${item.dictationPassed ? 'peppa-dict-pass' : 'peppa-dict-pending'}">✍ ${item.dictationPassed ? '首轮已通过' : '首轮未通过'}</span>
            <span class="${item.spellingGraduated ? 'peppa-review-graduated' : isSpellingDue(item) ? 'peppa-review-due' : 'peppa-review-next'}">🗓 ${spellingScheduleLabel(item)}</span>
            <span class="${item.listeningPassed ? 'peppa-listen-pass' : 'peppa-listen-pending'}">👂 ${listeningLabel(item)}</span>
            <span class="${item.pronunciationPassed ? 'peppa-pron-pass' : 'peppa-pron-pending'}">🎙 ${pronunciationLabel(item)}</span>
            <span class="${knowledge ? 'peppa-knowledge-ready' : 'peppa-knowledge-empty'}">📘 ${knowledge ? `知识点 · P${knowledge.page}` : '资料未单列'}</span>
          </div>
        </div>
        <div class="peppa-item-actions">
          <button class="peppa-test-button" data-item-action="spelling-one" data-type="sentences" data-id="${esc(item.id)}">✍ 拼写这句</button>
          <button data-item-action="knowledge" data-type="sentences" data-id="${esc(item.id)}">📘 知识点</button>
          <button data-item-action="listen-test" data-type="sentences" data-id="${esc(item.id)}">👂 裸听</button>
          <button data-item-action="pronounce" data-type="sentences" data-id="${esc(item.id)}">🎙 发音检测</button>
          <button data-item-action="forget" data-type="sentences" data-id="${esc(item.id)}">↻ 忘了</button>
          <button data-item-action="study-one" data-type="sentences" data-id="${esc(item.id)}">练这句</button>
          <button data-item-action="edit" data-type="sentences" data-id="${esc(item.id)}">编辑</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderWords(ep) {
    if (!ep.words.length) return `<div class="peppa-empty"><strong>这一集还没有单词</strong><p>可以手动添加，也可以在“添加一句台词”时自动拆词。</p><button class="primary-button" data-peppa-action="add-word">添加第一个单词</button></div>`;
    return ep.words.map((item, index) => `
      <article class="peppa-item peppa-word-item ${item.status}" data-item-id="${esc(item.id)}">
        <div class="peppa-item-index">${index + 1}</div>
        <div class="peppa-item-main">
          <div class="peppa-item-line"><strong>${esc(item.term)}</strong><button data-speak="${esc(item.term)}" title="播放英式发音">🔊</button></div>
          ${item.phonetic ? `<code>${esc(item.phonetic)}</code>` : ''}
          <p class="peppa-translation">${item.meaning ? esc(item.meaning) : '<span class="peppa-muted">待补中文意思</span>'}</p>
          ${item.note ? `<small class="peppa-note">${esc(item.note)}</small>` : ''}
          <div class="peppa-item-meta"><span class="status-${item.status}">${statusLabel(item.status)}</span><span>练习 ${item.attempts} 次</span><span>忘了 ${item.forgotten} 次</span><span class="${item.pronunciationPassed ? 'peppa-pron-pass' : 'peppa-pron-pending'}">🎙 ${pronunciationLabel(item)}</span></div>
        </div>
        <div class="peppa-item-actions">
          <button data-item-action="pronounce" data-type="words" data-id="${esc(item.id)}">🎙 发音检测</button>
          <button data-item-action="remember" data-type="words" data-id="${esc(item.id)}">✓ 记住了</button>
          <button data-item-action="forget" data-type="words" data-id="${esc(item.id)}">↻ 忘了</button>
          <button data-item-action="study-one" data-type="words" data-id="${esc(item.id)}">练这个</button>
          <button data-item-action="edit" data-type="words" data-id="${esc(item.id)}">编辑</button>
        </div>
      </article>`).join('');
  }

  function renderStudyOverlay() {
    if (!study) return '';
    const ep = activeEpisode();
    const list = study.type === 'sentences' ? ep.sentences : ep.words;
    const current = list.find((x) => x.id === study.itemId) || list[0];
    if (!current) return '';
    const isSentence = study.type === 'sentences';
    const prompt = isSentence ? (current.chinese || '先回想这句英文') : (current.meaning || '先回想这个单词/短语');
    const answer = isSentence ? current.english : current.term;
    const index = Math.max(0, list.findIndex((x) => x.id === current.id));
    return `<div class="peppa-study-overlay" role="dialog" aria-modal="true">
      <div class="peppa-study-card">
        <header><button data-peppa-action="close-study">← 返回本集</button><span>${isSentence ? '句子背诵' : '单词记忆'} · ${index + 1}/${list.length}</span></header>
        <main>
          <p class="peppa-study-kicker">${isSentence ? '看中文，背出完整英文' : '看中文，回想英文'}</p>
          <h3>${esc(prompt)}</h3>
          <div class="peppa-study-answer ${study.revealed ? 'show' : ''}">
            <strong>${study.revealed ? esc(answer) : '••••••••'}</strong>
            ${study.revealed ? `<button data-speak="${esc(answer)}">🔊 英音</button>` : ''}
          </div>
          ${study.revealed && isSentence && current.note ? `<p class="peppa-study-note">${esc(current.note)}</p>` : ''}
        </main>
        <footer>
          ${!study.revealed ? `<button class="primary-button" data-peppa-action="reveal-study">显示答案</button>` : `
            <button class="peppa-forgot" data-study-grade="forget">忘了</button>
            <button class="peppa-fuzzy" data-study-grade="fuzzy">模糊</button>
            <button class="peppa-remember" data-study-grade="remember">会了</button>`}
        </footer>
      </div>
    </div>`;
  }

  function renderSpellingOverlay() {
    if (!spellingPractice) return '';
    if (spellingPractice.empty) {
      return `<div class="peppa-study-overlay peppa-spelling-overlay" role="dialog" aria-modal="true">
        <div class="peppa-spelling-card peppa-spelling-empty">
          <header><div><small>测试效应 · D1 / D2 / D4 / D7 / D15 / D30</small><strong>今天没有到期句子</strong></div><button data-peppa-action="close-spelling">×</button></header>
          <div class="peppa-spelling-empty-body"><span>✓</span><h3>本集今天已经清空</h3><p>没有首轮待测、到期复习或错题重测。按计划等下一次到期即可，不需要为了“刷进度”提前复习。</p></div>
          <footer><button class="primary-button" data-peppa-action="close-spelling">完成</button></footer>
        </div>
      </div>`;
    }
    const item = currentSpellingItem();
    if (!item) return '';
    const ep = state.episodes.find((x) => x.id === spellingPractice.episodeId) || activeEpisode();
    const knowledge = knowledgeFor(item, ep);
    const resultClass = spellingPractice.checked ? (spellingPractice.correct ? 'correct' : 'wrong') : '';
    return `<div class="peppa-study-overlay peppa-spelling-overlay" role="dialog" aria-modal="true">
      <form class="peppa-spelling-card" id="peppaSpellingForm">
        <header>
          <div><small>S${ep.season}E${String(ep.episode).padStart(2,'0')} · ${spellingPractice.index + 1}/${spellingPractice.queueIds.length}</small><strong>✍ 句子拼写测试</strong></div>
          <button type="button" data-peppa-action="close-spelling">×</button>
        </header>
        <div class="peppa-spelling-progress"><i style="width:${pct(spellingPractice.index, spellingPractice.queueIds.length)}%"></i></div>
        <div class="peppa-spelling-stage">
          <span>${esc(spellingScheduleLabel(item))}</span>
          <small>判断时忽略大小写、标点和多余空格；单词与缩写必须正确。</small>
        </div>
        <div class="peppa-spelling-prompt">
          <small>根据中文完整写出英文</small>
          <h3>${esc(item.chinese || '本句暂无中文，请按记忆拼写原句。')}</h3>
        </div>
        <textarea id="peppaSpellingInput" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="在这里完整拼写英文句子…"${spellingPractice.checked ? ' readonly' : ''}>${esc(spellingPractice.typed || '')}</textarea>
        ${spellingPractice.checked ? `<div class="peppa-spelling-result ${resultClass}">
          <strong>${spellingPractice.correct ? '✓ 正确' : '× 这次没有完全拼对'}</strong>
          ${spellingPractice.correct
            ? `<p>${item.spellingGraduated ? '这一句已完成 D30，正式毕业。' : `下一次：${esc(spellingScheduleLabel(item))}`}</p>`
            : `<p>正确原句：<b>${esc(item.english)}</b></p><small>本句已进入“错题重测”。立即重写正确后，会从 D1 重新开始间隔复习。</small>`}
        </div>` : ''}
        <div class="peppa-spelling-tools">
          <button type="button" class="secondary-button" data-peppa-action="knowledge-current-spelling">📘 ${knowledge ? '看本句知识点' : '知识点说明'}</button>
          ${spellingPractice.checked ? `<button type="button" class="secondary-button" data-speak="${esc(item.english)}">🔊 听标准句</button>` : ''}
        </div>
        <footer>
          <small>${spellingPractice.checked
            ? (spellingPractice.correct ? 'Enter：下一句' : 'Enter：重新拼写本句')
            : 'Enter：检查答案（Shift + Enter 才换行）'}</small>
          <button type="${spellingPractice.checked ? 'button' : 'submit'}" class="primary-button" ${spellingPractice.checked ? 'data-peppa-action="advance-spelling"' : ''}>
            ${spellingPractice.checked ? (spellingPractice.correct ? '下一句 →' : '重新拼写') : '检查'}
          </button>
        </footer>
      </form>
    </div>`;
  }

  function renderKnowledgeOverlay() {
    if (!knowledgePractice) return '';
    const ep = activeEpisode();
    const item = ep.sentences.find((x) => x.id === knowledgePractice.itemId);
    if (!item) return '';
    const data = knowledgeFor(item, ep);
    return `<div class="peppa-study-overlay peppa-knowledge-overlay" role="dialog" aria-modal="true">
      <div class="peppa-knowledge-card">
        <header><div><small>S${ep.season}E${String(ep.episode).padStart(2,'0')} · 本句知识点</small><strong>${esc(item.english)}</strong></div><button data-peppa-action="close-knowledge">×</button></header>
        <p class="peppa-knowledge-zh">${esc(item.chinese || '')}</p>
        ${data ? `
          <div class="peppa-knowledge-source">📄 ${esc(data.source)} · 第 ${Number(data.page) || '?'} 页</div>
          <h3>${esc(data.title || '知识点')}</h3>
          <div class="peppa-knowledge-points">${(data.points || []).map((x) => `<p>• ${esc(x)}</p>`).join('')}</div>
          ${(data.examples || []).length ? `<div class="peppa-knowledge-examples"><strong>资料中的例子 / 同类表达</strong>${data.examples.map((x) => `<code>${esc(x)}</code>`).join('')}</div>` : ''}
        ` : `
          <div class="peppa-knowledge-missing"><strong>这份知识点资料没有单独讲解本句</strong><p>这里不自行补写资料外知识点，避免把其他来源混进你上传的第 ${ep.episode} 集总结。</p></div>
        `}
        <footer><button class="secondary-button" data-speak="${esc(item.english)}">🔊 听原句</button><button class="primary-button" data-peppa-action="close-knowledge">看完了</button></footer>
      </div>
    </div>`;
  }

  function renderListeningOverlay() {
    if (!listeningPractice) return '';
    const ep = activeEpisode();
    const item = ep.sentences.find((x) => x.id === listeningPractice.itemId);
    if (!item) return '';
    const index = Math.max(0, ep.sentences.findIndex((x) => x.id === item.id));
    return `<div class="peppa-listen-overlay" role="dialog" aria-modal="true">
      <div class="peppa-listen-card">
        <header><button data-peppa-action="close-listening">← 返回本集</button><span>👂 裸听训练 · ${index + 1}/${ep.sentences.length}</span></header>
        <main>
          <p class="peppa-listen-kicker">先不看英文和中文，只听一遍并在脑中理解</p>
          <div class="peppa-listen-blind ${listeningPractice.revealed ? 'revealed' : ''}">
            ${listeningPractice.revealed
              ? `<strong>${esc(item.english)}</strong><p>${esc(item.chinese || '')}</p>${item.note ? `<small>${esc(item.note)}</small>` : ''}`
              : `<strong>字幕已隐藏</strong><p>听完后先自己复述意思，再显示台词核对。</p>`}
          </div>
          <div class="peppa-listen-toolbar">
            <button class="primary-button" data-peppa-action="play-listening">🔊 播放英音</button>
            ${!listeningPractice.revealed ? `<button class="secondary-button" data-peppa-action="reveal-listening">显示台词核对</button>` : ''}
          </div>
          <div class="peppa-listen-history">
            <span>裸听 ${item.listeningAttempts} 次</span>
            <span>${item.listeningPassed ? '✅ 已通过' : '○ 未通过'}</span>
          </div>
        </main>
        <footer>
          ${listeningPractice.revealed ? `
            <button class="peppa-forgot" data-peppa-action="listening-fail">没听懂 / 听错</button>
            <button class="peppa-remember" data-peppa-action="listening-pass">听懂了</button>
            ${item.listeningPassed ? `<button class="secondary-button" data-peppa-action="clear-listening-pass">取消通过</button>` : ''}` : `
            <button class="secondary-button" data-peppa-action="play-listening">再听一遍</button>`}
        </footer>
      </div>
    </div>`;
  }

  function renderPronunciationOverlay() {
    if (!pronunciationPractice) return '';
    const item = findItem(pronunciationPractice.type, pronunciationPractice.itemId);
    if (!item) return '';
    const target = pronunciationPractice.type === 'sentences' ? item.english : item.term;
    const supported = Boolean(recognitionCtor());
    const result = pronunciationPractice.result || (item.pronunciationLastTranscript ? compareSpeech(target, item.pronunciationLastTranscript) : null);
    const score = result?.score ?? item.pronunciationLastScore ?? 0;
    const transcript = pronunciationPractice.result?.transcript || item.pronunciationLastTranscript || '';
    const ops = result?.ops || [];
    return `<div class="peppa-pron-overlay" role="dialog" aria-modal="true">
      <div class="peppa-pron-card">
        <header><button data-peppa-action="close-pronunciation">← 返回本集</button><span>🎙 英音发音检测</span></header>
        <main>
          <p class="peppa-pron-kicker">先听原句，再完整读一遍</p>
          <h3>${esc(target)}</h3>
          <div class="peppa-pron-toolbar">
            <button class="secondary-button" data-speak="${esc(target)}">🔊 听英音</button>
            ${supported ? `<button class="primary-button ${pronunciationPractice.listening ? 'is-listening' : ''}" data-peppa-action="start-pronunciation" ${pronunciationPractice.listening ? 'disabled' : ''}>${pronunciationPractice.listening ? '🎙 正在听…' : '🎙 开始录音'}</button>` : ''}
          </div>
          ${pronunciationPractice.error ? `<div class="peppa-pron-error">${esc(pronunciationPractice.error)}</div>` : ''}
          ${!supported ? `<div class="peppa-pron-help"><strong>当前浏览器没有开放语音识别接口</strong><p>仍可先听英音并模仿；部署到 HTTPS 后建议使用最新版 Edge / Chrome。你也可以听原音后手动标记“发音通过”。</p></div>` : ''}
          ${transcript ? `<div class="peppa-pron-result">
            <div class="peppa-pron-score ${score >= PRONUNCIATION_PASS_SCORE ? 'pass' : score >= 70 ? 'mid' : 'low'}"><strong>${score}%</strong><span>识别匹配率</span></div>
            <div class="peppa-pron-transcript"><span>识别到：</span><strong>${esc(transcript)}</strong></div>
            <div class="peppa-pron-words">${ops.map((op) => {
              if (op.type === 'ok') return `<span class="ok">${esc(op.expected)}</span>`;
              if (op.type === 'sub') return `<span class="bad" title="识别为 ${esc(op.spoken)}">${esc(op.expected)} → ${esc(op.spoken)}</span>`;
              if (op.type === 'del') return `<span class="miss">漏：${esc(op.expected)}</span>`;
              return `<span class="extra">多：${esc(op.spoken)}</span>`;
            }).join(' ')}</div>
            <p class="peppa-pron-tip">${score >= PRONUNCIATION_PASS_SCORE ? '达到自动通过线。继续模仿原音的重音、连读和语调。' : '还没到 90% 自动通过线。优先重读红色 / 橙色提示的词，再试一次。'}</p>
          </div>` : `<div class="peppa-pron-help"><p>这里测的是“语音能不能被稳定听懂”的可理解度，不是音素级口音评分。发音是否自然，仍以《小猪佩奇》原音模仿为准。</p></div>`}
          <div class="peppa-pron-history"><span>检测 ${item.pronunciationAttempts} 次</span><span>最佳 ${item.pronunciationBestScore || 0}%</span><span>${item.pronunciationPassed ? '✅ 已通过' : '○ 未通过'}</span></div>
        </main>
        <footer>
          <button class="secondary-button" data-peppa-action="manual-pronunciation-pass">✓ 手动确认通过</button>
          ${item.pronunciationPassed ? `<button class="secondary-button" data-peppa-action="clear-pronunciation-pass">取消通过</button>` : ''}
        </footer>
      </div>
    </div>`;
  }

  function stopRecognition() {
    if (!activeRecognition) return;
    try { activeRecognition.abort(); } catch {}
    activeRecognition = null;
  }

  function startRecognition() {
    if (!pronunciationPractice || pronunciationPractice.listening) return;
    const Ctor = recognitionCtor();
    if (!Ctor) { pronunciationPractice.error = '当前浏览器不支持语音识别。'; render(); return; }
    const item = findItem(pronunciationPractice.type, pronunciationPractice.itemId);
    if (!item) return;
    const target = pronunciationPractice.type === 'sentences' ? item.english : item.term;
    stopRecognition();
    const recognition = new Ctor();
    activeRecognition = recognition;
    recognition.lang = 'en-GB';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;
    pronunciationPractice.listening = true;
    pronunciationPractice.error = '';
    pronunciationPractice.result = null;
    render();
    recognition.onresult = (event) => {
      const transcript = clean(event.results?.[0]?.[0]?.transcript || '');
      const result = compareSpeech(target, transcript);
      item.pronunciationAttempts += 1;
      item.pronunciationLastScore = result.score;
      item.pronunciationBestScore = Math.max(item.pronunciationBestScore || 0, result.score);
      item.pronunciationLastTranscript = transcript;
      item.lastPronunciationAt = nowIso();
      item.updatedAt = nowIso();
      if (result.score >= PRONUNCIATION_PASS_SCORE) {
        item.pronunciationPassed = true;
        item.pronunciationPassedAt = item.pronunciationPassedAt || nowIso();
      }
      activeEpisode().updatedAt = nowIso();
      pronunciationPractice.listening = false;
      pronunciationPractice.result = { ...result, transcript };
      activeRecognition = null;
      save(); render();
    };
    recognition.onerror = (event) => {
      pronunciationPractice.listening = false;
      const code = clean(event?.error);
      pronunciationPractice.error = code === 'not-allowed' || code === 'service-not-allowed'
        ? '麦克风权限被拒绝。请允许此网站使用麦克风后再试。'
        : code === 'no-speech' ? '没有检测到声音，请靠近麦克风并完整读一遍。'
        : `语音识别暂时失败${code ? `：${code}` : ''}。`;
      activeRecognition = null; render();
    };
    recognition.onend = () => {
      if (pronunciationPractice?.listening) { pronunciationPractice.listening = false; activeRecognition = null; render(); }
    };
    try { recognition.start(); }
    catch (e) { pronunciationPractice.listening = false; pronunciationPractice.error = '麦克风没有成功启动，请再试一次。'; activeRecognition = null; render(); }
  }

  function renderEditor() {
    if (!state.editor) return '';
    const e = state.editor;
    const isEpisode = e.kind === 'episode';
    const isSentence = e.kind === 'sentence';
    const title = e.mode === 'edit' ? '编辑' : '新增';
    return `<div class="peppa-editor-overlay" role="dialog" aria-modal="true">
      <form class="peppa-editor-card" id="peppaEditorForm">
        <header><strong>${title}${isEpisode ? '剧集' : isSentence ? '句子' : '单词 / 短语'}</strong><button type="button" data-peppa-action="close-editor">×</button></header>
        <div class="peppa-editor-fields">
          ${isEpisode ? `
            <label><span>第几季</span><input name="season" type="number" min="1" value="${esc(e.data.season || 1)}" required></label>
            <label><span>第几集</span><input name="episode" type="number" min="1" value="${esc(e.data.episode || 1)}" required></label>
            <label class="wide"><span>英文标题</span><input name="title" value="${esc(e.data.title || '')}" placeholder="Muddy Puddles" required></label>
            <label class="wide"><span>中文标题</span><input name="titleZh" value="${esc(e.data.titleZh || '')}" placeholder="泥水坑"></label>` : isSentence ? `
            <label class="wide"><span>英文台词</span><textarea name="english" rows="3" placeholder="输入这一句英文" required>${esc(e.data.english || '')}</textarea></label>
            <label class="wide"><span>中文意思</span><textarea name="chinese" rows="2" placeholder="输入中文意思">${esc(e.data.chinese || '')}</textarea></label>
            <label class="wide"><span>发音 / 语法 / 连读笔记</span><textarea name="note" rows="2" placeholder="例如：重音、弱读、句型">${esc(e.data.note || '')}</textarea></label>
            ${e.mode === 'new' ? `<label class="peppa-check wide"><input name="autoWords" type="checkbox" checked><span>保存句子时，把句中的独立单词自动加入本集“单词/短语”区（已存在的不重复）</span></label>` : ''}` : `
            <label class="wide"><span>英文单词 / 短语</span><input name="term" value="${esc(e.data.term || '')}" placeholder="puddle / muddy puddles" required></label>
            <label><span>音标（可选）</span><input name="phonetic" value="${esc(e.data.phonetic || '')}" placeholder="/ˈpʌdəl/"></label>
            <label class="wide"><span>中文意思</span><input name="meaning" value="${esc(e.data.meaning || '')}" placeholder="小水坑"></label>
            <label class="wide"><span>补充笔记</span><textarea name="note" rows="2">${esc(e.data.note || '')}</textarea></label>`}
        </div>
        <footer>
          ${e.mode === 'edit' && !isEpisode ? `<button type="button" class="peppa-delete" data-peppa-action="delete-editor-item">删除</button>` : '<span></span>'}
          <button type="submit" class="primary-button">保存</button>
        </footer>
      </form>
    </div>`;
  }

  function bind() {
    root.querySelectorAll('[data-episode-id]').forEach((btn) => btn.addEventListener('click', () => {
      state.activeEpisodeId = btn.dataset.episodeId; save(); render();
    }));
    root.querySelectorAll('[data-peppa-tab]').forEach((btn) => btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.peppaTab; save(); render();
    }));
    root.querySelectorAll('[data-speak]').forEach((btn) => btn.addEventListener('click', (ev) => {
      ev.stopPropagation(); speak(btn.dataset.speak);
    }));
    root.querySelectorAll('[data-peppa-action]').forEach((btn) => btn.addEventListener('click', () => handleAction(btn.dataset.peppaAction)));
    root.querySelectorAll('[data-item-action]').forEach((btn) => btn.addEventListener('click', () => handleItemAction(btn)));
    root.querySelectorAll('[data-study-grade]').forEach((btn) => btn.addEventListener('click', () => gradeStudy(btn.dataset.studyGrade)));
    root.querySelector('#peppaEditorForm')?.addEventListener('submit', submitEditor);
    root.querySelector('#peppaSpellingForm')?.addEventListener('submit', (event) => { event.preventDefault(); checkSpelling(); });
    const spellingInput = root.querySelector('#peppaSpellingInput');
    if (spellingInput && !spellingPractice?.checked) {
      setTimeout(() => spellingInput.focus(), 0);
      spellingInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          checkSpelling();
        }
      });
    }
    if (spellingPractice?.checked) {
      root.querySelector('#peppaSpellingForm')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); advanceSpelling(); }
      });
    }
  }

  function handleAction(action) {
    const ep = activeEpisode();
    if (action === 'new-episode') {
      const maxNo = state.episodes.filter((x) => x.season === ep.season).reduce((m,x) => Math.max(m,x.episode), 0);
      state.editor = { kind:'episode', mode:'new', data:{ season:ep.season, episode:maxNo + 1, title:'', titleZh:'' } }; render();
    } else if (action === 'edit-episode') {
      state.editor = { kind:'episode', mode:'edit', id:ep.id, data:{...ep} }; render();
    } else if (action === 'add-sentence') {
      state.editor = { kind:'sentence', mode:'new', data:{} }; render();
    } else if (action === 'add-word') {
      state.editor = { kind:'word', mode:'new', data:{} }; render();
    } else if (action === 'close-editor') {
      delete state.editor; render();
    } else if (action === 'delete-editor-item') {
      const e = state.editor;
      if (!e || e.mode !== 'edit') return;
      const type = e.kind === 'sentence' ? 'sentences' : 'words';
      ep[type] = ep[type].filter((x) => x.id !== e.id);
      delete state.editor; ep.updatedAt = nowIso(); save(); render();
    } else if (action === 'speak-title') {
      speak(ep.title);
    } else if (action === 'spelling-test') {
      beginSpelling();
      return;
    } else if (action === 'close-spelling') {
      spellingPractice = null; render();
      return;
    } else if (action === 'advance-spelling') {
      advanceSpelling();
      return;
    } else if (action === 'knowledge-current-spelling') {
      const item = currentSpellingItem();
      if (item) knowledgePractice = { itemId:item.id };
      render();
      return;
    } else if (action === 'close-knowledge') {
      knowledgePractice = null; render();
      return;
    } else if (action === 'study-episode') {
      const sentenceNext = ep.sentences.find((x) => x.status !== 'mastered') || ep.sentences[0];
      const wordNext = ep.words.find((x) => x.status !== 'mastered') || ep.words[0];
      if (sentenceNext) study = { type:'sentences', itemId:sentenceNext.id, revealed:false };
      else if (wordNext) study = { type:'words', itemId:wordNext.id, revealed:false };
      else return;
      render();
    } else if (action === 'close-study') {
      study = null; render();
    } else if (action === 'reveal-study') {
      if (study) study.revealed = true; render();
    } else if (action === 'close-listening') {
      listeningPractice = null; render();
    } else if (action === 'play-listening') {
      if (!listeningPractice) return;
      const item = ep.sentences.find((x) => x.id === listeningPractice.itemId);
      if (item) speak(item.english);
    } else if (action === 'reveal-listening') {
      if (listeningPractice) listeningPractice.revealed = true; render();
    } else if (action === 'listening-pass') {
      gradeListening(true);
    } else if (action === 'listening-fail') {
      gradeListening(false);
    } else if (action === 'clear-listening-pass') {
      if (!listeningPractice) return;
      const item = ep.sentences.find((x) => x.id === listeningPractice.itemId);
      if (item) { item.listeningPassed = false; item.listeningPassedAt = ''; item.updatedAt = nowIso(); ep.updatedAt = nowIso(); save(); }
      render();
    } else if (action === 'close-pronunciation') {
      stopRecognition(); pronunciationPractice = null; render();
    } else if (action === 'start-pronunciation') {
      startRecognition();
    } else if (action === 'manual-pronunciation-pass') {
      if (!pronunciationPractice) return;
      const item = findItem(pronunciationPractice.type, pronunciationPractice.itemId);
      if (item) { item.pronunciationPassed = true; item.pronunciationPassedAt = nowIso(); item.updatedAt = nowIso(); activeEpisode().updatedAt = nowIso(); save(); }
      render();
    } else if (action === 'clear-pronunciation-pass') {
      if (!pronunciationPractice) return;
      const item = findItem(pronunciationPractice.type, pronunciationPractice.itemId);
      if (item) { item.pronunciationPassed = false; item.pronunciationPassedAt = ''; item.updatedAt = nowIso(); activeEpisode().updatedAt = nowIso(); save(); }
      render();
    }
  }

  function findItem(type, id) { return activeEpisode()[type].find((x) => x.id === id); }

  function handleItemAction(btn) {
    const type = btn.dataset.type;
    const item = findItem(type, btn.dataset.id);
    if (!item) return;
    const action = btn.dataset.itemAction;
    if (action === 'spelling-one' && type === 'sentences') { beginSpelling([item.id]); return; }
    if (action === 'knowledge' && type === 'sentences') { knowledgePractice = { itemId:item.id }; render(); return; }
    if (action === 'listen-test' && type === 'sentences') { listeningPractice = { itemId:item.id, revealed:false }; render(); return; }
    if (action === 'pronounce') { pronunciationPractice = { type, itemId:item.id, listening:false, result:null, error:'' }; render(); return; }
    else if (action === 'remember') updateGrade(item, 'remember', type);
    else if (action === 'forget') updateGrade(item, 'forget', type);
    else if (action === 'study-one') { study = { type, itemId:item.id, revealed:false }; render(); return; }
    else if (action === 'edit') {
      state.editor = { kind:type === 'sentences' ? 'sentence' : 'word', mode:'edit', id:item.id, data:{...item} }; render(); return;
    }
    save(); render();
  }

  function updateGrade(item, grade, type = '') {
    item.attempts += 1;
    item.lastStudiedAt = nowIso();
    item.updatedAt = nowIso();
    if (grade === 'remember') {
      item.remembered += 1; item.status = 'mastered';
      // B127: reveal-based “会了”只表示背诵熟悉，不再替代真正的句子拼写测试。
    }
    else if (grade === 'fuzzy') { item.status = 'learning'; }
    else {
      item.forgotten += 1; item.status = 'learning';
      if (type === 'sentences') item.spellingNeedsRetry = true;
    }
    activeEpisode().updatedAt = nowIso();
  }

  function gradeListening(passed) {
    if (!listeningPractice) return;
    const ep = activeEpisode();
    const index = ep.sentences.findIndex((x) => x.id === listeningPractice.itemId);
    if (index < 0) return;
    const item = ep.sentences[index];
    item.listeningAttempts += 1;
    item.lastListeningAt = nowIso();
    item.updatedAt = nowIso();
    if (passed) {
      item.listeningPassed = true;
      item.listeningPassedAt = item.listeningPassedAt || nowIso();
    }
    ep.updatedAt = nowIso();
    save();
    const next = ep.sentences[index + 1];
    listeningPractice = next ? { itemId:next.id, revealed:false } : null;
    render();
  }

  function gradeStudy(grade) {
    if (!study) return;
    const ep = activeEpisode();
    const list = study.type === 'sentences' ? ep.sentences : ep.words;
    const index = list.findIndex((x) => x.id === study.itemId);
    if (index < 0) return;
    updateGrade(list[index], grade, study.type);
    save();
    let nextIndex = index + 1;
    if (nextIndex >= list.length) {
      if (study.type === 'sentences' && ep.words.length) {
        const nextWord = ep.words.find((x) => x.status !== 'mastered') || ep.words[0];
        study = { type:'words', itemId:nextWord.id, revealed:false };
      } else {
        study = null;
      }
    } else {
      study = { ...study, itemId:list[nextIndex].id, revealed:false };
    }
    render();
  }

  function submitEditor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const e = state.editor;
    const ep = activeEpisode();
    if (!e) return;
    if (e.kind === 'episode') {
      const values = {
        season: Math.max(1, Number(fd.get('season')) || 1), episode: Math.max(1, Number(fd.get('episode')) || 1),
        title: clean(fd.get('title')), titleZh: clean(fd.get('titleZh'))
      };
      if (e.mode === 'new') {
        const newEp = normalizeEpisode({ id:uid('episode'), ...values, sentences:[], words:[] }, state.episodes.length);
        state.episodes.push(newEp); state.activeEpisodeId = newEp.id;
      } else {
        const target = state.episodes.find((x) => x.id === e.id);
        Object.assign(target, values, {updatedAt:nowIso()});
      }
    } else if (e.kind === 'sentence') {
      const values = { english:clean(fd.get('english')), chinese:clean(fd.get('chinese')), note:clean(fd.get('note')) };
      if (!values.english) return;
      if (e.mode === 'new') {
        ep.sentences.push(normalizeItem({ id:uid('sentence'), ...values }, 'sentences'));
        if (fd.get('autoWords') === 'on') {
          const existing = new Set(ep.words.map((w) => w.term.toLowerCase().replace('’', "'")));
          extractWords(values.english).forEach((term) => {
            const key = term.toLowerCase().replace('’', "'");
            if (!existing.has(key)) {
              ep.words.push(normalizeItem({ id:uid('word'), term, meaning:'', note:`来自句子：${values.english}` }, 'words'));
              existing.add(key);
            }
          });
        }
      } else {
        Object.assign(findItem('sentences', e.id), values, {updatedAt:nowIso()});
      }
      ep.updatedAt = nowIso();
    } else {
      const values = { term:clean(fd.get('term')), meaning:clean(fd.get('meaning')), phonetic:clean(fd.get('phonetic')), note:clean(fd.get('note')) };
      if (!values.term) return;
      if (e.mode === 'new') ep.words.push(normalizeItem({id:uid('word'), ...values}, 'words'));
      else Object.assign(findItem('words', e.id), values, {updatedAt:nowIso()});
      ep.updatedAt = nowIso();
    }
    delete state.editor; save(); render();
  }

  function exportState() {
    const cleanState = JSON.parse(JSON.stringify(state));
    delete cleanState.editor;
    return cleanState;
  }

  function mergeStates(current, incoming) {
    const a = migrateLearnedContent(current);
    const b = migrateLearnedContent(incoming);
    const map = new Map(a.episodes.map((ep) => [ep.id, ep]));
    b.episodes.forEach((inc) => {
      const cur = map.get(inc.id);
      if (!cur) { a.episodes.push(inc); map.set(inc.id, inc); return; }
      ['sentences','words'].forEach((type) => {
        const itemMap = new Map(cur[type].map((x) => [x.id, x]));
        inc[type].forEach((item) => {
          const old = itemMap.get(item.id);
          if (!old) cur[type].push(item);
          else {
            const newer = String(item.updatedAt || '') >= String(old.updatedAt || '') ? item : old;
            Object.assign(old, newer, {
              attempts: Math.max(Number(old.attempts)||0, Number(item.attempts)||0),
              remembered: Math.max(Number(old.remembered)||0, Number(item.remembered)||0),
              forgotten: Math.max(Number(old.forgotten)||0, Number(item.forgotten)||0),
              dictationPassed: Boolean(old.dictationPassed || item.dictationPassed),
              dictationPassedAt: old.dictationPassedAt || item.dictationPassedAt || '',
              spellingAnchorAt: newer.spellingAnchorAt || '',
              spellingReviewIndex: Number(newer.spellingReviewIndex) || 0,
              spellingNextReviewAt: newer.spellingNextReviewAt || '',
              spellingGraduated: Boolean(newer.spellingGraduated),
              spellingNeedsRetry: Boolean(newer.spellingNeedsRetry),
              spellingAttempts: Math.max(Number(old.spellingAttempts)||0, Number(item.spellingAttempts)||0),
              spellingCorrect: Math.max(Number(old.spellingCorrect)||0, Number(item.spellingCorrect)||0),
              spellingIncorrect: Math.max(Number(old.spellingIncorrect)||0, Number(item.spellingIncorrect)||0),
              spellingLastAt: String(item.spellingLastAt || '') > String(old.spellingLastAt || '') ? item.spellingLastAt : old.spellingLastAt,
              listeningPassed: Boolean(old.listeningPassed || item.listeningPassed),
              listeningAttempts: Math.max(Number(old.listeningAttempts)||0, Number(item.listeningAttempts)||0),
              listeningPassedAt: old.listeningPassedAt || item.listeningPassedAt || '',
              pronunciationPassed: Boolean(old.pronunciationPassed || item.pronunciationPassed),
              pronunciationAttempts: Math.max(Number(old.pronunciationAttempts)||0, Number(item.pronunciationAttempts)||0),
              pronunciationBestScore: Math.max(Number(old.pronunciationBestScore)||0, Number(item.pronunciationBestScore)||0)
            });
          }
        });
      });
      if (String(inc.updatedAt || '') > String(cur.updatedAt || '')) {
        cur.season = inc.season; cur.episode = inc.episode; cur.title = inc.title; cur.titleZh = inc.titleZh; cur.updatedAt = inc.updatedAt;
      }
    });
    a.contentSeedRevision = Math.max(Number(a.contentSeedRevision)||0, Number(b.contentSeedRevision)||0);
    a.updatedAt = nowIso();
    return a;
  }

  function importState(payload, options = {}) {
    if (!payload) return false;
    state = options.merge === false ? migrateLearnedContent(payload) : mergeStates(state, payload);
    save(); render(); return true;
  }

  window.PeppaZone = { exportState, importState, speak, render, compareSpeech, pronunciationPassScore: PRONUNCIATION_PASS_SCORE, reviewDays:[...REVIEW_DAYS], dictationNormalize:canonicalDictationText, spellingDue:isSpellingDue, spellingScheduleLabel, storageKey: STORAGE_KEY };
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (pending) {
      state = mergeStates(state, pending);
      localStorage.removeItem(PENDING_KEY);
      save();
    }
  } catch { /* ignore pending recovery errors */ }
  render();
})();
