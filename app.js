(function(){
  "use strict";
  var STORAGE="qingshiji-v1";
  var PROFILE="qingshiji-profile-v1";
  var today=new Date().toLocaleDateString("sv-SE");
  var defaultProfile={height:168,weight:62.5,calorieTarget:1400,proteinTarget:80,fatTarget:40,carbsTarget:150,goal:"减脂"};
  var templates=[
    {mealType:"午餐",name:"619 kcal 营养套餐",calories:619,protein:41.79,fat:21.22,carbs:78.09,note:"高蛋白午餐"},
    {mealType:"晚餐",name:"414 kcal 轻食套餐",calories:414,protein:19.39,fat:4.87,carbs:76.98,note:"低脂、主食充足"},
    {mealType:"加餐",name:"鸡蛋 1 个",calories:70,protein:6,fat:5,carbs:.5,note:"简单补充蛋白质"},
    {mealType:"加餐",name:"番茄洋葱土豆汤",calories:30,protein:1,fat:0,carbs:6,note:"约 220g，以汤为主"}
  ];
  function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback}catch(e){return fallback}}
  var meals=load(STORAGE,[]),profile=load(PROFILE,defaultProfile);
  function save(){localStorage.setItem(STORAGE,JSON.stringify(meals));localStorage.setItem(PROFILE,JSON.stringify(profile))}
  function n(value){return Math.round((Number(value)||0)*10)/10}
  function sum(list,key){return list.reduce(function(total,item){return total+(Number(item[key])||0)},0)}
  function escapeHtml(value){var node=document.createElement("div");node.textContent=String(value);return node.innerHTML}
  function showToast(message){var toast=document.getElementById("toast");toast.textContent=message;toast.hidden=false;setTimeout(function(){toast.hidden=true},1800)}
  function openModal(id){document.getElementById(id).hidden=false;document.body.style.overflow="hidden"}
  function closeModals(){document.querySelectorAll(".modal-backdrop").forEach(function(el){el.hidden=true});document.body.style.overflow=""}
  function totalsFor(date){var list=meals.filter(function(m){return m.eatenOn===date});return{list:list,calories:sum(list,"calories"),protein:sum(list,"protein"),fat:sum(list,"fat"),carbs:sum(list,"carbs")}}
  function metric(label,value,target,unit,color){var pct=Math.min(100,Math.round(value/target*100)||0);return '<div class="metric"><div class="metric-head"><span>'+label+'</span><b>'+n(value)+'<small>/'+target+unit+'</small></b></div><div class="track"><span style="width:'+pct+'%;background:'+color+'"></span></div></div>'}
  function advice(t){var calLeft=Math.max(0,profile.calorieTarget-t.calories),proteinLeft=Math.max(0,profile.proteinTarget-t.protein),data;
    if(!t.list.length)data={title:"先记录今天的第一餐",body:"从常用套餐中选一个，或手动输入。记录后我会按你的目标给出下一餐建议。",tags:["目标 "+profile.calorieTarget+" kcal","蛋白质 "+profile.proteinTarget+"g"]};
    else if(calLeft<120)data={title:"今天基本吃够了",body:proteinLeft>10?"蛋白质还差约 "+n(proteinLeft)+"g，但热量空间较少。若饿，优先无糖高蛋白酸奶或少量虾仁。":"总热量与蛋白质已经接近目标，晚间按饥饿感决定，不必为了凑数字继续吃。",tags:["无需忌碳水","留意真实饥饿感"]};
    else if(proteinLeft>25)data={title:"下一餐优先补蛋白",body:"今天还可吃约 "+n(calLeft)+" kcal，蛋白质还差 "+n(proteinLeft)+"g。推荐鸡胸肉 150g 或虾 180g，配一大份蔬菜；饿的话正常加半碗饭。",tags:["高蛋白","蔬菜 300g","主食按饥饿感"]};
    else data={title:"可以正常吃一份均衡餐",body:"还可吃约 "+n(calLeft)+" kcal，蛋白质缺口不大。414 kcal 套餐"+(proteinLeft>8?"加 1 个鸡蛋":"单独吃")+"会比较合适。",tags:["不用去主食","控制额外油脂"]};return data
  }
  function renderToday(){var t=totalsFor(today),left=Math.max(0,profile.calorieTarget-t.calories),pct=Math.min(100,t.calories/profile.calorieTarget*100)||0;
    document.getElementById("total-calories").textContent=n(t.calories);document.getElementById("calories-left").textContent=n(left);document.getElementById("cal-ring").style.setProperty("--progress",pct+"%");
    document.getElementById("metrics").innerHTML=metric("蛋白质",t.protein,profile.proteinTarget,"g","#ff6b45")+metric("脂肪",t.fat,profile.fatTarget,"g","#f3b43f")+metric("碳水",t.carbs,profile.carbsTarget,"g","#557d67");
    document.getElementById("profile-summary").textContent="目标按 "+profile.height+" cm · "+profile.weight+" kg · "+profile.goal+" 设置，可在头像中调整";
    var a=advice(t);document.getElementById("advice-title").textContent=a.title;document.getElementById("advice-body").textContent=a.body;document.getElementById("advice-tags").innerHTML=a.tags.map(function(tag){return"<span>"+tag+"</span>"}).join("");
    var list=document.getElementById("meal-list");if(!t.list.length){list.className="empty";list.innerHTML="<b>今天还没有记录</b><span>点‘添加’记下第一餐，或从套餐库一键加入。</span>";return}list.className="meal-list";
    list.innerHTML=t.list.slice().reverse().map(function(m){var cls=m.mealType==="午餐"?"lunch":m.mealType==="晚餐"?"dinner":m.mealType==="加餐"?"snack":"";var icon=m.mealType==="早餐"?"☀":m.mealType==="午餐"?"◐":m.mealType==="晚餐"?"☾":"•";return '<article class="meal-row"><div class="meal-icon '+cls+'">'+icon+'</div><div class="meal-main"><span>'+escapeHtml(m.mealType)+'</span><h3>'+escapeHtml(m.name)+'</h3><p>蛋白质 '+n(m.protein)+'g · 脂肪 '+n(m.fat)+'g · 碳水 '+n(m.carbs)+'g</p></div><strong class="meal-cal">'+n(m.calories)+'<small> kcal</small></strong><button class="delete" data-delete="'+m.id+'" aria-label="删除 '+escapeHtml(m.name)+'">×</button></article>'}).join("")
  }
  function renderTemplates(){document.getElementById("template-grid").innerHTML=templates.map(function(t,i){return '<article class="template-card"><div class="template-art"><span>'+t.mealType+'</span><b>'+t.calories+'</b><small>kcal</small></div><div class="template-info"><h2>'+t.name+'</h2><p>'+t.note+'</p><div class="macro-tags"><span>P '+t.protein+'g</span><span>F '+t.fat+'g</span><span>C '+t.carbs+'g</span></div><button class="primary" data-template="'+i+'">＋ 记到今天</button></div></article>'}).join("")}
  function renderTrends(){var days=[];for(var offset=6;offset>=0;offset--){var d=new Date();d.setDate(d.getDate()-offset);var key=d.toLocaleDateString("sv-SE"),t=totalsFor(key);days.push({key:key,cal:t.calories,label:key===today?"今天":d.toLocaleDateString("zh-CN",{weekday:"short"})})}var active=days.filter(function(d){return d.cal>0});document.getElementById("daily-average").textContent=active.length?Math.round(sum(active,"cal")/active.length):0;document.getElementById("bar-chart").innerHTML=days.map(function(d){return '<div class="bar-col"><span class="bar-value">'+(d.cal||"—")+'</span><div class="bar-well"><i style="height:'+Math.min(100,d.cal/profile.calorieTarget*100)+'%"></i></div><small>'+d.label+'</small></div>'}).join("")}
  function render(){renderToday();renderTemplates();renderTrends()}
  function fillMeal(t){var form=document.getElementById("meal-form");form.reset();["mealType","name","calories","protein","fat","carbs","note"].forEach(function(key){if(t&&t[key]!==undefined)form.elements[key].value=t[key]});openModal("meal-modal");setTimeout(function(){form.elements.name.focus()},50)}
  function fillProfile(){var form=document.getElementById("profile-form");Object.keys(defaultProfile).forEach(function(key){if(form.elements[key])form.elements[key].value=profile[key]});openModal("profile-modal")}
  function setTab(name){document.querySelectorAll(".tab-page").forEach(function(p){p.classList.toggle("active",p.id==="page-"+name)});document.querySelectorAll("[data-tab]").forEach(function(b){b.classList.toggle("active",b.dataset.tab===name)});window.scrollTo({top:0,behavior:"smooth"})}
  document.getElementById("today-label").textContent="今天 · "+new Date().toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"});
  document.addEventListener("click",function(e){var add=e.target.closest("[data-add]");if(add)return fillMeal();var go=e.target.closest("[data-go]");if(go)return setTab(go.dataset.go);var tab=e.target.closest("[data-tab]");if(tab)return setTab(tab.dataset.tab);var template=e.target.closest("[data-template]");if(template){var t=templates[Number(template.dataset.template)];meals.push(Object.assign({id:Date.now(),eatenOn:today},t));save();render();setTab("today");return showToast("已记入今天")}var del=e.target.closest("[data-delete]");if(del){meals=meals.filter(function(m){return String(m.id)!==del.dataset.delete});save();render();return}if(e.target.closest("[data-close]"))closeModals()});
  document.querySelectorAll(".modal-backdrop").forEach(function(m){m.addEventListener("mousedown",function(e){if(e.target===m)closeModals()})});
  document.getElementById("profile-open").addEventListener("click",fillProfile);document.getElementById("profile-nav").addEventListener("click",fillProfile);
  document.getElementById("meal-form").addEventListener("submit",function(e){e.preventDefault();var data=new FormData(e.target);meals.push({id:Date.now(),eatenOn:today,mealType:data.get("mealType"),name:data.get("name").trim(),calories:Number(data.get("calories"))||0,protein:Number(data.get("protein"))||0,fat:Number(data.get("fat"))||0,carbs:Number(data.get("carbs"))||0,note:data.get("note")||""});save();render();closeModals();showToast("已记入今天")});
  document.getElementById("profile-form").addEventListener("submit",function(e){e.preventDefault();var data=new FormData(e.target);["height","weight","calorieTarget","proteinTarget","fatTarget","carbsTarget"].forEach(function(key){profile[key]=Number(data.get(key))||defaultProfile[key]});save();render();closeModals();showToast("目标已保存")});
  document.getElementById("export-data").addEventListener("click",function(){var blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),profile:profile,meals:meals},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="轻食记备份-"+today+".json";a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModals()});render();
})();
