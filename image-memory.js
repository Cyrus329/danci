(function (root) {
  'use strict';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function norm(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // B068：严格按原始导入顺序制作的定制情境图（目前覆盖第 1—180 个词条）。
  // 键使用标准化后的完整词条，避免 shop 误匹配到 shopping 等其他词。
  const CUSTOM_SCENES = {
    'shop': {
      asset: './assets/word-scenes/shop.webp',
      hint: '走进商店，先挑选商品，再到柜台结账：shop 就是“商店；购物”。',
    },
    'go shopping': {
      asset: './assets/word-scenes/go-shopping.webp',
      hint: '从出发、挑选到把商品带回家，一整段行动就是 go shopping。',
    },
    'store': {
      asset: './assets/word-scenes/store.webp',
      hint: '店里陈列商品，仓库里储存物品：store 同时连接“商店”和“储存”。',
    },
    'convenience store': {
      asset: './assets/word-scenes/convenience-store.webp',
      hint: '随时可以买到日用品的小店，就是 convenience store（便利店）。',
    },
    'restore': {
      asset: './assets/word-scenes/restore.webp',
      hint: '损坏的东西经过修复重新恢复原样：restore = 修复；使复原。',
    },
    'clerk': {
      asset: './assets/word-scenes/clerk.webp',
      hint: '职员在柜台整理档案、帮助办理事务：这个人物就是 clerk。',
    },
    'business': {
      asset: './assets/word-scenes/business.webp',
      hint: '两人洽谈公司事务并达成生意，把 business 放进真实商务场景里记。',
    },
    'on business': {
      asset: './assets/word-scenes/on-business.webp',
      hint: '带着行李前往外地工作，而不是度假：on business = 出差。',
    },
    'none of your business': {
      asset: './assets/word-scenes/none-of-your-business.webp',
      hint: '对私人话题划出界限，请别人不要干涉：none of your business。',
    },
    'e-business': {
      asset: './assets/word-scenes/e-business.webp',
      hint: '在网络平台完成交易、下单和在线支付：E-business = 电子商务。',
    },
    'stock': {
      asset: './assets/word-scenes/stock.webp',
      hint: '仓库货架上保存的一批批商品就是 stock（库存；存货）。',
    },
    'in stock': {
      asset: './assets/word-scenes/in-stock.webp',
      hint: '货架商品充足，现在就可以买：in stock = 有现货。',
    },
    'out of stock': {
      asset: './assets/word-scenes/out-of-stock.webp',
      hint: '想要的货架已经空了，只能等待补货：out of stock = 缺货。',
    },
    'price': {
      asset: './assets/word-scenes/price.webp',
      hint: '看商品旁的价格标签并询问多少钱：price 就是“价格”。',
    },
    'at any price': {
      asset: './assets/word-scenes/at-any-price.webp',
      hint: '为了到达目标愿意付出各种代价：at any price = 不惜任何代价。',
    },
    'price list': {
      asset: './assets/word-scenes/price-list.webp',
      hint: '把每件商品和对应价格列在一起对照，就是 price list（价目表）。',
    },
    'priceless': {
      asset: './assets/word-scenes/priceless.webp',
      hint: '珍贵回忆无法用价格衡量：priceless = 无价的；极珍贵的。',
    },
    'discount': {
      asset: './assets/word-scenes/discount.webp',
      hint: '原价被划掉，换成更低价格并省下钱：discount = 折扣。',
    },
    'dollar': {
      asset: './assets/word-scenes/dollar.webp',
      hint: '看到美元纸币、硬币并用它支付，直接联想到 dollar。',
    },
    'credit': {
      asset: './assets/word-scenes/credit.webp',
      hint: '守信的行为带来别人的信任：credit 的核心记忆点是“信用”。',
    },
    'credit card': {
      asset: './assets/word-scenes/credit-card.webp',
      hint: '把银行卡贴近终端完成信用支付：credit card = 信用卡。',
    },
    "to one's credit": {
      asset: './assets/word-scenes/to-ones-credit.webp',
      hint: '主动承认错误并负责改好，值得别人称赞：to one\'s credit = 值得赞扬的是。',
    },
    'cash': {
      asset: './assets/word-scenes/cash.webp',
      hint: '手里看得见、可以直接付款的纸币和硬币就是 cash（现金）。',
    },
    'in cash': {
      asset: './assets/word-scenes/in-cash.webp',
      hint: '不用银行卡，直接当面递出现金付款：in cash = 用现金。',
    },
    'cheque': {
      asset: './assets/word-scenes/cheque.webp',
      hint: '在票据上填写金额并签名完成支付：cheque = 支票。',
    },
    'online': {
      asset: './assets/word-scenes/online.webp',
      hint: '设备连接网络并实时互动：online = 在线的；在网上。',
    },
    'online shopping': {
      asset: './assets/word-scenes/online-shopping.webp',
      hint: '网上选购、下单，再等快递收货：online shopping = 线上购物。',
    },
    'online paying': {
      asset: './assets/word-scenes/online-paying.webp',
      hint: '确认金额后在手机上完成付款：online paying = 线上支付。',
    },
    'offline': {
      asset: './assets/word-scenes/offline.webp',
      hint: '设备断开网络，但仍可使用本地内容：offline = 离线的。',
    },
    'buy': {
      asset: './assets/word-scenes/buy.webp',
      hint: '选择商品、付款并把它带走：buy = 买；购买。',
    },
    'sell': {
      asset: './assets/word-scenes/sell.webp',
      hint: '准备商品、交给买家、收到货款：sell = 卖；出售。',
    },
    'sale': {
      asset: './assets/word-scenes/sale.webp',
      hint: '商店里发生一场出售活动：sale 是“出售；销售活动”。',
    },
    'for sale': {
      asset: './assets/word-scenes/for-sale.webp',
      hint: '物品贴出待售标志，正在寻找买家：for sale = 待售。',
    },
    'on sale': {
      asset: './assets/word-scenes/on-sale.webp',
      hint: '原价划掉、特价醒目，商品正在促销：on sale = 降价出售。',
    },
    'salesman': {
      asset: './assets/word-scenes/salesman.webp',
      hint: '向顾客介绍商品并帮助选择的男售货员，就是 salesman。',
    },
    'consume': {
      asset: './assets/word-scenes/consume.webp',
      hint: '电量和资源从充足到用完：consume = 消耗；用掉。',
    },
    'consumer': {
      asset: './assets/word-scenes/consumer.webp',
      hint: '挑选、购买并使用商品或服务的人，就是 consumer（消费者）。',
    },
    'consumption': {
      asset: './assets/word-scenes/consumption.webp',
      hint: '电表数字增加、资源逐渐减少，这个“消耗量”就是 consumption。',
    },
    'purchase': {
      asset: './assets/word-scenes/purchase.webp',
      hint: '选定物品、提交采购、付款收货：purchase = 购买；采购。',
    },
    'tradition': {
      asset: './assets/word-scenes/tradition.webp',
      hint: '长辈把节日做法传给晚辈，大家共同遵守：tradition = 传统。',
    },
    'traditional': {
      asset: './assets/word-scenes/traditional.webp',
      hint: '传统服饰、传统食物和代代遵守的旧俗，共同构成 traditional（传统的）。',
    },
    'custom': {
      asset: './assets/word-scenes/custom.webp',
      hint: '地方风俗、个人习惯和顾客光顾，帮助连接 custom 的多个常见意思。',
    },
    'customer': {
      asset: './assets/word-scenes/customer.webp',
      hint: '进入商店、挑选询问并付款的人就是 customer（顾客）。',
    },
    'costume': {
      asset: './assets/word-scenes/costume.webp',
      hint: '演员换上角色服饰再登台：costume = 服饰；装束。',
    },
    'bargain': {
      asset: './assets/word-scenes/bargain.webp',
      hint: '从高价开始讨价还价，最后便宜成交：bargain = 讨价还价；便宜货。',
    },
    'cheap': {
      asset: './assets/word-scenes/cheap.webp',
      hint: '价格很低，轻松买下还省钱：cheap = 便宜的。',
    },
    'expend': {
      asset: './assets/word-scenes/expend.webp',
      hint: '把金钱、体力或资源投入并消耗掉：expend = 支出；花费。',
    },
    'expense': {
      asset: './assets/word-scenes/expense.webp',
      hint: '交通、住宿等一项项开销合成总费用：expense = 费用；代价。',
    },
    'at the expense of': {
      asset: './assets/word-scenes/at-the-expense-of.webp',
      hint: '为了成绩牺牲睡眠与健康：at the expense of = 以……为代价。',
    },
    'expensive': {
      asset: './assets/word-scenes/expensive.webp',
      hint: '价格标签很高，钱包承担不起：expensive = 昂贵的。',
    },
    'expenditure': {
      asset: './assets/word-scenes/expenditure.webp',
      hint: '预算里的房租、食物和交通花费都是 expenditure（支出）。',
    },
    'dispensable': {
      asset: './assets/word-scenes/dispensable.webp',
      hint: '整理行李时可以拿掉、不带也行：dispensable = 非必需的。',
    },
    'indispensable': {
      asset: './assets/word-scenes/indispensable.webp',
      hint: '关键用品一个也不能缺：indispensable = 必不可少的。',
    },
    'spend': {
      asset: './assets/word-scenes/spend.webp',
      hint: '既可花钱、花时间，也可度过一段时光：spend。',
    },
    'spend on': {
      asset: './assets/word-scenes/spend-on.webp',
      hint: '把时间或金钱用在某件事上：spend ... on ...。',
    },
    'spend...in doing': {
      asset: './assets/word-scenes/spend-in-doing.webp',
      hint: '计时并持续做事直到完成：spend ... (in) doing ...。',
    },
    'cost': {
      asset: './assets/word-scenes/cost.webp',
      hint: '商品有价格，选择也可能让人付出代价：cost = 花费；成本；代价。',
    },
    'at all costs': {
      asset: './assets/word-scenes/at-all-costs.webp',
      hint: '面对困难仍坚持完成：at all costs = 无论如何；不惜一切代价。',
    },
    'at the cost of': {
      asset: './assets/word-scenes/at-the-cost-of.webp',
      hint: '完成目标却失去休息：at the cost of = 以……为代价。',
    },
    'costly': {
      asset: './assets/word-scenes/costly.webp',
      hint: '材料贵、价格高、代价大：costly = 昂贵的；代价高的。',
    },
    'take': {
      asset: './assets/word-scenes/take.webp',
      hint: '拿走物品、乘坐交通或占用时间，都可用 take。',
    },
    'it takes/took + time + to do sth.': {
      asset: './assets/word-scenes/it-takes-time-to-do.webp',
      hint: '从开始任务到时间经过再完成：It takes/took ... to do ...。',
    },
    'know': {
      asset: './assets/word-scenes/know.webp',
      hint: '从不懂到获得了解，再到知道或认识：know。',
    },
    'as far as i know': {
      asset: './assets/word-scenes/as-far-as-i-know.webp',
      hint: '回答只限于自己掌握的信息范围：as far as I know = 就我所知。',
    },
    'unknown': {
      asset: './assets/word-scenes/unknown.webp',
      hint: '没有资料、不熟悉、仍未被认识：unknown = 未知的。',
    },
    'see': {
      asset: './assets/word-scenes/see.webp',
      hint: '眼睛看见、查清情况、最终理解，都可连接 see。',
    },
    'see sb. off': {
      asset: './assets/word-scenes/see-sb-off.webp',
      hint: '陪到车站并挥手告别：see sb. off = 为某人送行。',
    },
    'feel': {
      asset: './assets/word-scenes/feel.webp',
      hint: '手摸触感、身体感觉和内心感受，都对应 feel。',
    },
    'feel at home': {
      asset: './assets/word-scenes/feel-at-home.webp',
      hint: '从拘谨到像在家一样放松：feel at home = 舒适自在。',
    },
    'feel free to do sth.': {
      asset: './assets/word-scenes/feel-free-to-do.webp',
      hint: '主人友好邀请，不必拘束地去做：feel free to do sth.。',
    },
    'feeling': {
      asset: './assets/word-scenes/feeling.webp',
      hint: '身体感觉、内心感受或个人看法，都可称为 feeling。',
    },
    'smell': {
      asset: './assets/word-scenes/smell.webp',
      hint: '气味飘来并被鼻子闻到：smell = 气味；闻。',
    },
    'taste': {
      asset: './assets/word-scenes/taste.webp',
      hint: '把食物放入口中品尝味道并形成口味：taste。',
    },
    'sound': {
      asset: './assets/word-scenes/sound.webp',
      hint: '发出声音，也可表示身体健康或结构牢固：sound。',
    },
    'listen': {
      asset: './assets/word-scenes/listen.webp',
      hint: '主动集中注意力去听、收听或听从：listen。',
    },
    'listen to': {
      asset: './assets/word-scenes/listen-to.webp',
      hint: '停下分心并专注聆听对象：listen to = 倾听。',
    },
    'hear': {
      asset: './assets/word-scenes/hear.webp',
      hint: '声音自然传进耳朵，被听见：hear = 听到。',
    },
    'voice': {
      asset: './assets/word-scenes/voice.webp',
      hint: '说话嗓音、个人意见以及公开表达都连接 voice。',
    },
    'speak': {
      asset: './assets/word-scenes/speak.webp',
      hint: '开口交谈、讲一种语言或公开发言：speak。',
    },
    'aloud': {
      asset: './assets/word-scenes/aloud.webp',
      hint: '从默读变成读出声音，让别人听见：aloud = 出声地。',
    },
    'loudly': { asset: './assets/word-scenes/loudly.webp', hint: '声音从小声变为传遍教室：loudly = 大声地；响亮地。' },
    'speech': { asset: './assets/word-scenes/speech.webp', hint: '从练习说话到站上讲台发表演说：speech = 言语；演说。' },
    'lecture': { asset: './assets/word-scenes/lecture.webp', hint: '老师在大学讲堂系统讲课：lecture = 讲座；讲课。' },
    'give a lecture': { asset: './assets/word-scenes/give-a-lecture.webp', hint: '准备讲稿、走上讲台并进行演讲：give a lecture。' },
    'talk': { asset: './assets/word-scenes/talk.webp', hint: '从两人交谈到小组商讨方案：talk = 交谈；讨论。' },
    'tell': { asset: './assets/word-scenes/tell.webp', hint: '告诉消息、说明情况并识别区别：tell。' },
    'tell apart': { asset: './assets/word-scenes/tell-apart.webp', hint: '在相似物品中寻找差别并成功区分：tell apart。' },
    'retell': { asset: './assets/word-scenes/retell.webp', hint: '读完故事后回想顺序并完整复述：retell。' },
    'story': { asset: './assets/word-scenes/story.webp', hint: '翻开书、进入情节和故事世界：story。' },
    'tell a story': { asset: './assets/word-scenes/tell-a-story.webp', hint: '从故事开头讲到情节发展和结尾：tell a story。' },
    'read': { asset: './assets/word-scenes/read.webp', hint: '安静阅读、读懂内容，再大声朗读：read。' },
    'reader': { asset: './assets/word-scenes/reader.webp', hint: '选择书籍并专心阅读的人就是 reader。' },
    'say': { asset: './assets/word-scenes/say.webp', hint: '开口说、公开说明并表达看法：say。' },
    'article': { asset: './assets/word-scenes/article.webp', hint: '从一件物品收集资料再写成文章：article。' },
    'text': { asset: './assets/word-scenes/text.webp', hint: '书页正文、电脑文本和手机短信都可连接 text。' },
    'context': { asset: './assets/word-scenes/context.webp', hint: '单独看不懂，放进句子和场景就明白：context = 语境。' },
    'passage': { asset: './assets/word-scenes/passage.webp', hint: '穿过通道和走廊，也可阅读一个段落：passage。' },
    'chapter': { asset: './assets/word-scenes/chapter.webp', hint: '从目录进入本章并完成章节：chapter。' },
    'paragraph': { asset: './assets/word-scenes/paragraph.webp', hint: '把挤成一团的文字按意思分成清楚段落：paragraph。' },
    'news': { asset: './assets/word-scenes/news.webp', hint: '事件发生、新闻报道、手机收到消息：news。' },
  };

  // 第 101—180 张继续沿用完整词条键；图片文件名使用稳定 slug，便于离线缓存和后续顺序扩展。
  const GENERATED_SCENE_SLUGS_101_180 = {
    'a piece of news': 'a-piece-of-news', 'newspaper': 'newspaper', 'message': 'message',
    'leave a message': 'leave-a-message', 'text message': 'text-message', 'ball': 'ball',
    'skate': 'skate', 'skill': 'skill', 'special skill': 'special-skill', 'social skill': 'social-skill',
    'professional skill': 'professional-skill', 'able': 'able', 'be able to do sth.': 'be-able-to-do-sth',
    'ability': 'ability', 'disable': 'disable', 'unable': 'unable', 'enjoy': 'enjoy',
    'enjoy doing sth.': 'enjoy-doing-sth', 'enjoyable': 'enjoyable', 'grass': 'grass',
    'afraid': 'afraid', 'be afraid of': 'be-afraid-of', 'water': 'water', 'old': 'old',
    'elder': 'elder', 'young': 'young', 'youth': 'youth', 'youngster': 'youngster',
    'junior': 'junior', 'senior': 'senior', 'live': 'live', 'live up to': 'live-up-to',
    'live on': 'live-on', 'lively': 'lively', 'livelihood': 'livelihood', 'alive': 'alive',
    'lovely': 'lovely', 'life': 'life', 'wildlife': 'wildlife', 'lifestyle': 'lifestyle',
    'style': 'style', 'animal': 'animal', 'mammal': 'mammal', 'insect': 'insect', 'pet': 'pet',
    'bite': 'bite', 'diary': 'diary', 'keep a diary': 'keep-a-diary', 'dairy': 'dairy',
    'borrow': 'borrow', 'lend': 'lend', 'lend sth. to sb.': 'lend-sth-to-sb',
    'vegetable': 'vegetable', 'sweep': 'sweep', 'mainly': 'mainly', 'topic': 'topic',
    'title': 'title', 'entitle': 'entitle', 'underline': 'underline', 'stop': 'stop',
    'cancel': 'cancel', 'call off': 'call-off', 'cancellation': 'cancellation', 'cancer': 'cancer',
    'start': 'start', 'star': 'star', 'begin': 'begin', 'to begin with': 'to-begin-with',
    'in the beginning': 'in-the-beginning', 'beginning': 'beginning', 'beginner': 'beginner',
    'renew': 'renew', 'outset': 'outset', 'end': 'end', 'in the end': 'in-the-end',
    'at the end of': 'at-the-end-of', 'endless': 'endless', 'ending': 'ending',
    'cease': 'cease', 'over': 'over',
  };
  Object.entries(GENERATED_SCENE_SLUGS_101_180).forEach(([term, slug]) => {
    CUSTOM_SCENES[term] = {
      asset: `./assets/word-scenes/${slug}.webp`,
      hint: `按三格情境从左到右回想“${term}”的核心词义和用法。`,
    };
  });

  // B070：第 181—260 张，继续严格对应 word-data.js 原始顺序。
  const GENERATED_SCENE_SLUGS_181_260 = {
    'over again': 'over-again', 'all over': 'all-over', 'under': 'under', 'above': 'above',
    'above all': 'above-all', 'pause': 'pause', 'halt': 'halt', 'ago': 'ago', 'before': 'before',
    'after': 'after', 'now': 'now', 'right now': 'right-now', 'just now': 'just-now',
    'now that': 'now-that', 'from now on': 'from-now-on', 'nowadays': 'nowadays',
    'future': 'future', 'in the future': 'in-the-future', 'recent': 'recent', 'recently': 'recently',
    'current': 'current', 'currently': 'currently', 'currency': 'currency', 'then': 'then',
    'by then': 'by-then', 'from then on': 'from-then-on', 'now and then': 'now-and-then',
    'only': 'only', 'only to do sth.': 'only-to-do-sth', 'mere': 'mere', 'merely': 'merely',
    'quarter': 'quarter', 'a quarter': 'a-quarter', 'half': 'half', 'internet': 'internet',
    'website': 'website', 'surf': 'surf', 'surf the internet': 'surf-the-internet', 'net': 'net',
    'network': 'network', 'site': 'site', 'construction site': 'construction-site', 'cite': 'cite',
    'way': 'way', 'all the way': 'all-the-way', 'by the way': 'by-the-way',
    'get in the way of': 'get-in-the-way-of', 'method': 'method', 'means': 'means',
    'by means of': 'by-means-of', 'by no means': 'by-no-means', 'avenue': 'avenue',
    'mode': 'mode', 'via': 'via', 'strategy': 'strategy', 'solve': 'solve', 'settle': 'settle',
    'tackle': 'tackle', 'handle': 'handle', 'deal with': 'deal-with', 'do with': 'do-with',
    'cope with': 'cope-with', 'solution': 'solution', 'brain': 'brain', 'wise': 'wise',
    'wisdom': 'wisdom', 'clever': 'clever', 'smart': 'smart', 'bright': 'bright',
    'brightness': 'brightness', 'brilliant': 'brilliant', 'intelligent': 'intelligent',
    'intelligence': 'intelligence', 'intellectual': 'intellectual', 'stupid': 'stupid',
    'fool': 'fool', 'foolish': 'foolish', 'silly': 'silly', 'dull': 'dull', 'to': 'to',
  };
  Object.entries(GENERATED_SCENE_SLUGS_181_260).forEach(([term, slug]) => {
    CUSTOM_SCENES[term] = {
      asset: `./assets/word-scenes/${slug}.webp`,
      hint: `按三格情境从左到右回想“${term}”的核心词义和用法。`,
    };
  });

  // B071：第 261—280 张，继续严格对应 word-data.js 原始顺序。
  const GENERATED_SCENE_SLUGS_261_280 = {
    'emphasis': 'emphasis', 'collective': 'collective', 'cell-phone': 'cell-phone',
    'punctual': 'punctual', 'with': 'with', 'hazard': 'hazard', 'two': 'two',
    'yours': 'yours', 'dinner': 'dinner', 'dioxide': 'dioxide', 'april': 'april',
    'defy': 'defy', 'shoulder': 'shoulder', 'january': 'january', 'pop': 'pop',
    'summer': 'summer', 'sun': 'sun', 'vocation': 'vocation',
    'september': 'september', 'wet': 'wet',
  };
  Object.entries(GENERATED_SCENE_SLUGS_261_280).forEach(([term, slug]) => {
    CUSTOM_SCENES[term] = {
      asset: `./assets/word-scenes/${slug}.webp`,
      hint: `按三格情境从左到右回想“${term}”的核心词义和用法。`,
    };
  });

  const SPECIAL = [
    [/\bpressure\b|stress|压力/, ['📚','⏰','😣'], 'study', '任务堆在一起、时间又很紧，脑中出现“被压力压着”的画面。'],
    [/break down|出故障|分解/, ['⚙️','💥','🛑'], 'action', '想成机器突然坏掉：break down = 出故障 / 分解。'],
    [/break up|分手|解散/, ['💔','↔️','👥'], 'emotion', '想成两个人分开：break up = 分手 / 解散。'],
    [/break out|爆发/, ['🔥','💥','🚨'], 'danger', '想成火灾突然爆发：break out = 突然爆发。'],
    [/break into|闯入/, ['🚪','🏃','⚠️'], 'action', '想成冲进一扇门：break into = 闯入。'],
    [/break through|突破/, ['🧱','💥','➡️'], 'action', '想成撞破墙冲出去：break through = 突破。'],
    [/at ease|with ease|轻易|自在|放松/, ['😌','🪑','🌿'], 'calm', '身体放松下来，不费力、不紧张，就是 ease 的感觉。'],
    [/take advantage of|利用/, ['🎯','⚡','✋'], 'action', '看到机会就抓住并利用：take advantage of。'],
    [/rich in|富含/, ['🧺','✨','➕'], 'nature', '想成一个篮子装得满满的：be rich in = 富含。'],
    [/marine ecosystem|海洋生态/, ['🌊','🐟','🌿'], 'nature', '海水、鱼和植物组成一整个海洋生态系统。'],
    [/food chain|食物链/, ['🌿','🐛','🐦'], 'nature', '植物→小动物→大动物，一环接一环就是 food chain。'],
    [/flow into|流入/, ['💧','➡️','🌊'], 'nature', '水顺着箭头流进去：flow into = 流入。'],
    [/fossil fuel|化石燃料/, ['🛢️','🔥','🏭'], 'industry', '石油、煤等被燃烧供能，联想到 fossil fuels。'],
    [/appliance|电器/, ['🏠','🔌','⚙️'], 'technology', '家里插电使用的设备：appliances。'],
    [/cafe|cafeteria|咖啡|食堂|餐厅/, ['☕','🍽️','🏠'], 'food', '看到餐桌和咖啡，直接联想到餐馆/食堂场景。'],
    [/campus|校园/, ['🎓','🏫','🌳'], 'study', '教学楼、学生和校园树木组成 campus 场景。'],
    [/candidate|候选|应试/, ['👤','📋','✅'], 'people', '名单里等待被选中的人，就是 candidate。'],
    [/carbon|碳/, ['🏭','☁️','C'], 'industry', '工厂排放和字母 C，联想到 carbon。'],
    [/cargo|货物/, ['📦','🚢','✈️'], 'travel', '船或飞机运着一箱箱货物，就是 cargo。'],
    [/bullet|子弹/, ['🔫','•','➡️'], 'danger', '高速射出的弹丸就是 bullet；也可联想到列表圆点。'],
    [/briefcase|公文包/, ['💼','📄','🖊️'], 'business', '装文件的手提公文包就是 briefcase。'],
    [/brochure|小册子|手册/, ['📖','📣','📰'], 'communication', '宣传用的小册子，想到 brochure。'],
    [/broker|经纪|中间人/, ['🤝','💼','💰'], 'business', '在双方中间撮合交易的人，就是 broker。'],
    [/boundary|边界|界限/, ['🗺️','➖','🚧'], 'place', '地图上的分界线，就是 boundary。'],
    [/breeze|微风/, ['🍃','💨','🙂'], 'nature', '轻轻吹过的风：breeze。'],
    [/brick|砖/, ['🧱','🏠','🧱'], 'object', '一块一块砖砌成墙，直接记 brick。'],
    [/bomb|炸弹/, ['💣','💥','🚨'], 'danger', '爆炸画面直接对应 bomb。'],
    [/blog|博客/, ['💻','✍️','🌐'], 'technology', '在网络上写文章，就是 blog。'],
    [/blossom|花|开花/, ['🌱','🌸','✨'], 'nature', '花从花苞绽放：blossom。'],
    [/seed|种子/, ['🌰','🌱','🌳'], 'nature', '一粒种子长成植物，记 seed。'],
    [/banquet|宴会/, ['🍽️','🎉','👥'], 'food', '很多人围桌吃正式宴席：banquet。'],
    [/balcony|阳台/, ['🏠','⬆️','🌤️'], 'place', '房子外伸出的高处平台，就是 balcony。'],
    [/ballet|芭蕾/, ['🩰','🎵','🧍'], 'art', '芭蕾舞鞋+舞台动作，记 ballet。'],
    [/attorney|律师/, ['⚖️','👔','📄'], 'law', '律师拿着法律文件站在法庭边：attorney。'],
    [/audience|观众|听众/, ['👥','👀','🎤'], 'people', '一群人面对舞台观看/聆听，就是 audience。'],
    [/auditorium|礼堂|会堂/, ['🏛️','🎤','👥'], 'place', '大礼堂里有舞台和观众：auditorium。'],
    [/author|作者|作家/, ['✍️','📖','👤'], 'communication', '一个人在写书，直接联想到 author。'],
    [/ashamed|羞耻|惭愧/, ['😳','🙈','⬇️'], 'emotion', '做错事后低头脸红的感觉：ashamed。'],
    [/guilt|guilty|内疚|有罪/, ['😔','⚖️','💭'], 'law', '脑中既有“内疚”也有“有罪”的法庭感，记 guilt/guilty。'],
    [/apolog|道歉|歉意/, ['🙏','💬','😔'], 'communication', '低头说“对不起”的画面，联想到 apologize/apology。'],
    [/punish|penal|处罚|惩罚/, ['⚖️','🚫','📋'], 'law', '违规后收到处罚，记 punish / penalty / penalize。'],
    [/prison|jail|监狱|囚犯/, ['🔒','🚪','⚖️'], 'law', '铁门和锁，直接联想到 prison / jail。'],
    [/witness|证人|目击/, ['👀','⚖️','🗣️'], 'law', '亲眼看到后在法庭作证，就是 witness。'],
    [/victim|受害|迫害/, ['🧍','⚠️','🩹'], 'danger', '受到伤害的人就是 victim。'],
    [/verify|valid|核实|有效/, ['✅','🔍','📄'], 'law', '检查文件后打上有效勾，联想到 verify / valid。'],
    [/appeal|上诉|呼吁|吸引/, ['📣','⚖️','⬆️'], 'law', '向上级法庭请求，或向公众呼吁：appeal。'],
    [/legislat|立法|法律/, ['🏛️','📜','⚖️'], 'law', '议会制定法律，联想到 legislate / legislation。'],
    [/flow|float|漂浮|流动/, ['💧','🌊','➡️'], 'nature', '水在流、物体浮在水上，记 flow / float。'],
  ];

  const CATEGORY_RULES = [
    ['law', /法律|律师|法庭|犯罪|罪|监狱|处罚|惩罚|合法|非法|立法|证人|法官|条款|审判|责任|权利|义务/],
    ['study', /学习|学校|学生|教育|考试|课程|知识|学术|校园|教师|课堂|作业|研究/],
    ['technology', /计算机|网络|技术|机器|设备|电器|软件|硬件|电子|应用程序|博客/],
    ['business', /公司|商业|业务|经济|银行|奖金|经纪|货币|投资|效率|工作|职业|市场/],
    ['food', /食物|饮料|咖啡|餐厅|食堂|宴会|酒|水果|吃|饮/],
    ['nature', /海|水|河|风|花|植物|动物|泥|种子|生态|天气|森林|山|空气/],
    ['travel', /飞机|船|车|道路|旅行|运输|货物|交通|航|港口/],
    ['emotion', /快乐|焦虑|紧张|害怕|羞耻|惭愧|内疚|愤怒|悲伤|勇敢|残忍|敬畏/],
    ['people', /人；|者；|人员|朋友|伙伴|候选人|作者|观众|律师|新郎|囚犯|旁观者/],
    ['place', /地方|建筑|房间|校园|阳台|后院|礼堂|咖啡馆|食堂|办事处|边界|地点/],
    ['communication', /说|宣布|文章|书|写|博客|通告|呼吁|道歉|表达|语言|读者|作者/],
    ['danger', /爆炸|炸弹|火灾|战争|疾病|危险|受害|拷打|伤害|猛冲/],
    ['art', /艺术|舞蹈|芭蕾|音乐|美|创作/],
  ];

  const CATEGORY_META = {
    study: { icons:['📚','🎓','✏️'], hint:'把这个词放进“上课/备考”的画面里，先看图说中文，再回想英文。' },
    law: { icons:['⚖️','📜','🔒'], hint:'把它放进“法律/规则/法庭”场景，画面越具体越容易记。' },
    technology: { icons:['💻','⚙️','🔌'], hint:'想成设备正在运行或被操作，用功能画面绑定这个词。' },
    business: { icons:['💼','💰','📊'], hint:'把它想进交易、工作或公司场景，看到图就先说核心义。' },
    food: { icons:['🍽️','☕','🥣'], hint:'把味道、餐桌或饮品画面和词义绑在一起。' },
    nature: { icons:['🌿','🌊','☀️'], hint:'用自然场景记：颜色、运动方向和位置都能帮助回忆。' },
    travel: { icons:['🚗','✈️','📦'], hint:'把词放进出行/运输场景，用“从哪里到哪里”帮助记忆。' },
    emotion: { icons:['🙂','💭','❤️'], hint:'先感受这个情绪，再把英文标签贴到这个感觉上。' },
    people: { icons:['👤','👥','💬'], hint:'给这个人物设定一个身份和动作，比只背中文更牢。' },
    place: { icons:['🏠','📍','🚪'], hint:'把这个地点想成一个可进入、可指向的具体空间。' },
    communication: { icons:['💬','✍️','📣'], hint:'想成有人在说、写或传播信息，让词义落到动作上。' },
    danger: { icons:['⚠️','🚨','💥'], hint:'用强烈的危险画面制造记忆钩子，但只记核心义。' },
    art: { icons:['🎨','🎵','🩰'], hint:'把词和舞台、艺术作品或创作动作绑定。' },
    action: { icons:['🎬','➡️','✋'], hint:'把这个词想成一个正在发生的动作，不要只背静态中文。' },
    object: { icons:['📦','🔎','✋'], hint:'想象你正拿着这个东西，观察它的形状和用途。' },
    abstract: { icons:['💡','🧠','🔗'], hint:'把抽象意思变成“原因→结果”的小场景，再贴上英文标签。' },
    calm: { icons:['😌','🌿','🫧'], hint:'用放松、轻松的画面记住这个词的感觉。' },
    industry: { icons:['🏭','⚙️','🔥'], hint:'把它放进工厂、能源或生产场景里记。' },
  };

  function classify(word) {
    const source = `${norm(word?.term)} ${String(word?.meaning || '')}`;
    for (const [regex, icons, theme, hint] of SPECIAL) {
      if (regex.test(source)) return { icons, theme, hint, special:true };
    }
    for (const [theme, regex] of CATEGORY_RULES) {
      if (regex.test(source)) return { ...CATEGORY_META[theme], theme };
    }
    if (/^(v|vt|vi)\./i.test(String(word?.meaning || ''))) return { ...CATEGORY_META.action, theme:'action' };
    if (/^n\./i.test(String(word?.meaning || ''))) return { ...CATEGORY_META.object, theme:'object' };
    return { ...CATEGORY_META.abstract, theme:'abstract' };
  }

  function coreMeaning(word) {
    const text = String(word?.meaning || '').replace(/^\s*(n|v|vt|vi|adj|adv|prep|pron|conj|num|art)\.\s*/i, '');
    return text.split(/[；;。]/)[0].trim() || '核心词义';
  }

  function build(word) {
    const visual = classify(word || {});
    const term = String(word?.term || 'word');
    const core = coreMeaning(word || {});
    const custom = CUSTOM_SCENES[norm(term)] || null;
    let hint = custom?.hint || visual.hint;
    if (!custom && !visual.special) {
      hint = `${visual.hint} 这张图只抓“${core}”这个核心义。`;
    }
    const isPressure = norm(term) === 'pressure';
    return {
      term,
      core,
      theme: visual.theme || 'abstract',
      icons: visual.icons || CATEGORY_META.abstract.icons,
      hint,
      asset: custom?.asset || (isPressure ? './assets/image-memory-pressure.png' : ''),
      customScene: Boolean(custom),
    };
  }

  function renderScene(data) {
    if (data.asset) {
      return `<img class="image-memory-real-v53" src="${esc(data.asset)}" alt="${esc(data.term)} 的定制图像记忆场景" loading="lazy" decoding="async">`;
    }
    const [a,b,c] = data.icons;
    return `<div class="image-memory-scene-v53 theme-${esc(data.theme)}" role="img" aria-label="${esc(data.term)} 的视觉联想图">
      <span class="im-orb-v53 im-a-v53">${esc(a)}</span>
      <span class="im-arrow-v53">→</span>
      <span class="im-orb-v53 im-b-v53">${esc(b)}</span>
      <span class="im-link-v53">+</span>
      <span class="im-orb-v53 im-c-v53">${esc(c)}</span>
      <strong class="im-term-v53">${esc(data.term)}</strong>
      <small class="im-core-v53">${esc(data.core)}</small>
    </div>`;
  }

  function render(word, options) {
    if (!word || !word.term) return '';
    const opts = options || {};
    const data = build(word);
    const open = opts.open ? ' open' : '';
    const compact = opts.compact ? ' compact-v53' : '';
    return `<details class="image-memory-v53${compact}"${open}>
      <summary><span><i>🖼️</i><b>图片记忆</b></span><small>先自己回想，再点开看图</small></summary>
      <div class="image-memory-body-v53">
        ${renderScene(data)}
        <p class="image-memory-hint-v53"><b>联想：</b>${esc(data.hint)}</p>
      </div>
    </details>`;
  }

  root.WordMemoryImageMemory = { build, render };
}(typeof globalThis !== 'undefined' ? globalThis : this));
