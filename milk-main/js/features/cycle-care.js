(function () {
    'use strict';

    const DAY = 24 * 60 * 60 * 1000;

    function getCareSettings() {
        if (typeof settings === 'undefined') window.settings = {};
        if (!settings.periodCare) settings.periodCare = {};
        if (!settings.replyInvites) settings.replyInvites = {};
        settings.periodCare = Object.assign({
            enabled: true,
            lastPeriodDate: '',
            periodLength: 5,
            cycleLength: 28,
            careChance: 0.01,
            duringMessages: [],
            afterMessages: []
        }, settings.periodCare);
        settings.replyInvites = Object.assign({
            enabled: true,
            chance: 0.01,
            items: []
        }, settings.replyInvites);
        if (Number(settings.periodCare.careChance) === 0.45) settings.periodCare.careChance = 0.01;
        if (Number(settings.replyInvites.chance) === 0.25) settings.replyInvites.chance = 0.01;
        return settings;
    }

    function splitLines(value) {
        return String(value || '').split('\n').map(v => v.trim()).filter(Boolean);
    }

    function clampNumber(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.round(n)));
    }

    function daysSinceLastPeriod() {
        const pc = getCareSettings().periodCare;
        if (!pc.lastPeriodDate) return null;
        const start = new Date(pc.lastPeriodDate + 'T00:00:00');
        if (Number.isNaN(start.getTime())) return null;
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return Math.floor((todayStart.getTime() - start.getTime()) / DAY);
    }

    function getCyclePhase() {
        const pc = getCareSettings().periodCare;
        const days = daysSinceLastPeriod();
        if (days === null) return { phase: 'unknown', days: null };
        const cycleLength = clampNumber(pc.cycleLength, 15, 60, 28);
        const periodLength = clampNumber(pc.periodLength, 1, 14, 5);
        const normalized = ((days % cycleLength) + cycleLength) % cycleLength;
        const daysUntilNext = normalized === 0 ? 0 : cycleLength - normalized;
        if (daysUntilNext >= 1 && daysUntilNext <= 3) {
            return { phase: 'before', days, daysUntilNext };
        }
        if (normalized < periodLength) return { phase: 'during', days, daysUntilNext };
        return { phase: 'normal', days, daysUntilNext };
    }

    function pick(list) {
        if (!Array.isArray(list) || !list.length) return '';
        return list[Math.floor(Math.random() * list.length)];
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

    function renderInviteCompanionBlock(text) {
        const id = 'invite-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        return `
<div class="invite-companion-card" data-invite-id="${id}">
    <div class="invite-companion-text">${escapeHtml(text)}</div>
    <div class="invite-companion-actions">
        <button type="button" onclick="window.handleInviteCompanionChoice && window.handleInviteCompanionChoice(this, 'accept')">接受</button>
        <button type="button" onclick="window.handleInviteCompanionChoice && window.handleInviteCompanionChoice(this, 'reject')">拒绝</button>
    </div>
</div>`;
    }

    window.composeCareReplyLine = function (baseText) {
        const s = getCareSettings();
        const additions = [];
        const phase = getCyclePhase();
        const pc = s.periodCare;
        const invites = s.replyInvites;

        if (pc.enabled && phase.phase === 'before' && Math.random() < Number(pc.careChance || 0)) {
            const pool = pc.duringMessages;
            const careLine = pick(pool);
            if (careLine) additions.push(careLine);
        }

        if (invites.enabled && Math.random() < Number(invites.chance || 0)) {
            const inviteLine = pick(invites.items);
            if (inviteLine) additions.push(renderInviteCompanionBlock(inviteLine));
        }

        if (!additions.length) return baseText;
        return [baseText].concat(additions).filter(Boolean).join('\n');
    };

    window.handleInviteCompanionChoice = function (button, choice) {
        const card = button && button.closest ? button.closest('.invite-companion-card') : null;
        if (!card || card.dataset.answered === '1') return;
        card.dataset.answered = '1';
        card.classList.add('answered', choice === 'accept' ? 'accepted' : 'rejected');
        card.querySelectorAll('button').forEach(btn => {
            btn.disabled = true;
            btn.classList.toggle('selected', btn === button);
        });
        const response = choice === 'accept' ? '我接受你的邀请。' : '这次先不了。';
        if (typeof addMessage === 'function') {
            addMessage({
                id: Date.now(),
                sender: 'user',
                text: response,
                timestamp: new Date(),
                status: 'sent',
                favorited: false,
                type: 'normal'
            });
        }
        if (typeof playSound === 'function') playSound('send');
        if (typeof throttledSaveData === 'function') throttledSaveData();
    };

    function ensureModal() {
        let modal = document.getElementById('cycle-care-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'cycle-care-modal';
        modal.innerHTML = `
            <div class="modal-content cycle-care-panel">
                <div class="modal-title">
                    <i class="fas fa-heart-pulse"></i><span>经期照顾</span>
                </div>
                <div class="cycle-care-summary" id="cycle-care-summary"></div>
                <div class="settings-section">
                    <div class="settings-section-title"><i class="fas fa-calendar-days"></i>周期记忆</div>
                    <label class="cc-field"><span>上次开始日期</span><input type="date" id="cc-last-date"></label>
                    <label class="cc-field"><span>经期持续天数</span><input type="number" id="cc-period-length" min="1" max="14"></label>
                    <label class="cc-field"><span>周期天数</span><input type="number" id="cc-cycle-length" min="15" max="60"></label>
                    <label class="cc-toggle"><input type="checkbox" id="cc-care-enabled"><span>预测经期前 3 天加入照顾提醒</span></label>
                    <label class="cc-field"><span>照顾出现概率 %</span><input type="number" id="cc-care-chance" min="0" max="100"></label>
                </div>
                <div class="settings-section">
                    <div class="settings-section-title"><i class="fas fa-hand-holding-heart"></i>角色怎么照顾我</div>
                    <label class="cc-block"><span>预测经期前会说的话（一行一条）</span><textarea id="cc-during-messages" rows="5"></textarea></label>
                    <label class="cc-block"><span>备用照顾话语（一行一条）</span><textarea id="cc-after-messages" rows="4"></textarea></label>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" id="cc-cancel">取消</button>
                    <button class="modal-btn modal-btn-primary" id="cc-save">保存</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function updateSummary() {
        const el = document.getElementById('cycle-care-summary');
        if (!el) return;
        const pc = getCareSettings().periodCare;
        const phase = getCyclePhase();
        if (!pc.lastPeriodDate || phase.days === null) {
            el.textContent = '还没有记录上次经期日期。';
            return;
        }
        if (phase.phase === 'before') {
            el.textContent = `距离上次经期 ${phase.days} 天，预计 ${phase.daysUntilNext} 天后开始，经期照顾提醒会进入随机池。`;
            return;
        }
        const nextText = phase.daysUntilNext === 0 ? '可能是开始日' : `预计 ${phase.daysUntilNext} 天后开始`;
        el.textContent = `距离上次经期 ${phase.days} 天，${nextText}。照顾提醒只会在预计开始前 3 天出现。`;
    }

    function fillForm() {
        const s = getCareSettings();
        document.getElementById('cc-last-date').value = s.periodCare.lastPeriodDate || '';
        document.getElementById('cc-period-length').value = s.periodCare.periodLength || 5;
        document.getElementById('cc-cycle-length').value = s.periodCare.cycleLength || 28;
        document.getElementById('cc-care-enabled').checked = s.periodCare.enabled !== false;
        document.getElementById('cc-care-chance').value = Math.round(Number(s.periodCare.careChance ?? 0.01) * 100);
        document.getElementById('cc-during-messages').value = (s.periodCare.duringMessages || []).join('\n');
        document.getElementById('cc-after-messages').value = (s.periodCare.afterMessages || []).join('\n');
        updateSummary();
    }

    function saveForm() {
        const s = getCareSettings();
        s.periodCare.lastPeriodDate = document.getElementById('cc-last-date').value || '';
        s.periodCare.periodLength = clampNumber(document.getElementById('cc-period-length').value, 1, 14, 5);
        s.periodCare.cycleLength = clampNumber(document.getElementById('cc-cycle-length').value, 15, 60, 28);
        s.periodCare.enabled = document.getElementById('cc-care-enabled').checked;
        s.periodCare.careChance = clampNumber(document.getElementById('cc-care-chance').value, 0, 100, 1) / 100;
        s.periodCare.duringMessages = splitLines(document.getElementById('cc-during-messages').value);
        s.periodCare.afterMessages = splitLines(document.getElementById('cc-after-messages').value);
        if (typeof throttledSaveData === 'function') throttledSaveData();
        if (typeof hideModal === 'function') hideModal(document.getElementById('cycle-care-modal'));
        if (typeof showNotification === 'function') showNotification('经期照顾设置已保存', 'success');
    }

    function syncInviteSettingsUI() {
        const s = getCareSettings();
        const toggle = document.getElementById('reply-invite-toggle');
        const items = document.getElementById('reply-invite-items');
        if (toggle) toggle.classList.toggle('active', s.replyInvites.enabled !== false);
        if (items) items.value = (s.replyInvites.items || []).join('\n');
    }

    function saveInviteSettingsFromUI() {
        const s = getCareSettings();
        const items = document.getElementById('reply-invite-items');
        s.replyInvites.chance = 0.01;
        if (items) s.replyInvites.items = splitLines(items.value);
        if (typeof throttledSaveData === 'function') throttledSaveData();
    }

    function injectStyles() {
        if (document.getElementById('cycle-care-style')) return;
        const style = document.createElement('style');
        style.id = 'cycle-care-style';
        style.textContent = `
            .cycle-care-panel{max-height:86vh;overflow:auto}
            .cycle-care-summary{margin:4px 0 14px;padding:11px 13px;border-radius:12px;background:rgba(var(--accent-color-rgb),0.09);border:1px solid rgba(var(--accent-color-rgb),0.18);font-size:13px;color:var(--text-primary)}
            .cc-field,.cc-block,.cc-toggle{display:flex;gap:8px;margin:10px 0;color:var(--text-primary);font-size:13px}
            .cc-field{align-items:center;justify-content:space-between}
            .cc-field input{width:150px}
            .cc-field input,.cc-block textarea{border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);border-radius:10px;padding:9px 10px;font-family:var(--font-family)}
            .cc-block{flex-direction:column}
            .cc-block textarea{width:100%;resize:vertical;line-height:1.5}
            .cc-toggle{align-items:center}
            .cc-toggle input{width:18px;height:18px;accent-color:var(--accent-color)}
            .invite-companion-card{margin-top:8px;padding:10px;border-radius:12px;border:1px solid rgba(var(--accent-color-rgb),0.22);background:rgba(var(--accent-color-rgb),0.08)}
            .invite-companion-text{font-size:13px;line-height:1.5;margin-bottom:8px}
            .invite-companion-actions{display:flex;gap:8px}
            .invite-companion-actions button{border:1px solid var(--border-color);border-radius:9px;background:var(--primary-bg);color:var(--text-primary);padding:6px 12px;font-size:12px;cursor:pointer;font-family:var(--font-family)}
            .invite-companion-actions button:first-child{background:var(--accent-color);border-color:var(--accent-color);color:#fff}
            .invite-companion-actions button:disabled{opacity:.55;cursor:default}
            .invite-companion-actions button.selected{opacity:1;box-shadow:0 0 0 2px rgba(var(--accent-color-rgb),0.18)}
            @media (max-width:520px){.cc-field{align-items:flex-start;flex-direction:column}.cc-field input{width:100%}}
        `;
        document.head.appendChild(style);
    }

    function bindEntry() {
        injectStyles();
        const entry = document.getElementById('cycle-care-settings');
        if (!entry || entry.dataset.bound === '1') return;
        entry.dataset.bound = '1';
        entry.addEventListener('click', function () {
            const modal = ensureModal();
            fillForm();
            const cancel = document.getElementById('cc-cancel');
            const save = document.getElementById('cc-save');
            if (cancel && cancel.dataset.bound !== '1') {
                cancel.dataset.bound = '1';
                cancel.addEventListener('click', () => {
                    if (typeof hideModal === 'function') hideModal(modal);
                });
            }
            if (save && save.dataset.bound !== '1') {
                save.dataset.bound = '1';
                save.addEventListener('click', saveForm);
            }
            modal.querySelectorAll('input').forEach(input => {
                if (input.dataset.summaryBound === '1') return;
                input.dataset.summaryBound = '1';
                input.addEventListener('input', updateSummary);
            });
            if (typeof hideModal === 'function') hideModal(document.getElementById('settings-modal'));
            if (typeof showModal === 'function') showModal(modal);
        });
    }

    function bindInviteSettings() {
        const toggle = document.getElementById('reply-invite-toggle');
        const items = document.getElementById('reply-invite-items');
        if (!toggle && !items) return;

        syncInviteSettingsUI();

        if (toggle && toggle.dataset.bound !== '1') {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', () => {
                const s = getCareSettings();
                s.replyInvites.enabled = !(s.replyInvites.enabled !== false);
                toggle.classList.toggle('active', s.replyInvites.enabled);
                if (typeof throttledSaveData === 'function') throttledSaveData();
                if (typeof showNotification === 'function') {
                    showNotification(`邀请陪伴已${s.replyInvites.enabled ? '开启' : '关闭'}`, 'success');
                }
            });
        }

        if (items && items.dataset.bound !== '1') {
            items.dataset.bound = '1';
            items.addEventListener('change', saveInviteSettingsFromUI);
            items.addEventListener('blur', saveInviteSettingsFromUI);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindEntry();
        bindInviteSettings();
    });
    window.openCycleCareSettings = function () {
        bindEntry();
        const entry = document.getElementById('cycle-care-settings');
        if (entry) entry.click();
    };
})();
