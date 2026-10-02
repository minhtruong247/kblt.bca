/**
 * BCA Auto Check-out Content Script
 * Automates searching and checking out discharged patients on BCA / ASM accommodation management portals.
 */

(function () {
    // Prevent multiple injections
    if (document.getElementById('bca-checkout-widget')) return;

    // ==========================================
    // Domain Check: Only activate on BCA / ASM portals
    // ==========================================
    const BCA_DOMAINS = [
        'dichvucong.bocongan.gov.vn',
        'asm.bocongan.gov.vn',
        'luutru.bocongan.gov.vn',
        'tamtru.bocongan.gov.vn',
        'quanlyluutru.bocongan.gov.vn',
        'dvc.bocongan.gov.vn',
        'csdl.bocongan.gov.vn',
        'congan.gov.vn'  // any subdomain under bocongan.gov.vn
    ];
    const currentHost = window.location.hostname.toLowerCase();
    const isAllowedDomain = BCA_DOMAINS.some(d => currentHost === d || currentHost.endsWith('.' + d) || currentHost.includes('bocongan') || currentHost.includes('congan'));
    if (!isAllowedDomain) {
        // Not on a BCA domain -> do NOT inject anything
        return;
    }

    let patientQueue = [];
    let currentIndex = 0;
    let isRunning = false;
    let isPaused = false;
    let autoConfirmModal = true;
    let stepDelayMs = 1800;
    let searchMode = 'name'; // 'name' | 'docId' | 'both'
    let executionMode = 'auto'; // 'auto' | 'step'
    let checkoutMethod = 'auto'; // 'auto' | 'action_btn' | 'checkbox_toolbar' | 'custom'

    // Custom selectors (user can override)
    let customSelectors = {
        searchInput: '',
        searchButton: '',
        checkoutButton: '',
        confirmButton: ''
    };

    // Load saved settings
    chrome.storage?.local?.get(['bca_delay', 'bca_searchMode', 'bca_execMode', 'bca_autoConfirm', 'bca_checkoutMethod', 'bca_selectors'], (res) => {
        if (res.bca_delay) stepDelayMs = parseInt(res.bca_delay, 10);
        if (res.bca_searchMode) searchMode = res.bca_searchMode;
        if (res.bca_execMode) executionMode = res.bca_execMode;
        if (res.bca_checkoutMethod) checkoutMethod = res.bca_checkoutMethod;
        if (res.bca_autoConfirm !== undefined) autoConfirmModal = res.bca_autoConfirm;
        if (res.bca_selectors) customSelectors = { ...customSelectors, ...res.bca_selectors };
        updateSettingsUI();
    });

    // Helper: Sleep
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Helper: Strip Vietnamese accents
    function stripAccents(str) {
        if (!str) return '';
        return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd');
    }

    // Helper: Normalize name
    function normalizeStr(str) {
        if (!str) return '';
        return String(str).toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // Override window.confirm to auto-accept if enabled
    const nativeConfirm = window.confirm;
    window.confirm = function (msg) {
        if (isRunning && autoConfirmModal) {
            log(`[Modal] Tự động chấp nhận confirm: "${msg}"`);
            return true;
        }
        return nativeConfirm.apply(window, arguments);
    };

    // 1. Create Floating Launcher Button (Always available to reopen widget)
    const launcherBtn = document.createElement('div');
    launcherBtn.id = 'bca-launcher-btn';
    launcherBtn.innerHTML = `<span>🚪</span> <span>BCA Check-out</span>`;
    launcherBtn.title = 'Bấm để mở Bảng điều khiển BCA Auto Check-out';
    document.body.appendChild(launcherBtn);

    // 2. Create Widget DOM
    const widget = document.createElement('div');
    widget.id = 'bca-checkout-widget';
    widget.innerHTML = `
        <div class="bca-widget-header" id="bcaWidgetHeader">
            <div class="bca-widget-title">
                <span class="bca-widget-title-icon">🚪</span>
                <span>BCA Auto Check-out</span>
            </div>
            <div class="bca-widget-controls">
                <button class="bca-header-btn bca-btn-minimize" id="bcaBtnMinimize" title="Thu nhỏ / Phóng to">_</button>
                <button class="bca-header-btn bca-btn-close" id="bcaBtnClose" title="Thu gọn vào nút nổi">✕</button>
            </div>
        </div>

        <div class="bca-widget-tabs">
            <button class="bca-tab-btn active" data-tab="tab-import">📥 Nạp DS</button>
            <button class="bca-tab-btn" data-tab="tab-run">⚡ Tiến Trình</button>
            <button class="bca-tab-btn" data-tab="tab-config">⚙️ Tùy Chỉnh Nút</button>
        </div>

        <div class="bca-widget-body">
            <!-- TAB 1: IMPORT -->
            <div class="bca-tab-content active" id="tab-import">
                <div class="bca-upload-box" id="bcaDropZone">
                    <div class="bca-upload-icon">📄</div>
                    <div class="bca-upload-title">Kéo thả file Excel Ra Viện (.xlsx)</div>
                    <div class="bca-upload-hint">File xuất từ tool so sánh (DS_Ra_Vien_...xlsx) hoặc click để chọn</div>
                    <input type="file" id="bcaFileInput" accept=".xlsx,.xls" style="display:none">
                </div>

                <div class="bca-or-divider">HOẶC DÁN DANH SÁCH</div>

                <textarea class="bca-textarea" id="bcaTextInput" placeholder="Dán danh sách bệnh nhân tại đây (mỗi người 1 dòng)&#10;Ví dụ:&#10;Nguyễn Văn A - 079200001234&#10;Trần Thị B"></textarea>

                <div class="bca-options-grid">
                    <div class="bca-option-item">
                        <label class="bca-option-label">Tìm kiếm theo</label>
                        <select class="bca-select" id="bcaSearchModeSelect">
                            <option value="name">Họ và tên</option>
                            <option value="docId">Số CCCD / CMND</option>
                            <option value="both">Họ tên + CCCD</option>
                        </select>
                    </div>
                    <div class="bca-option-item">
                        <label class="bca-option-label">Thời gian chờ</label>
                        <select class="bca-select" id="bcaDelaySelect">
                            <option value="1200">Nhanh (1.2s)</option>
                            <option value="1800" selected>Vừa phải (1.8s)</option>
                            <option value="2500">Chậm (2.5s)</option>
                            <option value="3500">Rất chậm (3.5s)</option>
                        </select>
                    </div>
                </div>

                <div class="bca-option-item" style="margin-top: 4px;">
                    <label class="bca-option-label">Phương thức bấm Trả phòng (Check-out)</label>
                    <select class="bca-select" id="bcaCheckoutMethodSelect">
                        <option value="auto">🎯 Tự động thông minh (Khuyên dùng)</option>
                        <option value="action_btn">🟢 Nút xanh lá (Cột Hành động trên dòng)</option>
                        <option value="checkbox_toolbar">☑️ Tích chọn Checkbox + Nút Thanh công cụ</option>
                        <option value="custom">🎯 Dùng bộ chọn tùy chỉnh (Đã chấm chọn)</option>
                    </select>
                </div>

                <label class="bca-checkbox-label">
                    <input type="checkbox" id="bcaAutoConfirmCheck" checked>
                    Tự động ấn "Xác nhận / Đồng ý" trên hộp thoại popup
                </label>

                <button class="bca-btn-primary" id="bcaBtnLoadList">
                    <span>➡️ Nạp & Chuyển Sang Tiến Trình</span>
                </button>
            </div>

            <!-- TAB 2: EXECUTION & MONITOR -->
            <div class="bca-tab-content" id="tab-run">
                <div class="bca-stats-grid">
                    <div class="bca-stat-card">
                        <div class="bca-stat-num" id="bcaStatTotal">0</div>
                        <div class="bca-stat-label">Tổng số</div>
                    </div>
                    <div class="bca-stat-card bca-stat-success">
                        <div class="bca-stat-num" id="bcaStatSuccess">0</div>
                        <div class="bca-stat-label">Đã ra viện</div>
                    </div>
                    <div class="bca-stat-card bca-stat-warning">
                        <div class="bca-stat-num" id="bcaStatNotFound">0</div>
                        <div class="bca-stat-label">Không thấy</div>
                    </div>
                    <div class="bca-stat-card bca-stat-danger">
                        <div class="bca-stat-num" id="bcaStatError">0</div>
                        <div class="bca-stat-label">Lỗi</div>
                    </div>
                </div>

                <div class="bca-control-buttons">
                    <button class="bca-btn-primary" id="bcaBtnStart">
                        <span id="bcaBtnStartIcon">▶️</span>
                        <span id="bcaBtnStartText">BẮT ĐẦU TỰ ĐỘNG</span>
                    </button>
                    <button class="bca-btn-secondary" id="bcaBtnStep" title="Thực hiện 1 người rồi dừng">
                        <span>⏭️ Bước</span>
                    </button>
                    <button class="bca-btn-secondary bca-btn-danger" id="bcaBtnStop" disabled title="Dừng lại">
                        <span>⏹️ Dừng</span>
                    </button>
                </div>

                <div class="bca-queue-container" id="bcaQueueList">
                    <div style="padding: 20px; text-align: center; color: #64748b; font-size: 12px;">
                        Chưa có dữ liệu. Vui lòng nạp file ở Tab 1.
                    </div>
                </div>

                <div class="bca-log-box" id="bcaLogBox">Sẵn sàng hoạt động...</div>

                <button class="bca-btn-secondary" id="bcaBtnExportReport" style="display:none;">
                    <span>📥 Xuất Báo Cáo Kết Quả (.xlsx)</span>
                </button>
            </div>

            <!-- TAB 3: ADVANCED CONFIG & ELEMENT PICKER -->
            <div class="bca-tab-content" id="tab-config">
                <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.5; background: rgba(59,130,246,0.08); padding: 8px 10px; border-radius: 8px; border: 1px dashed rgba(59,130,246,0.3);">
                    💡 <strong>Linh hoạt khi web đổi giao diện:</strong> Nếu Bộ Công An đổi vị trí nút hoặc giao diện, bạn chỉ cần bấm nút <strong>🎯 Chọn</strong> bên dưới và click trực tiếp vào nút trên màn hình!
                </div>

                <div class="bca-option-item">
                    <label class="bca-option-label">Nút Trả phòng (Checkout Button) — Quan trọng nhất</label>
                    <div style="display:flex; gap:6px;">
                        <input class="bca-input" style="flex:1" id="cfgCheckoutButton" placeholder="Mặc định tự động nhận diện...">
                        <button class="bca-btn-secondary bca-pick-btn" data-target="checkoutButton" style="background:#2563eb; color:white;">🎯 Chấm Chọn</button>
                    </div>
                </div>

                <div class="bca-option-item">
                    <label class="bca-option-label">Ô tìm kiếm (Search Input)</label>
                    <div style="display:flex; gap:6px;">
                        <input class="bca-input" style="flex:1" id="cfgSearchInput" placeholder="Tự động phát hiện...">
                        <button class="bca-btn-secondary bca-pick-btn" data-target="searchInput">🎯 Chọn</button>
                    </div>
                </div>

                <div class="bca-option-item">
                    <label class="bca-option-label">Nút tìm kiếm (Search Button)</label>
                    <div style="display:flex; gap:6px;">
                        <input class="bca-input" style="flex:1" id="cfgSearchButton" placeholder="Tự động phát hiện...">
                        <button class="bca-btn-secondary bca-pick-btn" data-target="searchButton">🎯 Chọn</button>
                    </div>
                </div>

                <div class="bca-option-item">
                    <label class="bca-option-label">Nút Xác nhận Modal (Confirm Button)</label>
                    <div style="display:flex; gap:6px;">
                        <input class="bca-input" style="flex:1" id="cfgConfirmButton" placeholder="Tự động phát hiện...">
                        <button class="bca-btn-secondary bca-pick-btn" data-target="confirmButton">🎯 Chọn</button>
                    </div>
                </div>

                <button class="bca-btn-secondary" id="bcaBtnSaveConfig">
                    <span>💾 Lưu Cấu Hình Tùy Chỉnh</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(widget);

    // Show/Hide Helpers
    function showWidget() {
        widget.style.display = 'flex';
        widget.classList.remove('minimized');
        launcherBtn.classList.remove('visible');
    }

    function hideWidget() {
        widget.style.display = 'none';
        launcherBtn.classList.add('visible');
    }

    launcherBtn.addEventListener('click', showWidget);

    // Listen for messages from popup or background
    chrome.runtime?.onMessage?.addListener((req, sender, sendResponse) => {
        if (req.type === 'TOGGLE_WIDGET' || req.type === 'OPEN_WIDGET') {
            showWidget();
            sendResponse({ status: 'OK' });
        }
        return true;
    });

    // ==========================================
    // UI Event Listeners & Dragging
    // ==========================================
    const header = document.getElementById('bcaWidgetHeader');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.bca-header-btn')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = widget.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        widget.style.right = 'auto';
        widget.style.left = `${Math.max(10, Math.min(window.innerWidth - widget.offsetWidth - 10, startLeft + dx))}px`;
        widget.style.top = `${Math.max(10, Math.min(window.innerHeight - widget.offsetHeight - 10, startTop + dy))}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Minimize & Close
    const btnMinimize = document.getElementById('bcaBtnMinimize');
    const btnClose = document.getElementById('bcaBtnClose');

    btnMinimize.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.classList.toggle('minimized');
        if (widget.classList.contains('minimized')) {
            launcherBtn.classList.add('visible');
        } else {
            launcherBtn.classList.remove('visible');
        }
    });

    widget.addEventListener('click', (e) => {
        if (widget.classList.contains('minimized')) {
            widget.classList.remove('minimized');
            launcherBtn.classList.remove('visible');
        }
    });

    btnClose.addEventListener('click', () => {
        hideWidget();
        log('💡 Bảng điều khiển đã thu gọn thành nút nổi ở góc dưới màn hình. Bấm vào nút nổi để mở lại.');
    });

    // Tab Switching
    const tabs = widget.querySelectorAll('.bca-tab-btn');
    const tabContents = widget.querySelectorAll('.bca-tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    function switchTab(tabId) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === tabId));
    }

    // ==========================================
    // File Upload & Input Parsing
    // ==========================================
    const dropZone = document.getElementById('bcaDropZone');
    const fileInput = document.getElementById('bcaFileInput');
    const textInput = document.getElementById('bcaTextInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleExcelFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleExcelFile(e.target.files[0]);
    });

    async function handleExcelFile(file) {
        log(`Đang đọc file Excel: ${file.name}...`);
        if (typeof XLSX === 'undefined') {
            log('❌ Lỗi: Thư viện SheetJS chưa được nạp.');
            return;
        }

        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (rows.length < 2) {
                log('❌ File không có đủ dữ liệu.');
                return;
            }

            // Find header columns
            let nameCol = -1, docCol = -1, dobCol = -1, roomCol = -1, admitCol = -1;
            for (let r = 0; r < Math.min(10, rows.length); r++) {
                const row = rows[r];
                if (!Array.isArray(row)) continue;
                for (let c = 0; c < row.length; c++) {
                    const val = normalizeStr(stripAccents(row[c]));
                    if (nameCol === -1 && (val.includes('ho ten') || val.includes('ho va ten') || val === 'ten')) nameCol = c;
                    if (docCol === -1 && (val.includes('so giay to') || val.includes('cccd') || val.includes('cmnd') || val.includes('dinh danh'))) docCol = c;
                    if (dobCol === -1 && (val.includes('ngay sinh') || val.includes('nam sinh'))) dobCol = c;
                    if (roomCol === -1 && (val.includes('phong') || val.includes('khoa'))) roomCol = c;
                    if (admitCol === -1 && (val.includes('ngay den') || val.includes('ngay vao') || val.includes('nhap vien') || val.includes('luu tru'))) admitCol = c;
                }
                if (nameCol !== -1) break;
            }

            // Fallback default columns if no header found
            if (nameCol === -1) nameCol = 1; // Col 2
            if (dobCol === -1) dobCol = 2;   // Col 3
            if (docCol === -1) docCol = 3;   // Col 4
            if (roomCol === -1) roomCol = 4; // Col 5
            if (admitCol === -1) admitCol = 5; // Col 6

            const list = [];
            for (let r = 1; r < rows.length; r++) {
                const row = rows[r];
                if (!row || !row[nameCol]) continue;
                const hoTen = String(row[nameCol]).trim();
                if (!hoTen || hoTen.startsWith('<') || normalizeStr(stripAccents(hoTen)) === 'ho ten') continue;

                const docId = docCol !== -1 && row[docCol] ? String(row[docCol]).trim() : '';
                const dob = dobCol !== -1 && row[dobCol] ? String(row[dobCol]).trim() : '';
                const room = roomCol !== -1 && row[roomCol] ? String(row[roomCol]).trim() : '';
                const admitDate = admitCol !== -1 && row[admitCol] ? String(row[admitCol]).trim() : '';

                list.push({
                    id: list.length + 1,
                    hoTen: hoTen,
                    docId: docId === 'null' ? '' : docId,
                    ngaySinh: dob,
                    phongKhoa: room,
                    ngayDen: admitDate,
                    status: 'pending', // pending | running | success | not_found | error
                    errorMsg: ''
                });
            }

            if (list.length > 0) {
                setPatientQueue(list);
                log(`✅ Đã nạp ${list.length} bệnh nhân từ file Excel!`);
                switchTab('tab-run');
            } else {
                log('⚠️ Không trích xuất được bệnh nhân nào từ file.');
            }
        } catch (err) {
            log(`❌ Lỗi đọc file Excel: ${err.message}`);
        }
    }

    // Parse Text Input
    document.getElementById('bcaBtnLoadList').addEventListener('click', () => {
        const text = textInput.value.trim();
        if (text) {
            const lines = text.split('\n');
            const list = [];
            lines.forEach((line, idx) => {
                const clean = line.trim();
                if (!clean) return;

                // Check if line has separators like "-" or tab or ","
                let hoTen = clean;
                let docId = '';
                if (clean.includes('\t')) {
                    const parts = clean.split('\t');
                    hoTen = parts[0].trim();
                    docId = parts[1] ? parts[1].trim() : '';
                } else if (clean.includes('-')) {
                    const parts = clean.split('-');
                    hoTen = parts[0].trim();
                    docId = parts[1] ? parts[1].trim() : '';
                }

                list.push({
                    id: list.length + 1,
                    hoTen: hoTen,
                    docId: docId,
                    ngaySinh: '',
                    phongKhoa: '',
                    status: 'pending',
                    errorMsg: ''
                });
            });

            if (list.length > 0) {
                setPatientQueue(list);
                log(`✅ Đã nạp ${list.length} bệnh nhân từ danh sách dán!`);
                switchTab('tab-run');
            } else {
                log('⚠️ Vui lòng nhập danh sách hoặc chọn file Excel.');
            }
        } else if (patientQueue.length > 0) {
            switchTab('tab-run');
        } else {
            log('⚠️ Vui lòng nhập danh sách hoặc chọn file Excel.');
        }
    });

    function setPatientQueue(list) {
        patientQueue = list;
        currentIndex = 0;
        updateQueueUI();
        updateStats();
    }

    function updateQueueUI() {
        const container = document.getElementById('bcaQueueList');
        if (patientQueue.length === 0) {
            container.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b; font-size: 12px;">Chưa có dữ liệu.</div>`;
            return;
        }

        container.innerHTML = patientQueue.map((p, idx) => {
            let badgeClass = 'bca-badge-pending';
            let statusText = 'Chờ xử lý';
            if (p.status === 'running') { badgeClass = 'bca-badge-running'; statusText = 'Đang tìm...'; }
            else if (p.status === 'success') { badgeClass = 'bca-badge-success'; statusText = 'Đã ra viện ✓'; }
            else if (p.status === 'not_found') { badgeClass = 'bca-badge-warning'; statusText = 'Không thấy ⚠'; }
            else if (p.status === 'error') { badgeClass = 'bca-badge-danger'; statusText = 'Lỗi ✕'; }

            const subInfo = [p.docId, p.ngaySinh, p.phongKhoa].filter(Boolean).join(' • ');

            return `
                <div class="bca-queue-item ${idx === currentIndex && isRunning ? 'active' : ''}" id="queue-item-${idx}">
                    <div class="bca-patient-info">
                        <div class="bca-patient-name">${idx + 1}. ${p.hoTen}</div>
                        ${subInfo ? `<div class="bca-patient-sub">${subInfo}</div>` : ''}
                    </div>
                    <span class="bca-status-badge ${badgeClass}">${statusText}</span>
                </div>
            `;
        }).join('');
    }

    function updateStats() {
        const total = patientQueue.length;
        const success = patientQueue.filter(p => p.status === 'success').length;
        const notFound = patientQueue.filter(p => p.status === 'not_found').length;
        const error = patientQueue.filter(p => p.status === 'error').length;

        document.getElementById('bcaStatTotal').textContent = total;
        document.getElementById('bcaStatSuccess').textContent = success;
        document.getElementById('bcaStatNotFound').textContent = notFound;
        document.getElementById('bcaStatError').textContent = error;

        if (total > 0 && (success + notFound + error === total)) {
            document.getElementById('bcaBtnExportReport').style.display = 'flex';
        }
    }

    function log(msg) {
        const box = document.getElementById('bcaLogBox');
        if (!box) return;
        const time = new Date().toLocaleTimeString('vi-VN');
        box.textContent = `[${time}] ${msg}\n` + box.textContent.slice(0, 1500);
    }

    // ==========================================
    // Smart DOM Automation Engine
    // ==========================================

    // 1. Find Search Input Field
    function findSearchInput() {
        if (customSelectors.searchInput) {
            const el = document.querySelector(customSelectors.searchInput);
            if (el) return el;
        }

        // Priority 1: First text input in filter/search bar (often next to search icon or placeholder)
        const candidateSelectors = [
            'input[placeholder*="tìm" i]',
            'input[placeholder*="họ tên" i]',
            'input[placeholder*="cccd" i]',
            'input[placeholder*="giấy tờ" i]',
            'input[placeholder*="search" i]',
            '.search-box input',
            '.filter-box input',
            '.ant-input-search input',
            '.ant-input[type="text"]',
            '.el-input__inner',
            'input.form-control[type="text"]',
            'input[type="search"]',
            'input[type="text"]'
        ];

        for (const selector of candidateSelectors) {
            const inputs = Array.from(document.querySelectorAll(selector));
            for (const inp of inputs) {
                if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly && !widget.contains(inp)) {
                    // Make sure it's not a datepicker input (usually has 'ngày' in placeholder or name)
                    const ph = (inp.placeholder || '').toLowerCase();
                    const name = (inp.name || '').toLowerCase();
                    if (ph.includes('ngày') || name.includes('date') || ph.includes('phòng') || ph.includes('căn hộ')) {
                        continue;
                    }
                    return inp;
                }
            }
        }

        // Fallback: any visible text input on page
        const anyInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        for (const inp of anyInputs) {
            if (inp.offsetParent !== null && !inp.disabled && !inp.readOnly && !widget.contains(inp)) {
                return inp;
            }
        }
        return null;
    }

    // 2. Find Search Button
    function findSearchButton(searchInput) {
        if (customSelectors.searchButton) {
            const el = document.querySelector(customSelectors.searchButton);
            if (el) return el;
        }

        // Search near search input first
        if (searchInput && searchInput.parentElement) {
            const nearBtn = searchInput.parentElement.querySelector('button, .ant-input-search-button, [role="button"], i, svg');
            if (nearBtn) return nearBtn.closest('button, [role="button"]') || nearBtn;
            if (searchInput.parentElement.parentElement) {
                const nearBtn2 = searchInput.parentElement.parentElement.querySelector('button, [role="button"]');
                if (nearBtn2) return nearBtn2;
            }
        }

        const allButtons = Array.from(document.querySelectorAll('button, a.btn, [role="button"], input[type="submit"]'));
        for (const btn of allButtons) {
            if (btn.offsetParent === null || btn.disabled || widget.contains(btn)) continue;
            const text = normalizeStr(stripAccents(btn.innerText || btn.value || ''));
            if (text.includes('tim kiem') || text === 'tim' || text.includes('tra cuu') || text.includes('search')) {
                return btn;
            }
            if (btn.querySelector('.fa-search, .anticon-search, .bi-search, svg')) {
                return btn;
            }
        }
        return null;
    }

    // 3. Set input value with full React / Vue synthetic event dispatch
    function setInputValue(input, val) {
        input.focus();
        input.value = val;

        // Dispatch synthetic events for React / Vue / Angular
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, val);
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    // 4. Find patient row in results table with multi-criteria verification (Họ tên, Ngày sinh, CCCD, Khoa/Phòng, Ngày đến)
    function findPatientRow(patient) {
        const normName = normalizeStr(stripAccents(patient.hoTen));
        const cleanDoc = patient.docId ? patient.docId.trim().toUpperCase() : '';
        const cleanDob = patient.ngaySinh ? normalizeStr(patient.ngaySinh) : '';
        const cleanRoom = patient.phongKhoa ? normalizeStr(stripAccents(patient.phongKhoa)) : '';
        const cleanAdmit = patient.ngayDen ? normalizeStr(patient.ngayDen) : '';

        const rows = Array.from(document.querySelectorAll('tbody tr, .ant-table-row, .el-table__row, table tr'));
        let bestRow = null;
        let highestScore = -1;

        for (const row of rows) {
            if (row.offsetParent === null || widget.contains(row)) continue;

            const cells = Array.from(row.querySelectorAll('td, th'));
            const rowFullText = normalizeStr(stripAccents(row.innerText));

            // Must match patient name or docId
            let nameMatched = false;
            if (rowFullText.includes(normName)) {
                nameMatched = true;
            }
            if (!nameMatched && cleanDoc && rowFullText.includes(cleanDoc.toLowerCase())) {
                nameMatched = true;
            }

            if (!nameMatched) continue;

            // Start score calculation
            let score = 50; // Base score for name match

            // Extract table columns on BCA: [0: Checkbox, 1: STT, 2: Họ tên, 3: Ngày sinh, 4: Giới tính, 5: Loại GT, 6: Số GT, 7: Ngày đến, ..., 11: Số phòng/Khoa]
            let rowDob = '', rowDocId = '', rowAdmit = '', rowRoom = '';
            if (cells.length >= 8) {
                rowDob = normalizeStr(cells[3]?.innerText || '');
                rowDocId = normalizeStr(cells[6]?.innerText || '').toUpperCase();
                rowAdmit = normalizeStr(cells[7]?.innerText || '');
                if (cells.length >= 12) {
                    rowRoom = normalizeStr(stripAccents(cells[11]?.innerText || ''));
                }
            }

            // 1. Check CCCD / Số giấy tờ
            if (cleanDoc) {
                if (rowDocId && rowDocId.includes(cleanDoc)) {
                    score += 100; // Perfect CCCD match
                } else if (rowFullText.includes(cleanDoc.toLowerCase())) {
                    score += 80;
                } else if (rowDocId && rowDocId !== '' && !rowDocId.includes(cleanDoc)) {
                    score -= 40; // Different CCCD
                }
            }

            // 2. Check Ngày sinh (DOB)
            if (cleanDob) {
                const dobParts = cleanDob.split(/[\/\-\.]/);
                const dobYear = dobParts[dobParts.length - 1]; // e.g. 1957 or 1943

                if (rowDob && (rowDob === cleanDob || rowDob.includes(cleanDob))) {
                    score += 60; // Exact DOB match
                } else if (rowFullText.includes(cleanDob)) {
                    score += 50;
                } else if (dobYear && dobYear.length === 4 && (rowDob.includes(dobYear) || rowFullText.includes(dobYear))) {
                    score += 35; // Year of birth match
                } else if (rowDob && rowDob !== '' && dobYear && !rowDob.includes(dobYear)) {
                    score -= 35; // Different birth year
                }
            }

            // 3. Check Phòng / Khoa
            if (cleanRoom) {
                const roomKeywords = cleanRoom.split(/[\-\,\/]/).map(s => s.trim()).filter(s => s.length > 2);
                let roomMatched = false;
                for (const kw of roomKeywords) {
                    if ((rowRoom && rowRoom.includes(kw)) || rowFullText.includes(kw)) {
                        roomMatched = true;
                        break;
                    }
                }
                if (roomMatched) {
                    score += 40;
                }
            }

            // 4. Check Ngày đến / Ngày nhập viện
            if (cleanAdmit) {
                if ((rowAdmit && rowAdmit.includes(cleanAdmit)) || rowFullText.includes(cleanAdmit)) {
                    score += 30;
                }
            }

            if (score > highestScore) {
                highestScore = score;
                bestRow = row;
            }
        }

        if (bestRow) {
            log(`🎯 Đã chọn dòng chính xác (Độ khớp: ${highestScore}đ)`);
        }

        return bestRow;
    }

    // 5. Find Checkout button based on configured method
    // PRIORITY ORDER: Custom > Toolbar (checkbox+toolbar) > Action button in row
    // User requested: ALWAYS PRIORITIZE toolbar checkout button
    function findCheckoutButton(row) {
        // Method 0: Custom selector if user explicitly configured
        if (checkoutMethod === 'custom' && customSelectors.checkoutButton) {
            const el = row.querySelector(customSelectors.checkoutButton) || document.querySelector(customSelectors.checkoutButton);
            if (el) {
                log('ℹ️ Phương thức: Bộ chọn tùy chỉnh');
                return el;
            }
        }

        // Method 1 (PREFERRED): Toolbar checkout button
        // This is prioritized for both 'auto' and 'checkbox_toolbar' modes
        if (checkoutMethod === 'auto' || checkoutMethod === 'checkbox_toolbar') {
            const topToolbarBtn = findToolbarCheckoutButton();
            if (topToolbarBtn) {
                log('ℹ️ Phương thức: Bấm nút Toolbar "Checkout/Trả phòng" (Ưu tiên)');
                return topToolbarBtn;
            }
        }

        // Method 2: Action button in row (fallback for 'auto' and 'action_btn' modes)
        if (checkoutMethod === 'auto' || checkoutMethod === 'action_btn') {
            const cells = Array.from(row.querySelectorAll('td'));
            const actionCell = cells.length > 0 ? cells[cells.length - 1] : row;

            const actionButtons = Array.from(actionCell.querySelectorAll('button, a, [role="button"], span, div, i')).filter(el => {
                return el.offsetParent !== null && (
                    el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button' ||
                    el.classList.contains('ant-btn') || el.classList.contains('btn') ||
                    el.onclick !== null || el.style.cursor === 'pointer' ||
                    window.getComputedStyle(el).borderRadius.includes('50%') ||
                    window.getComputedStyle(el).borderRadius.includes('9999px') ||
                    el.querySelector('svg, i, .fa-check') !== null
                );
            });

            // 2.1: Look for green circular checkmark button in action cell
            for (const btn of actionButtons) {
                const style = window.getComputedStyle(btn);
                const bgColor = style.backgroundColor || '';
                const isGreen = bgColor.includes('rgb(82, 196, 26)') || bgColor.includes('rgb(34, 197, 94)') ||
                                bgColor.includes('rgb(22, 163, 74)') || bgColor.includes('rgb(46, 125, 50)') ||
                                bgColor.includes('rgb(74, 222, 128)') || bgColor.includes('rgb(40, 167, 69)') ||
                                bgColor.includes('rgb(56, 158, 13)') || bgColor.includes('rgb(104, 182, 28)');

                const hasCheck = btn.querySelector('.fa-check, .anticon-check, svg') ||
                                 btn.innerText.includes('✓') || btn.innerText.includes('✔') ||
                                 (btn.className && btn.className.includes('check'));

                const title = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').toLowerCase();
                const isCheckoutTitle = title.includes('checkout') || title.includes('trả phòng') || title.includes('tra phong');

                if (isGreen || (hasCheck && !title.includes('gia hạn')) || isCheckoutTitle) {
                    log('ℹ️ Phương thức: Nút xanh lá trên dòng (Action Button)');
                    return btn.closest('button, a, [role="button"]') || btn;
                }
            }

            // 2.2: 5th circular button in action cell (Index 4)
            const circularBtns = Array.from(actionCell.querySelectorAll('button, a, [role="button"], span.btn, div.btn')).filter(el => el.offsetParent !== null);
            if (circularBtns.length >= 5) {
                log('ℹ️ Phương thức: Nút thứ 5 trong cột hành động');
                return circularBtns[4];
            }

            // 2.3: Search for check icon in action cell
            const checkIconEl = actionCell.querySelector('.fa-check, .anticon-check, i.check, svg');
            if (checkIconEl) {
                log('ℹ️ Phương thức: Biểu tượng check trong cột hành động');
                return checkIconEl.closest('button, a, [role="button"], span, div') || checkIconEl;
            }
        }

        return null;
    }

    // Helper: Find top toolbar "Checkout/Trả phòng" button
    function findToolbarCheckoutButton() {
        const buttons = Array.from(document.querySelectorAll('button, a.btn, [role="button"]'));
        for (const btn of buttons) {
            if (widget.contains(btn) || btn.offsetParent === null) continue;
            const text = normalizeStr(stripAccents(btn.innerText || ''));
            if (text.includes('checkout') || text.includes('tra phong') || text.includes('checkout/tra phong')) {
                return btn;
            }
        }
        return null;
    }

    // 6. Handle Confirm Modal Dialog
    // CRITICAL: Only search INSIDE real modal containers, never on the entire page
    // Priority: "Có" > "Xác nhận" > "Đồng ý" > "OK"
    // NEVER click "Checkout/Trả phòng" here — that's the toolbar, not a confirm button
    async function handleConfirmModal() {
        if (!autoConfirmModal) return;

        // Try confirming up to 3 times in case of cascading modals
        for (let attempt = 0; attempt < 3; attempt++) {
            await sleep(600);

            // Check custom selector first
            if (customSelectors.confirmButton) {
                const el = document.querySelector(customSelectors.confirmButton);
                if (el && el.offsetParent !== null && !widget.contains(el)) {
                    el.click();
                    log('[Modal] Đã nhấn nút Xác nhận theo cấu hình.');
                    await waitForModalToClose();
                    return;
                }
            }

            // ============================================
            // Find REAL modal containers only
            // These are the actual overlay/popup elements, NOT random divs
            // ============================================
            const modalSelectors = [
                '.ant-modal-wrap',       // Ant Design modal wrapper
                '.ant-modal',            // Ant Design modal
                '.ant-confirm',          // Ant Design confirm dialog
                '.ant-modal-confirm',    // Ant Design confirm
                '.modal.show',           // Bootstrap modal (shown)
                '.modal.in',             // Bootstrap modal (old version)
                '.swal2-container',      // SweetAlert2
                '.el-message-box__wrapper', // Element UI
                '.el-dialog__wrapper',   // Element UI dialog
                '[role="dialog"]',       // Accessible dialog
                '.confirm-modal',        // Generic confirm modal
                '.nz-modal-wrap',        // ng-zorro
            ];

            const modalContainers = [];
            for (const sel of modalSelectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    if (el.offsetParent !== null && !widget.contains(el)) {
                        modalContainers.push(el);
                    }
                }
            }

            if (modalContainers.length === 0) {
                // No modal found, check if maybe it's a native-like modal body overlay
                const overlays = document.querySelectorAll('.ant-modal-root, .modal-backdrop, .swal2-shown');
                if (overlays.length === 0) {
                    log('[Modal] Không tìm thấy hộp thoại popup nào.');
                    break;
                }
                // Try finding modal again with broader but still modal-specific selectors
                const rootModal = document.querySelector('.ant-modal-root .ant-modal, .modal-dialog');
                if (rootModal && rootModal.offsetParent !== null) {
                    modalContainers.push(rootModal);
                } else {
                    break;
                }
            }

            let clicked = false;

            for (const modal of modalContainers) {
                // Fill date input inside modal if empty
                const modalDateInputs = modal.querySelectorAll('input[type="text"], .ant-input');
                for (const inp of modalDateInputs) {
                    if (inp.offsetParent !== null && !inp.value && !widget.contains(inp)) {
                        const ph = (inp.placeholder || '').toLowerCase();
                        // Only fill if it looks like a date field
                        if (ph.includes('ngày') || ph.includes('date') || ph === '' || ph.includes('dd/mm')) {
                            const now = new Date();
                            const dd = String(now.getDate()).padStart(2, '0');
                            const mm = String(now.getMonth() + 1).padStart(2, '0');
                            const yyyy = now.getFullYear();
                            const hh = String(now.getHours()).padStart(2, '0');
                            const min = String(now.getMinutes()).padStart(2, '0');
                            setInputValue(inp, `${dd}/${mm}/${yyyy} ${hh}:${min}`);
                            log(`[Modal] Tự động điền ngày giờ trả phòng: ${dd}/${mm}/${yyyy} ${hh}:${min}`);
                        }
                    }
                }

                // ============================================
                // Find confirm buttons INSIDE this modal only
                // Priority order: "Có" → "Xác nhận" → "Đồng ý" → "OK"
                // ============================================
                const allBtns = Array.from(modal.querySelectorAll('button, a.btn, [role="button"], .ant-btn, input[type="button"]'));
                
                // Sort buttons by priority
                let bestBtn = null;
                let bestPriority = 999;

                for (const btn of allBtns) {
                    if (btn.offsetParent === null || widget.contains(btn)) continue;
                    const btnText = normalizeStr(stripAccents(btn.innerText || btn.value || ''));

                    // SKIP: negative/cancel buttons
                    if (btnText.includes('khong') || btnText.includes('huy') || btnText === 'dong' || btnText === 'cancel' || btnText === 'close') {
                        continue;
                    }

                    // SKIP: buttons that say "checkout" or "trả phòng" — these are NOT confirm buttons
                    // The confirm button in the modal is "Có", "Xác nhận", "Đồng ý", etc.
                    if (btnText.includes('checkout') || btnText.includes('tra phong')) {
                        continue;
                    }

                    // Priority ranking
                    let priority = 999;
                    if (btnText === 'co') priority = 1;                          // "Có" — highest priority
                    else if (btnText === 'ok') priority = 2;                     // "OK"
                    else if (btnText.includes('xac nhan')) priority = 3;         // "Xác nhận"
                    else if (btnText.includes('dong y')) priority = 4;           // "Đồng ý"
                    else if (btn.classList.contains('ant-btn-primary')) priority = 5;   // Ant primary button
                    else if (btn.classList.contains('btn-primary')) priority = 5;       // Bootstrap primary
                    else if (btn.classList.contains('btn-success')) priority = 5;       // Bootstrap success
                    else if (btn.classList.contains('swal2-confirm')) priority = 5;     // SweetAlert confirm

                    if (priority < bestPriority) {
                        bestPriority = priority;
                        bestBtn = btn;
                    }
                }

                if (bestBtn) {
                    bestBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    bestBtn.click();
                    bestBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    log(`[Modal] ✅ Đã bấm nút xác nhận: "${bestBtn.innerText.trim()}" (ưu tiên: ${bestPriority})`);
                    clicked = true;
                    break;
                }
            }

            if (clicked) {
                await waitForModalToClose();
                await sleep(600); // check if a 2nd confirmation dialog appears
            } else {
                break;
            }
        }
    }

    // Wait until modal dialog has fully closed before moving to next patient
    async function waitForModalToClose() {
        let waitCount = 0;
        while (waitCount < 20) {
            const openModals = Array.from(document.querySelectorAll('.modal.show, .modal.in, .ant-modal, .swal2-container, .el-message-box, [role="dialog"]')).filter(m => {
                return m.offsetParent !== null && !widget.contains(m);
            });
            if (openModals.length === 0) break;
            await sleep(250);
            waitCount++;
        }
        await sleep(800); // extra wait for server API response
    }

    // ==========================================
    // Robust Automation Execution Controller
    // ==========================================
    let currentRunId = 0;

    async function startExecution(fromIdx = 0) {
        isRunning = true;
        isPaused = false;
        currentRunId++;
        const runId = currentRunId;

        btnStartText.textContent = 'TẠM DỪNG';
        btnStartIcon.textContent = '⏸️';
        btnStop.disabled = false;

        // Find starting index
        let startFrom = fromIdx;
        if (startFrom >= patientQueue.length || patientQueue[startFrom].status === 'success') {
            const nextPending = patientQueue.findIndex(p => p.status !== 'success');
            startFrom = nextPending !== -1 ? nextPending : 0;
        }

        for (let i = startFrom; i < patientQueue.length; i++) {
            if (!isRunning || runId !== currentRunId) break;

            // Wait if paused
            while (isPaused) {
                if (!isRunning || runId !== currentRunId) break;
                await sleep(300);
            }
            if (!isRunning || runId !== currentRunId) break;

            const patient = patientQueue[i];
            if (patient.status === 'success') continue;

            currentIndex = i;
            patient.status = 'running';
            updateQueueUI();
            updateStats();

            // Scroll queue list to active item
            const itemEl = document.getElementById(`queue-item-${i}`);
            if (itemEl) itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            await doCheckoutPatient(patient, i, runId);

            if (!isRunning || runId !== currentRunId) break;

            updateQueueUI();
            updateStats();

            if (executionMode === 'step') {
                isPaused = true;
                btnStartText.textContent = 'TIẾP TỤC (BƯỚC KẾ)';
                btnStartIcon.textContent = '▶️';
                log(`⏸️ Đã xong bước [${i + 1}/${patientQueue.length}]. Bấm Tiếp tục để xử lý người kế tiếp.`);
                break;
            }

            if (isRunning && !isPaused && i < patientQueue.length - 1) {
                await sleep(stepDelayMs);
            }
        }

        if (isRunning && !isPaused && runId === currentRunId) {
            const hasPending = patientQueue.some(p => p.status === 'pending' || p.status === 'running');
            if (!hasPending) {
                log('🎉 HOÀN THÀNH TẤT CẢ DANH SÁCH!');
                stopExecution();
            }
        }
    }

    // Helper: Select row checkbox before checkout
    async function selectRowCheckbox(row) {
        if (!row) return;

        // 1. Uncheck ALL other rows first (clear any stale selections)
        const allCheckedBoxes = Array.from(document.querySelectorAll(
            'tbody tr input[type="checkbox"]:checked, .ant-table-row input[type="checkbox"]:checked, table tr input[type="checkbox"]:checked'
        ));
        for (const cb of allCheckedBoxes) {
            if (!row.contains(cb) && !widget.contains(cb)) {
                // For Ant Design: click the wrapper, not the hidden input
                const wrapper = cb.closest('.ant-checkbox-wrapper') || cb.closest('.ant-checkbox') || cb.closest('label');
                if (wrapper) {
                    wrapper.click();
                } else {
                    cb.click();
                }
                await sleep(100);
            }
        }

        // 2. Also uncheck "select all" header checkbox if checked
        const headerCheckboxes = Array.from(document.querySelectorAll(
            'thead input[type="checkbox"]:checked, .ant-table-header input[type="checkbox"]:checked'
        ));
        for (const hcb of headerCheckboxes) {
            if (!widget.contains(hcb)) {
                const wrapper = hcb.closest('.ant-checkbox-wrapper') || hcb.closest('label');
                if (wrapper) wrapper.click(); else hcb.click();
                await sleep(100);
            }
        }

        await sleep(200);

        // 3. Check current row's checkbox
        // Strategy: For Ant Design, clicking the wrapper is the most reliable
        const firstCell = row.querySelector('td:first-child, td.ant-table-selection-column, .ant-table-selection-column') || row;
        const checkbox = firstCell.querySelector('input[type="checkbox"]') || row.querySelector('input[type="checkbox"]');

        // Ant Design checkbox hierarchy: .ant-checkbox-wrapper > .ant-checkbox > input
        const antCheckboxWrapper = firstCell.querySelector('.ant-checkbox-wrapper') ||
                                   row.querySelector('.ant-checkbox-wrapper');
        const antCheckbox = firstCell.querySelector('.ant-checkbox') ||
                            row.querySelector('.ant-checkbox');

        // Check if already selected
        const isAlreadyChecked = checkbox?.checked ||
            antCheckbox?.classList?.contains('ant-checkbox-checked') ||
            row.classList.contains('ant-table-row-selected');

        if (!isAlreadyChecked) {
            if (antCheckboxWrapper) {
                // Ant Design: click the wrapper element
                antCheckboxWrapper.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                antCheckboxWrapper.click();
                antCheckboxWrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            } else if (checkbox) {
                // Standard HTML checkbox: set property + dispatch events
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
                if (nativeSetter) nativeSetter.call(checkbox, true);
                checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // Fallback: try clicking the first cell or the row itself
                firstCell.click();
            }
            log('☑️ Đã tích chọn ô checkbox của bệnh nhân.');
        } else {
            log('☑️ Bệnh nhân đã được chọn sẵn.');
        }

        // Wait for React/Ant Design/Vue internal state to register row selection
        await sleep(400);

        // 4. Verify selection actually took effect
        const verifyChecked = checkbox?.checked ||
            row.querySelector('.ant-checkbox-checked') ||
            row.classList.contains('ant-table-row-selected');
        if (!verifyChecked) {
            log('⚠️ Checkbox có thể chưa được chọn đúng, thử lại lần 2...');
            // Retry: click directly on the row's checkbox area
            if (antCheckboxWrapper) {
                antCheckboxWrapper.click();
            } else if (checkbox) {
                checkbox.click();
            }
            await sleep(400);
        }
    }

    async function doCheckoutPatient(patient, idx, runId) {
        const searchKeyword = (searchMode === 'docId' && patient.docId) ? patient.docId : patient.hoTen;
        log(`🔍 [${idx + 1}/${patientQueue.length}] Đang tìm: "${searchKeyword}" (${patient.hoTen})`);

        try {
            // ============================================
            // STEP 1: Find Search input
            // ============================================
            const input = findSearchInput();
            if (!input) {
                throw new Error('Không tìm thấy ô tìm kiếm trên trang web.');
            }

            // ============================================
            // STEP 2: Clear previous search & Fill new keyword
            // ============================================
            setInputValue(input, '');
            await sleep(200);
            setInputValue(input, searchKeyword);
            await sleep(300);
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 3: Click Search Button or trigger Enter
            // ============================================
            const searchBtn = findSearchButton(input);
            if (searchBtn) {
                searchBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                searchBtn.click();
                searchBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            } else {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            }

            // ============================================
            // STEP 4: Wait for results to refresh (critical wait)
            // ============================================
            await sleep(Math.max(1500, stepDelayMs));
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 5: Find patient row with multi-criteria verification
            // ============================================
            const row = findPatientRow(patient);
            if (!row) {
                log(`⚠️ Không tìm thấy "${patient.hoTen}" trong kết quả.`);
                patient.status = 'not_found';
                patient.errorMsg = 'Không tìm thấy trên web';
                return;
            }

            // Highlight row
            row.classList.add('bca-highlight-row');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(400);
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 6: ALWAYS SELECT ROW CHECKBOX FIRST
            // (Bắt buộc tích chọn bản ghi trước khi checkout)
            // ============================================
            await selectRowCheckbox(row);
            await sleep(300);
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 7: Find & Click Checkout button
            // ============================================
            const checkoutBtn = findCheckoutButton(row);
            if (!checkoutBtn) {
                throw new Error('Tìm thấy dòng BN nhưng không thấy nút "Trả phòng".');
            }

            checkoutBtn.classList.add('bca-highlight-target');
            log(`🚪 Đang mở hộp thoại Trả phòng cho "${patient.hoTen}"...`);
            await sleep(200);
            checkoutBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            checkoutBtn.click();
            checkoutBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));

            // ============================================
            // STEP 8: Wait for checkout modal/popup to appear
            // ============================================
            await sleep(800);
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 9: Handle Confirm Modal
            // (Bấm nút "Có" / "Checkout/Trả phòng" / "Xác nhận")
            // MUST complete before moving to next patient!
            // ============================================
            await handleConfirmModal();
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 10: Wait for modal to FULLY close
            // This is critical: DO NOT search for next patient until modal is closed
            // and server has processed the checkout request
            // ============================================
            await waitForModalToClose();
            if (!isRunning || runId !== currentRunId) return;

            // Extra safety: wait for table to refresh after checkout
            await sleep(1000);
            if (!isRunning || runId !== currentRunId) return;

            // ============================================
            // STEP 11: Mark success
            // ============================================
            patient.status = 'success';
            patient.errorMsg = '';
            log(`✅ [${idx + 1}/${patientQueue.length}] ĐÃ CHECK-OUT THÀNH CÔNG: "${patient.hoTen}"`);
            row.classList.remove('bca-highlight-row');

            // ============================================
            // STEP 12: Clear search input before next patient
            // Only now is it safe to clear and prepare for next search
            // ============================================
            const searchInputEl = findSearchInput();
            if (searchInputEl) {
                setInputValue(searchInputEl, '');
            }
            await sleep(600);

        } catch (err) {
            log(`❌ Lỗi [${patient.hoTen}]: ${err.message}`);
            patient.status = 'error';
            patient.errorMsg = err.message;
        }
    }

    // Controls
    const btnStart = document.getElementById('bcaBtnStart');
    const btnStartText = document.getElementById('bcaBtnStartText');
    const btnStartIcon = document.getElementById('bcaBtnStartIcon');
    const btnStep = document.getElementById('bcaBtnStep');
    const btnStop = document.getElementById('bcaBtnStop');

    btnStart.addEventListener('click', () => {
        if (patientQueue.length === 0) {
            log('⚠️ Chưa có dữ liệu. Vui lòng nạp danh sách ở Tab 1.');
            return;
        }

        if (!isRunning) {
            // Start from beginning or first non-success item
            executionMode = 'auto';
            startExecution(0);
        } else if (!isPaused) {
            // Pause
            isPaused = true;
            btnStartText.textContent = 'TIẾP TỤC';
            btnStartIcon.textContent = '▶️';
            log('⏸️ Đã tạm dừng. Bấm "Tiếp tục" để chạy lại.');
        } else {
            // Resume
            isPaused = false;
            executionMode = 'auto';
            btnStartText.textContent = 'TẠM DỪNG';
            btnStartIcon.textContent = '⏸️';
            log('▶️ Đang tiếp tục chạy...');
        }
    });

    btnStep.addEventListener('click', () => {
        if (patientQueue.length === 0) {
            log('⚠️ Chưa có dữ liệu. Vui lòng nạp danh sách ở Tab 1.');
            return;
        }
        executionMode = 'step';
        const nextPending = patientQueue.findIndex(p => p.status !== 'success');
        const targetIdx = nextPending !== -1 ? nextPending : 0;

        if (targetIdx < patientQueue.length) {
            startExecution(targetIdx);
        } else {
            log('🎉 Đã xử lý hết danh sách.');
        }
    });

    btnStop.addEventListener('click', () => {
        stopExecution();
        log('⏹️ Đã dừng tiến trình.');
    });

    function stopExecution() {
        isRunning = false;
        isPaused = false;
        currentRunId++; // invalidate any ongoing loop
        btnStartText.textContent = 'BẮT ĐẦU TỰ ĐỘNG';
        btnStartIcon.textContent = '▶️';
        btnStop.disabled = true;

        // Reset any running status back to pending
        patientQueue.forEach(p => {
            if (p.status === 'running') p.status = 'pending';
        });
        updateQueueUI();
        updateStats();
    }

    // Export Report
    document.getElementById('bcaBtnExportReport').addEventListener('click', () => {
        if (typeof XLSX === 'undefined' || patientQueue.length === 0) return;

        const header = ['STT', 'Họ và tên', 'Số giấy tờ', 'Phòng/Khoa', 'Trạng thái', 'Ghi chú / Lỗi'];
        const data = [header];

        patientQueue.forEach((p, idx) => {
            let sttText = 'Chờ xử lý';
            if (p.status === 'success') sttText = 'Đã trả phòng thành công';
            else if (p.status === 'not_found') sttText = 'Không tìm thấy trên web BCA';
            else if (p.status === 'error') sttText = 'Lỗi trong quá trình thao tác';

            data.push([idx + 1, p.hoTen, p.docId, p.phongKhoa, sttText, p.errorMsg || '']);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 26 }, { wch: 30 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ket_Qua_Checkout');

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        XLSX.writeFile(wb, `BaoCao_Checkout_BCA_${dd}${mm}.xlsx`);
    });

    // ==========================================
    // Settings & Element Picker
    // ==========================================
    const searchModeSelect = document.getElementById('bcaSearchModeSelect');
    const delaySelect = document.getElementById('bcaDelaySelect');
    const autoConfirmCheck = document.getElementById('bcaAutoConfirmCheck');
    const checkoutMethodSelect = document.getElementById('bcaCheckoutMethodSelect');

    searchModeSelect.addEventListener('change', (e) => {
        searchMode = e.target.value;
        saveSettings();
    });

    delaySelect.addEventListener('change', (e) => {
        stepDelayMs = parseInt(e.target.value, 10);
        saveSettings();
    });

    autoConfirmCheck.addEventListener('change', (e) => {
        autoConfirmModal = e.target.checked;
        saveSettings();
    });

    if (checkoutMethodSelect) {
        checkoutMethodSelect.addEventListener('change', (e) => {
            checkoutMethod = e.target.value;
            saveSettings();
            log(`⚙️ Đã chuyển phương thức bấm Checkout sang: "${e.target.options[e.target.selectedIndex].text}"`);
        });
    }

    function saveSettings() {
        chrome.storage?.local?.set({
            bca_delay: stepDelayMs,
            bca_searchMode: searchMode,
            bca_checkoutMethod: checkoutMethod,
            bca_autoConfirm: autoConfirmModal,
            bca_selectors: customSelectors
        });
    }

    function updateSettingsUI() {
        if (searchModeSelect) searchModeSelect.value = searchMode;
        if (delaySelect) delaySelect.value = String(stepDelayMs);
        if (autoConfirmCheck) autoConfirmCheck.checked = autoConfirmModal;
        if (checkoutMethodSelect) checkoutMethodSelect.value = checkoutMethod;

        const cfgInp = document.getElementById('cfgSearchInput');
        const cfgBtn = document.getElementById('cfgSearchButton');
        const cfgChk = document.getElementById('cfgCheckoutButton');
        const cfgCnf = document.getElementById('cfgConfirmButton');

        if (cfgInp) cfgInp.value = customSelectors.searchInput || '';
        if (cfgBtn) cfgBtn.value = customSelectors.searchButton || '';
        if (cfgChk) cfgChk.value = customSelectors.checkoutButton || '';
        if (cfgCnf) cfgCnf.value = customSelectors.confirmButton || '';
    }

    document.getElementById('bcaBtnSaveConfig').addEventListener('click', () => {
        customSelectors.searchInput = document.getElementById('cfgSearchInput').value.trim();
        customSelectors.searchButton = document.getElementById('cfgSearchButton').value.trim();
        customSelectors.checkoutButton = document.getElementById('cfgCheckoutButton').value.trim();
        customSelectors.confirmButton = document.getElementById('cfgConfirmButton').value.trim();
        if (customSelectors.checkoutButton) {
            checkoutMethod = 'custom';
            if (checkoutMethodSelect) checkoutMethodSelect.value = 'custom';
        }
        saveSettings();
        log('💾 Đã lưu cấu hình bộ chọn tùy chỉnh!');
    });

    // Element Picker Feature
    widget.querySelectorAll('.bca-pick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetType = e.currentTarget.dataset.target;
            startElementPicker(targetType);
        });
    });

    function startElementPicker(targetType) {
        log(`🎯 Đang chọn phần tử cho [${targetType}]. Hãy rê chuột và click vào phần tử trên trang (Bấm phím ESC để hủy)...`);
        widget.style.opacity = '0.2';

        function cleanup() {
            document.removeEventListener('mouseover', onHover, true);
            document.removeEventListener('mouseout', onLeave, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            widget.style.opacity = '1';
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                cleanup();
                log('❌ Đã hủy chọn phần tử.');
            }
        }

        function onHover(e) {
            if (widget.contains(e.target) || e.target === launcherBtn) return;
            e.target.style.outline = '3px solid #38bdf8';
            e.target.style.cursor = 'crosshair';
        }

        function onLeave(e) {
            if (widget.contains(e.target) || e.target === launcherBtn) return;
            e.target.style.outline = '';
            e.target.style.cursor = '';
        }

        function onClick(e) {
            if (widget.contains(e.target) || e.target === launcherBtn) return;
            e.preventDefault();
            e.stopPropagation();

            e.target.style.outline = '';
            e.target.style.cursor = '';
            cleanup();

            // Generate CSS selector
            const selector = generateSelector(e.target);
            log(`🎯 Đã chọn thành công: "${selector}"`);

            customSelectors[targetType] = selector;
            if (targetType === 'checkoutButton') {
                checkoutMethod = 'custom';
            }
            updateSettingsUI();
            saveSettings();
        }

        document.addEventListener('mouseover', onHover, true);
        document.addEventListener('mouseout', onLeave, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
    }

    function generateSelector(el) {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('name')) return `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
        if (el.className && typeof el.className === 'string') {
            const validClasses = el.className.split(' ').filter(c => c && !c.startsWith('bca-'));
            if (validClasses.length) return `${el.tagName.toLowerCase()}.${validClasses.slice(0, 2).join('.')}`;
        }
        return el.tagName.toLowerCase();
    }

    log('✨ BCA Auto Check-out đã kích hoạt trên trang web.');
})();
