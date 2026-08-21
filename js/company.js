(function () {
    'use strict';

    var STORAGE_KEY = 'milk_companion_state_v1';
    var HISTORY_KEY = 'milk_companion_history_v1';
    var DEFAULT_PHOTO = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">' +
        '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#F8D8E8"/><stop offset="1" stop-color="#CFE7FF"/></linearGradient></defs>' +
        '<rect width="240" height="240" rx="52" fill="url(#g)"/><circle cx="120" cy="104" r="46" fill="#fff" opacity=".85"/>' +
        '<circle cx="103" cy="98" r="5" fill="#1f2937"/><circle cx="137" cy="98" r="5" fill="#1f2937"/>' +
        '<path d="M100 123c13 12 27 12 40 0" stroke="#1f2937" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<path d="M68 190c14-36 90-36 104 0" fill="#fff" opacity=".8"/></svg>'
    );

    var SUPPORT_LINES = [
        '你先开始，我会陪你一会儿。',
        '不用一下子做完，先完成眼前这一小步。',
        '慢慢来，保持住就很好。',
        '我在这里，专心做这件事就可以。',
        '已经开始了，这就是进度。',
        '累了可以暂停，但不要责怪自己。',
        '把注意力放回这一分钟。',
        '今天的你也在认真生活。',
        '先做 5 分钟，后面再决定。',
        '很好，我们继续。'
    ];

    var companionState = loadState();

    function defaultState() {
        return {
            profile: {
                name: '陪伴',
                photoUrl: DEFAULT_PHOTO,
                statusText: '准备陪你专注'
            },
            timer: {
                mode: 'pomodoro',
                status: 'idle',
                durationMinutes: 25,
                startedAt: null,
                pausedAt: null,
                accumulatedPausedMs: 0,
                elapsedMs: 0,
                intervalId: null
            },
            currentTask: {
                id: null,
                text: ''
            },
            isMuted: false,
            supportLine: SUPPORT_LINES[0]
        };
    }

    function loadState() {
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            return Object.assign(defaultState(), saved || {});
        } catch (e) {
            return defaultState();
        }
    }

    function saveState() {
        var copy = JSON.parse(JSON.stringify(companionState));
        copy.timer.intervalId = null;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    }

    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveSessionRecord(status) {
        var history = loadHistory();
        history.unshift({
            id: 'cmp_' + Date.now(),
            taskId: companionState.currentTask.id,
            taskText: companionState.currentTask.text,
            companionName: companionState.profile.name,
            companionPhotoUrl: companionState.profile.photoUrl,
            mode: companionState.timer.mode,
            durationMinutes: companionState.timer.durationMinutes,
            startedAt: companionState.timer.startedAt,
            endedAt: Date.now(),
            elapsedMs: companionState.timer.elapsedMs,
            status: status,
            isMuted: companionState.isMuted,
            supportLine: companionState.supportLine
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    }

    function pickSupportLine() {
        var index = Math.floor(Math.random() * SUPPORT_LINES.length);
        companionState.supportLine = SUPPORT_LINES[index];
    }

    function formatTime(ms) {
        var totalSeconds = Math.max(0, Math.floor(ms / 1000));
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    function getElapsedMs() {
        var timer = companionState.timer;
        if (!timer.startedAt) return timer.elapsedMs || 0;
        if (timer.status === 'paused') return timer.elapsedMs || 0;
        return Date.now() - timer.startedAt - (timer.accumulatedPausedMs || 0);
    }

    function getDisplayMs() {
        var elapsed = getElapsedMs();
        if (companionState.timer.mode === 'pomodoro') {
            return companionState.timer.durationMinutes * 60 * 1000 - elapsed;
        }
        return elapsed;
    }

    function updateTimer() {
        companionState.timer.elapsedMs = getElapsedMs();
        if (companionState.timer.mode === 'pomodoro' && getDisplayMs() <= 0) {
            completeSession();
            return;
        }
        renderCompanionPanel();
    }

    function startSession() {
        var timer = companionState.timer;
        if (timer.status === 'focusing') return;
        if (timer.status === 'paused') {
            timer.accumulatedPausedMs += Date.now() - timer.pausedAt;
            timer.pausedAt = null;
        } else {
            timer.startedAt = Date.now();
            timer.accumulatedPausedMs = 0;
            timer.elapsedMs = 0;
            pickSupportLine();
        }
        timer.status = 'focusing';
        clearInterval(timer.intervalId);
        timer.intervalId = setInterval(updateTimer, 1000);
        saveState();
        renderCompanionPanel();
    }

    function pauseSession() {
        var timer = companionState.timer;
        if (timer.status !== 'focusing') return;
        timer.elapsedMs = getElapsedMs();
        timer.pausedAt = Date.now();
        timer.status = 'paused';
        clearInterval(timer.intervalId);
        saveState();
        renderCompanionPanel();
    }

    function stopSession() {
        var timer = companionState.timer;
        if (timer.status === 'focusing' && getElapsedMs() > 60000 && !confirm('要结束这次陪伴吗？')) return;
        timer.elapsedMs = getElapsedMs();
        timer.status = 'stopped';
        clearInterval(timer.intervalId);
        saveSessionRecord('stopped');
        saveState();
        renderCompanionPanel();
    }

    function completeSession() {
        companionState.timer.elapsedMs = companionState.timer.durationMinutes * 60 * 1000;
        companionState.timer.status = 'completed';
        clearInterval(companionState.timer.intervalId);
        saveSessionRecord('completed');
        saveState();
        renderCompanionPanel();
        if (!companionState.isMuted && typeof showNotification === 'function') {
            showNotification('这次专注完成了，辛苦啦', 'success', 3000);
        }
    }

    function resetSession() {
        clearInterval(companionState.timer.intervalId);
        companionState.timer.status = 'idle';
        companionState.timer.startedAt = null;
        companionState.timer.pausedAt = null;
        companionState.timer.accumulatedPausedMs = 0;
        companionState.timer.elapsedMs = 0;
        saveState();
        renderCompanionPanel();
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
        });
    }

    function injectStyles() {
        if (document.getElementById('companion-style')) return;
        var style = document.createElement('style');
        style.id = 'companion-style';
        style.textContent = [
            '#companion-modal .modal-content{max-width:390px;padding:0;overflow:hidden;background:var(--primary-bg);}',
            '.cmp-wrap{padding:20px 18px 16px;font-family:var(--font-family);color:var(--text-primary);}',
            '.cmp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}',
            '.cmp-title{font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;}',
            '.cmp-close{border:0;background:transparent;color:var(--text-secondary);font-size:18px;cursor:pointer;padding:4px 8px;border-radius:8px;}',
            '.cmp-profile{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 14px;}',
            '.cmp-photo-btn{width:108px;height:108px;border:0;border-radius:28px;overflow:hidden;padding:0;background:var(--secondary-bg);box-shadow:0 12px 30px rgba(0,0,0,.12);cursor:pointer;}',
            '.cmp-photo-btn img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.cmp-name{border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-primary);border-radius:12px;padding:8px 12px;text-align:center;font-weight:700;width:min(220px,80%);outline:none;}',
            '.cmp-line{text-align:center;min-height:24px;color:var(--text-secondary);font-size:13px;line-height:1.7;}',
            '.cmp-time{text-align:center;font-size:54px;font-weight:900;letter-spacing:0;color:var(--accent-color);line-height:1;margin:8px 0 14px;font-variant-numeric:tabular-nums;}',
            '.cmp-row{display:flex;gap:8px;margin-bottom:10px;}',
            '.cmp-row>*{flex:1;}',
            '.cmp-input,.cmp-select{border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-primary);border-radius:12px;padding:10px 12px;font-size:13px;outline:none;box-sizing:border-box;width:100%;}',
            '.cmp-status{text-align:center;color:var(--text-secondary);font-size:12px;margin-bottom:12px;}',
            '.cmp-controls{display:grid;grid-template-columns:1fr 1fr 44px 44px;gap:8px;}',
            '.cmp-btn{border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-primary);border-radius:12px;padding:10px 8px;font-size:13px;font-weight:700;cursor:pointer;}',
            '.cmp-btn.primary{background:var(--accent-color);border-color:var(--accent-color);color:#fff;}',
            '.cmp-btn.icon{font-size:14px;padding:10px 0;}',
            '.cmp-history{margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;font-size:12px;color:var(--text-secondary);max-height:88px;overflow:auto;}',
            '.cmp-history-item{display:flex;justify-content:space-between;gap:8px;padding:5px 0;}',
            '.cmp-entry{position:fixed;right:18px;bottom:92px;z-index:1200;width:46px;height:46px;border-radius:16px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--accent-color);box-shadow:0 10px 30px rgba(0,0,0,.16);display:flex;align-items:center;justify-content:center;cursor:pointer;}'
        ].join('');
        document.head.appendChild(style);
    }

    function ensureModal() {
        if (document.getElementById('companion-modal')) return;
        var modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'companion-modal';
        modal.innerHTML =
            '<div class="modal-content">' +
                '<div class="cmp-wrap">' +
                    '<div class="cmp-head">' +
                        '<div class="cmp-title"><i class="fas fa-hourglass-half"></i><span>陪伴</span></div>' +
                        '<button class="cmp-close" id="cmp-close" title="关闭"><i class="fas fa-xmark"></i></button>' +
                    '</div>' +
                    '<div class="cmp-profile">' +
                        '<button class="cmp-photo-btn" id="cmp-photo-btn" title="更换陪伴照片"><img id="cmp-photo" alt="陪伴照片"></button>' +
                        '<input type="file" id="cmp-photo-input" accept="image/*" style="display:none">' +
                        '<input class="cmp-name" id="cmp-name" maxlength="16">' +
                        '<div class="cmp-line" id="cmp-line"></div>' +
                    '</div>' +
                    '<div class="cmp-time" id="cmp-time">25:00</div>' +
                    '<div class="cmp-row">' +
                        '<select class="cmp-select" id="cmp-mode">' +
                            '<option value="pomodoro">番茄钟</option>' +
                            '<option value="countUp">正计时</option>' +
                        '</select>' +
                        '<select class="cmp-select" id="cmp-duration">' +
                            '<option value="15">15 分钟</option>' +
                            '<option value="25">25 分钟</option>' +
                            '<option value="45">45 分钟</option>' +
                            '<option value="60">60 分钟</option>' +
                        '</select>' +
                    '</div>' +
                    '<input class="cmp-input" id="cmp-task" maxlength="80" placeholder="现在要做什么？">' +
                    '<div class="cmp-status" id="cmp-status">准备开始</div>' +
                    '<div class="cmp-controls">' +
                        '<button class="cmp-btn primary" id="cmp-start">开始</button>' +
                        '<button class="cmp-btn" id="cmp-stop">停止</button>' +
                        '<button class="cmp-btn icon" id="cmp-mute" title="静音"><i class="fas fa-volume-high"></i></button>' +
                        '<button class="cmp-btn icon" id="cmp-reset" title="重置"><i class="fas fa-rotate-left"></i></button>' +
                    '</div>' +
                    '<div class="cmp-history" id="cmp-history"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
    }

    function bindModal() {
        var modal = document.getElementById('companion-modal');
        var photoInput = document.getElementById('cmp-photo-input');
        document.getElementById('cmp-close').onclick = function () { hideCompanion(); };
        document.getElementById('cmp-photo-btn').onclick = function () { photoInput.click(); };
        document.getElementById('cmp-start').onclick = function () {
            if (companionState.timer.status === 'focusing') pauseSession();
            else startSession();
        };
        document.getElementById('cmp-stop').onclick = stopSession;
        document.getElementById('cmp-reset').onclick = resetSession;
        document.getElementById('cmp-mute').onclick = function () {
            companionState.isMuted = !companionState.isMuted;
            saveState();
            renderCompanionPanel();
        };
        document.getElementById('cmp-name').oninput = function () {
            companionState.profile.name = this.value.trim() || '陪伴';
            saveState();
        };
        document.getElementById('cmp-task').oninput = function () {
            companionState.currentTask.text = this.value.trim();
            saveState();
        };
        document.getElementById('cmp-mode').onchange = function () {
            if (companionState.timer.status === 'focusing') return;
            companionState.timer.mode = this.value;
            saveState();
            renderCompanionPanel();
        };
        document.getElementById('cmp-duration').onchange = function () {
            companionState.timer.durationMinutes = parseInt(this.value, 10) || 25;
            saveState();
            renderCompanionPanel();
        };
        photoInput.onchange = function (event) {
            var file = event.target.files && event.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                if (typeof showNotification === 'function') showNotification('图片不能超过 2MB', 'warning');
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                companionState.profile.photoUrl = reader.result;
                saveState();
                renderCompanionPanel();
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        };
        modal.addEventListener('click', function (event) {
            if (event.target === modal) hideCompanion();
        });
    }

    function statusLabel(status) {
        return {
            idle: '准备开始',
            focusing: '专注中',
            paused: '已暂停',
            completed: '已完成',
            stopped: '已停止'
        }[status] || '准备开始';
    }

    function renderCompanionPanel() {
        if (!document.getElementById('companion-modal')) return;
        var displayMs = getDisplayMs();
        document.getElementById('cmp-photo').src = companionState.profile.photoUrl || DEFAULT_PHOTO;
        document.getElementById('cmp-name').value = companionState.profile.name || '陪伴';
        document.getElementById('cmp-line').textContent = companionState.supportLine || SUPPORT_LINES[0];
        document.getElementById('cmp-time').textContent = formatTime(displayMs);
        document.getElementById('cmp-mode').value = companionState.timer.mode;
        document.getElementById('cmp-duration').value = String(companionState.timer.durationMinutes);
        document.getElementById('cmp-duration').style.display = companionState.timer.mode === 'pomodoro' ? 'block' : 'none';
        document.getElementById('cmp-task').value = companionState.currentTask.text || '';
        document.getElementById('cmp-status').textContent = statusLabel(companionState.timer.status);
        document.getElementById('cmp-start').textContent = companionState.timer.status === 'focusing' ? '暂停' : (companionState.timer.status === 'paused' ? '继续' : '开始');
        document.getElementById('cmp-mute').innerHTML = companionState.isMuted ? '<i class="fas fa-volume-xmark"></i>' : '<i class="fas fa-volume-high"></i>';
        renderHistory();
    }

    function renderHistory() {
        var box = document.getElementById('cmp-history');
        if (!box) return;
        var rows = loadHistory().slice(0, 3);
        if (!rows.length) {
            box.innerHTML = '还没有专注记录';
            return;
        }
        box.innerHTML = rows.map(function (item) {
            return '<div class="cmp-history-item"><span>' + escapeHtml(item.taskText || '未命名任务') + '</span><span>' + formatTime(item.elapsedMs) + '</span></div>';
        }).join('');
    }

    function showCompanion(taskText, taskId) {
        ensureModal();
        bindModal();
        if (taskText) companionState.currentTask.text = taskText;
        if (taskId) companionState.currentTask.id = taskId;
        saveState();
        renderCompanionPanel();
        var modal = document.getElementById('companion-modal');
        if (typeof showModal === 'function') showModal(modal);
        else modal.style.display = 'flex';
    }

    function hideCompanion() {
        var modal = document.getElementById('companion-modal');
        if (!modal) return;
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }

    function injectEntryPoints() {
        if (!document.getElementById('companion-entry-btn')) {
            var floating = document.createElement('button');
            floating.id = 'companion-entry-btn';
            floating.className = 'cmp-entry';
            floating.title = '陪伴';
            floating.innerHTML = '<i class="fas fa-hourglass-half"></i>';
            floating.onclick = function () { showCompanion(); };
            document.body.appendChild(floating);
        }

        var list = document.querySelector('#advanced-modal .settings-item-list');
        if (list) {
            var item = document.getElementById('companion-function');
            if (!item) {
                item = document.createElement('div');
                item.className = 'settings-item';
                item.id = 'companion-function';
                item.innerHTML = '<i class="fas fa-hourglass-half"></i><span>陪伴</span>';
            }
            item.onclick = function () {
                var advanced = document.getElementById('advanced-modal');
                if (advanced && typeof hideModal === 'function') hideModal(advanced);
                showCompanion();
            };
            var questionnaire = document.getElementById('questionnaire-function');
            if (questionnaire && questionnaire.parentElement === list) {
                questionnaire.insertAdjacentElement('afterend', item);
            } else if (item.parentElement !== list) {
                list.appendChild(item);
            }
        }
    }

    function initCompanion() {
        injectStyles();
        ensureModal();
        bindModal();
        injectEntryPoints();
        renderCompanionPanel();
        if (companionState.timer.status === 'focusing') {
            clearInterval(companionState.timer.intervalId);
            companionState.timer.intervalId = setInterval(updateTimer, 1000);
        }
    }

    window.openCompanion = showCompanion;
    window.companionState = companionState;
    document.addEventListener('DOMContentLoaded', initCompanion);
    setTimeout(injectEntryPoints, 800);
})();
