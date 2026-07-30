(function () {
  "use strict";

  var STORAGE = "qingshiji-v1";
  var PROFILE = "qingshiji-profile-v1";
  var TEMPLATE_STORAGE = "qingshiji-templates-v1";
  var MIGRATION_PREFIX = "qingshiji-supabase-migrated-";
  var SUPABASE_URL = "https://rmdkdbhzmvgfdickybel.supabase.co";
  var SUPABASE_KEY = "sb_publishable_GyMTYjsSYxi1P2_itA3ulw_NKKr_3IV";
  var today = new Date().toLocaleDateString("sv-SE");
  var selectedHistoryDate = today;
  var historyManageMode = false;
  var emptyProfile = {
    height: null,
    weight: null,
    calorieTarget: null,
    proteinTarget: null,
    fatTarget: null,
    carbsTarget: null,
    goal: "",
  };
  var builtInTemplates = [
    { mealType: "午餐", name: "绿皮叔照烧鸡肉健康碗", calories: 549, protein: 39.49, fat: 7.42, carbs: 81.89, note: "高蛋白主力午餐" },
    { mealType: "晚餐", name: "绿皮叔炙烤大虾健康碗", calories: 414, protein: 19.39, fat: 4.87, carbs: 76.98, note: "完整套餐，包含主食" },
    { mealType: "午餐", name: "619 kcal 营养套餐", calories: 619, protein: 41.79, fat: 21.22, carbs: 78.09, note: "历史记录中的高蛋白套餐" },
    { mealType: "早餐", name: "鸡蛋肉堡（少面皮）", calories: 300, protein: 18, fat: 12.5, carbs: 22.5, note: "保留内馅和少量脆皮，数值为估算中值" },
    { mealType: "加餐", name: "青海高原鲜牛奶 230ml", calories: 158, protein: 8.05, fat: 8.74, carbs: 11.73, note: "按包装营养表换算" },
    { mealType: "加餐", name: "鸡蛋 1 个", calories: 70, protein: 6, fat: 5, carbs: 0.5, note: "简单补充蛋白质" },
    { mealType: "加餐", name: "番茄洋葱土豆汤", calories: 30, protein: 1, fat: 0, carbs: 6, note: "约 220g，以汤为主" },
    { mealType: "加餐", name: "香蕉牛奶小面包（去夹心）", calories: 170, protein: 4, fat: 6, carbs: 28, note: "约 57g，去夹心后估算" },
    { mealType: "加餐", name: "红豆千层面包", calories: 239, protein: 4, fat: 4.3, carbs: 42, note: "约 67g，按包装营养表换算" },
  ];

  function load(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function newClientId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "local-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  function ensureMealIdentity(meal) {
    if (!meal.clientId) meal.clientId = String(meal.id || newClientId());
    if (!meal.id) meal.id = meal.clientId;
    return meal;
  }

  function ensureTemplateIdentity(template) {
    if (!template.clientId) template.clientId = String(template.id || newClientId());
    if (!template.id) template.id = template.clientId;
    template.custom = true;
    return template;
  }

  var hadLocalMeals = localStorage.getItem(STORAGE) !== null;
  var hadLocalProfile = localStorage.getItem(PROFILE) !== null;
  var meals = load(STORAGE, []).map(ensureMealIdentity);
  var customTemplates = load(TEMPLATE_STORAGE, []).map(ensureTemplateIdentity);
  var aiMessages = [];
  var aiBusy = false;
  var profile = Object.assign({}, emptyProfile, load(PROFILE, emptyProfile));
  var currentUser = null;
  var loadedUserId = null;
  var profilePrompted = false;
  var dbClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
      })
    : null;

  function saveLocal() {
    localStorage.setItem(STORAGE, JSON.stringify(meals));
    localStorage.setItem(PROFILE, JSON.stringify(profile));
    localStorage.setItem(TEMPLATE_STORAGE, JSON.stringify(customTemplates));
  }

  function n(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }

  function sum(list, key) {
    return list.reduce(function (total, item) {
      return total + (Number(item[key]) || 0);
    }, 0);
  }

  function profileReady() {
    return ["height", "weight", "calorieTarget", "proteinTarget", "fatTarget", "carbsTarget"].every(function (key) {
      return Number(profile[key]) > 0;
    }) && Boolean(profile.goal);
  }

  function escapeHtml(value) {
    var node = document.createElement("div");
    node.textContent = String(value);
    return node.innerHTML;
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    setTimeout(function () {
      toast.hidden = true;
    }, 2200);
  }

  function setSyncState(kind, text) {
    var button = document.getElementById("auth-open");
    button.classList.remove("synced", "syncing", "error");
    if (kind) button.classList.add(kind);
    document.getElementById("sync-label").textContent = text;
  }

  function openModal(id) {
    document.getElementById(id).hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModals() {
    document.querySelectorAll(".modal-backdrop").forEach(function (element) {
      element.hidden = true;
    });
    document.body.style.overflow = "";
  }

  function totalsFor(date) {
    var list = meals.filter(function (meal) {
      return meal.eatenOn === date;
    });
    return {
      list: list,
      calories: sum(list, "calories"),
      protein: sum(list, "protein"),
      fat: sum(list, "fat"),
      carbs: sum(list, "carbs"),
    };
  }

  function metric(label, value, target, unit, color) {
    var pct = Math.min(100, Math.round((value / target) * 100) || 0);
    return '<div class="metric"><div class="metric-head"><span>' + label + "</span><b>" + n(value) + "<small>/" + target + unit + '</small></b></div><div class="track"><span style="width:' + pct + "%;background:" + color + '"></span></div></div>';
  }

  function emptyMetric(label) {
    return '<div class="metric"><div class="metric-head"><span>' + label + '</span><b>待设置</b></div><div class="track"><span style="width:0%"></span></div></div>';
  }

  function advice(totals) {
    if (!profileReady()) {
      return { title: "先填写你的个人目标", body: "身高、体重和营养目标不会由系统替你预设。填写完成后，才会开始计算今日额度和下一餐建议。", tags: ["由你填写", "每个账号独立保存"] };
    }
    var calLeft = Math.max(0, profile.calorieTarget - totals.calories);
    var proteinLeft = Math.max(0, profile.proteinTarget - totals.protein);
    if (!totals.list.length) {
      return { title: "先记录今天的第一餐", body: "从常用套餐中选一个，或手动输入。记录后我会按你的目标给出下一餐建议。", tags: ["目标 " + profile.calorieTarget + " kcal", "蛋白质 " + profile.proteinTarget + "g"] };
    }
    if (calLeft < 120) {
      return { title: "今天基本吃够了", body: proteinLeft > 10 ? "蛋白质还差约 " + n(proteinLeft) + "g，但热量空间较少。若饿，优先无糖高蛋白酸奶或少量虾仁。" : "总热量与蛋白质已经接近目标，晚间按饥饿感决定，不必为了凑数字继续吃。", tags: ["无需忌碳水", "留意真实饥饿感"] };
    }
    if (proteinLeft > 25) {
      return { title: "下一餐优先补蛋白", body: "今天还可吃约 " + n(calLeft) + " kcal，蛋白质还差 " + n(proteinLeft) + "g。推荐鸡胸肉 150g 或虾 180g，配一大份蔬菜；饿的话正常加半碗饭。", tags: ["高蛋白", "蔬菜 300g", "主食按饥饿感"] };
    }
    return { title: "可以正常吃一份均衡餐", body: "还可吃约 " + n(calLeft) + " kcal，蛋白质缺口不大。414 kcal 套餐" + (proteinLeft > 8 ? "加 1 个鸡蛋" : "单独吃") + "会比较合适。", tags: ["不用去主食", "控制额外油脂"] };
  }

  var planMeals = {
    breakfast: { name: "高蛋白酸奶 200g + 燕麦 30g + 半根香蕉", calories: 330, protein: 25, fat: 6, carbs: 45, reason: "把早餐的蛋白质和主食一起补上，饱腹感更稳。" },
    chicken: { name: "鸡胸肉 150g + 时蔬 300g + 米饭 150g", calories: 560, protein: 48, fat: 12, carbs: 60, reason: "蛋白质充足，保留正常主食，不需要只吃菜。" },
    shrimp: { name: "大虾 180g + 时蔬 300g + 米饭 150g", calories: 510, protein: 43, fat: 8, carbs: 62, reason: "脂肪较低，适合今天仍有明显蛋白质缺口时。" },
    light: { name: "大虾 180g + 番茄蔬菜汤 + 半碗饭", calories: 380, protein: 38, fat: 5, carbs: 43, reason: "热量空间不大时，优先保住蛋白质和蔬菜。" },
    snack: { name: "无糖高蛋白酸奶 200g + 半根香蕉", calories: 190, protein: 20, fat: 3, carbs: 25, reason: "只在确实饿时吃，用小份加餐补足蛋白质。" },
    tiny: { name: "无糖高蛋白酸奶 150g", calories: 110, protein: 15, fat: 2, carbs: 8, reason: "临近目标时不必凑满热量，饿了再补这一小份。" },
  };

  function remainingPlan(totals) {
    var calLeft = Math.max(0, profile.calorieTarget - totals.calories);
    var proteinLeft = Math.max(0, profile.proteinTarget - totals.protein);
    var fatLeft = Math.max(0, profile.fatTarget - totals.fat);
    var hour = new Date().getHours();
    var items = [];

    if (calLeft < 120) {
      return { items: [], message: "今天已经接近热量目标。如果没有明显饥饿感，可以不再安排；饿的话优先少量无糖酸奶或清淡蔬菜。" };
    }

    if (!totals.list.length && hour < 10 && calLeft >= 1250) {
      items = [
        { slot: "下一顿 · 早餐", meal: planMeals.breakfast },
        { slot: "午餐", meal: planMeals.chicken },
        { slot: "晚餐", meal: planMeals.shrimp },
      ];
    } else if (calLeft >= 700) {
      var main = proteinLeft > 35 && fatLeft < 18 ? planMeals.shrimp : planMeals.chicken;
      items = [
        { slot: hour < 14 ? "下一顿 · 午餐" : "下一顿 · 晚餐", meal: main },
        { slot: "稍晚 · 饿了再吃", meal: planMeals.snack },
      ];
    } else if (calLeft >= 450) {
      items = [{ slot: hour < 14 ? "下一顿 · 午餐" : "下一顿 · 晚餐", meal: proteinLeft > 28 ? planMeals.light : planMeals.shrimp }];
    } else if (calLeft >= 180) {
      items = [{ slot: "下一次进食", meal: calLeft >= 380 && proteinLeft > 28 ? planMeals.light : planMeals.snack }];
    } else {
      items = [{ slot: "饿了再吃", meal: planMeals.tiny }];
    }

    var plannedCalories = sum(items.map(function (item) { return item.meal; }), "calories");
    while (items.length > 1 && plannedCalories > calLeft + 80) {
      items.pop();
      plannedCalories = sum(items.map(function (item) { return item.meal; }), "calories");
    }
    return { items: items, message: "这是按今天已记录的摄入和当前时间生成的可执行方案，分量与营养值为估算。" };
  }

  function renderRemainingPlan() {
    if (!profileReady()) return fillProfile();
    var totals = totalsFor(today);
    var calLeft = Math.max(0, profile.calorieTarget - totals.calories);
    var proteinLeft = Math.max(0, profile.proteinTarget - totals.protein);
    var plan = remainingPlan(totals);
    var planned = plan.items.map(function (item) { return item.meal; });
    var plannedCalories = sum(planned, "calories");
    var plannedProtein = sum(planned, "protein");
    document.getElementById("plan-lead").textContent = "今天还可安排约 " + n(calLeft) + " kcal，蛋白质还差约 " + n(proteinLeft) + "g。";
    document.getElementById("plan-summary").innerHTML = plan.items.length
      ? '<span>建议安排 <b>' + plan.items.length + '</b> 次</span><span>合计约 <b>' + n(plannedCalories) + ' kcal</b></span><span>蛋白质约 <b>' + n(plannedProtein) + 'g</b></span>'
      : '<span><b>今天无需再安排固定餐次</b></span>';
    document.getElementById("plan-list").innerHTML = plan.items.length
      ? plan.items.map(function (item, index) {
          return '<article class="plan-item"><div class="plan-number">' + (index + 1) + '</div><div class="plan-content"><span>' + escapeHtml(item.slot) + '</span><h3>' + escapeHtml(item.meal.name) + '</h3><p>' + escapeHtml(item.meal.reason) + '</p><div class="plan-macros"><b>' + item.meal.calories + ' kcal</b><span>P ' + item.meal.protein + 'g</span><span>F ' + item.meal.fat + 'g</span><span>C ' + item.meal.carbs + 'g</span></div></div></article>';
        }).join("")
      : '<div class="plan-empty">按真实饥饿感决定即可，不需要为了凑数字继续吃。</div>';
    var unplanned = Math.max(0, calLeft - plannedCalories);
    document.getElementById("plan-note").textContent = plan.message + (plan.items.length && unplanned > 100 ? " 计划后仍留有约 " + n(unplanned) + " kcal 弹性，不必刻意吃满。" : "");
  }

  function mealRow(meal, allowDelete) {
    var cls = meal.mealType === "午餐" ? "lunch" : meal.mealType === "晚餐" ? "dinner" : meal.mealType === "加餐" ? "snack" : "";
    var icon = meal.mealType === "早餐" ? "☀" : meal.mealType === "午餐" ? "◐" : meal.mealType === "晚餐" ? "☾" : "•";
    var deleteControl = allowDelete === "history"
      ? '<button class="delete history-delete" data-history-delete="' + escapeHtml(meal.clientId) + '" aria-label="删除历史记录 ' + escapeHtml(meal.name) + '">×</button>'
      : allowDelete
        ? '<button class="delete" data-delete="' + escapeHtml(meal.clientId) + '" aria-label="删除 ' + escapeHtml(meal.name) + '">×</button>'
        : '<span class="history-lock" aria-label="历史记录默认只读">已保存</span>';
    return '<article class="meal-row"><div class="meal-icon ' + cls + '">' + icon + '</div><div class="meal-main"><span>' + escapeHtml(meal.mealType) + "</span><h3>" + escapeHtml(meal.name) + "</h3><p>蛋白质 " + n(meal.protein) + "g · 脂肪 " + n(meal.fat) + "g · 碳水 " + n(meal.carbs) + 'g</p></div><strong class="meal-cal">' + n(meal.calories) + '<small> kcal</small></strong>' + deleteControl + "</article>";
  }

  function renderToday() {
    var totals = totalsFor(today);
    var ready = profileReady();
    var left = ready ? Math.max(0, profile.calorieTarget - totals.calories) : null;
    var pct = ready ? Math.min(100, (totals.calories / profile.calorieTarget) * 100) || 0 : 0;
    document.getElementById("total-calories").textContent = n(totals.calories);
    document.getElementById("calories-left").textContent = ready ? n(left) : "—";
    document.getElementById("profile-status").textContent = ready ? "目标内" : "待设置";
    document.getElementById("cal-ring").style.setProperty("--progress", pct + "%");
    document.getElementById("metrics").innerHTML = ready
      ? metric("蛋白质", totals.protein, profile.proteinTarget, "g", "#ff6b45") + metric("脂肪", totals.fat, profile.fatTarget, "g", "#f3b43f") + metric("碳水", totals.carbs, profile.carbsTarget, "g", "#557d67")
      : emptyMetric("蛋白质") + emptyMetric("脂肪") + emptyMetric("碳水");
    document.getElementById("profile-summary").textContent = ready ? "目标按 " + profile.height + " cm · " + profile.weight + " kg · " + profile.goal + " 设置，可在头像中调整" : "尚未填写个人资料，系统不会使用内置身高、体重或营养目标。";
    var nextAdvice = advice(totals);
    document.getElementById("advice-title").textContent = nextAdvice.title;
    document.getElementById("advice-body").textContent = nextAdvice.body;
    document.getElementById("advice-tags").innerHTML = nextAdvice.tags.map(function (tag) { return "<span>" + tag + "</span>"; }).join("");
    var list = document.getElementById("meal-list");
    if (!totals.list.length) {
      list.className = "empty";
      list.innerHTML = "<b>今天还没有记录</b><span>点‘添加’记下第一餐，或从套餐库一键加入。</span>";
      return;
    }
    list.className = "meal-list";
    list.innerHTML = totals.list.slice().reverse().map(function (meal) { return mealRow(meal, true); }).join("");
  }

  function renderTemplates() {
    var allTemplates = builtInTemplates.map(function (template, index) {
      return Object.assign({ key: "builtin-" + index, custom: false }, template);
    }).concat(customTemplates.map(function (template) {
      return Object.assign({ key: template.clientId, custom: true }, template);
    }));
    document.getElementById("template-count").textContent = allTemplates.length + " 个搭配";
    document.getElementById("template-grid").innerHTML = allTemplates.map(function (template) {
      var manage = template.custom ? '<button class="template-delete" data-template-delete="' + escapeHtml(template.clientId) + '" aria-label="删除套餐 ' + escapeHtml(template.name) + '">删除</button>' : '<span class="template-origin">内置参考</span>';
      return '<article class="template-card"><div class="template-art"><span>' + escapeHtml(template.mealType) + '</span><b>' + n(template.calories) + '</b><small>kcal</small></div><div class="template-info"><div class="template-meta">' + manage + '</div><h2>' + escapeHtml(template.name) + '</h2><p>' + escapeHtml(template.note || "") + '</p><div class="macro-tags"><span>P ' + n(template.protein) + 'g</span><span>F ' + n(template.fat) + 'g</span><span>C ' + n(template.carbs) + 'g</span></div><button class="primary" data-template-key="' + escapeHtml(template.key) + '">＋ 记到今天</button></div></article>';
    }).join("");
  }

  function findTemplate(key) {
    if (key.indexOf("builtin-") === 0) return builtInTemplates[Number(key.replace("builtin-", ""))];
    return customTemplates.find(function (template) { return template.clientId === key; });
  }

  function renderAiMessages() {
    var container = document.getElementById("ai-messages");
    if (!aiMessages.length) {
      container.innerHTML = '<div class="ai-welcome"><span>✦</span><h2>有什么想聊的？</h2><p>我可以结合你的目标和最近饮食，安排接下来的餐食、复盘趋势，或在吃多以后帮你平稳回到节奏。</p></div>';
      return;
    }
    container.innerHTML = aiMessages.map(function (message) {
      return '<article class="ai-message ' + message.role + '"><span>' + (message.role === "user" ? "我" : "轻食助手") + '</span><div>' + escapeHtml(message.content).replace(/\n/g, "<br>") + '</div></article>';
    }).join("");
    container.scrollTop = container.scrollHeight;
  }

  function aiContext() {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 13);
    var cutoffKey = cutoff.toLocaleDateString("sv-SE");
    var recent = meals.filter(function (meal) { return meal.eatenOn >= cutoffKey; });
    var byDate = {};
    recent.forEach(function (meal) {
      if (!byDate[meal.eatenOn]) byDate[meal.eatenOn] = [];
      byDate[meal.eatenOn].push(meal);
    });
    return {
      today: today,
      profile: profileReady() ? profile : null,
      dailyHistory: Object.keys(byDate).sort().map(function (date) {
        var list = byDate[date];
        return {
          date: date,
          calories: n(sum(list, "calories")),
          protein: n(sum(list, "protein")),
          fat: n(sum(list, "fat")),
          carbs: n(sum(list, "carbs")),
          meals: list.map(function (meal) { return meal.mealType + "：" + meal.name; }),
        };
      }),
    };
  }

  async function persistAiMessage(message) {
    if (!dbClient || !currentUser) return;
    var result = await dbClient.from("ai_messages").insert({ user_id: currentUser.id, role: message.role, content: message.content }).select("*").single();
    if (!result.error && result.data) message.id = result.data.id;
  }

  async function askAi(text) {
    if (aiBusy || !text.trim()) return;
    if (!currentUser) {
      document.getElementById("auth-status").textContent = "请先登录，再使用只读取你个人记录的 AI 助手。";
      return openModal("auth-modal");
    }
    if (!profileReady()) return fillProfile();
    var input = text.trim();
    var userMessage = { role: "user", content: input };
    aiMessages.push(userMessage);
    persistAiMessage(userMessage);
    renderAiMessages();
    aiBusy = true;
    document.getElementById("ai-send").disabled = true;
    document.getElementById("ai-status").textContent = "正在结合你的记录分析…";
    try {
      var result = await dbClient.functions.invoke("nutrition-coach", {
        body: {
          message: input,
          history: aiMessages.slice(-10).map(function (message) { return { role: message.role, content: message.content }; }),
          context: aiContext(),
        },
      });
      if (result.error) throw result.error;
      var reply = result.data && result.data.reply ? result.data.reply : "这次没有生成有效回复，请稍后再试。";
      var assistantMessage = { role: "assistant", content: reply };
      aiMessages.push(assistantMessage);
      await persistAiMessage(assistantMessage);
      renderAiMessages();
      document.getElementById("ai-status").textContent = "建议仅作日常参考，不替代医生或注册营养师。";
    } catch (error) {
      console.error(error);
      document.getElementById("ai-status").textContent = "AI 服务尚未完成配置或暂时不可用，请稍后再试。";
      showToast("AI 助手暂时无法回复");
    } finally {
      aiBusy = false;
      document.getElementById("ai-send").disabled = false;
    }
  }

  function renderTrends() {
    var days = [];
    for (var offset = 6; offset >= 0; offset -= 1) {
      var date = new Date();
      date.setDate(date.getDate() - offset);
      var key = date.toLocaleDateString("sv-SE");
      var totals = totalsFor(key);
      days.push({ key: key, cal: totals.calories, label: key === today ? "今天" : date.toLocaleDateString("zh-CN", { weekday: "short" }) });
    }
    var active = days.filter(function (day) { return day.cal > 0; });
    document.getElementById("daily-average").textContent = active.length ? Math.round(sum(active, "cal") / active.length) : 0;
    document.getElementById("bar-chart").innerHTML = days.map(function (day) {
      var selected = day.key === selectedHistoryDate;
      var chartTarget = profileReady() ? profile.calorieTarget : Math.max(day.cal, 1);
      return '<button type="button" class="bar-col' + (selected ? " selected" : "") + '" data-history-date="' + day.key + '" aria-pressed="' + selected + '" aria-label="查看 ' + day.key + ' 的饮食记录"><span class="bar-value">' + (day.cal || "—") + '</span><span class="bar-well"><i style="height:' + Math.min(100, (day.cal / chartTarget) * 100) + '%"></i></span><small>' + day.label + "</small></button>";
    }).join("");
  }

  function renderHistory() {
    var mealOrder = { "早餐": 0, "午餐": 1, "加餐": 2, "晚餐": 3 };
    var list = meals.filter(function (meal) { return meal.eatenOn === selectedHistoryDate; }).sort(function (a, b) {
      return (mealOrder[a.mealType] || 0) - (mealOrder[b.mealType] || 0);
    });
    var dateLabel = new Date(selectedHistoryDate + "T12:00:00").toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    var picker = document.getElementById("history-date-picker");
    picker.max = today;
    picker.value = selectedHistoryDate;
    document.getElementById("history-title").textContent = selectedHistoryDate === today ? "今天的饮食记录" : dateLabel;
    document.getElementById("history-count").textContent = list.length ? list.length + " 条" : "无记录";
    var manageButton = document.getElementById("history-manage");
    manageButton.hidden = !list.length;
    manageButton.textContent = historyManageMode ? "完成管理" : "··· 管理";
    manageButton.setAttribute("aria-pressed", String(historyManageMode));
    var container = document.getElementById("history-list");
    if (!list.length) {
      historyManageMode = false;
      container.innerHTML = '<div class="empty"><b>这一天没有饮食记录</b><span>点击上方其他日期继续查看。</span></div>';
      return;
    }
    var calories = sum(list, "calories");
    var protein = sum(list, "protein");
    var fat = sum(list, "fat");
    var carbs = sum(list, "carbs");
    var historyState = historyManageMode ? "管理模式 · 删除后无法撤销" : "历史记录已保存";
    container.innerHTML = '<article class="history-day"><div class="history-head"><div><span class="history-date">' + escapeHtml(dateLabel) + "</span><b>" + historyState + '</b></div><div class="history-summary"><strong>' + n(calories) + ' kcal</strong><span>蛋白质 ' + n(protein) + 'g</span><span>脂肪 ' + n(fat) + 'g</span><span>碳水 ' + n(carbs) + 'g</span></div></div><div class="meal-list history-meals">' + list.map(function (meal) { return mealRow(meal, historyManageMode ? "history" : false); }).join("") + "</div></article>";
  }

  function render() {
    renderToday();
    renderTemplates();
    renderTrends();
    renderHistory();
    renderAiMessages();
  }

  function fillMeal(template) {
    var form = document.getElementById("meal-form");
    form.reset();
    ["mealType", "name", "calories", "protein", "fat", "carbs", "note"].forEach(function (key) {
      if (template && template[key] !== undefined) form.elements[key].value = template[key];
    });
    openModal("meal-modal");
    setTimeout(function () { form.elements.name.focus(); }, 50);
  }

  function fillProfile() {
    var form = document.getElementById("profile-form");
    form.reset();
    Object.keys(emptyProfile).forEach(function (key) {
      if (form.elements[key] && profile[key] !== null && profile[key] !== "") form.elements[key].value = profile[key];
    });
    openModal("profile-modal");
  }

  function setTab(name) {
    document.querySelectorAll(".tab-page").forEach(function (page) { page.classList.toggle("active", page.id === "page-" + name); });
    document.querySelectorAll("[data-tab]").forEach(function (button) { button.classList.toggle("active", button.dataset.tab === name); });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function mealToRow(meal, userId) {
    return {
      id: typeof meal.id === "string" && /^[0-9a-f-]{36}$/i.test(meal.id) ? meal.id : undefined,
      user_id: userId,
      client_id: meal.clientId,
      eaten_on: meal.eatenOn,
      meal_type: meal.mealType,
      name: meal.name,
      calories: n(meal.calories),
      protein: n(meal.protein),
      fat: n(meal.fat),
      carbs: n(meal.carbs),
      note: meal.note || "",
    };
  }

  function rowToMeal(row) {
    return {
      id: row.id,
      clientId: row.client_id,
      eatenOn: row.eaten_on,
      mealType: row.meal_type,
      name: row.name,
      calories: Number(row.calories),
      protein: Number(row.protein),
      fat: Number(row.fat),
      carbs: Number(row.carbs),
      note: row.note || "",
    };
  }

  function templateToRow(template, userId) {
    return {
      id: typeof template.id === "string" && /^[0-9a-f-]{36}$/i.test(template.id) ? template.id : undefined,
      user_id: userId,
      client_id: template.clientId,
      meal_type: template.mealType,
      name: template.name,
      calories: n(template.calories),
      protein: n(template.protein),
      fat: n(template.fat),
      carbs: n(template.carbs),
      note: template.note || "",
    };
  }

  function rowToTemplate(row) {
    return ensureTemplateIdentity({
      id: row.id,
      clientId: row.client_id,
      mealType: row.meal_type,
      name: row.name,
      calories: Number(row.calories),
      protein: Number(row.protein),
      fat: Number(row.fat),
      carbs: Number(row.carbs),
      note: row.note || "",
    });
  }

  function profileToRow(userId) {
    return {
      user_id: userId,
      height: n(profile.height),
      weight: n(profile.weight),
      calorie_target: Math.round(profile.calorieTarget),
      protein_target: n(profile.proteinTarget),
      fat_target: n(profile.fatTarget),
      carbs_target: n(profile.carbsTarget),
      goal: profile.goal,
      updated_at: new Date().toISOString(),
    };
  }

  function rowToProfile(row) {
    return {
      height: Number(row.height),
      weight: Number(row.weight),
      calorieTarget: Number(row.calorie_target),
      proteinTarget: Number(row.protein_target),
      fatTarget: Number(row.fat_target),
      carbsTarget: Number(row.carbs_target),
      goal: row.goal || "",
    };
  }

  function updateAuthUI() {
    var signedIn = Boolean(currentUser);
    document.getElementById("auth-signed-out").hidden = signedIn;
    document.getElementById("auth-signed-in").hidden = !signedIn;
    document.getElementById("account-email").textContent = signedIn ? currentUser.email || "已登录" : "";
    document.getElementById("ai-status").textContent = signedIn ? "建议仅作日常参考，不替代医生或注册营养师。" : "需要登录后使用。建议仅作日常参考。";
    document.getElementById("storage-note").textContent = signedIn ? "记录已安全同步到云端，也会在当前设备留下一份缓存。本工具不替代医生或注册营养师的医疗建议。" : "未登录时记录保存在当前浏览器；登录后会安全同步到云端。本工具不替代医生或注册营养师的医疗建议。";
    if (signedIn) setSyncState("synced", currentUser.email || "已同步");
    else setSyncState("", dbClient ? "本机保存 · 登录同步" : "本机保存");
  }

  async function loadRemoteState() {
    if (!dbClient || !currentUser) return;
    var userId = currentUser.id;
    var migrationKey = MIGRATION_PREFIX + userId;
    setSyncState("syncing", "正在同步…");
    try {
      if (!localStorage.getItem(migrationKey)) {
        if (hadLocalProfile && profileReady()) {
          var profileMigration = await dbClient.from("profiles").upsert(profileToRow(userId), { onConflict: "user_id" });
          if (profileMigration.error) throw profileMigration.error;
        }
        if (hadLocalMeals && meals.length) {
          var mealMigration = await dbClient.from("meals").upsert(meals.map(function (meal) { return mealToRow(meal, userId); }), { onConflict: "user_id,client_id" });
          if (mealMigration.error) throw mealMigration.error;
        }
        localStorage.setItem(migrationKey, new Date().toISOString());
      }
      var profileResult = await dbClient.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      if (profileResult.error) throw profileResult.error;
      var mealsResult = await dbClient.from("meals").select("*").eq("user_id", userId).order("eaten_on", { ascending: true }).order("created_at", { ascending: true });
      if (mealsResult.error) throw mealsResult.error;
      if (customTemplates.length) {
        var templateMigration = await dbClient.from("meal_templates").upsert(customTemplates.map(function (template) { return templateToRow(template, userId); }), { onConflict: "user_id,client_id" });
        if (templateMigration.error) throw templateMigration.error;
      }
      var templatesResult = await dbClient.from("meal_templates").select("*").eq("user_id", userId).order("created_at", { ascending: true });
      if (templatesResult.error) throw templatesResult.error;
      var messagesResult = await dbClient.from("ai_messages").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      if (messagesResult.error) throw messagesResult.error;
      profile = profileResult.data ? rowToProfile(profileResult.data) : Object.assign({}, emptyProfile);
      meals = (mealsResult.data || []).map(rowToMeal);
      customTemplates = (templatesResult.data || []).map(rowToTemplate);
      aiMessages = (messagesResult.data || []).slice().reverse().map(function (row) { return { id: row.id, role: row.role, content: row.content }; });
      saveLocal();
      render();
      setSyncState("synced", currentUser.email || "已同步");
      document.getElementById("auth-status").textContent = "同步完成";
      promptProfileIfNeeded();
    } catch (error) {
      console.error(error);
      setSyncState("error", "同步遇到问题");
      document.getElementById("auth-status").textContent = "暂时无法同步，本机记录仍然保留。";
      showToast("同步失败，记录已保存在本机");
    }
  }

  async function persistMeal(meal) {
    saveLocal();
    render();
    if (!dbClient || !currentUser) return;
    setSyncState("syncing", "正在同步…");
    var result = await dbClient.from("meals").upsert(mealToRow(meal, currentUser.id), { onConflict: "user_id,client_id" }).select("*").single();
    if (result.error) {
      console.error(result.error);
      setSyncState("error", "同步遇到问题");
      showToast("已保存在本机，稍后再同步");
      return;
    }
    var syncedMeal = rowToMeal(result.data);
    meals = meals.map(function (item) { return item.clientId === syncedMeal.clientId ? syncedMeal : item; });
    saveLocal();
    setSyncState("synced", currentUser.email || "已同步");
  }

  async function deleteMeal(clientId) {
    meals = meals.filter(function (meal) { return meal.clientId !== clientId; });
    saveLocal();
    render();
    if (!dbClient || !currentUser) return;
    setSyncState("syncing", "正在同步…");
    var result = await dbClient.from("meals").delete().eq("user_id", currentUser.id).eq("client_id", clientId);
    if (result.error) {
      console.error(result.error);
      setSyncState("error", "同步遇到问题");
      showToast("云端删除失败，请稍后重试");
      return;
    }
    setSyncState("synced", currentUser.email || "已同步");
  }

  async function persistTemplate(template) {
    saveLocal();
    renderTemplates();
    if (!dbClient || !currentUser) return;
    setSyncState("syncing", "正在同步…");
    var result = await dbClient.from("meal_templates").upsert(templateToRow(template, currentUser.id), { onConflict: "user_id,client_id" }).select("*").single();
    if (result.error) {
      console.error(result.error);
      setSyncState("error", "同步遇到问题");
      return showToast("套餐已保存在本机，稍后再同步");
    }
    var synced = rowToTemplate(result.data);
    customTemplates = customTemplates.map(function (item) { return item.clientId === synced.clientId ? synced : item; });
    saveLocal();
    setSyncState("synced", currentUser.email || "已同步");
  }

  async function deleteTemplate(clientId) {
    customTemplates = customTemplates.filter(function (template) { return template.clientId !== clientId; });
    saveLocal();
    renderTemplates();
    if (!dbClient || !currentUser) return;
    var result = await dbClient.from("meal_templates").delete().eq("user_id", currentUser.id).eq("client_id", clientId);
    if (result.error) {
      console.error(result.error);
      return showToast("云端删除失败，请稍后再试");
    }
    showToast("套餐已删除");
  }

  async function persistProfile() {
    saveLocal();
    render();
    if (!dbClient || !currentUser) return;
    setSyncState("syncing", "正在同步…");
    var result = await dbClient.from("profiles").upsert(profileToRow(currentUser.id), { onConflict: "user_id" });
    if (result.error) {
      console.error(result.error);
      setSyncState("error", "同步遇到问题");
      showToast("目标已保存在本机，稍后再同步");
      return;
    }
    setSyncState("synced", currentUser.email || "已同步");
  }

  async function handleSession(session) {
    currentUser = session ? session.user : null;
    updateAuthUI();
    if (currentUser && loadedUserId !== currentUser.id) {
      loadedUserId = currentUser.id;
      await loadRemoteState();
    }
    promptProfileIfNeeded();
  }

  function promptProfileIfNeeded() {
    if (profileReady() || profilePrompted) return;
    profilePrompted = true;
    setTimeout(fillProfile, 0);
  }

  document.getElementById("today-label").textContent = "今天 · " + new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });

  document.addEventListener("click", function (event) {
    var historyDay = event.target.closest("[data-history-date]");
    if (historyDay) {
      selectedHistoryDate = historyDay.dataset.historyDate;
      historyManageMode = false;
      renderTrends();
      renderHistory();
      return;
    }
    var add = event.target.closest("[data-add]");
    if (add) return fillMeal();
    var go = event.target.closest("[data-go]");
    if (go) {
      closeModals();
      return setTab(go.dataset.go);
    }
    var tabButton = event.target.closest("[data-tab]");
    if (tabButton) return setTab(tabButton.dataset.tab);
    var templateButton = event.target.closest("[data-template-key]");
    if (templateButton) {
      var template = findTemplate(templateButton.dataset.templateKey);
      if (!template) return;
      var meal = ensureMealIdentity({
        id: newClientId(), eatenOn: today, mealType: template.mealType, name: template.name,
        calories: template.calories, protein: template.protein, fat: template.fat,
        carbs: template.carbs, note: template.note || "",
      });
      meals.push(meal);
      persistMeal(meal);
      setTab("today");
      return showToast("已记入今天");
    }
    var templateDelete = event.target.closest("[data-template-delete]");
    if (templateDelete) return deleteTemplate(templateDelete.dataset.templateDelete);
    var quickAi = event.target.closest("[data-ai-prompt]");
    if (quickAi) return askAi(quickAi.dataset.aiPrompt);
    var historyManage = event.target.closest("[data-history-manage]");
    if (historyManage) {
      historyManageMode = !historyManageMode;
      return renderHistory();
    }
    var historyDelete = event.target.closest("[data-history-delete]");
    if (historyDelete) {
      var historyMeal = meals.find(function (meal) { return meal.clientId === historyDelete.dataset.historyDelete; });
      if (!historyMeal) return;
      if (!window.confirm("确定删除“" + historyMeal.name + "”这条历史记录吗？删除后无法撤销。")) return;
      return deleteMeal(historyDelete.dataset.historyDelete);
    }
    var deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) return deleteMeal(deleteButton.dataset.delete);
    if (event.target.closest("[data-close]")) closeModals();
  });

  document.querySelectorAll(".modal-backdrop").forEach(function (modal) {
    modal.addEventListener("mousedown", function (event) {
      if (event.target === modal) closeModals();
    });
  });

  document.getElementById("history-date-picker").addEventListener("change", function (event) {
    if (!event.target.value) return;
    selectedHistoryDate = event.target.value;
    historyManageMode = false;
    renderTrends();
    renderHistory();
  });

  document.getElementById("profile-open").addEventListener("click", fillProfile);
  document.getElementById("template-add").addEventListener("click", function () {
    document.getElementById("template-form").reset();
    openModal("template-modal");
  });
  document.getElementById("advice-plan-open").addEventListener("click", function () {
    if (!profileReady()) return fillProfile();
    renderRemainingPlan();
    openModal("plan-modal");
  });
  document.getElementById("auth-open").addEventListener("click", function () {
    document.getElementById("auth-status").textContent = "";
    openModal("auth-modal");
  });

  document.getElementById("meal-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(event.target);
    var meal = ensureMealIdentity({
      id: newClientId(),
      eatenOn: today,
      mealType: data.get("mealType"),
      name: data.get("name").trim(),
      calories: Number(data.get("calories")) || 0,
      protein: Number(data.get("protein")) || 0,
      fat: Number(data.get("fat")) || 0,
      carbs: Number(data.get("carbs")) || 0,
      note: data.get("note") || "",
    });
    meals.push(meal);
    persistMeal(meal);
    closeModals();
    showToast("已记入今天");
  });

  document.getElementById("template-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(event.target);
    var template = ensureTemplateIdentity({
      id: newClientId(),
      mealType: data.get("mealType"),
      name: data.get("name").trim(),
      calories: Number(data.get("calories")) || 0,
      protein: Number(data.get("protein")) || 0,
      fat: Number(data.get("fat")) || 0,
      carbs: Number(data.get("carbs")) || 0,
      note: data.get("note") || "",
    });
    customTemplates.push(template);
    persistTemplate(template);
    closeModals();
    showToast("新套餐已保存");
  });

  document.getElementById("ai-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var input = document.getElementById("ai-input");
    var value = input.value;
    input.value = "";
    askAi(value);
  });

  document.getElementById("profile-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(event.target);
    ["height", "weight", "calorieTarget", "proteinTarget", "fatTarget", "carbsTarget"].forEach(function (key) {
      profile[key] = Number(data.get(key));
    });
    profile.goal = data.get("goal");
    persistProfile();
    closeModals();
    showToast("目标已保存");
  });

  function authMessage(error) {
    var message = error && error.message ? error.message : "未知错误";
    if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确";
    if (/email not confirmed/i.test(message)) return "请先完成注册确认，再回来登录";
    if (/user already registered/i.test(message)) return "这个邮箱已经注册，请直接登录";
    if (/password should be at least/i.test(message)) return "密码至少需要 6 位";
    return message;
  }

  function setAuthBusy(form, busy, label) {
    form.querySelectorAll("button").forEach(function (button) { button.disabled = busy; });
    form.querySelector("button[type=submit]").textContent = busy ? label : "登录";
  }

  document.getElementById("auth-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!dbClient) return showToast("同步服务暂时不可用");
    var form = event.target;
    var data = new FormData(form);
    var email = data.get("email").trim();
    var password = data.get("password");
    setAuthBusy(form, true, "正在登录…");
    document.getElementById("auth-status").textContent = "";
    var result = await dbClient.auth.signInWithPassword({
      email: email,
      password: password,
    });
    setAuthBusy(form, false, "");
    if (result.error) {
      console.error(result.error);
      document.getElementById("auth-status").textContent = "登录失败：" + authMessage(result.error);
      return;
    }
    document.getElementById("auth-status").textContent = "登录成功，正在同步…";
  });

  document.getElementById("sign-up").addEventListener("click", async function () {
    if (!dbClient) return showToast("同步服务暂时不可用");
    var form = document.getElementById("auth-form");
    if (!form.reportValidity()) return;
    var data = new FormData(form);
    var email = data.get("email").trim();
    var password = data.get("password");
    setAuthBusy(form, true, "正在注册…");
    document.getElementById("auth-status").textContent = "";
    var result = await dbClient.auth.signUp({ email: email, password: password });
    setAuthBusy(form, false, "");
    if (result.error) {
      console.error(result.error);
      document.getElementById("auth-status").textContent = "注册失败：" + authMessage(result.error);
      return;
    }
    document.getElementById("auth-status").textContent = result.data.session
      ? "注册并登录成功，正在同步…"
      : "注册成功。请完成邮箱确认一次，之后都可直接用密码登录。";
  });

  document.getElementById("sign-out").addEventListener("click", async function () {
    if (!dbClient) return;
    await dbClient.auth.signOut();
    currentUser = null;
    loadedUserId = null;
    meals = [];
    customTemplates = [];
    aiMessages = [];
    profile = Object.assign({}, emptyProfile);
    profilePrompted = false;
    localStorage.removeItem(STORAGE);
    localStorage.removeItem(PROFILE);
    localStorage.removeItem(TEMPLATE_STORAGE);
    render();
    updateAuthUI();
    closeModals();
    showToast("已安全退出");
  });

  document.getElementById("export-data").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: profile, meals: meals, templates: customTemplates, aiMessages: aiMessages }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "轻食记备份-" + today + ".json";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModals();
  });

  render();
  updateAuthUI();
  if (dbClient) {
    dbClient.auth.getSession().then(function (result) {
      handleSession(result.data.session);
    });
    dbClient.auth.onAuthStateChange(function (event, session) {
      setTimeout(function () { handleSession(session); }, 0);
    });
  } else promptProfileIfNeeded();
})();
