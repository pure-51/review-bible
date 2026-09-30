/* ────────────────────────────────────────────────────────────────────────
   复习宝典 · 静态存档版适配层

   这个文件只被 deploy/ 里的副本引用。源产物 data/<讲稿>/index.html 一行未改。

   为什么要它：产物的原始设计是"由本地服务 serve.py 提供"—— API key 不能进
   静态文件，所以答疑必须走后端，页面的每一个 /api/* 都指向那个后端。
   GitHub Pages 上只有静态文件，/api/* 必然 404，页面会直接把错误抛到脸上。

   这层把那些请求就地接管，如实说明，而不是让页面报错：
     · 便签读取   → 页面内嵌的快照（本来就是同一份数据）
     · 便签增删改 → 存进访客自己的 localStorage（静态站没有服务端存储）
     · 答疑       → 回一段固定说明，不假装这是 AI 的回答
     · 笔记       → 空列表
   顺手把页头那个指向讲稿库的链接指回本站首页（静态站没有讲稿库）。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  var NOTE =
    '这一份是《复习宝典》的线上静态存档版：页面由本地流水线一次性生成，' +
    '不含后端服务，所以实时 AI 答疑无法在这里运行，完整效果见参赛演示视频。' +
    '页面上的正文、目录、公式、原页对照都可以正常使用，便签会存在你自己的浏览器里。';

  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  var LSKEY = 'fuxi-static-tags:' + location.pathname;

  // ── localStorage 里的便签（只有这份静态版才有，服务端版不用这套）──
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LSKEY)) || []; } catch (e) { return []; }
  }
  function writeLocal(arr) {
    try { localStorage.setItem(LSKEY, JSON.stringify(arr)); } catch (e) {}
  }
  function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function newId() {
    return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
  }

  function json(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 页面的答疑是流式读的（SSE：一行一个 data: {...}），这里照着它的格式喂
  function sse(text) {
    var enc = new TextEncoder();
    var body = new ReadableStream({
      start: function (c) {
        c.enqueue(enc.encode('data: ' + JSON.stringify({ phase: 'text', t: text }) + '\n\n'));
        c.enqueue(enc.encode('data: ' + JSON.stringify({ phase: 'done', html: '<p>' + text + '</p>' }) + '\n\n'));
        c.close();
      }
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    if (url.indexOf('/api/') !== 0) {
      return _fetch ? _fetch(input, init) : Promise.reject(new Error('no fetch'));
    }

    // ── 便签 ──
    if (url.indexOf('/api/tags') === 0) {
      if (method === 'GET') {
        var snap = { tags: [] };
        var el = document.getElementById('tagdata');
        if (el) { try { snap = JSON.parse(el.textContent) || snap; } catch (e) {} }
        return Promise.resolve(json({ tags: (snap.tags || []).concat(readLocal()) }));
      }

      var body = {};
      try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}

      if (url.indexOf('/api/tags/delete') === 0) {
        writeLocal(readLocal().filter(function (t) { return t.id !== body.id; }));
        return Promise.resolve(json({ ok: true }));
      }

      // 页面 POST 上来的是 section，回给它的字段叫 section_id，别弄混
      var list = readLocal(), now = stamp();
      if (body.id) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === body.id) {
            list[i].text = body.text;
            list[i].y = body.y;
            list[i].updated = now;
            writeLocal(list);
            return Promise.resolve(json({ ok: true, tag: list[i] }));
          }
        }
      }
      var t = {
        id: newId(), section_id: body.section, text: body.text,
        y: body.y, created: now, updated: now
      };
      list.push(t);
      writeLocal(list);
      return Promise.resolve(json({ ok: true, tag: t }));
    }

    // ── 答疑笔记：没后端就当作没有 ──
    if (url.indexOf('/api/notes') === 0) {
      return Promise.resolve(json({ ok: true, notes: [] }));
    }

    // ── 答疑 ──
    if (url.indexOf('/api/ask') === 0) {
      return Promise.resolve(sse(NOTE));
    }

    return Promise.resolve(json({ ok: false, error: NOTE }));
  };

  // 页头那个"讲稿库"链接在静态站上是死的，指回本站首页
  function fixHomeLink() {
    var hl = document.querySelector('.home-link');
    if (hl) hl.setAttribute('href', '../');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixHomeLink);
  } else {
    fixHomeLink();
  }
})();
