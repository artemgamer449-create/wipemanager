// ===== КОНФИГ =====
// ⚠️ ИЗМЕНИ ЭТУ ССЫЛКУ НА СВОЙ БЕКЕНД!
const BACKEND_URL = 'https://alpharust-wipe.onrender.com'; // Замени на свой URL

// Если бекенд недоступен - используем localStorage
const USE_LOCAL_FALLBACK = true;

// ===== API =====
async function apiRequest(endpoint, method = 'GET', data = null) {
    try {
        const url = `${BACKEND_URL}/api${endpoint}`;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data) options.body = JSON.stringify(data);
        
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('Бекенд недоступен:', error);
        if (USE_LOCAL_FALLBACK) {
            return handleLocalFallback(endpoint, method, data);
        }
        throw error;
    }
}

// ===== ЛОКАЛЬНОЕ ХРАНИЛИЩЕ (резерв) =====
const LOCAL_KEY = 'alpharust_wipe_data';

function getLocalData() {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : { schedules: { 240: { date: null }, 236: { date: null } }, logs: [] };
}

function saveLocalData(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

function handleLocalFallback(endpoint, method, data) {
    const localData = getLocalData();
    
    switch (endpoint) {
        case '/data':
            return localData;
        case '/schedule':
            if (method === 'POST' && data) {
                if (!localData.schedules[data.server]) {
                    localData.schedules[data.server] = {};
                }
                localData.schedules[data.server] = {
                    date: data.date_time,
                    type: data.wipe_type || 'normal',
                    files: data.files || '',
                    message: data.message || ''
                };
                localData.logs.push({
                    server: data.server,
                    action: `📅 Запланирован вайп на ${new Date(data.date_time).toLocaleString('ru-RU')}`,
                    timestamp: new Date().toLocaleString('ru-RU')
                });
                saveLocalData(localData);
                return { status: 'ok' };
            }
            break;
        case '/execute':
            if (method === 'POST' && data) {
                if (localData.schedules[data.server]) {
                    localData.schedules[data.server].date = null;
                }
                localData.logs.push({
                    server: data.server,
                    action: `✅ ${(data.wipe_type || 'normal').toUpperCase()} ВАЙП ВЫПОЛНЕН!`,
                    timestamp: new Date().toLocaleString('ru-RU')
                });
                saveLocalData(localData);
                return { status: 'ok' };
            }
            break;
        case '/clear-queue':
            if (method === 'POST') {
                for (const s in localData.schedules) {
                    localData.schedules[s].date = null;
                }
                saveLocalData(localData);
                return { status: 'ok' };
            }
            break;
        case '/clear-logs':
            if (method === 'POST') {
                localData.logs = [];
                saveLocalData(localData);
                return { status: 'ok' };
            }
            break;
        case '/status':
            return {
                online: true,
                servers: {
                    240: { status: 'online' },
                    236: { status: 'online' }
                }
            };
    }
    return localData;
}

// ===== ОСНОВНЫЕ ФУНКЦИИ =====
async function loadData() {
    try {
        const data = await apiRequest('/data');
        updateBackendStatus(true);
        return data;
    } catch {
        updateBackendStatus(false);
        return getLocalData();
    }
}

async function scheduleWipe(server, dateTime, files, message, wipeType, priority) {
    const result = await apiRequest('/schedule', 'POST', {
        server,
        date_time: dateTime,
        files,
        message,
        wipe_type: wipeType,
        priority
    });
    
    if (result.status === 'ok' || result.error) {
        showNotification(result.error ? `❌ ${result.error}` : '✅ Вайп запланирован!', 
                        result.error ? 'error' : 'success');
        renderAll();
    }
}

async function executeWipe(server, wipeType = 'normal') {
    if (!confirm(`Вы уверены? ${wipeType.toUpperCase()} вайп на сервере ${server}!`)) return;
    
    const result = await apiRequest('/execute', 'POST', {
        server,
        wipe_type: wipeType
    });
    
    if (result.status === 'ok' || result.error) {
        showNotification(result.error ? `❌ ${result.error}` : `✅ ${wipeType.toUpperCase()} вайп выполнен!`,
                        result.error ? 'error' : 'success');
        renderAll();
    }
}

async function clearQueue() {
    if (!confirm('Отменить все запланированные вайпы?')) return;
    await apiRequest('/clear-queue', 'POST');
    showNotification('🗑️ Очередь очищена', 'info');
    renderAll();
}

async function clearLogs() {
    if (!confirm('Очистить лог?')) return;
    await apiRequest('/clear-logs', 'POST');
    showNotification('🗑️ Лог очищен', 'info');
    renderAll();
}

// ===== ОТОБРАЖЕНИЕ =====
async function renderAll() {
    try {
        const data = await loadData();
        renderWipeDates(data);
        renderCountdowns(data);
        renderLogs(data);
        renderQueue(data);
        updateStatus(data);
    } catch (e) {
        console.error('Render error:', e);
    }
}

function renderWipeDates(data) {
    ['240', '236'].forEach(server => {
        const el = document.getElementById(`wipe${server}`);
        const schedule = data.schedules?.[server];
        if (schedule?.date && schedule.date !== 'null') {
            const d = new Date(schedule.date);
            const type = schedule.type === 'global' ? '💀 ГЛОБАЛЬНЫЙ' : '📦 ОБЫЧНЫЙ';
            el.textContent = `${d.toLocaleString('ru-RU')} [${type}]`;
        } else {
            el.textContent = '❌ Не установлен';
        }
    });
}

function renderCountdowns(data) {
    ['240', '236'].forEach(server => {
        const el = document.getElementById(`countdown${server}`);
        const numEl = el?.querySelector('.countdown-number');
        if (!numEl) return;
        
        const schedule = data.schedules?.[server];
        if (!schedule?.date || schedule.date === 'null') {
            numEl.textContent = '⏳ Ожидание...';
            el.className = 'countdown';
            return;
        }

        const target = new Date(schedule.date).getTime();
        const now = Date.now();
        const diff = target - now;

        if (diff <= 0) {
            numEl.textContent = '🚨 ВАЙП!';
            el.className = 'countdown warning';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        numEl.textContent = `${days}д ${hours}ч ${mins}м ${secs}с`;
        el.className = 'countdown';
        if (diff < 3600000) el.classList.add('warning');
    });
}

function renderLogs(data) {
    const container = document.getElementById('logContainer');
    const logs = data.logs || [];
    
    if (!logs.length) {
        container.innerHTML = '<div class="log-empty">⏳ Ожидание действий...</div>';
        return;
    }

    const html = logs.slice().reverse().slice(0, 50).map(entry => {
        const serverClass = entry.server === '240' ? 's240' : 
                           entry.server === '236' ? 's236' : 'ssystem';
        const typeIcon = entry.wipe_type === 'global' ? '💀' : '📦';
        return `
            <div class="log-entry">
                <div class="log-meta">
                    <span class="server-tag ${serverClass}">${typeIcon} ${entry.server || 'SYS'}</span>
                    <span class="timestamp">${entry.timestamp || ''}</span>
                </div>
                <div class="log-action">${entry.action || ''}</div>
                ${entry.message ? `<div style="color:rgba(255,255,255,0.3);font-size:0.7rem;margin-top:4px;">📨 ${entry.message}</div>` : ''}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function renderQueue(data) {
    const el = document.getElementById('wipeQueueStatus');
    if (!el) return;
    const schedules = data.schedules || {};
    const count = Object.values(schedules).filter(s => s?.date && s.date !== 'null').length;
    el.textContent = `📋 Очередь: ${count}`;
}

function updateStatus(data) {
    ['240', '236'].forEach(server => {
        const badge = document.getElementById(`statusBadge${server}`);
        const statusText = document.getElementById(`status${server}`);
        if (badge) {
            const schedule = data.schedules?.[server];
            if (schedule?.date && schedule.date !== 'null') {
                badge.textContent = '⏳ ВАЙП';
                badge.className = 'server-status warning';
                if (statusText) statusText.textContent = 'ВАЙП ЗАПЛАНИРОВАН';
            } else {
                badge.textContent = '● ONLINE';
                badge.className = 'server-status online';
                if (statusText) statusText.textContent = 'ОНЛАЙН';
            }
        }
    });
}

function updateBackendStatus(online) {
    const dot = document.getElementById('backendDot');
    const text = document.getElementById('backendStatusText');
    const info = document.getElementById('backendInfo');
    
    if (dot) {
        dot.className = 'status-dot ' + (online ? 'live' : 'offline');
    }
    if (text) {
        text.textContent = online ? 'Бекенд подключен' : 'Офлайн (локальный режим)';
        text.style.color = online ? '#00ff88' : '#ff6a00';
    }
    if (info) {
        info.textContent = `Бекенд: ${online ? 'подключен' : 'локальный режим'}`;
    }
}

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(text, type = 'info') {
    const colors = {
        info: '#1976d2',
        warning: '#ff9800',
        success: '#4caf50',
        error: '#d32f2f'
    };

    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: ${colors[type] || colors.info};
        color: #fff;
        padding: 18px 28px;
        border-radius: 12px;
        font-weight: 600;
        z-index: 9999;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        max-width: 400px;
        animation: slideIn 0.3s ease;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.8rem;
        letter-spacing: 1px;
    `;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 4000);
}

// ===== СОБЫТИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    // Системное время
    setInterval(() => {
        document.getElementById('systemTime').textContent = new Date().toLocaleTimeString('ru-RU');
    }, 1000);

    renderAll();
    setInterval(renderAll, 1000);

    // Планировать
    document.querySelectorAll('.wipe-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const server = this.dataset.server;
            const type = this.closest('.server-card').querySelector('.wipe-tab.active')?.dataset.type || 'normal';
            document.getElementById('serverSelect').value = server;
            document.getElementById('wipeTypeSelect').value = type;
            document.getElementById('wipeForm').scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Вкладки типа вайпа
    document.querySelectorAll('.wipe-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const parent = this.closest('.server-card');
            parent.querySelectorAll('.wipe-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Сохранить
    document.getElementById('saveWipeBtn').addEventListener('click', () => {
        const server = document.getElementById('serverSelect').value;
        const dateTime = document.getElementById('wipeDateTime').value;
        const wipeType = document.getElementById('wipeTypeSelect').value;
        const files = document.getElementById('filesToDelete').value.trim() || 'map.sav, rust.db';
        const message = document.getElementById('wipeMessage').value.trim() || 'Вайп сервера!';
        const priority = document.getElementById('prioritySelect').value;

        if (!dateTime) {
            showNotification('⚠️ Выберите дату и время!', 'warning');
            return;
        }
        if (new Date(dateTime).getTime() <= Date.now()) {
            showNotification('⚠️ Время должно быть в будущем!', 'warning');
            return;
        }

        scheduleWipe(server, dateTime, files, message, wipeType, priority);
        document.getElementById('wipeDateTime').value = '';
    });

    // Выполнить сейчас
    document.getElementById('executeWipeBtn').addEventListener('click', () => {
        const server = document.getElementById('serverSelect').value;
        const wipeType = document.getElementById('wipeTypeSelect').value;
        executeWipe(server, wipeType);
    });

    // Очистить очередь
    document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);

    // Очистить лог
    document.getElementById('clearLogBtn').addEventListener('click', clearLogs);
});

// Добавляем стиль для offline статуса
const style = document.createElement('style');
style.textContent = `
    .status-dot.offline {
        background: #ff6a00;
        animation: dotPulse 2s infinite;
    }
    .server-status.warning {
        color: #ff6a00;
        animation: dotPulse 1s infinite;
    }
    .wipe-type-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 15px;
    }
    .wipe-tab {
        flex: 1;
        padding: 8px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        color: rgba(255,255,255,0.4);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.6rem;
        cursor: pointer;
        transition: all 0.3s;
        letter-spacing: 1px;
    }
    .wipe-tab.active {
        background: rgba(255,106,0,0.1);
        border-color: rgba(255,106,0,0.3);
        color: #fff;
    }
    .wipe-tab:hover {
        background: rgba(255,255,255,0.05);
    }
    .wipe-actions {
        display: flex;
        gap: 10px;
        margin-top: 10px;
    }
    .wipe-actions .btn {
        flex: 1;
        font-size: 0.6rem;
        padding: 10px;
    }
    .danger-btn {
        border-color: rgba(255,60,60,0.3) !important;
    }
    .danger-btn:hover {
        border-color: #ff3d3d !important;
        box-shadow: 0 0 40px rgba(255,60,60,0.2) !important;
    }
    .backend-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-top: 10px;
        font-size: 0.7rem;
        color: rgba(255,255,255,0.3);
    }
`;
document.head.appendChild(style);
