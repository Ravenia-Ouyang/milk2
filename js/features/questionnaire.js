(function () {
    'use strict';

    const STORAGE_KEY = 'questionnaireItems';
    const MIN_DELAY = 3 * 60 * 60 * 1000;
    const MAX_DELAY = 5 * 60 * 60 * 1000;
    let items = [];
    let draftQuestions = [];
    let timer = null;

    function storageKey() {
        if (typeof getStorageKey === 'function') return getStorageKey(STORAGE_KEY);
        return 'CHAT_APP_V3_' + STORAGE_KEY;
    }

    function randomDelay() {
        return MIN_DELAY + Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1));
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function formatDueTime(ts) {
        const d = new Date(ts);
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    async function saveItems() {
        try {
            if (window.localforage) await localforage.setItem(storageKey(), items);
            else localStorage.setItem(storageKey(), JSON.stringify(items));
        } catch (e) {
            console.warn('[questionnaire] 保存失败:', e);
        }
    }

    async function loadItems() {
        try {
            const saved = window.localforage
                ? await localforage.getItem(storageKey())
                : JSON.parse(localStorage.getItem(storageKey()) || '[]');
            items = Array.isArray(saved) ? saved : [];
        } catch (e) {
            items = [];
        }
    }

    function ensureStyles() {
        if (document.getElementById('questionnaire-style')) return;
        const style = document.createElement('style');
        style.id = 'questionnaire-style';
        style.textContent = `
            .questionnaire-panel{max-height:86vh;overflow:auto}
            .qn-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-size:13px;color:var(--text-primary)}
            .qn-field input,.qn-field textarea{border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);border-radius:10px;padding:9px 10px;font-family:var(--font-family);font-size:13px}
            .qn-choice-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
            .qn-actions-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
            .qn-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}
            .qn-card{border:1px solid var(--border-color);background:var(--secondary-bg);border-radius:12px;padding:10px 12px}
            .qn-card-title{font-size:13px;line-height:1.45;color:var(--text-primary);margin-bottom:6px}
            .qn-card-meta{font-size:11px;color:var(--text-secondary)}
            .qn-draft-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
            .qn-draft-card{border:1px solid rgba(var(--accent-color-rgb),0.2);background:rgba(var(--accent-color-rgb),0.06);border-radius:12px;padding:10px 12px;position:relative}
            .qn-draft-title{font-size:13px;line-height:1.45;color:var(--text-primary);padding-right:28px}
            .qn-draft-meta{font-size:11px;color:var(--text-secondary);margin-top:4px}
            .qn-draft-remove{position:absolute;right:8px;top:8px;width:24px;height:24px;border:none;border-radius:7px;background:transparent;color:var(--text-secondary);cursor:pointer}
            .qn-draft-remove:hover{background:rgba(255,80,80,0.1);color:#ff5050}
            .qn-empty{font-size:12px;color:var(--text-secondary);text-align:center;padding:16px;border:1px dashed var(--border-color);border-radius:12px}
            @media (max-width:520px){.qn-choice-row,.qn-actions-row{grid-template-columns:1fr}}
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        let modal = document.getElementById('questionnaire-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'questionnaire-modal';
        modal.innerHTML = `
            <div class="modal-content questionnaire-panel">
                <div class="modal-title">
                    <i class="fas fa-clipboard-question"></i><span>问卷</span>
                </div>
                <div class="settings-section">
                    <div class="settings-section-title"><i class="fas fa-pen"></i>编辑问卷</div>
                    <label class="qn-field">
                        <span>问题</span>
                        <textarea id="qn-question" rows="3" placeholder="写下想问的问题"></textarea>
                    </label>
                    <div class="qn-choice-row">
                        <label class="qn-field">
                            <span>选项 A</span>
                            <input id="qn-choice-a" type="text" value="1(是)" placeholder="第一个选项">
                        </label>
                        <label class="qn-field">
                            <span>选项 B</span>
                            <input id="qn-choice-b" type="text" value="2(否)" placeholder="第二个选项">
                        </label>
                    </div>
                    <div class="qn-actions-row">
                        <button class="modal-btn modal-btn-secondary" id="qn-add-question">添加问题</button>
                        <button class="modal-btn modal-btn-primary" id="qn-submit">投递整份问卷</button>
                    </div>
                    <div class="qn-draft-list" id="qn-draft-list"></div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-title"><i class="fas fa-hourglass-half"></i>等待回复</div>
                    <div class="qn-list" id="qn-list"></div>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" id="qn-back"><i class="fas fa-arrow-left"></i> 返回</button>
                    <button class="modal-btn modal-btn-secondary" id="qn-close">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function renderList() {
        const list = document.getElementById('qn-list');
        if (!list) return;
        const pending = items.filter(item => item.status === 'pending');
        if (!pending.length) {
            list.innerHTML = '<div class="qn-empty">暂无等待回复的问卷</div>';
            return;
        }
        list.innerHTML = pending
            .sort((a, b) => a.dueAt - b.dueAt)
            .map(item => `
                <div class="qn-card">
                    <div class="qn-card-title">${escapeHtml(item.title || '问卷')}</div>
                    <div class="qn-card-meta">${getQuestions(item).length} 题 · 预计 ${formatDueTime(item.dueAt)} 后回复</div>
                </div>
            `).join('');
    }

    function getQuestions(item) {
        if (Array.isArray(item.questions)) return item.questions;
        if (item.question) {
            return [{
                question: item.question,
                choiceA: item.choiceA,
                choiceB: item.choiceB
            }];
        }
        return [];
    }

    function renderDraftList() {
        const list = document.getElementById('qn-draft-list');
        if (!list) return;
        if (!draftQuestions.length) {
            list.innerHTML = '<div class="qn-empty">还没有添加问题</div>';
            return;
        }
        list.innerHTML = draftQuestions.map((q, index) => `
            <div class="qn-draft-card">
                <button class="qn-draft-remove" data-index="${index}" title="删除"><i class="fas fa-times"></i></button>
                <div class="qn-draft-title">${index + 1}. ${escapeHtml(q.question)}</div>
                <div class="qn-draft-meta">${escapeHtml(q.choiceA)} / ${escapeHtml(q.choiceB)}</div>
            </div>
        `).join('');
    }

    function clearForm() {
        const q = document.getElementById('qn-question');
        const a = document.getElementById('qn-choice-a');
        const b = document.getElementById('qn-choice-b');
        if (q) q.value = '';
        if (a) a.value = '1(是)';
        if (b) b.value = '2(否)';
    }

    function addDraftQuestion() {
        const question = (document.getElementById('qn-question')?.value || '').trim();
        const choiceA = (document.getElementById('qn-choice-a')?.value || '').trim();
        const choiceB = (document.getElementById('qn-choice-b')?.value || '').trim();
        if (!question || !choiceA || !choiceB) {
            if (typeof showNotification === 'function') showNotification('请填写问题和两个选项', 'warning');
            return false;
        }
        draftQuestions.push({ question, choiceA, choiceB });
        clearForm();
        renderDraftList();
        return true;
    }

    function getPartnerName() {
        try {
            return settings.partnerName || '对方';
        } catch (e) {
            return '对方';
        }
    }

    function deliverResult(item) {
        const questions = getQuestions(item);
        const answers = questions.map((q, index) => ({
            index,
            question: q.question,
            answer: Math.random() < 0.5 ? q.choiceA : q.choiceB
        }));
        item.status = 'answered';
        item.answeredAt = Date.now();
        item.answers = answers;

        const resultLines = answers.map(a => `${a.index + 1}. ${a.question}\n我的选择：${a.answer}`).join('\n\n');
        const text = `问卷回复\n${resultLines}`;
        if (typeof addMessage === 'function') {
            addMessage({
                id: Date.now(),
                sender: getPartnerName(),
                text: text,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                type: 'normal'
            });
        }
        if (typeof playSound === 'function') playSound('message');
        if (typeof window._sendPartnerNotification === 'function') {
            window._sendPartnerNotification(getPartnerName(), '问卷回复已送达');
        }
    }

    async function checkDueItems() {
        const now = Date.now();
        let changed = false;
        items.forEach(item => {
            if (item.status === 'pending' && item.dueAt <= now) {
                deliverResult(item);
                changed = true;
            }
        });
        if (changed) {
            await saveItems();
            if (typeof throttledSaveData === 'function') throttledSaveData();
            renderList();
        }
        scheduleNext();
    }

    function scheduleNext() {
        if (timer) clearTimeout(timer);
        const pending = items.filter(item => item.status === 'pending');
        if (!pending.length) return;
        const nextDue = Math.min(...pending.map(item => item.dueAt));
        const delay = Math.max(1000, Math.min(nextDue - Date.now(), 30 * 60 * 1000));
        timer = setTimeout(checkDueItems, delay);
    }

    async function submitQuestionnaire() {
        const hasTypedQuestion = (document.getElementById('qn-question')?.value || '').trim()
            || (document.getElementById('qn-choice-a')?.value || '').trim()
            || (document.getElementById('qn-choice-b')?.value || '').trim();
        if (hasTypedQuestion && !addDraftQuestion()) return;
        if (!draftQuestions.length) {
            if (typeof showNotification === 'function') showNotification('请先添加至少一个问题', 'warning');
            return;
        }

        const dueAt = Date.now() + randomDelay();
        items.push({
            id: Date.now(),
            title: `问卷（${draftQuestions.length}题）`,
            questions: draftQuestions.map(q => ({ ...q })),
            createdAt: Date.now(),
            dueAt,
            status: 'pending'
        });
        await saveItems();
        draftQuestions = [];
        clearForm();
        renderDraftList();
        renderList();
        scheduleNext();
        if (typeof showNotification === 'function') {
            showNotification(`问卷已投递，预计 ${formatDueTime(dueAt)} 后收到回复`, 'success', 3500);
        }
    }

    async function openQuestionnaire() {
        await loadItems();
        await checkDueItems();
        const modal = ensureModal();
        renderDraftList();
        renderList();
        if (typeof hideModal === 'function') hideModal(document.getElementById('advanced-modal'));
        if (typeof showModal === 'function') showModal(modal);
    }

    function bind() {
        ensureStyles();
        const entry = document.getElementById('questionnaire-function');
        if (entry && entry.dataset.bound !== '1') {
            entry.dataset.bound = '1';
            entry.addEventListener('click', openQuestionnaire);
        }

        document.addEventListener('click', e => {
            if (e.target.closest('#qn-add-question')) addDraftQuestion();
            if (e.target.closest('#qn-submit')) submitQuestionnaire();
            const removeBtn = e.target.closest('.qn-draft-remove');
            if (removeBtn) {
                const index = Number(removeBtn.dataset.index);
                if (!Number.isNaN(index)) {
                    draftQuestions.splice(index, 1);
                    renderDraftList();
                }
            }
            if (e.target.closest('#qn-close')) {
                const modal = document.getElementById('questionnaire-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
            }
            if (e.target.closest('#qn-back')) {
                const modal = document.getElementById('questionnaire-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
                if (typeof showModal === 'function') showModal(document.getElementById('advanced-modal'));
            }
        });

        loadItems().then(() => {
            checkDueItems();
            setInterval(checkDueItems, 10 * 60 * 1000);
        });
    }

    document.addEventListener('DOMContentLoaded', bind);
})();
