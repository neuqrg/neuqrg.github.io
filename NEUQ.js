

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 这不是一个CTF题目，不通过阅读源码也可以完成这个谜题，试试看吧

import '@tailwindcss/browser';


// --- DOM 元素引用 ---
const desktop = document.getElementById('desktop'); // 桌面元素
const windows = document.querySelectorAll('.window'); // 所有窗口元素的 NodeList
const icons = document.querySelectorAll('.icon'); // 所有桌面图标元素的 NodeList
const startMenu = document.getElementById('start-menu'); // 开始菜单元素
const startButton = document.getElementById('start-button'); // 开始按钮元素
const taskbarAppsContainer = document.getElementById('taskbar-apps'); // 任务栏应用容器
const taskbarClock = document.getElementById('taskbar-clock'); // 任务栏时钟元素
const volumeIcon = document.getElementById('volume-icon'); // 音量图标
const networkIcon = document.getElementById('network-icon'); // 网络图标


// --- 状态变量 ---
let activeWindow = null; // 当前活动窗口
let highestZIndex = 20; // 用于管理窗口层级的 z-index
const openApps = new Map(); // 存储已打开的应用及其对应的窗口和任务栏按钮
let timelineOffsetMs = 0; // 时间线偏移量 (毫秒)
const timelineStartDate = new Date('2022-08-23T00:00:00'); // 时间线起始日期

// 存储 ResizeObserver 实例，以便之后可以断开连接
const paintResizeObserverMap = new Map();

// --- 扫雷游戏状态变量 ---
let minesweeperTimerInterval = null; // 扫雷计时器
let minesweeperTimeElapsed = 0; // 扫雷游戏已用时间
let minesweeperFlagsPlaced = 0; // 已放置的旗帜数量
let minesweeperGameOver = false; // 游戏是否结束
let minesweeperMineCount = 10; // 雷的数量 (默认为 9x9)
let minesweeperGridSize = { rows: 9, cols: 9 }; // 棋盘大小 (默认为 9x9)
let minesweeperFirstClick = true; // 是否是第一次点击，以确保第一次不会点到雷

// --- Bilibili 播放器状态 ---
const DEFAULT_BILIBILI_URL = 'https://www.bilibili.com/video/BV1GJ411x7h7'; // 默认Bilibili视频

// --- QICQ 聊天记录 ---
const neuqMusicGameChatLog = [
    { user: '时光淡漠i', style: 'color: #00aaff; font-family: "SimSun";', text: '有米有大佬带带chunithm啊' },
    { user: '☆Tonoseihon★', style: 'color: red; font-weight: bold; font-family: "Courier New";', text: '萌新瑟瑟发抖' },
    { user: 'MonianHello', style: 'color: green; font-family: "Comic Sans MS";', text: '你们说的什么啊？听不懂耶 O(∩_∩)O~' },
    { user: 'Pubbysuki', style: 'color: #333; font-style: italic;', text: '我倒' },
    { user: '时光淡漠i', style: 'color: #00aaff; font-family: "SimSun";', text: '不会吧不会吧，不会真的有萌新吧' }
];


// --- 核心函数 ---

/**
 * 将窗口带到最前面并设为活动状态
 * @param {HTMLDivElement} windowElement - 要操作的窗口元素
 */
function bringToFront(windowElement) {
    if (activeWindow === windowElement) return; // 如果已经是活动窗口，则不执行任何操作

    // 如果之前有活动窗口，则移除其活动状态
    if (activeWindow) {
        activeWindow.classList.remove('active');
        const appName = activeWindow.id;
        if (openApps.has(appName)) {
            openApps.get(appName)?.taskbarButton.classList.remove('active');
        }
    }

    // 提高 z-index，将新窗口置于顶层
    highestZIndex++;
    windowElement.style.zIndex = highestZIndex.toString();
    windowElement.classList.add('active');
    activeWindow = windowElement;

    // 更新任务栏按钮的活动状态
    const appNameRef = windowElement.id;
    if (openApps.has(appNameRef)) {
        openApps.get(appNameRef)?.taskbarButton.classList.add('active');
    }
}

/**
 * 打开一个应用程序窗口
 * @param {string} appName - 要打开的应用名称
 */
async function openApp(appName) {
    if (!appName) return;
    
    // 处理特殊命令
    if (appName === 'logoff') {
        location.reload();
        return;
    }
    if (appName === 'shutdown') {
        const desktopEnv = document.getElementById('desktop-environment');
        const shutdownScreen = document.getElementById('shutdown-screen');
        if(desktopEnv) desktopEnv.style.opacity = '0';
        setTimeout(() => {
            if(desktopEnv) desktopEnv.style.display = 'none';
            if(shutdownScreen) shutdownScreen.style.display = 'flex';
        }, 500);
        return;
    }

    const windowElement = document.getElementById(appName);
    if (!windowElement) {
        console.error(`未找到应用窗口元素: ${appName}`);
        return;
    }

    // 如果应用已打开，则将其带到最前
    if (openApps.has(appName)) {
        bringToFront(windowElement);
        windowElement.style.display = 'flex';
        windowElement.classList.add('active');
        // If it's the calendar, refresh it
        if (appName === 'calendarWindow') {
            initCalendar(windowElement);
        }
        return;
    }

    // 显示并激活窗口
    windowElement.style.display = 'flex';
    windowElement.classList.add('active');
    bringToFront(windowElement);

    // 创建任务栏按钮
    const taskbarButton = document.createElement('div');
    taskbarButton.classList.add('taskbar-app');
    taskbarButton.dataset.appName = appName;

    let iconSrc = '';
    let title = appName;
    const iconElement = findIconElement(appName);
    if (iconElement) {
        const img = iconElement.querySelector('img');
        const span = iconElement.querySelector('span');
        if(img) iconSrc = img.src;
        if(span) title = span.textContent || appName;
    } else { // 为从开始菜单打开但桌面无图标的应用提供备用图标和标题
         switch(appName) {
            case 'myComputer': iconSrc = 'static/mycomputer.png'; title = '我的电脑'; break;
            case 'notepad': iconSrc = 'static/GemNotes.png'; title = '记事本'; break;
            case 'paint': iconSrc = 'static/gempaint.png'; title = '画图'; break;
            case 'qicq': iconSrc = 'icons/png/user_computer_pair-0.png'; title = 'QICQ'; break;
            case 'qicqChatNEUQ': iconSrc = 'icons/png/msn3-5.png'; title = 'NEUQ音游同好会（仮）'; break;
            case 'minesweeper': iconSrc = 'static/gemsweeper.png'; title = '扫雷'; break;
            case 'imageViewer': iconSrc = 'icons/png/display_properties-4.png'; title = '图片查看器'; break;
            case 'mediaPlayer': iconSrc = 'static/ytmediaplayer.png'; title = '媒体播放器'; break;
            case 'neuqBrowser': iconSrc = 'static/neuq_icon.png'; title = '东北大学秦皇岛分校'; break;
            case 'qicqPasswordRecovery': iconSrc = 'icons/png/key-2.png'; title = '密码恢复'; break;
            case 'volumeControl': iconSrc = 'icons/png/computer_sound-2.png'; title = '音量控制'; break;
            case 'networkStatus': iconSrc = 'icons/png/network_cool_two_pcs-0.png'; title = '连接状态'; break;
            case 'timelineControl': iconSrc = 'icons/png/channels-0.png'; title = '时空奇点'; break;
            case 'calendarWindow': iconSrc = 'icons/png/time_and_date-0.png'; title = '日期/时间 属性'; break;
         }
    }

    if (iconSrc) {
        const img = document.createElement('img');
        img.src = iconSrc;
        img.alt = title;
        taskbarButton.appendChild(img);
    }
    taskbarButton.appendChild(document.createTextNode(title));

    // 为任务栏按钮添加点击事件
    taskbarButton.addEventListener('click', () => {
        if (windowElement === activeWindow && windowElement.style.display !== 'none') {
             minimizeApp(appName);
        } else {
            windowElement.style.display = 'flex';
            bringToFront(windowElement);
            if (appName === 'calendarWindow') {
                initCalendar(windowElement);
            }
        }
    });

    taskbarAppsContainer.appendChild(taskbarButton);
    openApps.set(appName, { windowEl: windowElement, taskbarButton: taskbarButton });
    taskbarButton.classList.add('active');

    // 根据应用名称初始化特定功能
    if (appName === 'notepad') {
        initNotepad(windowElement);
    }
    else if (appName === 'paint') {
        initSimplePaintApp(windowElement);
    }
    else if (appName === 'qicq') {
        initQicq(windowElement);
    }
     else if (appName === 'qicqPasswordRecovery') {
        initPasswordRecovery(windowElement);
    }
    else if (appName === 'qicqChatNEUQ') {
        initQicqChat(windowElement);
    }
    else if (appName === 'minesweeper') {
        initMinesweeperGame(windowElement);
    }
    else if (appName === 'myComputer') {
        initMyComputer(windowElement);
    }
    else if (appName === 'mediaPlayer') {
        initMediaPlayer(windowElement);
    }
    else if (appName === 'timelineControl') {
        initTimelineControl(windowElement);
    }
    else if (appName === 'calendarWindow') {
        initCalendar(windowElement);
    }
}

/**
 * 关闭一个应用程序窗口
 * @param {string} appName - 要关闭的应用名称
 */
function closeApp(appName) {
    const appData = openApps.get(appName);
    if (!appData) return;

    const { windowEl, taskbarButton } = appData;

    // 隐藏窗口并移除任务栏按钮
    windowEl.style.display = 'none';
    windowEl.classList.remove('active');
    taskbarButton.remove();
    openApps.delete(appName);

    // 如果是画图应用，则清理 ResizeObserver
    if (appName === 'paint') {
         const paintContent = appData.windowEl.querySelector('.window-content');
         if (paintContent && paintResizeObserverMap.has(paintContent)) {
             paintResizeObserverMap.get(paintContent)?.disconnect();
             paintResizeObserverMap.delete(paintContent);
         }
    }

    // 如果是扫雷，则停止计时器
    if (appName === 'minesweeper') {
        if (minesweeperTimerInterval) {
            clearInterval(minesweeperTimerInterval);
            minesweeperTimerInterval = null;
        }
    }

    // 如果是媒体播放器，则清空播放器内容
    if (appName === 'mediaPlayer') {
        const playerDivId = `youtube-player-mediaPlayer`;
        const playerDiv = document.getElementById(playerDivId);
        if (playerDiv) {
            // 清空 iframe 以停止视频播放
            playerDiv.innerHTML = `<p class="media-player-status-message">播放器已关闭。输入 Bilibili 网址以加载。</p>`;
        }
    }

    // 如果关闭的是活动窗口，则激活下一个最高层级的窗口
    if (activeWindow === windowEl) {
        activeWindow = null;
        let nextAppToActivate = null;
        let maxZ = -1;
        openApps.forEach((data) => {
             const z = parseInt(data.windowEl.style.zIndex || '0', 10);
             if (z > maxZ) {
                 maxZ = z;
                 nextAppToActivate = data.windowEl;
             }
        });
        if (nextAppToActivate) {
            bringToFront(nextAppToActivate);
        }
    }
}

/**
 * 最小化一个应用程序窗口
 * @param {string} appName - 要最小化的应用名称
 */
function minimizeApp(appName) {
    const appData = openApps.get(appName);
    if (!appData) return;

    const { windowEl, taskbarButton } = appData;

    // 隐藏窗口并更新任务栏状态
    windowEl.style.display = 'none';
    windowEl.classList.remove('active');
    taskbarButton.classList.remove('active');

    // 如果最小化的是活动窗口，则激活下一个可见的最高层级窗口
    if (activeWindow === windowEl) {
        activeWindow = null;
         let nextAppToActivate = null;
         let maxZ = 0;
         openApps.forEach((data, name) => {
             if (data.windowEl.style.display !== 'none') {
                 const z = parseInt(data.windowEl.style.zIndex || '0', 10);
                 if (z > maxZ) {
                     maxZ = z;
                     nextAppToActivate = name;
                 }
             }
         });
         if (nextAppToActivate) {
             bringToFront(openApps.get(nextAppToActivate).windowEl);
         }
    }
}

// --- QICQ 功能 ---
function initQicq(windowElement) {
    const loginBtn = windowElement.querySelector('.qicq-login-btn');
    const pwInput = windowElement.querySelector('#qicq-pw');
    const statusMsg = windowElement.querySelector('.qicq-status-message');
    const loginView = windowElement.querySelector('.qicq-login-view');
    const mainView = windowElement.querySelector('#qicq-main-view');
    const neuqChatItem = windowElement.querySelector('.qicq-contact-item[data-app="qicqChatNEUQ"]');
    const forgotPasswordLink = windowElement.querySelector('#qicq-forgot-password-link');
    const applyLink = windowElement.querySelector('#qicq-apply-link');
    
    if (!loginBtn || !pwInput || !statusMsg || !loginView || !mainView || !neuqChatItem || !forgotPasswordLink || !applyLink) return;

    let qicqLoginAttempts = 0;

    loginBtn.addEventListener('click', () => {
        if (pwInput.value === 'PROJECTSYNTHESIS') {
            statusMsg.style.color = 'green';
            statusMsg.textContent = '登录成功...';
            loginBtn.disabled = true;
            qicqLoginAttempts = 0; // Reset on success
            setTimeout(() => {
                loginView.style.display = 'none';
                mainView.style.display = 'flex';
                windowElement.querySelector('.window-title').textContent = 'QICQ - 10001';
            }, 1000);
        } else {
            qicqLoginAttempts++;
            statusMsg.style.color = 'red';
            if (qicqLoginAttempts >= 3) {
                 statusMsg.textContent = '密码错误！多次尝试失败，建议使用“忘记密码”功能。';
            } else {
                 statusMsg.textContent = '密码错误！请重试。';
            }
        }
    });
    
    pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        openApp('qicqPasswordRecovery');
    });
    
    applyLink.addEventListener('click', (e) => {
        e.preventDefault();
        statusMsg.style.color = 'red';
        statusMsg.textContent = '错误：此功能不可用。';
    });


    neuqChatItem.addEventListener('click', () => {
        openApp('qicqChatNEUQ');
    });
}

function initPasswordRecovery(windowElement) {
    const submitBtn = windowElement.querySelector('#recovery-submit-btn');
    const q1 = windowElement.querySelector('#sec-q1');
    const q2 = windowElement.querySelectorAll('input[name="sec-q2"]');
    const q3 = windowElement.querySelectorAll('input[name="sec-q3"]');
    const statusMsg = windowElement.querySelector('#recovery-status-message');
    const revealDiv = windowElement.querySelector('#password-reveal');

    submitBtn.addEventListener('click', () => {
        const q1Answer = q1.value.trim().toUpperCase();
        const q2Answered = Array.from(q2).some(r => r.checked);
        const q3Answered = Array.from(q3).some(r => r.checked);

        if (q1Answer !== 'NEUQ') {
            statusMsg.textContent = '问题 1 答案错误。';
            return;
        }
        if (!q2Answered || !q3Answered) {
            statusMsg.textContent = '请回答所有问题。';
            return;
        }
        
        statusMsg.textContent = '';
        revealDiv.style.display = 'block';
    });
}

function initQicqChat(windowElement) {
    const historyDiv = windowElement.querySelector('.qicq-chat-history');
    const sendButton = windowElement.querySelector('.qicq-chat-send-btn');
    const closeButton = windowElement.querySelector('.qicq-chat-close-btn');
    const textarea = windowElement.querySelector('textarea');

    if (!historyDiv || !sendButton || !closeButton || !textarea) return;

    // 填充聊天记录
    historyDiv.innerHTML = ''; // 清空
    
    neuqMusicGameChatLog.forEach(msg => {
        const now = new Date();
        const timeString = `2023-09 ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        const msgElement = document.createElement('div');
        msgElement.classList.add('qicq-chat-message');
        msgElement.innerHTML = `
            <strong style="${msg.style}">${msg.user} (${timeString}):</strong>
            <div style="${msg.style}">${msg.text}</div>
        `;
        historyDiv.appendChild(msgElement);
    });
    historyDiv.scrollTop = historyDiv.scrollHeight;

    function sendMessage() {
        const text = textarea.value.trim();
        if (text === '') return;

        // 获取调整后的时间
        const now = new Date(Date.now() + timelineOffsetMs);
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-indexed, so September is 8
        const canSendMessage = (year === 2023 && month === 8);
        const timeString = `${year}-${(month + 1).toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // 添加用户消息
        const userMsgElement = document.createElement('div');
        userMsgElement.classList.add('qicq-chat-message', 'user-message');
        userMsgElement.innerHTML = `
            <strong>冰蓝色の泪 (${timeString}):</strong>
            <div>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        `;
        historyDiv.appendChild(userMsgElement);
        textarea.value = '';

        // 根据时间线决定是发送成功还是失败
        setTimeout(() => {
            if (canSendMessage) {
                // 添加回复
                const replyUser = 'Pubbysuki';
                const replyStyle = 'color: #333; font-style: italic;';
                const replyText = '等等，你们刚才说的γ5α2β1α3(3/4)是啥意思啊？';
                
                const replyNow = new Date(Date.now() + timelineOffsetMs);
                // 确保分钟不会超过59
                const replyMinutes = (replyNow.getMinutes() + 1) % 60;
                const replyHours = replyNow.getHours() + (replyMinutes === 0 ? 1 : 0);

                const replyTimeString = `${replyNow.getFullYear()}-${(replyNow.getMonth() + 1).toString().padStart(2, '0')} ${replyHours.toString().padStart(2, '0')}:${replyMinutes.toString().padStart(2, '0')}`;
                
                const replyMsgElement = document.createElement('div');
                replyMsgElement.classList.add('qicq-chat-message');
                replyMsgElement.innerHTML = `
                    <strong style="${replyStyle}">${replyUser} (${replyTimeString}):</strong>
                    <div style="${replyStyle}">${replyText}</div>
                `;
                historyDiv.appendChild(replyMsgElement);
            } else {
                 // 添加系统错误消息
                const errorMsgElement = document.createElement('p');
                errorMsgElement.classList.add('qicq-chat-message', 'system-error');
                errorMsgElement.textContent = `[系统消息] 你不处于此时间线，信息发送失败。`;
                historyDiv.appendChild(errorMsgElement);
            }
            historyDiv.scrollTop = historyDiv.scrollHeight;
        }, 800);
        
        historyDiv.scrollTop = historyDiv.scrollHeight;
    }

    sendButton.addEventListener('click', sendMessage);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    closeButton.addEventListener('click', () => {
        closeApp(windowElement.id);
    });
}


/**
 * 处理记事本功能
 * @param {HTMLDivElement} windowElement - 记事本窗口元素
 */
function initNotepad(windowElement) {
    const textarea = windowElement.querySelector('.notepad-textarea');
    const importButton = windowElement.querySelector('#notepad-import-button');
    const saveButton = windowElement.querySelector('#notepad-save-button');
    if (!textarea || !importButton || !saveButton) return;

    // Set default text
    textarea.value = "α3β4α2δ1 (1/4)";

    // 保存功能
    saveButton.addEventListener('click', () => {
        const textToSave = textarea.value;
        const blob = new Blob([textToSave], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 导入功能
    importButton.addEventListener('click', () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,text/plain';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    textarea.value = event.target.result;
                };
                reader.readAsText(file);
            }
        };
        fileInput.click();
    });
}

// --- 事件监听器设置 ---

// 为所有桌面图标添加点击事件 (包括应用和链接)
icons.forEach(icon => {
    icon.addEventListener('click', () => {
        const appName = icon.getAttribute('data-app');
        if (appName) {
            openApp(appName);
            startMenu.classList.remove('active');
        }
    });
});


// 为开始菜单项添加点击事件
document.querySelectorAll('.start-menu-item').forEach(item => {
    item.addEventListener('click', () => {
        const appName = item.getAttribute('data-app');
        if (appName) openApp(appName);
        startMenu.classList.remove('active');
    });
});

// 为开始按钮添加点击事件
startButton.addEventListener('click', (e) => {
    e.stopPropagation();
    startMenu.classList.toggle('active');
    if (startMenu.classList.contains('active')) {
        highestZIndex++;
        startMenu.style.zIndex = highestZIndex.toString();
    }
});

// 为所有窗口设置通用行为（拖动、关闭、最小化）
windows.forEach(windowElement => {
    const titleBar = windowElement.querySelector('.window-titlebar');
    const closeButton = windowElement.querySelector('.window-close');
    const minimizeButton = windowElement.querySelector('.window-minimize');

    // 点击窗口时将其带到最前
    windowElement.addEventListener('mousedown', () => bringToFront(windowElement), true);

    // 关闭按钮
    if (closeButton) {
        closeButton.addEventListener('click', (e) => { e.stopPropagation(); closeApp(windowElement.id); });
    }
    // 最小化按钮
    if (minimizeButton) {
        minimizeButton.addEventListener('click', (e) => { e.stopPropagation(); minimizeApp(windowElement.id); });
    }

    // 窗口拖动逻辑 (支持鼠标和触摸)
    if (titleBar) {
        let isDragging = false;
        let dragOffsetX, dragOffsetY;

        const getPointerCoords = (e) => {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };
        
        const startDragging = (e) => {
             if (!(e.target === titleBar || titleBar.contains(e.target)) || e.target.closest('.window-control-button')) {
                 isDragging = false; return;
            }
            // 在移动端禁用页面滚动
            if (e.type === 'touchstart') {
                e.preventDefault();
            }
            isDragging = true; bringToFront(windowElement);
            const rect = windowElement.getBoundingClientRect();
            const coords = getPointerCoords(e);
            dragOffsetX = coords.x - rect.left; dragOffsetY = coords.y - rect.top;
            titleBar.style.cursor = 'grabbing';
            document.addEventListener('mousemove', dragWindow);
            document.addEventListener('touchmove', dragWindow, { passive: false });
            document.addEventListener('mouseup', stopDragging, { once: true });
            document.addEventListener('touchend', stopDragging, { once: true });
        };
        const dragWindow = (e) => {
            if (!isDragging) return;
             if (e.type === 'touchmove') {
                e.preventDefault();
            }
            const coords = getPointerCoords(e);
            let x = coords.x - dragOffsetX; let y = coords.y - dragOffsetY;
            const taskbarHeight = taskbarAppsContainer.parentElement?.offsetHeight ?? 36;

            // 保持窗口在屏幕内
            const minX = 0;
            const minY = 0;
            const maxX = window.innerWidth - windowElement.offsetWidth;
            const maxY = window.innerHeight - windowElement.offsetHeight - taskbarHeight;

            x = Math.max(minX, Math.min(x, maxX));
            y = Math.max(minY, Math.min(y, maxY));
            
            windowElement.style.left = `${x}px`; windowElement.style.top = `${y}px`;
        };
        const stopDragging = () => {
            if (!isDragging) return;
            isDragging = false; titleBar.style.cursor = 'grab';
            document.removeEventListener('mousemove', dragWindow);
            document.removeEventListener('touchmove', dragWindow);
        };
        titleBar.addEventListener('mousedown', startDragging);
        titleBar.addEventListener('touchstart', startDragging, { passive: true });
    }

    // 为新打开的窗口设置随机初始位置 (仅在非移动设备上)
    if (!window.matchMedia("(max-width: 768px)").matches) {
        if (!openApps.has(windowElement.id)) {
            const randomTop = Math.random() * (window.innerHeight / 4) + 20;
            const randomLeft = Math.random() * (window.innerWidth / 3) + 20;
            windowElement.style.top = `${randomTop}px`;
            windowElement.style.left = `${randomLeft}px`;
        }
    }
});

// 点击桌面空白处时关闭开始菜单
document.addEventListener('click', (e) => {
    if (startMenu.classList.contains('active') && !startMenu.contains(e.target) && !startButton.contains(e.target)) {
        startMenu.classList.remove('active');
    }
});

/**
 * 根据应用名称查找对应的桌面图标元素
 * @param {string} appName - 应用名称
 * @returns {HTMLDivElement | undefined} - 找到的图标元素或 undefined
 */
function findIconElement(appName) {
    return Array.from(icons).find(icon => icon.dataset.app === appName);
}

/**
 * 初始化简单的画图应用
 * @param {HTMLDivElement} windowElement - 画图窗口元素
 */
function initSimplePaintApp(windowElement) {
    const canvas = windowElement.querySelector('#paint-canvas');
    const toolbar = windowElement.querySelector('.paint-toolbar');
    const contentArea = windowElement.querySelector('.window-content');
    const colorSwatches = windowElement.querySelectorAll('.paint-color-swatch');
    const sizeButtons = windowElement.querySelectorAll('.paint-size-button');
    const clearButton = windowElement.querySelector('.paint-clear-button');
    const saveButton = windowElement.querySelector('.paint-save-button');
    const glitchButton = windowElement.querySelector('#paint-glitch-button');

    if (!canvas || !toolbar || !contentArea || !clearButton || !saveButton || !glitchButton) { return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { return; }

    let isDrawing = false; let lastX = 0; let lastY = 0;
    let drawingInterval = null; // To store the interval for the glitch text animation
    ctx.strokeStyle = 'black'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let currentStrokeStyle = ctx.strokeStyle; let currentLineWidth = ctx.lineWidth;

    function resizeCanvas() {
        const rect = contentArea.getBoundingClientRect();
        const toolbarHeight = toolbar.offsetHeight;
        const newWidth = Math.floor(rect.width);
        const newHeight = Math.floor(rect.height - toolbarHeight);

        if (canvas.width === newWidth && canvas.height === newHeight && newWidth > 0 && newHeight > 0) return;
        
        // 保存当前画布内容
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        if(canvas.width > 0 && canvas.height > 0) tempCtx.drawImage(canvas, 0, 0);

        canvas.width = newWidth > 0 ? newWidth : 1;
        canvas.height = newHeight > 0 ? newHeight : 1;
        
        // 恢复画布内容
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); // 清除并设置背景
        if(tempCanvas.width > 0 && tempCanvas.height > 0) ctx.drawImage(tempCanvas, 0, 0);

        ctx.strokeStyle = currentStrokeStyle; ctx.lineWidth = currentLineWidth;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    }

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(contentArea);
    paintResizeObserverMap.set(contentArea, resizeObserver);
    resizeCanvas();

    function getMousePos(canvasDom, event) {
        const rect = canvasDom.getBoundingClientRect();
        let clientX, clientY;
        if (event.touches) { 
            clientX = event.touches[0].clientX; 
            clientY = event.touches[0].clientY; 
        } else {
            clientX = event.clientX; 
            clientY = event.clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }
    function startDrawing(e) {
        e.preventDefault(); isDrawing = true; const pos = getMousePos(canvas, e);
        [lastX, lastY] = [pos.x, pos.y]; ctx.beginPath(); ctx.moveTo(lastX, lastY);
    }
    function draw(e) {
        if (!isDrawing) return; e.preventDefault();
        const pos = getMousePos(canvas, e);
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        [lastX, lastY] = [pos.x, pos.y];
    }
    function stopDrawing() { if (isDrawing) isDrawing = false; }

    canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseleave', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing); canvas.addEventListener('touchcancel', stopDrawing);

    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            ctx.strokeStyle = swatch.dataset.color || 'black'; currentStrokeStyle = ctx.strokeStyle;
            colorSwatches.forEach(s => s.classList.remove('active')); swatch.classList.add('active');
            if (swatch.dataset.color === 'white') {
                const largeSizeButton = Array.from(sizeButtons).find(b => b.dataset.size === '10');
                if (largeSizeButton) {
                    ctx.lineWidth = parseInt(largeSizeButton.dataset.size || '10', 10); currentLineWidth = ctx.lineWidth;
                    sizeButtons.forEach(s => s.classList.remove('active')); largeSizeButton.classList.add('active');
                }
            } else {
                const activeSizeButton = Array.from(sizeButtons).find(b => b.classList.contains('active'));
                if (activeSizeButton) { ctx.lineWidth = parseInt(activeSizeButton.dataset.size || '2', 10); currentLineWidth = ctx.lineWidth; }
            }
        });
    });
    sizeButtons.forEach(button => {
        button.addEventListener('click', () => {
            ctx.lineWidth = parseInt(button.dataset.size || '2', 10); currentLineWidth = ctx.lineWidth;
            sizeButtons.forEach(s => s.classList.remove('active')); button.classList.add('active');
            const eraser = Array.from(colorSwatches).find(s => s.dataset.color === 'white');
            if (!eraser?.classList.contains('active')) {
                 if (!Array.from(colorSwatches).some(s => s.classList.contains('active'))) {
                    const blackSwatch = Array.from(colorSwatches).find(s => s.dataset.color === 'black');
                    blackSwatch?.classList.add('active'); ctx.strokeStyle = 'black'; currentStrokeStyle = ctx.strokeStyle;
                 }
            }
        });
    });
    clearButton.addEventListener('click', () => {
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
    saveButton.addEventListener('click', () => {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'drawing.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    glitchButton.addEventListener('click', () => {
        if (drawingInterval) clearInterval(drawingInterval); // Clear previous animation if any
        
        const text = 'γ4β3α1(2/4)';
        let i = 0;

        // Setup canvas for drawing
        const fontSize = Math.min(canvas.width / 8, canvas.height / 3);
        ctx.font = `bold ${fontSize}px "Courier New", monospace`;
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Clear canvas before starting
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawingInterval = setInterval(() => {
            if (i >= text.length) {
                clearInterval(drawingInterval);
                drawingInterval = null;
                return;
            }
            i++;
            const partialText = text.substring(0, i);
            
            // Redraw background and then text to avoid artifacts
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'black';
            ctx.fillText(partialText, canvas.width / 2, canvas.height / 2);
        }, 150);
    });

    windowElement.querySelector('.paint-color-swatch[data-color="black"]')?.classList.add('active');
    windowElement.querySelector('.paint-size-button[data-size="2"]')?.classList.add('active');
}

/**
 * 初始化扫雷游戏
 * @param {HTMLDivElement} windowElement - 扫雷窗口元素
 */
function initMinesweeperGame(windowElement) {
    const boardElement = windowElement.querySelector('#minesweeper-board');
    const flagCountElement = windowElement.querySelector('.minesweeper-flag-count');
    const timerElement = windowElement.querySelector('.minesweeper-timer');
    const resetButton = windowElement.querySelector('.minesweeper-reset-button');
    const commentaryElement = windowElement.querySelector('.minesweeper-commentary');
    const cheatButton = windowElement.querySelector('.minesweeper-cheat-button');
    if (!boardElement || !flagCountElement || !timerElement || !resetButton || !commentaryElement || !cheatButton) return;
    let grid = [];
    function resetGame() {
        if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
        minesweeperTimerInterval = null; minesweeperTimeElapsed = 0; minesweeperFlagsPlaced = 0;
        minesweeperGameOver = false; minesweeperFirstClick = true; minesweeperMineCount = 10;
        minesweeperGridSize = { rows: 9, cols: 9 };
        timerElement.textContent = `⏱️ 0`; flagCountElement.textContent = `🚩 ${minesweeperMineCount}`;
        resetButton.textContent = '🙂'; commentaryElement.textContent = "开始游戏吧！点击一个方块。";
        createGrid();
    }
    function createGrid() {
        boardElement.innerHTML = ''; grid = [];
        boardElement.style.gridTemplateColumns = `repeat(${minesweeperGridSize.cols}, 20px)`;
        boardElement.style.gridTemplateRows = `repeat(${minesweeperGridSize.rows}, 20px)`;
        for (let r = 0; r < minesweeperGridSize.rows; r++) {
            const row = [];
            for (let c = 0; c < minesweeperGridSize.cols; c++) {
                const cellElement = document.createElement('div'); cellElement.classList.add('minesweeper-cell');
                const cellData = { isMine: false, isRevealed: false, isFlagged: false, adjacentMines: 0, element: cellElement, row: r, col: c };
                cellElement.addEventListener('click', () => handleCellClick(cellData));
                cellElement.addEventListener('contextmenu', (e) => { e.preventDefault(); handleCellRightClick(cellData); });
                row.push(cellData); boardElement.appendChild(cellElement);
            }
            grid.push(row);
        }
    }
    function placeMines(firstClickRow, firstClickCol) {
        let minesPlaced = 0;
        while (minesPlaced < minesweeperMineCount) {
            const r = Math.floor(Math.random() * minesweeperGridSize.rows);
            const c = Math.floor(Math.random() * minesweeperGridSize.cols);
            if ((r === firstClickRow && c === firstClickCol) || grid[r][c].isMine) continue;
            grid[r][c].isMine = true; minesPlaced++;
        }
        for (let r = 0; r < minesweeperGridSize.rows; r++) {
            for (let c = 0; c < minesweeperGridSize.cols; c++) {
                if (!grid[r][c].isMine) grid[r][c].adjacentMines = countAdjacentMines(r, c);
            }
        }
    }
    function countAdjacentMines(row, col) {
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr; const nc = col + dc;
                if (nr >= 0 && nr < minesweeperGridSize.rows && nc >= 0 && nc < minesweeperGridSize.cols && grid[nr][nc].isMine) count++;
            }
        }
        return count;
    }
    function handleCellClick(cell) {
        if (minesweeperGameOver || cell.isRevealed || cell.isFlagged) return;
        if (minesweeperFirstClick && !minesweeperTimerInterval) {
             placeMines(cell.row, cell.col); minesweeperFirstClick = false; startTimer();
        }
        if (cell.isMine) gameOver(cell);
        else { revealCell(cell); checkWinCondition(); }
    }
    function handleCellRightClick(cell) {
        if (minesweeperGameOver || cell.isRevealed || (minesweeperFirstClick && !minesweeperTimerInterval)) return;
        cell.isFlagged = !cell.isFlagged; cell.element.textContent = cell.isFlagged ? '🚩' : '';
        minesweeperFlagsPlaced += cell.isFlagged ? 1 : -1;
        updateFlagCount(); checkWinCondition();
    }
    function revealCell(cell) {
        if (cell.isRevealed || cell.isFlagged || cell.isMine) return;
        cell.isRevealed = true; cell.element.classList.add('revealed'); cell.element.textContent = '';
        if (cell.adjacentMines > 0) {
            cell.element.textContent = cell.adjacentMines.toString();
            cell.element.dataset.number = cell.adjacentMines.toString();
        } else {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = cell.row + dr; const nc = cell.col + dc;
                    if (nr >= 0 && nr < minesweeperGridSize.rows && nc >= 0 && nc < minesweeperGridSize.cols) {
                        const neighbor = grid[nr][nc];
                        if (!neighbor.isRevealed && !neighbor.isFlagged) revealCell(neighbor);
                    }
                }
            }
        }
    }
    function startTimer() {
        if (minesweeperTimerInterval) return;
        minesweeperTimeElapsed = 0; timerElement.textContent = `⏱️ 0`;
        minesweeperTimerInterval = window.setInterval(() => {
            minesweeperTimeElapsed++; timerElement.textContent = `⏱️ ${minesweeperTimeElapsed}`;
        }, 1000);
    }
    function updateFlagCount() {
        flagCountElement.textContent = `🚩 ${minesweeperMineCount - minesweeperFlagsPlaced}`;
    }
    function gameOver(clickedMine) {
        minesweeperGameOver = true;
        if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
        minesweeperTimerInterval = null; resetButton.textContent = '😵';
        commentaryElement.textContent = "啊哦，再试一次吧！";
        grid.forEach(row => row.forEach(cell => {
            if (cell.isMine) {
                cell.element.classList.add('mine', 'revealed'); cell.element.textContent = '💣';
            }
            if (!cell.isMine && cell.isFlagged) cell.element.textContent = '❌';
        }));
        clickedMine.element.classList.add('exploded'); clickedMine.element.textContent = '💥';
    }
    function checkWinCondition() {
        if (minesweeperGameOver) return;
        let revealedCount = 0; let correctlyFlaggedMines = 0;
        grid.forEach(row => row.forEach(cell => {
            if (cell.isRevealed && !cell.isMine) revealedCount++;
            if (cell.isFlagged && cell.isMine) correctlyFlaggedMines++;
        }));
        const totalNonMineCells = (minesweeperGridSize.rows * minesweeperGridSize.cols) - minesweeperMineCount;
        if (revealedCount === totalNonMineCells || (correctlyFlaggedMines === minesweeperMineCount && minesweeperFlagsPlaced === minesweeperMineCount)) {
            minesweeperGameOver = true;
            if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
            minesweeperTimerInterval = null; resetButton.textContent = '😎';
            commentaryElement.textContent = '恭喜，你赢了！提示：(1&2&3)->4';
            if (revealedCount === totalNonMineCells) {
                 grid.forEach(row => row.forEach(cell => {
                     if (cell.isMine && !cell.isFlagged) { cell.isFlagged = true; cell.element.textContent = '🚩'; minesweeperFlagsPlaced++; }
                 })); updateFlagCount();
            }
        }
    }
    
    function forceWin() {
        if (minesweeperGameOver) return;
        if (minesweeperFirstClick) {
            // Place mines first to ensure the grid is generated
            placeMines(-1, -1); // Place mines away from any potential first click
            minesweeperFirstClick = false;
        }
        minesweeperGameOver = true;
        if (minesweeperTimerInterval) clearInterval(minesweeperTimerInterval);
        minesweeperTimerInterval = null;
        resetButton.textContent = '😎';
        commentaryElement.textContent = '恭喜，你赢了！提示：(1&2&3)->4';
        grid.forEach(row => row.forEach(cell => {
            if (cell.isMine) {
                if (!cell.isFlagged) {
                    cell.isFlagged = true;
                    cell.element.textContent = '🚩';
                }
            } else if (!cell.isRevealed) {
                cell.isRevealed = true;
                cell.element.classList.add('revealed');
                if (cell.adjacentMines > 0) {
                    cell.element.textContent = cell.adjacentMines.toString();
                    cell.element.dataset.number = cell.adjacentMines.toString();
                } else {
                    cell.element.textContent = '';
                }
            }
        }));
        minesweeperFlagsPlaced = minesweeperMineCount;
        updateFlagCount();
    }
    
    resetButton.addEventListener('click', resetGame);
    cheatButton.addEventListener('click', forceWin);
    resetGame();
}

/**
 * 初始化“我的电脑”功能
 * @param {HTMLDivElement} windowElement - 我的电脑窗口元素
 */
function initMyComputer(windowElement) {
    const cDriveIcon = windowElement.querySelector('#c-drive-icon');
    const cDriveContent = windowElement.querySelector('#c-drive-content');
    const secretImageIcon = windowElement.querySelector('#secret-image-icon');
    if (!cDriveIcon || !cDriveContent || !secretImageIcon) return;
    cDriveIcon.addEventListener('click', () => {
        cDriveIcon.style.display = 'none'; cDriveContent.style.display = 'block';
    });
    secretImageIcon.addEventListener('click', () => {
        const imageViewerWindow = document.getElementById('imageViewer');
        const imageViewerImg = document.getElementById('image-viewer-img');
        const imageViewerTitle = document.getElementById('image-viewer-title');
        if (!imageViewerWindow || !imageViewerImg || !imageViewerTitle) { alert("图片查看器已损坏！"); return; }
        imageViewerImg.src = 'static/Snipaste_2025-09-19_00-01-08.png';
        imageViewerImg.alt = '不要给任何人看.jpg';
        imageViewerTitle.textContent = '不要给任何人看.jpg - 图片查看器';
        openApp('imageViewer');
    });
    cDriveIcon.style.display = 'inline-flex'; cDriveContent.style.display = 'none';
}

// --- Bilibili 播放器 (媒体播放器) 逻辑 ---

/**
 * 从 Bilibili URL 中提取 BV 号并生成嵌入式播放器 URL
 * @param {string} url - Bilibili 视频网址
 * @returns {string | null} - 嵌入式播放器 URL 或 null
 */
function getBilibiliEmbedUrl(url) {
    if (!url) return null;
    // 正则表达式匹配 BV 号 (例如 BV1GJ411x7h7)
    const bvidMatch = url.match(/BV[1-9A-HJ-NP-Za-km-z]{10}/i);
    if (bvidMatch && bvidMatch[0]) {
        const bvid = bvidMatch[0];
        // 返回 Bilibili 官方推荐的嵌入式播放器 URL，参数可以按需调整
        return `//player.bilibili.com/player.html?bvid=${bvid}&page=1&as_wide=1&high_quality=1&danmaku=0`;
    }
    return null; // 如果未找到 BV 号则返回 null
}


/**
 * 初始化媒体播放器 (Bilibili 版本)
 * @param {HTMLDivElement} windowElement - 媒体播放器窗口元素
 */
function initMediaPlayer(windowElement) {
    const appName = windowElement.id; // 'mediaPlayer'
    const urlInput = windowElement.querySelector('.media-player-input');
    const loadButton = windowElement.querySelector('.media-player-load-button');
    const playerContainerDivId = `youtube-player-${appName}`; // 保持 ID 与 CSS 兼容
    const playerDiv = windowElement.querySelector(`#${playerContainerDivId}`);
    const playButton = windowElement.querySelector('#media-player-play');
    const pauseButton = windowElement.querySelector('#media-player-pause');
    const stopButton = windowElement.querySelector('#media-player-stop');

    if (!urlInput || !loadButton || !playerDiv || !playButton || !pauseButton || !stopButton) {
        console.error("媒体播放器元素未找到:", appName);
        if (playerDiv) playerDiv.innerHTML = `<p class="media-player-status-message" style="color:red;">错误：播放器界面丢失。</p>`;
        return;
    }

    // 由于 Bilibili 嵌入式播放器不提供简单的 JS API 来控制播放，所以禁用这些按钮
    playButton.disabled = true;
    pauseButton.disabled = true;
    stopButton.disabled = true;

    const showPlayerMessage = (message, isError = false) => {
        playerDiv.innerHTML = `<p class="media-player-status-message" style="color:${isError ? 'red' : '#ccc'};">${message}</p>`;
    };

    const loadVideo = (url) => {
        const embedUrl = getBilibiliEmbedUrl(url);
        if (embedUrl) {
            // 创建 iframe 并加载视频
            playerDiv.innerHTML = `<iframe src="${embedUrl}" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width: 100%; height: 100%;"></iframe>`;
        } else {
            showPlayerMessage("无效的 Bilibili 视频网址。请提供包含 BV 号的网址。", true);
        }
    };

    // 加载按钮点击事件
    loadButton.addEventListener('click', () => {
        const videoUrl = urlInput.value.trim();
        if (videoUrl) {
            showPlayerMessage("正在加载视频...");
            loadVideo(videoUrl);
        } else {
            showPlayerMessage("请输入一个 Bilibili 视频网址。", true);
        }
    });

    // 地址栏回车事件
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loadButton.click();
        }
    });

    // 打开应用时加载默认视频
    if (DEFAULT_BILIBILI_URL) {
        urlInput.value = DEFAULT_BILIBILI_URL;
        showPlayerMessage("正在加载默认视频...");
        loadVideo(DEFAULT_BILIBILI_URL);
    } else {
        showPlayerMessage("请输入 Bilibili 视频网址并点击 '加载'。");
    }
}
// --- END Bilibili Player Logic ---

// --- 任务栏时钟与托盘图标逻辑 ---
/**
 * 更新任务栏上的时钟显示
 */
function updateClock() {
    if (!taskbarClock) return;
    const now = new Date(Date.now() + timelineOffsetMs);
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    taskbarClock.textContent = `${year}/${month}/${day} ${hours}:${minutes}`;
    taskbarClock.title = now.toLocaleString('zh-CN');
}


function initTrayIcons() {
    if (volumeIcon) {
        volumeIcon.addEventListener('click', () => openApp('volumeControl'));
    }
    if (networkIcon) {
        networkIcon.addEventListener('click', () => openApp('networkStatus'));
    }
    if (taskbarClock) {
        taskbarClock.addEventListener('click', () => openApp('calendarWindow'));
    }
}

function initTimelineControl(windowElement) {
    const slider = windowElement.querySelector('#timeline-slider');
    const display = windowElement.querySelector('#timeline-display');
    if (!slider || !display) return;
    
    const now = new Date();
    const minOffset = timelineStartDate.getTime() - now.getTime();
    const maxOffset = 0;

    slider.min = minOffset;
    slider.max = maxOffset;
    slider.value = timelineOffsetMs;

    function updateDisplay() {
        const currentDate = new Date(Date.now() + timelineOffsetMs);
        display.textContent = currentDate.toLocaleDateString('zh-CN');
    }
    
    slider.addEventListener('input', () => {
        timelineOffsetMs = parseInt(slider.value, 10);
        updateClock();
        updateDisplay();
    });
    
    updateDisplay();
}

function initCalendar(windowElement) {
    const content = windowElement.querySelector('.window-content');
    if (!content) return;

    const now = new Date(Date.now() + timelineOffsetMs);
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const today = now.getDate();

    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 for Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

    let html = `
        <div class="calendar-header">
            <span>${monthNames[month]} ${year}</span>
        </div>
        <div class="calendar-grid">
    `;
    // Day names
    dayNames.forEach(day => {
        html += `<div class="calendar-day-name">${day}</div>`;
    });
    // Blank days for the first week
    for (let i = 0; i < firstDayOfMonth; i++) {
        html += `<div></div>`;
    }
    // Month days
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today ? ' today' : '';
        html += `<div class="calendar-day${isToday}">${day}</div>`;
    }
    html += `</div>`;
    content.innerHTML = html;
}



// --- 启动流程 ---
function initBootSequence() {
    const synthesisLoader = document.getElementById('synthesis-loader');
    const win98Loader = document.getElementById('win98-loader');
    const initiateButton = document.getElementById('initiate-button');
    const desktopEnvironment = document.getElementById('desktop-environment');
    const canvas = document.getElementById('matrixBg');
    const ctx = canvas.getContext('2d');

    // Matrix background effect
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const matrix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
    const matrixArray = matrix.split("");
    const fontSize = 10;
    const columns = canvas.width / fontSize;
    const drops = [];
    for(let x = 0; x < columns; x++) drops[x] = 1;
    let matrixInterval;

    function drawMatrix() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff88';
        ctx.font = fontSize + 'px JetBrains Mono';
        for(let i = 0; i < drops.length; i++) {
            const text = matrixArray[Math.floor(Math.random() * matrixArray.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if(drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
        }
    }
    matrixInterval = setInterval(drawMatrix, 35);
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });


    initiateButton.addEventListener('click', () => {
        // 停止代码雨动画以节省资源
        clearInterval(matrixInterval);

        // 1. 隐藏 Synthesis 加载器
        synthesisLoader.style.opacity = '0';
        setTimeout(() => {
            synthesisLoader.style.display = 'none';
        }, 700);

        // 2. 显示 Win98 加载器并开始动画
        win98Loader.style.display = 'flex';
        
        // 3. 模拟加载后，隐藏 Win98 加载器并显示桌面
        setTimeout(() => {
            win98Loader.style.opacity = '0';
            setTimeout(() => {
                win98Loader.style.display = 'none';
                desktopEnvironment.style.display = 'block'; // 显示桌面环境
                console.log("复古操作系统模拟器已初始化 (JS)");
                // 启动时钟
                setInterval(updateClock, 1000);
                updateClock(); // 立即调用一次以显示时间
                initTrayIcons(); // 初始化托盘图标点击事件
            }, 700);
        }, 2800); // 匹配 CSS 动画时长 + 一点延迟
    });
}

// 页面加载完成后开始启动流程
document.addEventListener('DOMContentLoaded', initBootSequence);