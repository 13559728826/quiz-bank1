/* 业务知识题库 H5 - 纯逻辑层（取题 / 判分 / 本地存储），不依赖 DOM */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data.js'));
  } else {
    root.QZ = factory(root.QUIZ_BANK);
  }
}(typeof self !== 'undefined' ? self : this, function (bank) {
  'use strict';

  var TYPE_LABEL = { single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题', short: '简答题' };
  var TYPE_SHORT = { single: '单选', multi: '多选', judge: '判断', blank: '填空', short: '简答' };
  var TYPE_ORDER = ['single', 'multi', 'judge', 'blank', 'short'];

  /* ---------- 本地存储 ---------- */
  var LS = (typeof localStorage !== 'undefined') ? localStorage : (function () {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  })();

  var PREFIX = 'bq_h5_';

  function readJSON(key, dflt) {
    try {
      var raw = LS.getItem(PREFIX + key);
      return raw === null ? dflt : JSON.parse(raw);
    } catch (e) {
      return dflt;
    }
  }

  function writeJSON(key, val) {
    try {
      LS.setItem(PREFIX + key, JSON.stringify(val));
    } catch (e) {
      /* 存储不可用时静默降级 */
    }
  }

  var store = {
    getWrongIds: function () { var a = readJSON('wrong', []); return Array.isArray(a) ? a : []; },
    addWrong: function (id) {
      var a = store.getWrongIds();
      if (a.indexOf(id) < 0) { a.push(id); writeJSON('wrong', a); }
    },
    removeWrong: function (id) {
      var a = store.getWrongIds();
      var p = a.indexOf(id);
      if (p >= 0) { a.splice(p, 1); writeJSON('wrong', a); }
    },
    clearWrong: function () { writeJSON('wrong', []); },

    getFavIds: function () { var a = readJSON('fav', []); return Array.isArray(a) ? a : []; },
    isFav: function (id) { return store.getFavIds().indexOf(id) >= 0; },
    toggleFav: function (id) {
      var a = store.getFavIds();
      var p = a.indexOf(id);
      if (p >= 0) { a.splice(p, 1); writeJSON('fav', a); return false; }
      a.push(id);
      writeJSON('fav', a);
      return true;
    },

    getHistory: function () { var a = readJSON('history', []); return Array.isArray(a) ? a : []; },
    addHistory: function (rec) {
      var a = store.getHistory();
      a.unshift(rec);
      if (a.length > 100) a.length = 100;
      writeJSON('history', a);
    },

    getStats: function () {
      var s = readJSON('stats', null);
      if (s && typeof s.total === 'number' && typeof s.correct === 'number') return s;
      return { total: 0, correct: 0 };
    },
    addStats: function (total, correct) {
      var s = store.getStats();
      s.total += total;
      s.correct += correct;
      writeJSON('stats', s);
    },

    saveResult: function (res) { writeJSON('result', res); },
    getResult: function () { return readJSON('result', null); },

    saveRetry: function (ids) { writeJSON('retry', ids); },
    getRetryIds: function () { var a = readJSON('retry', []); return Array.isArray(a) ? a : []; },

    clearAll: function () {
      ['wrong', 'fav', 'history', 'stats', 'result', 'retry'].forEach(function (k) {
        try { LS.removeItem(PREFIX + k); } catch (e) {}
      });
    }
  };

  /* ---------- 题库 ---------- */
  function getCounts() {
    var c = { single: 0, multi: 0, judge: 0, blank: 0, short: 0 };
    for (var i = 0; i < bank.length; i++) {
      if (c[bank[i].type] !== undefined) c[bank[i].type]++;
    }
    return c;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * mode: all | random | type | wrong | fav | retry
   */
  function buildPool(mode, type, count) {
    var pool = bank;
    if (mode === 'type' && type) {
      pool = bank.filter(function (q) { return q.type === type; });
    } else if (mode === 'wrong') {
      var ids = store.getWrongIds();
      pool = bank.filter(function (q) { return ids.indexOf(q.id) >= 0; });
    } else if (mode === 'fav') {
      var fids = store.getFavIds();
      pool = bank.filter(function (q) { return fids.indexOf(q.id) >= 0; });
    } else if (mode === 'retry') {
      var rids = store.getRetryIds();
      pool = bank.filter(function (q) { return rids.indexOf(q.id) >= 0; });
    } else if (mode === 'random') {
      pool = shuffle(bank.slice());
      var n = Number(count) || 0;
      if (n > 0 && n < pool.length) pool = pool.slice(0, n);
    }
    return pool;
  }

  /* ---------- 判分 ---------- */
  function normalizeText(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\s\u00a0\u3000]+/g, '')
      .replace(/[，。、；：！？,.;:!?"'“”‘’（）()《》【】\[\]{}—－\-_~·…\/\\]/g, '')
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); })
      .toLowerCase();
  }

  function sortLetters(s) {
    return String(s || '').split('').sort().join('');
  }

  function checkSingle(answer, user) {
    return String(user === null || user === undefined ? '' : user) === String(answer || '');
  }

  function checkMulti(answer, sel) {
    var user = Array.isArray(sel) ? sel.join('') : String(sel || '');
    return sortLetters(user) === sortLetters(answer);
  }

  function checkJudge(answer, user) {
    return String(user === null || user === undefined ? '' : user) === String(answer || '');
  }

  function checkBlank(answer, user) {
    var a = normalizeText(answer);
    var u = normalizeText(user);
    if (!a || !u) return false;
    return a === u;
  }

  function checkByType(q, user) {
    if (q.type === 'single') return checkSingle(q.answer, user);
    if (q.type === 'multi') return checkMulti(q.answer, user);
    if (q.type === 'judge') return checkJudge(q.answer, user);
    if (q.type === 'blank') return checkBlank(q.answer, user);
    return false;
  }

  function answerText(q) {
    if (q.type === 'single' || q.type === 'multi') {
      var letters = String(q.answer || '').split('');
      var opts = q.options || [];
      var parts = [];
      for (var i = 0; i < letters.length; i++) {
        var t = '';
        for (var j = 0; j < opts.length; j++) {
          if (opts[j].key === letters[i]) { t = opts[j].text; break; }
        }
        parts.push(letters[i] + (t ? '. ' + t : ''));
      }
      return parts.join('；');
    }
    return String(q.answer || '');
  }

  function userText(q, user) {
    if (user === null || user === undefined || user === '') return '未作答';
    if (Array.isArray(user)) {
      if (!user.length) return '未作答';
      var opts = q.options || [];
      var parts = [];
      for (var i = 0; i < user.length; i++) {
        var t = '';
        for (var j = 0; j < opts.length; j++) {
          if (opts[j].key === user[i]) { t = opts[j].text; break; }
        }
        parts.push(user[i] + (t ? '. ' + t : ''));
      }
      return parts.join('；');
    }
    return String(user);
  }

  function formatDuration(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  return {
    TYPE_LABEL: TYPE_LABEL,
    TYPE_SHORT: TYPE_SHORT,
    TYPE_ORDER: TYPE_ORDER,
    store: store,
    getCounts: getCounts,
    shuffle: shuffle,
    buildPool: buildPool,
    normalizeText: normalizeText,
    checkSingle: checkSingle,
    checkMulti: checkMulti,
    checkJudge: checkJudge,
    checkBlank: checkBlank,
    checkByType: checkByType,
    answerText: answerText,
    userText: userText,
    formatDuration: formatDuration,
    bank: bank
  };
}));
