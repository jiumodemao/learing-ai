// 多AI 自我诊断层：捕获 JS 错误 + 显示云端状态（调试期使用，稳定后移除）
(function () {
  var banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;' +
    'font-size:12px;padding:6px 10px;display:none;white-space:pre-wrap;word-break:break-all';
  document.body.appendChild(banner);

  function show(msg) {
    banner.textContent = '⚠ ' + msg;
    banner.style.display = 'block';
  }

  window.addEventListener('error', function (e) {
    var src = (e.filename || '').split('/').pop();
    show('JS错误: ' + e.message + ' @ ' + src + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    show('异步错误: ' + ((r && (r.message || r.name)) || String(r)));
  });

  // 右下角云端状态条
  window.__dbgStatus = function () {
    try {
      var sdk = !!window.supabase;
      var cfg = typeof isConfigured === 'function' && isConfigured();
      var client = !!(typeof getSupabase === 'function' && getSupabase());
      var user = !!(typeof getCurrentUser === 'function' && getCurrentUser());
      return 'SDK:' + (sdk ? 'OK' : '缺') + ' | 配置:' + (cfg ? 'OK' : '缺') +
        ' | 客户端:' + (client ? 'OK' : '未建') + ' | 登录:' + (user ? '是' : '否');
    } catch (e) { return '状态读取失败: ' + e.message; }
  };

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var chip = document.createElement('div');
      chip.id = 'cloud-status';
      chip.style.cssText =
        'position:fixed;bottom:8px;right:8px;z-index:99998;background:#111827;color:#fff;' +
        'font-size:11px;padding:4px 8px;border-radius:8px;opacity:.9';
      chip.textContent = window.__dbgStatus();
      document.body.appendChild(chip);
      setInterval(function () {
        var c = document.getElementById('cloud-status');
        if (c) c.textContent = window.__dbgStatus();
      }, 2000);
    }, 1500);
  });
})();
