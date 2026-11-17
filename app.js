/* 业务知识题库 H5 - 视图与交互 */
(function () {
  'use strict';

  var QZ = window.QZ;
  var TYPE_SHORT = QZ.TYPE_SHORT;

  var MODE_TEXT = {
    all: '全部刷题',
    random: '随机练习',
    type: '题型练习',
    wrong: '错题重练',
    fav: '收藏练习',
    retry: '重做错题'
  };

  var S = {
    items: [],
    idx: 0,
    mode: 'random',
    type: '',
    startedAt: 0,
    timer: null,
    blankVal: '',
    shortVal: ''
  };

  /* ---------- 小工具 ---------- */
  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDate(ts) {
    var d = new Date(ts);
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function showView(name) {
    ['home', 'quiz', 'result'].forEach(function (v) {
      var el = byId('view-' + v);
      if (el) el.hidden = (v !== name);
    });
    if (name !== 'quiz') window.scrollTo(0, 0);
  }

  /* ---------- 路由 ---------- */
  function parseQuery(h) {
    var out = {};
    var qi = h.indexOf('?');
    if (qi < 0) return out;
    h.slice(qi + 1).split('&').forEach(function (p) {
      if (!p) return;
      var kv = p.split('=');
      out[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return out;
  }

  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/quiz') === 0) {
      var qs = parseQuery(h);
      startQuiz(qs.mode || 'random', qs.type || '', Number(qs.count) || 0);
    } else if (h.indexOf('#/result') === 0) {
      stopTimer();
      renderResult();
      showView('result');
    } else {
      stopTimer();
      renderHome();
      showView('home');
    }
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var counts = QZ.getCounts();
    var total = counts.single + counts.multi + counts.judge + counts.blank + counts.short;
    var stats = QZ.store.getStats();
    var wrongCount = QZ.store.getWrongIds().length;
    var favCount = QZ.store.getFavIds().length;

    byId('home-total').textContent = total;
    byId('all-total').textContent = total;

    var heroCounts = [
      ['single', '单选'], ['multi', '多选'], ['judge', '判断'], ['blank', '填空'], ['short', '简答']
    ].map(function (x) {
      return '<div class="hs-item"><span class="hs-num">' + counts[x[0]] + '</span><span class="hs-lbl">' + x[1] + '</span></div>';
    }).join('');
    byId('home-counts').innerHTML = heroCounts;

    byId('stat-total').textContent = stats.total;
    byId('stat-correct').textContent = stats.correct;
    byId('stat-rate').textContent = (stats.total ? Math.round(stats.correct / stats.total * 100) : 0) + '%';

    byId('wrong-count').textContent = wrongCount;
    byId('fav-count').textContent = favCount;

    byId('type-grid').innerHTML = [
      ['single', '单选题'], ['multi', '多选题'], ['judge', '判断题'], ['blank', '填空题'], ['short', '简答题']
    ].map(function (x) {
      return '<button type="button" class="type-item t-' + x[0] + '" data-type="' + x[0] + '">' +
        '<span class="ti-name">' + x[1] + '</span>' +
        '<span class="ti-count">' + counts[x[0]] + ' 题</span></button>';
    }).join('');

    var history = QZ.store.getHistory().slice(0, 5);
    var list = byId('history-list');
    if (!history.length) {
      list.innerHTML = '<div class="empty-tip">还没有练习记录，先来 10 题热热身吧</div>';
    } else {
      list.innerHTML = history.map(function (h) {
        var rate = h.total ? Math.round(h.correct / h.total * 100) : 0;
        return '<div class="his-row">' +
          '<span class="his-mode">' + esc(MODE_TEXT[h.mode] || '练习') + '</span>' +
          '<span class="his-rate">' + h.correct + '/' + h.total + ' · ' + rate + '%</span>' +
          '<span class="his-time">' + esc(fmtDate(h.time)) + '</span>' +
          '</div>';
      }).join('');
    }
  }

  /* ---------- 答题页 ---------- */
  function startQuiz(mode, type, count) {
    stopTimer();
    var pool = QZ.buildPool(mode, type, count);
    if (!pool.length) {
      alert('没有可练习的题目');
      if (location.hash !== '#/') location.hash = '#/';
      else route();
      return;
    }
    S.mode = mode;
    S.type = type;
    S.items = pool.map(function (q) {
      return { q: q, state: 0, user: null, pendingSel: null, pending: null, showing: false };
    });
    S.idx = 0;
    S.startedAt = Date.now();
    S.blankVal = '';
    S.shortVal = '';
    showView('quiz');
    renderTop();
    renderQuestion();
    startTimer();
  }

  function renderTop() {
    var it = S.items[S.idx];
    if (!it) return;
    var q = it.q;
    var n = S.items.length;
    byId('q-counter').textContent = (S.idx + 1) + ' / ' + n;

    var tag = byId('q-type');
    tag.textContent = TYPE_SHORT[q.type] || '';
    tag.className = 'type-tag t-' + q.type;

    var fav = QZ.store.isFav(q.id);
    var favBtn = byId('q-fav');
    favBtn.textContent = fav ? '★' : '☆';
    favBtn.classList.toggle('on', fav);

    var answered = 0;
    for (var i = 0; i < n; i++) if (S.items[i].state !== 0) answered++;
    byId('q-progress').style.width = Math.round((answered / n) * 100) + '%';
    byId('q-next').textContent = (S.idx === n - 1) ? '交卷' : '下一题';
  }

  function judgeCls(val, q, answered, sel) {
    if (!answered) return sel.indexOf(val) >= 0 ? ' sel' : '';
    if (q.answer === val) return ' right';
    if (sel.indexOf(val) >= 0) return ' wrong';
    return '';
  }

  function renderQuestion() {
    var it = S.items[S.idx];
    var q = it.q;
    var answered = it.state !== 0;

    var sel = [];
    if (answered) {
      sel = Array.isArray(it.user) ? it.user.slice() : [String(it.user)];
    } else if (q.type === 'multi') {
      sel = (it.pendingSel || []).slice();
    }

    var html = '<div class="q-stem"><span class="q-no">' + q.no + '.</span>' + esc(q.stem) + '</div>';

    if (q.type === 'single' || q.type === 'multi') {
      html += '<div class="opts">';
      q.options.forEach(function (o) {
        var cls = '';
        if (!answered) {
          if (sel.indexOf(o.key) >= 0) cls = ' sel';
        } else if (q.answer.indexOf(o.key) >= 0) {
          cls = ' right';
        } else if (sel.indexOf(o.key) >= 0) {
          cls = ' wrong';
        }
        html += '<button type="button" class="opt' + cls + '" data-key="' + o.key + '">' +
          '<span class="opt-key">' + o.key + '</span>' +
          '<span class="opt-text">' + esc(o.text) + '</span></button>';
      });
      html += '</div>';
      if (q.type === 'multi' && !answered) {
        html += '<button type="button" class="btn-main" id="submit-multi">提交答案</button>';
      }
    } else if (q.type === 'judge') {
      html += '<div class="judge-wrap">' +
        '<button type="button" class="judge-btn' + judgeCls('正确', q, answered, sel) + '" data-val="正确">正确</button>' +
        '<button type="button" class="judge-btn' + judgeCls('错误', q, answered, sel) + '" data-val="错误">错误</button>' +
        '</div>';
    } else if (q.type === 'blank') {
      html += '<input class="blank-input" id="blank-input" type="text" autocomplete="off" ' +
        'placeholder="请输入答案，提交后自动判分" value="' +
        esc(answered ? (it.user || '') : S.blankVal) + '"' + (answered ? ' disabled' : '') + '>';
      if (!answered) {
        html += '<button type="button" class="btn-main" id="submit-blank">提交答案</button>';
      }
    } else if (q.type === 'short') {
      var showAnswer = answered || it.showing;
      var val = answered ? (it.user || '') : (it.showing ? (it.pending || '') : S.shortVal);
      html += '<textarea class="short-input" id="short-input" placeholder="写写你的答案要点，再对照参考答案自评" maxlength="2000"' +
        ((answered || it.showing) ? ' disabled' : '') + '>' + esc(val) + '</textarea>';
      if (!showAnswer) {
        html += '<button type="button" class="btn-main" id="submit-short">查看参考答案</button>';
      }
      if (showAnswer) {
        html += '<div class="answer-box"><div class="answer-title">参考答案</div>' +
          '<div class="answer-text">' + esc(q.answer) + '</div></div>';
      }
      if (showAnswer && !answered) {
        html += '<div class="self-judge">' +
          '<button type="button" class="judge-btn right" data-ok="1">我答对了</button>' +
          '<button type="button" class="judge-btn wrong" data-ok="0">没记住</button>' +
          '</div>';
      }
    }

    if (answered) {
      html += '<div class="feedback ' + (it.state === 1 ? 'ok' : 'bad') + '">' +
        (it.state === 1 ? '✓ 回答正确' : '✗ 回答错误') + '</div>';
      if (it.state !== 1 && q.type !== 'short') {
        html += '<div class="correct-line">正确答案：<span class="correct-val">' +
          esc(QZ.answerText(q)) + '</span></div>';
      }
    }

    byId('q-body').innerHTML = html;
  }

  function mark(state, user) {
    var it = S.items[S.idx];
    it.state = state;
    it.user = user;
    it.showing = false;
    it.pendingSel = null;
    if (state === 2) {
      QZ.store.addWrong(it.q.id);
    } else {
      QZ.store.removeWrong(it.q.id);
    }
    renderTop();
    renderQuestion();
  }

  function goto(i) {
    if (i < 0 || i >= S.items.length) return;
    S.idx = i;
    S.blankVal = '';
    S.shortVal = '';
    renderTop();
    renderQuestion();
    byId('q-body').scrollTop = 0;
  }

  function onTapOption(key) {
    var it = S.items[S.idx];
    var q = it.q;
    if (it.state !== 0) return;

    if (q.type === 'multi') {
      if (!it.pendingSel) it.pendingSel = [];
      var pos = it.pendingSel.indexOf(key);
      if (pos >= 0) it.pendingSel.splice(pos, 1);
      else it.pendingSel.push(key);
      renderQuestion();
      return;
    }
    mark(QZ.checkSingle(q.answer, key) ? 1 : 2, key);
  }

  function onJudge(btn) {
    var it = S.items[S.idx];
    if (it.state !== 0) return;
    if (btn.hasAttribute('data-ok')) {
      var ok = btn.getAttribute('data-ok') === '1';
      mark(ok ? 1 : 2, it.pending || '');
      return;
    }
    var val = btn.getAttribute('data-val');
    mark(QZ.checkJudge(it.q.answer, val) ? 1 : 2, val);
  }

  function onSubmitMulti() {
    var it = S.items[S.idx];
    var sel = it.pendingSel || [];
    if (!sel.length) {
      alert('请先选择答案');
      return;
    }
    mark(QZ.checkMulti(it.q.answer, sel) ? 1 : 2, sel.slice());
  }

  function onSubmitBlank() {
    var v = (S.blankVal || '').trim();
    if (!v) {
      alert('请先输入答案');
      return;
    }
    mark(QZ.checkBlank(S.items[S.idx].q.answer, v) ? 1 : 2, v);
  }

  function onSubmitShort() {
    var it = S.items[S.idx];
    if (it.state !== 0 || it.showing) return;
    it.pending = S.shortVal || '';
    it.showing = true;
    renderQuestion();
  }

  function onNext() {
    if (S.idx < S.items.length - 1) goto(S.idx + 1);
    else finish();
  }

  function finish() {
    var left = 0;
    S.items.forEach(function (it) { if (it.state === 0) left++; });
    if (left > 0 && !confirm('还有 ' + left + ' 题未作答，未作答会记为错误。确定交卷吗？')) return;
    doFinish();
  }

  function doFinish() {
    stopTimer();
    var details = S.items.map(function (it) {
      return {
        id: it.q.id,
        no: it.q.no,
        type: it.q.type,
        stem: it.q.stem,
        options: it.q.options || null,
        answer: it.q.answer,
        user: it.user,
        state: it.state
      };
    });
    var correct = 0;
    details.forEach(function (d) { if (d.state === 1) correct++; });
    var res = {
      mode: S.mode,
      type: S.type,
      total: details.length,
      correct: correct,
      duration: Date.now() - S.startedAt,
      details: details,
      time: Date.now()
    };
    QZ.store.saveResult(res);
    QZ.store.addHistory({
      time: res.time, mode: res.mode, type: res.type,
      total: res.total, correct: correct, duration: res.duration
    });
    QZ.store.addStats(res.total, correct);
    if (location.hash === '#/result') route();
    else location.hash = '#/result';
  }

  /* ---------- 答题卡 ---------- */
  function openCard() {
    var grid = byId('card-grid');
    grid.innerHTML = S.items.map(function (it, i) {
      var cls = it.state === 1 ? ' right' : (it.state === 2 ? ' wrong' : '');
      return '<button type="button" class="cg' + cls + '" data-i="' + i + '">' + (i + 1) + '</button>';
    }).join('');
    byId('card-mask').hidden = false;
  }

  function closeCard() {
    byId('card-mask').hidden = true;
  }

  /* ---------- 收藏 ---------- */
  function toggleFav() {
    var it = S.items[S.idx];
    QZ.store.toggleFav(it.q.id);
    renderTop();
  }

  /* ---------- 计时 ---------- */
  function tick() {
    var s = Math.floor((Date.now() - S.startedAt) / 1000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    byId('q-timer').textContent = pad(m) + ':' + pad(r);
  }

  function startTimer() {
    stopTimer();
    tick();
    S.timer = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (S.timer) {
      clearInterval(S.timer);
      S.timer = null;
    }
  }

  /* ---------- 结果页 ---------- */
  function renderResult() {
    var res = QZ.store.getResult();
    if (!res) {
      location.hash = '#/';
      return;
    }
    var percent = res.total ? Math.round((res.correct / res.total) * 100) : 0;
    var level = percent >= 80 ? 'high' : (percent >= 60 ? 'mid' : 'low');

    byId('score-card').className = 'score-card level-' + level;
    byId('score-correct').textContent = res.correct;
    byId('score-total').textContent = res.total;
    byId('score-meta').textContent =
      '正确率 ' + percent + '% · 用时 ' + QZ.formatDuration(res.duration || 0) +
      ' · ' + (MODE_TEXT[res.mode] || '练习');

    var byType = {};
    var order = [];
    res.details.forEach(function (d) {
      if (!byType[d.type]) {
        byType[d.type] = { label: TYPE_SHORT[d.type] || d.type, total: 0, correct: 0 };
        order.push(d.type);
      }
      byType[d.type].total++;
      if (d.state === 1) byType[d.type].correct++;
    });
    byId('type-stats').innerHTML = order.map(function (t) {
      var s = byType[t];
      var p = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return '<div class="ts-row">' +
        '<span class="ts-name">' + esc(s.label) + '</span>' +
        '<span class="ts-bar"><span class="ts-fill" style="width:' + p + '%"></span></span>' +
        '<span class="ts-val">' + s.correct + '/' + s.total + '</span>' +
        '</div>';
    }).join('');

    var wrong = res.details.filter(function (d) { return d.state !== 1; });
    byId('result-wrong-count').textContent = wrong.length;
    byId('wrong-card').hidden = !wrong.length;
    byId('all-right-card').hidden = wrong.length > 0;
    byId('btn-retry').hidden = !wrong.length;

    byId('wrong-list').innerHTML = wrong.map(function (d, i) {
      return '<div class="wrong-item">' +
        '<div class="wi-head">' +
        '<span class="wi-no">第 ' + (i + 1) + ' 题</span>' +
        '<span class="wi-tag">' + esc(TYPE_SHORT[d.type] || d.type) + '</span>' +
        '<span class="wi-state' + (d.state === 0 ? ' none' : '') + '">' + (d.state === 0 ? '未作答' : '答错') + '</span>' +
        '</div>' +
        '<div class="wi-stem">' + esc(d.stem) + '</div>' +
        '<div class="wi-your">你的答案：' + esc(QZ.userText(d, d.user)) + '</div>' +
        '<div class="wi-answer">正确答案：' + esc(QZ.answerText(d)) + '</div>' +
        '</div>';
    }).join('');
  }

  function onRetry() {
    var res = QZ.store.getResult();
    if (!res) return;
    var ids = res.details.filter(function (d) { return d.state !== 1; }).map(function (d) { return d.id; });
    if (!ids.length) return;
    QZ.store.saveRetry(ids);
    location.hash = '#/quiz?mode=retry';
  }

  function onAgain() {
    var res = QZ.store.getResult();
    if (!res) return;
    if (res.mode === 'random') location.hash = '#/quiz?mode=random&count=' + res.total;
    else if (res.mode === 'type') location.hash = '#/quiz?mode=type&type=' + encodeURIComponent(res.type);
    else if (res.mode === 'all') location.hash = '#/quiz?mode=all';
    else location.hash = '#/quiz?mode=' + res.mode;
  }

  /* ---------- 事件绑定 ---------- */
  function bindHomeEvents() {
    byId('btn-random').addEventListener('click', function (e) {
      var b = e.target.closest('[data-count]');
      if (b) location.hash = '#/quiz?mode=random&count=' + b.getAttribute('data-count');
    });
    byId('btn-all').addEventListener('click', function () {
      location.hash = '#/quiz?mode=all';
    });
    byId('type-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (b) location.hash = '#/quiz?mode=type&type=' + b.getAttribute('data-type');
    });
    byId('btn-wrong').addEventListener('click', function () {
      if (!QZ.store.getWrongIds().length) {
        alert('错题本还是空的哦');
        return;
      }
      location.hash = '#/quiz?mode=wrong';
    });
    byId('btn-fav').addEventListener('click', function () {
      if (!QZ.store.getFavIds().length) {
        alert('还没有收藏题目');
        return;
      }
      location.hash = '#/quiz?mode=fav';
    });
    byId('btn-clear').addEventListener('click', function () {
      if (!QZ.store.getWrongIds().length) return;
      if (confirm('确定清空全部错题记录吗？')) {
        QZ.store.clearWrong();
        renderHome();
      }
    });
  }

  function bindQuizEvents() {
    var body = byId('q-body');

    body.addEventListener('click', function (e) {
      var opt = e.target.closest('.opt');
      if (opt) {
        onTapOption(opt.getAttribute('data-key'));
        return;
      }
      var jb = e.target.closest('.judge-btn');
      if (jb) {
        onJudge(jb);
        return;
      }
      if (e.target.id === 'submit-multi') { onSubmitMulti(); return; }
      if (e.target.id === 'submit-blank') { onSubmitBlank(); return; }
      if (e.target.id === 'submit-short') { onSubmitShort(); }
    });

    body.addEventListener('input', function (e) {
      if (e.target.id === 'blank-input') S.blankVal = e.target.value;
      if (e.target.id === 'short-input') S.shortVal = e.target.value;
    });

    body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.id === 'blank-input') {
        onSubmitBlank();
      }
    });

    byId('q-prev').addEventListener('click', function () { goto(S.idx - 1); });
    byId('q-next').addEventListener('click', onNext);
    byId('q-card').addEventListener('click', openCard);
    byId('q-fav').addEventListener('click', toggleFav);
    byId('card-close').addEventListener('click', closeCard);
    byId('card-mask').addEventListener('click', function (e) {
      if (e.target === byId('card-mask')) closeCard();
    });
    byId('card-grid').addEventListener('click', function (e) {
      var b = e.target.closest('.cg');
      if (!b) return;
      goto(Number(b.getAttribute('data-i')));
      closeCard();
    });
  }

  function bindResultEvents() {
    byId('btn-retry').addEventListener('click', onRetry);
    byId('btn-again').addEventListener('click', onAgain);
    byId('btn-home').addEventListener('click', function () {
      location.hash = '#/';
    });
  }

  function init() {
    bindHomeEvents();
    bindQuizEvents();
    bindResultEvents();
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
