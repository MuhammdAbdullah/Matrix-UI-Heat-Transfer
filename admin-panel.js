/* Admin Panel — namespaced module, embedded inside index.html */
window.adminPanel = (function () {
    'use strict';

    // ── Module state ──────────────────────────────────────────────────────────
    let logCount = 0;
    let rawDataCount = 0;
    let connectionStartTime = null;
    let lastDataTime = null;
    let dataRateInterval = null;
    let initialized = false;

    // PID state
    let lastProportionalValue = '';
    let lastIntegralValue = '';
    let lastDifferentialValue = '';

    // Bootloader state
    let bootloaderConnected = false;
    let hexFileLoaded = false;
    let hexFilePath = '';

    // ── Tab switching ─────────────────────────────────────────────────────────
    function switchAdminTab(tabName) {
        ['dashboard', 'pid', 'bootloader', 'updates'].forEach(function (t) {
            var panel = document.getElementById('adminTab_' + t);
            if (panel) panel.classList.add('hidden');
            var btn = document.getElementById('adminTabBtn_' + t);
            if (btn) btn.classList.remove('tab-active');
        });
        var active = document.getElementById('adminTab_' + tabName);
        if (active) active.classList.remove('hidden');
        var activeBtn = document.getElementById('adminTabBtn_' + tabName);
        if (activeBtn) activeBtn.classList.add('tab-active');
        addLog('Switched to ' + tabName + ' tab', 'info');
    }

    // ── Logging ───────────────────────────────────────────────────────────────
    function addLog(message, type) {
        type = type || 'info';
        var container = document.getElementById('adminLogContainer');
        if (!container) return;
        var timestamp = new Date().toLocaleTimeString();
        var entry = document.createElement('div');
        entry.className = 'flex gap-1 leading-tight';
        var colorClass = type === 'error' ? 'text-error' :
                         type === 'success' ? 'text-success' :
                         type === 'warning' ? 'text-warning' : 'text-base-content/60';
        entry.innerHTML =
            '<span class="text-base-content/40 shrink-0">[' + timestamp + ']</span>' +
            '<span class="' + colorClass + '">' + message + '</span>';
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        logCount++;
        updateStats();
        while (container.children.length > 1000) container.removeChild(container.firstChild);
    }

    function addRawData(data, type) {
        type = type || 'hex';
        var container = document.getElementById('rawDataContainer');
        if (!container) return;
        var timestamp = new Date().toLocaleTimeString();
        var displayData = type === 'hex'
            ? Array.from(data).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ')
            : data.toString();
        var entry = document.createElement('div');
        entry.className = 'flex gap-1 leading-tight';
        entry.innerHTML =
            '<span class="text-base-content/40 shrink-0">[' + timestamp + ']</span>' +
            '<span class="text-base-content/80">' + displayData + '</span>';
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        rawDataCount++;
        lastDataTime = Date.now();
        updateStats();
        while (container.children.length > 2000) container.removeChild(container.firstChild);
    }

    function updateStats() {
        var el;
        el = document.getElementById('adminTotalLogs');     if (el) el.textContent = logCount;
        el = document.getElementById('adminTotalRawData');  if (el) el.textContent = rawDataCount;
        if (connectionStartTime) {
            var uptime = Date.now() - connectionStartTime;
            var h = Math.floor(uptime / 3600000);
            var m = Math.floor((uptime % 3600000) / 60000);
            var s = Math.floor((uptime % 60000) / 1000);
            el = document.getElementById('adminConnectionUptime');
            if (el) el.textContent =
                String(h).padStart(2, '0') + ':' +
                String(m).padStart(2, '0') + ':' +
                String(s).padStart(2, '0');
        }
    }

    function startDataRateCalculation() {
        if (dataRateInterval) clearInterval(dataRateInterval);
        dataRateInterval = setInterval(function () {
            if (lastDataTime) {
                var timeDiff = (Date.now() - lastDataTime) / 1000 / 60;
                var rate = timeDiff > 0 ? Math.round(rawDataCount / timeDiff) : 0;
                var el = document.getElementById('adminDataRate');
                if (el) el.textContent = rate;
            }
        }, 5000);
    }

    // ── Admin controls ────────────────────────────────────────────────────────
    function clearLogs() {
        var container = document.getElementById('adminLogContainer');
        if (!container) return;
        container.innerHTML = '';
        logCount = 0;
        addLog('Logs cleared', 'info');
    }

    function clearRawData() {
        var container = document.getElementById('rawDataContainer');
        if (!container) return;
        container.innerHTML = '';
        rawDataCount = 0;
        addLog('Raw data cleared', 'info');
        updateStats();
    }

    function exportLogs() {
        var logs = document.getElementById('adminLogContainer');
        if (!logs) return;
        var blob = new Blob([logs.innerText], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'heat-transfer-logs-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportRawData() {
        var raw = document.getElementById('rawDataContainer');
        if (!raw) return;
        var blob = new Blob([raw.innerText], { type: 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'heat-transfer-raw-data-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    function resetApp() {
        if (confirm('Reset the application? This will clear all data and restart the connection.')) {
            if (window.electronAPI && window.electronAPI.resetApp) window.electronAPI.resetApp();
            clearLogs();
            clearRawData();
            addLog('Application reset requested', 'warning');
        }
    }

    function setConnectionStartTime() {
        connectionStartTime = Date.now();
        addLog('Connection established', 'success');
    }

    // ── PID ───────────────────────────────────────────────────────────────────
    async function sendPIDValue(type, value) {
        if (!window.electronAPI || !window.electronAPI.sendPIDValue) {
            addLog('PID control not available', 'error');
            return false;
        }
        try {
            var result = await window.electronAPI.sendPIDValue(type, value);
            if (result.success) { addLog('PID ' + type + ' sent: ' + value, 'success'); return true; }
            addLog('PID ' + type + ' failed: ' + result.error, 'error'); return false;
        } catch (e) { addLog('PID error: ' + e.message, 'error'); return false; }
    }

    function updatePIDStatus(type, success, message) {
        var el = document.getElementById('admin' + type.charAt(0).toUpperCase() + type.slice(1) + 'Status');
        if (!el) return;
        el.textContent = message;
        el.className = 'badge badge-sm ' + (success ? 'badge-success' : 'badge-error');
        setTimeout(function () { el.textContent = ''; el.className = 'badge badge-sm badge-ghost'; }, 3000);
    }

    // ── Bootloader helpers ────────────────────────────────────────────────────
    function addBootloaderLog(message, type) {
        type = type || 'info';
        var container = document.getElementById('bootloaderLog');
        if (!container) return;
        var entry = document.createElement('div');
        var colorClass = type === 'error' ? 'text-error' :
                         type === 'success' ? 'text-success' : 'text-base-content/70';
        entry.className = colorClass + ' leading-tight text-xs';
        entry.textContent = '[' + new Date().toLocaleTimeString() + '] ' + message;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    function setBootloaderButtonState(state) {
        var ids = {
            connect: 'bootConnectBtn', trigger: 'bootTriggerBtn',
            loadHex: 'bootLoadHexBtn', epv: 'bootEpvBtn',
            runApp: 'bootRunAppBtn', ver: 'bootVerBtn',
            erase: 'bootEraseBtn', program: 'bootProgramBtn', verify: 'bootVerifyBtn'
        };
        var map = {
            disconnected: { connect: false, trigger: false, loadHex: true, epv: true, runApp: true, ver: true, erase: true, program: true, verify: true },
            connected:    { connect: false, trigger: true,  loadHex: false, epv: true, runApp: true, ver: true, erase: true, program: true, verify: true },
            hex_loaded:   { connect: false, trigger: true,  loadHex: false, epv: false, runApp: true, ver: true, erase: true, program: true, verify: true },
            busy:         { connect: true,  trigger: true,  loadHex: true,  epv: true,  runApp: true, ver: true, erase: true, program: true, verify: true },
            ready_to_run: { connect: true,  trigger: true,  loadHex: true,  epv: true,  runApp: false, ver: true, erase: true, program: true, verify: true }
        };
        var disabled = map[state] || map.disconnected;
        Object.keys(ids).forEach(function (key) {
            var el = document.getElementById(ids[key]);
            if (el) el.disabled = disabled[key];
        });
    }

    function enableBootloaderButtons(enabled) {
        setBootloaderButtonState(enabled ? (hexFileLoaded ? 'hex_loaded' : 'connected') : 'disconnected');
    }

    function showFirmwareProgress(label, percent, mode) {
        var section = document.getElementById('firmwareProgressSection');
        var labelEl = document.getElementById('firmwareProgressLabel');
        var fillEl  = document.getElementById('firmwareProgressFill');
        var textEl  = document.getElementById('firmwareProgressText');
        if (!section) return;
        section.classList.remove('hidden');
        if (labelEl) labelEl.textContent = label;
        if (fillEl) fillEl.style.width = (percent || 0) + '%';
        if (textEl) textEl.textContent = Math.round(percent || 0) + '%';
        if (fillEl) {
            fillEl.className = 'progress-fill h-full rounded transition-all duration-300 ' +
                (mode === 'erase' ? 'bg-warning' : mode === 'verify' ? 'bg-info' : 'bg-primary');
        }
    }

    function hideFirmwareProgress() {
        var section = document.getElementById('firmwareProgressSection');
        if (section) section.classList.add('hidden');
    }

    function updateFirmwareProgress(label, percent) {
        var labelEl = document.getElementById('firmwareProgressLabel');
        var fillEl  = document.getElementById('firmwareProgressFill');
        var textEl  = document.getElementById('firmwareProgressText');
        if (labelEl) labelEl.textContent = label;
        if (fillEl)  fillEl.style.width = percent + '%';
        if (textEl)  textEl.textContent = Math.round(percent) + '%';
    }

    // ── Communication settings ────────────────────────────────────────────────
    function onComEnableChanged() {
        var comEnabled = document.getElementById('comEnableCheck').checked;
        document.getElementById('comPortSelect').disabled = !comEnabled;
        document.getElementById('baudRateSelect').disabled = !comEnabled;
        if (comEnabled) {
            document.getElementById('usbEnableCheck').checked = false;
            document.getElementById('usbVidInput').disabled = true;
            document.getElementById('usbPidInput').disabled = true;
        }
    }

    function onUsbEnableChanged() {
        var usbEnabled = document.getElementById('usbEnableCheck').checked;
        document.getElementById('usbVidInput').disabled = !usbEnabled;
        document.getElementById('usbPidInput').disabled = !usbEnabled;
        if (usbEnabled) {
            document.getElementById('comEnableCheck').checked = false;
            document.getElementById('comPortSelect').disabled = true;
            document.getElementById('baudRateSelect').disabled = true;
        }
    }

    // ── Bootloader actions ────────────────────────────────────────────────────
    async function triggerBootloader() {
        var btn = document.getElementById('bootTriggerBtn');
        if (btn) btn.disabled = true;
        addBootloaderLog('Sending bootloader command...', 'info');
        try {
            if (window.electronAPI && window.electronAPI.sendBootloader) {
                var result = await window.electronAPI.sendBootloader(1);
                if (result.success) {
                    addBootloaderLog('Bootloader command sent', 'success');
                    addBootloaderLog('Device should now be in bootloader mode', 'info');
                } else {
                    addBootloaderLog('Failed: ' + (result.error || 'Unknown error'), 'error');
                }
            } else { addBootloaderLog('Bootloader control not available', 'error'); }
        } catch (e) { addBootloaderLog('Error: ' + e.message, 'error'); }
        finally { if (btn) btn.disabled = false; }
    }

    async function connectBootloader() {
        var connectBtn = document.getElementById('bootConnectBtn');
        if (bootloaderConnected) {
            addBootloaderLog('Disconnecting...', 'info');
            if (window.electronAPI && window.electronAPI.disconnectFromPort)
                await window.electronAPI.disconnectFromPort();
            bootloaderConnected = false;
            hexFileLoaded = false;
            if (connectBtn) connectBtn.textContent = 'Connect';
            setBootloaderButtonState('disconnected');
            addBootloaderLog('Disconnected', 'info');
            return;
        }
        var comEnabled = document.getElementById('comEnableCheck') && document.getElementById('comEnableCheck').checked;
        var usbEnabled = document.getElementById('usbEnableCheck') && document.getElementById('usbEnableCheck').checked;
        if (!comEnabled && !usbEnabled) { addBootloaderLog('Enable COM or USB first', 'error'); return; }
        if (connectBtn) connectBtn.disabled = true;
        addBootloaderLog('Connecting...', 'info');
        try {
            var result;
            if (comEnabled) {
                var port = document.getElementById('comPortSelect').value;
                var baud = parseInt(document.getElementById('baudRateSelect').value);
                if (!port) { addBootloaderLog('Select a COM port', 'error'); if (connectBtn) connectBtn.disabled = false; return; }
                if (window.electronAPI && window.electronAPI.connectToPort)
                    result = await window.electronAPI.connectToPort(port, baud);
            } else if (usbEnabled) {
                var vid = document.getElementById('usbVidInput').value;
                var pid = document.getElementById('usbPidInput').value;
                if (window.electronAPI && window.electronAPI.connectToBootloaderUSB)
                    result = await window.electronAPI.connectToBootloaderUSB(vid, pid);
            }
            if (result && result.success) {
                bootloaderConnected = true;
                if (connectBtn) connectBtn.textContent = 'Disconnect';
                setBootloaderButtonState('connected');
                addBootloaderLog('Connected', 'success');
                addBootloaderLog('Load a hex file to continue', 'info');
            } else {
                addBootloaderLog('Failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
                if (connectBtn) connectBtn.disabled = false;
            }
        } catch (e) { addBootloaderLog('Error: ' + e.message, 'error'); if (connectBtn) connectBtn.disabled = false; }
    }

    async function bootloaderVersion() {
        addBootloaderLog('Reading bootloader version...', 'info');
        if (window.electronAPI && window.electronAPI.bootloaderReadInfo) {
            var result = await window.electronAPI.bootloaderReadInfo();
            if (result && result.success)
                addBootloaderLog('Version: ' + result.majorVersion + '.' + result.minorVersion, 'success');
            else addBootloaderLog('Failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
        }
    }

    async function loadHexFile() {
        if (!window.electronAPI || !window.electronAPI.showOpenDialog) {
            addBootloaderLog('File dialog not available', 'error'); return;
        }
        try {
            var result = await window.electronAPI.showOpenDialog({
                filters: [{ name: 'Hex Files', extensions: ['hex'] }],
                properties: ['openFile']
            });
            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                hexFilePath = result.filePaths[0];
                var label = document.getElementById('hexFilePathLabel');
                if (label) { label.textContent = hexFilePath; label.classList.add('text-success'); }
                if (window.electronAPI && window.electronAPI.loadHexFile) {
                    var loadResult = await window.electronAPI.loadHexFile(hexFilePath);
                    if (loadResult && loadResult.success) {
                        hexFileLoaded = true;
                        addBootloaderLog('Hex file loaded successfully', 'success');
                        addBootloaderLog('Click Erase-Program-Verify to update firmware', 'info');
                        setBootloaderButtonState('hex_loaded');
                    } else {
                        addBootloaderLog('Load failed: ' + (loadResult && loadResult.error ? loadResult.error : 'Unknown'), 'error');
                    }
                }
            }
        } catch (e) { addBootloaderLog('Error: ' + e.message, 'error'); }
    }

    async function eraseFlash() {
        addBootloaderLog('Erasing flash...', 'info');
        enableBootloaderButtons(false);
        showFirmwareProgress('Erasing Flash...', 0, 'erase');
        if (window.electronAPI && window.electronAPI.bootloaderEraseFlash) {
            try {
                var eraseProgress = 0;
                var eraseInterval = setInterval(function () {
                    eraseProgress += 5;
                    if (eraseProgress < 90) updateFirmwareProgress('Erasing Flash...', eraseProgress);
                }, 100);
                var result = await window.electronAPI.bootloaderEraseFlash();
                clearInterval(eraseInterval);
                if (result && result.success) {
                    updateFirmwareProgress('Erase Complete!', 100);
                    addBootloaderLog('✓ Flash erased', 'success');
                    var progBtn = document.getElementById('bootProgramBtn');
                    if (progBtn) progBtn.disabled = false;
                    setTimeout(hideFirmwareProgress, 1500);
                } else {
                    hideFirmwareProgress();
                    addBootloaderLog('✗ Erase failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
                }
            } catch (e) { hideFirmwareProgress(); addBootloaderLog('✗ Erase error: ' + e.message, 'error'); }
            finally { enableBootloaderButtons(true); }
        }
    }

    async function programFlash() {
        if (!hexFileLoaded) { addBootloaderLog('Load hex file first', 'error'); return; }
        addBootloaderLog('Programming flash...', 'info');
        enableBootloaderButtons(false);
        showFirmwareProgress('Programming Flash... 0%', 0, 'program');
        if (window.electronAPI && window.electronAPI.bootloaderProgramFlash) {
            try {
                var result = await window.electronAPI.bootloaderProgramFlash();
                if (result && result.success) {
                    updateFirmwareProgress('Programming Complete!', 100);
                    addBootloaderLog('✓ Programming complete', 'success');
                    var verBtn = document.getElementById('bootVerifyBtn');
                    var runBtn = document.getElementById('bootRunAppBtn');
                    if (verBtn) verBtn.disabled = false;
                    if (runBtn) runBtn.disabled = false;
                    setTimeout(hideFirmwareProgress, 1500);
                } else {
                    hideFirmwareProgress();
                    addBootloaderLog('✗ Programming failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
                }
            } catch (e) { hideFirmwareProgress(); addBootloaderLog('✗ Error: ' + e.message, 'error'); }
            finally { enableBootloaderButtons(true); }
        } else {
            hideFirmwareProgress();
            addBootloaderLog('✗ Programming not available', 'error');
            enableBootloaderButtons(true);
        }
    }

    async function verifyFlash() {
        addBootloaderLog('Verifying...', 'info');
        enableBootloaderButtons(false);
        if (window.electronAPI && window.electronAPI.bootloaderReadCRC) {
            try {
                var result = await window.electronAPI.bootloaderReadCRC();
                if (result && result.success)
                    addBootloaderLog(result.crcMatch ? '✓ CRC matches' : '✗ CRC mismatch', result.crcMatch ? 'success' : 'error');
                else addBootloaderLog('✗ Verify failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
            } catch (e) { addBootloaderLog('✗ Verify error: ' + e.message, 'error'); }
            finally { enableBootloaderButtons(true); }
        }
    }

    async function eraseProgramVerify() {
        if (!hexFileLoaded) { addBootloaderLog('Load hex file first', 'error'); return; }
        addBootloaderLog('Starting Erase-Program-Verify sequence...', 'info');
        setBootloaderButtonState('busy');
        try {
            addBootloaderLog('Step 1/3: Erasing...', 'info');
            var er = await window.electronAPI.bootloaderEraseFlash();
            if (!er || !er.success) { addBootloaderLog('✗ Erase failed: ' + (er && er.error ? er.error : 'Unknown'), 'error'); setBootloaderButtonState('hex_loaded'); return; }
            addBootloaderLog('✓ Erase done', 'success');

            addBootloaderLog('Step 2/3: Programming...', 'info');
            var pr = await window.electronAPI.bootloaderProgramFlash();
            if (!pr || !pr.success) { addBootloaderLog('✗ Program failed: ' + (pr && pr.error ? pr.error : 'Unknown'), 'error'); setBootloaderButtonState('hex_loaded'); return; }
            addBootloaderLog('✓ Program done', 'success');

            addBootloaderLog('Step 3/3: Verifying...', 'info');
            var vr = await window.electronAPI.bootloaderReadCRC();
            if (!vr || !vr.success) { addBootloaderLog('✗ Verify failed: ' + (vr && vr.error ? vr.error : 'Unknown'), 'error'); setBootloaderButtonState('hex_loaded'); return; }
            if (vr.crcMatch) {
                addBootloaderLog('✓ Erase-Program-Verify complete', 'success');
                addBootloaderLog('Click Run Application to start new firmware', 'info');
                setBootloaderButtonState('ready_to_run');
            } else {
                addBootloaderLog('✗ CRC mismatch', 'error');
                setBootloaderButtonState('hex_loaded');
            }
        } catch (e) { addBootloaderLog('✗ Sequence error: ' + e.message, 'error'); setBootloaderButtonState('hex_loaded'); }
    }

    async function runApplication() {
        addBootloaderLog('Jumping to application...', 'info');
        setBootloaderButtonState('busy');
        if (window.electronAPI && window.electronAPI.bootloaderJumpToApp) {
            try {
                var result = await window.electronAPI.bootloaderJumpToApp();
                if (result && result.success) {
                    addBootloaderLog('✓ Jump command sent', 'success');
                    addBootloaderLog('Device running application', 'info');
                } else {
                    addBootloaderLog('✗ Failed: ' + (result && result.error ? result.error : 'Unknown'), 'error');
                    setBootloaderButtonState('ready_to_run'); return;
                }
            } catch (e) {
                if (e.message && (e.message.includes('disconnected') || e.message.includes('Cannot write'))) {
                    addBootloaderLog('✓ Device jumped to application', 'success');
                } else {
                    addBootloaderLog('✗ Error: ' + e.message, 'error');
                    setBootloaderButtonState('ready_to_run'); return;
                }
            }
            bootloaderConnected = false;
            hexFileLoaded = false;
            var cb = document.getElementById('bootConnectBtn');
            if (cb) cb.textContent = 'Connect';
            setBootloaderButtonState('disconnected');
        }
    }

    // ── Updates ───────────────────────────────────────────────────────────────
    async function checkForUpdates() {
        var checkBtn = document.getElementById('adminCheckUpdateBtn');
        var statusDisplay = document.getElementById('updateStatusDisplay');
        var statusAlert = document.getElementById('updateStatusAlert');
        var statusContent = document.getElementById('updateStatusContent');
        var progressSection = document.getElementById('updateProgressSection');

        if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
            addLog('Update checking not available', 'error');
            if (statusDisplay) statusDisplay.textContent = 'Error: not available';
            return;
        }
        if (checkBtn) checkBtn.disabled = true;
        if (statusDisplay) statusDisplay.textContent = 'Checking...';
        if (statusAlert) { statusAlert.classList.remove('hidden'); statusAlert.className = 'alert alert-info'; }
        if (statusContent) statusContent.textContent = 'Checking for updates...';
        if (progressSection) progressSection.classList.add('hidden');
        addLog('Checking for updates...', 'info');
        try {
            var result = await window.electronAPI.checkForUpdates();
            if (result.success) {
                if (statusDisplay) statusDisplay.textContent = 'Checking...';
                addLog('Update check initiated', 'success');
            } else {
                if (statusDisplay) statusDisplay.textContent = 'Error';
                if (statusAlert) statusAlert.className = 'alert alert-error';
                if (statusContent) statusContent.textContent = result.error || 'Failed';
                addLog('Failed: ' + (result.error || 'Unknown'), 'error');
                if (checkBtn) checkBtn.disabled = false;
            }
        } catch (e) {
            if (statusDisplay) statusDisplay.textContent = 'Error';
            if (statusAlert) statusAlert.className = 'alert alert-error';
            if (statusContent) statusContent.textContent = e.message;
            addLog('Error: ' + e.message, 'error');
            if (checkBtn) checkBtn.disabled = false;
        }
    }

    function handleUpdateStatus(updateInfo) {
        var statusDisplay = document.getElementById('updateStatusDisplay');
        var statusAlert = document.getElementById('updateStatusAlert');
        var statusContent = document.getElementById('updateStatusContent');
        var progressSection = document.getElementById('updateProgressSection');
        var progressFill = document.getElementById('updateProgressFill');
        var progressText = document.getElementById('updateProgressText');
        var checkBtn = document.getElementById('adminCheckUpdateBtn');
        if (statusAlert) statusAlert.classList.remove('hidden');

        var s = updateInfo.status;
        if (s === 'checking') {
            if (statusDisplay) statusDisplay.textContent = 'Checking...';
            if (statusAlert) statusAlert.className = 'alert alert-info';
            if (statusContent) statusContent.textContent = updateInfo.message || 'Checking...';
            if (progressSection) progressSection.classList.add('hidden');
        } else if (s === 'available') {
            if (statusDisplay) statusDisplay.textContent = 'Update Available!';
            if (statusAlert) statusAlert.className = 'alert alert-success';
            var msg = 'Version ' + updateInfo.version + ' available!';
            if (updateInfo.releaseNotes) msg += '\n\n' + updateInfo.releaseNotes;
            if (statusContent) statusContent.textContent = msg;
            if (progressSection) progressSection.classList.add('hidden');
            if (checkBtn) checkBtn.disabled = false;
            addLog('Update available: v' + updateInfo.version, 'success');
        } else if (s === 'not-available') {
            if (statusDisplay) statusDisplay.textContent = 'Up to Date';
            if (statusAlert) statusAlert.className = 'alert alert-success';
            if (statusContent) statusContent.textContent = updateInfo.message || 'You are on the latest version.';
            if (progressSection) progressSection.classList.add('hidden');
            if (checkBtn) checkBtn.disabled = false;
            addLog('No updates available', 'info');
        } else if (s === 'downloading') {
            if (statusDisplay) statusDisplay.textContent = 'Downloading...';
            if (statusAlert) statusAlert.className = 'alert alert-info';
            if (statusContent) statusContent.textContent = updateInfo.message || 'Downloading...';
            if (progressSection) progressSection.classList.remove('hidden');
            if (updateInfo.percent !== undefined) {
                if (progressFill) progressFill.style.width = updateInfo.percent + '%';
                if (progressText) progressText.textContent = updateInfo.percent + '%';
            }
        } else if (s === 'downloaded') {
            if (statusDisplay) statusDisplay.textContent = 'Ready to Install';
            if (statusAlert) statusAlert.className = 'alert alert-success';
            if (statusContent) statusContent.textContent = 'Update downloaded. A dialog will ask you to restart.';
            if (progressFill) progressFill.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            if (checkBtn) checkBtn.disabled = false;
            addLog('Update downloaded', 'success');
        } else if (s === 'error') {
            if (statusDisplay) statusDisplay.textContent = 'Error';
            if (statusAlert) statusAlert.className = 'alert alert-error';
            if (statusContent) statusContent.textContent = updateInfo.message || 'An error occurred.';
            if (progressSection) progressSection.classList.add('hidden');
            if (checkBtn) checkBtn.disabled = false;
            addLog('Update error: ' + updateInfo.message, 'error');
        }
    }

    async function loadCurrentVersion() {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            try {
                var info = await window.electronAPI.getAppVersion();
                var el = document.getElementById('currentVersionDisplay');
                if (el) el.textContent = info.version + (!info.isPackaged ? ' (Development)' : '');
            } catch (e) { /* silent */ }
        }
    }

    // ── Init (called each time admin view becomes visible) ────────────────────
    function init() {
        if (initialized) return;
        initialized = true;

        updateStats();
        startDataRateCalculation();
        loadCurrentVersion();
        setBootloaderButtonState('disconnected');

        // Wire tab buttons
        ['dashboard', 'pid', 'bootloader', 'updates'].forEach(function (t) {
            var btn = document.getElementById('adminTabBtn_' + t);
            if (btn) btn.addEventListener('click', function () { switchAdminTab(t); });
        });

        // Wire PID inputs
        var pidInputs = [
            { id: 'proportionalInput', type: 'P', lastKey: 'lastProportionalValue', statusId: 'adminProportionalStatus' },
            { id: 'integralInput',     type: 'I', lastKey: 'lastIntegralValue',     statusId: 'adminIntegralStatus' },
            { id: 'differentialInput', type: 'D', lastKey: 'lastDifferentialValue', statusId: 'adminDifferentialStatus' }
        ];
        pidInputs.forEach(function (cfg) {
            var el = document.getElementById(cfg.id);
            if (!el) return;
            el.addEventListener('change', async function () {
                var val = this.value.trim();
                if (val === '') return;
                updatePIDStatus(cfg.type.toLowerCase() === 'p' ? 'Proportional' :
                                cfg.type.toLowerCase() === 'i' ? 'Integral' : 'Differential', false, 'Sending...');
                var ok = await sendPIDValue(cfg.type, val);
                updatePIDStatus(cfg.type.toLowerCase() === 'p' ? 'Proportional' :
                                cfg.type.toLowerCase() === 'i' ? 'Integral' : 'Differential',
                                ok, ok ? 'Sent' : 'Failed');
            });
        });

        // Populate COM ports
        if (window.electronAPI && window.electronAPI.getAvailablePorts) {
            window.electronAPI.getAvailablePorts().then(function (ports) {
                var sel = document.getElementById('comPortSelect');
                if (!sel) return;
                sel.innerHTML = '<option value="">Select Port...</option>';
                (ports || []).forEach(function (port) {
                    var opt = document.createElement('option');
                    opt.value = port.path;
                    opt.textContent = port.path + (port.manufacturer ? ' — ' + port.manufacturer : '');
                    sel.appendChild(opt);
                });
            }).catch(function () {});
        }

        // Listen for bootloader connection status
        if (window.electronAPI && window.electronAPI.onConnectionStatus) {
            window.electronAPI.onConnectionStatus(function (event, status) {
                var isBootloader = status.isBootloader || status.isDFU || false;
                var cb = document.getElementById('bootConnectBtn');
                if (status.connected && isBootloader) {
                    bootloaderConnected = true;
                    if (cb) { cb.textContent = 'Disconnect'; cb.disabled = false; }
                    setBootloaderButtonState('connected');
                    addBootloaderLog('Device connected', 'success');
                    if (status.bootloaderVersion) addBootloaderLog('Firmware: ' + status.bootloaderVersion, 'success');
                } else if (!status.connected && isBootloader) {
                    bootloaderConnected = false;
                    hexFileLoaded = false;
                    if (cb) { cb.textContent = 'Connect'; cb.disabled = false; }
                    setBootloaderButtonState('disconnected');
                    addBootloaderLog('Device disconnected', 'info');
                }
            });
        }

        // Listen for update status
        if (window.electronAPI && window.electronAPI.onUpdateStatus) {
            window.electronAPI.onUpdateStatus(function (event, updateInfo) {
                handleUpdateStatus(updateInfo);
            });
        }

        // Listen for bootloader progress
        if (window.electronAPI && window.electronAPI.onBootloaderProgress) {
            window.electronAPI.onBootloaderProgress(function (data) {
                var mode = data.step === 'erase' ? 'erase' : data.step === 'verify' ? 'verify' : 'program';
                showFirmwareProgress(data.label, data.progress, mode);
                updateFirmwareProgress(data.label, data.progress);
                if (data.progress >= 100 && (data.step === 'verify' || (data.label && data.label.includes('completed')))) {
                    setTimeout(hideFirmwareProgress, 3000);
                }
            });
        }

        addLog('Admin panel initialized', 'info');
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        init: init,
        addLog: addLog,
        addRawData: addRawData,
        setConnectionStartTime: setConnectionStartTime,
        switchTab: switchAdminTab,
        clearLogs: clearLogs,
        clearRawData: clearRawData,
        exportLogs: exportLogs,
        exportRawData: exportRawData,
        resetApp: resetApp,
        sendPIDValue: sendPIDValue,
        connectBootloader: connectBootloader,
        triggerBootloader: triggerBootloader,
        loadHexFile: loadHexFile,
        eraseFlash: eraseFlash,
        programFlash: programFlash,
        verifyFlash: verifyFlash,
        eraseProgramVerify: eraseProgramVerify,
        runApplication: runApplication,
        bootloaderVersion: bootloaderVersion,
        checkForUpdates: checkForUpdates,
        onComEnableChanged: onComEnableChanged,
        onUsbEnableChanged: onUsbEnableChanged
    };
})();
