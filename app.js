// app.js - Universal UPI Frontend Client
document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let appConfig = null;
    let accountsList = [];
    let currentSenderAccount = null;
    let currentQuote = null;
    let quoteInterval = null;
    let quoteSecondsLeft = 0;
    let ws = null;
    let html5QrcodeScanner = null;

    // --- DOM Elements ---
    const gatewayStatus = document.getElementById('gateway-status');
    const gatewayStatusText = document.getElementById('gateway-status-text');
    const senderAccountSelect = document.getElementById('sender-account-select');
    const senderAvailableBalance = document.getElementById('sender-available-balance');
    
    const navTabs = document.querySelectorAll('.nav-tab');
    const viewPanels = document.querySelectorAll('.view-panel');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    const senderCountry = document.getElementById('sender-country');
    const receiverCountry = document.getElementById('receiver-country');
    const btnSwapCurrency = document.getElementById('btn-swap-currency');
    const senderSymbol = document.getElementById('sender-symbol');
    const sendAmount = document.getElementById('send-amount');
    const paymentId = document.getElementById('payment-id');
    const btnQuickSample = document.getElementById('btn-quick-sample');
    
    const recipientBadge = document.getElementById('recipient-badge');
    const recipName = document.getElementById('recip-name');
    const recipDetails = document.getElementById('recip-details');
    const recipRailTag = document.getElementById('recip-rail-tag');

    const displayRate = document.getElementById('display-rate');
    const displayFee = document.getElementById('display-fee');
    const displayConverted = document.getElementById('display-converted');
    const quoteTimerBadge = document.getElementById('quote-timer-badge');
    const quoteTimerText = document.getElementById('quote-timer-text');
    const quoteStatusBar = document.getElementById('quote-status-bar');
    const quoteProgressFill = document.getElementById('quote-progress-fill');
    
    const btnConfirm = document.getElementById('btn-confirm');
    const loadingFlow = document.getElementById('loading-flow');
    const stepRailName = document.getElementById('step-rail-name');
    
    const successFlow = document.getElementById('success-flow');
    const finalAmount = document.getElementById('final-amount');
    const finalId = document.getElementById('final-id');
    const finalNetwork = document.getElementById('final-network');
    const finalTx = document.getElementById('final-tx');
    const finalRailTx = document.getElementById('final-rail-tx');
    const finalJournalId = document.getElementById('final-journal-id');
    const finalTimestamp = document.getElementById('final-timestamp');
    const btnReset = document.getElementById('btn-reset');
    const btnPrintReceipt = document.getElementById('btn-print-receipt');

    const mpinModal = document.getElementById('mpin-modal');
    const mpinInput = document.getElementById('mpin-input');
    const mpinModalAmount = document.getElementById('mpin-modal-amount');
    const btnMpinCancel = document.getElementById('btn-mpin-cancel');
    const btnMpinSubmit = document.getElementById('btn-mpin-submit');

    // QR & History Views
    const myQrImg = document.getElementById('my-qr-img');
    const myQrVpa = document.getElementById('my-qr-vpa');
    const myQrRail = document.getElementById('my-qr-rail');
    const myQrSymbol = document.getElementById('my-qr-symbol');
    const customQrAmount = document.getElementById('custom-qr-amount');
    const btnRefreshQr = document.getElementById('btn-refresh-qr');
    const btnCopyUpiUri = document.getElementById('btn-copy-upi-uri');
    const qrLoading = document.getElementById('qr-loading');

    const historyList = document.getElementById('history-list');
    const btnRefreshHistory = document.getElementById('btn-refresh-history');
    const ledgerEntriesList = document.getElementById('ledger-entries-list');

    // Sample addresses for quick testing
    const sampleRecipients = [
        'priya.sharma@paytm',
        'alex@fednow',
        'DE89370400440532013000',
        '20-00-00-12345678',
        '+6581234567',
        'AE290330000000000123456'
    ];
    let sampleIdx = 0;

    // --- Initialize App ---
    async function init() {
        connectWebSocket();
        await loadConfig();
        await loadAccounts();
        setupEventListeners();
        renderMyQR();
    }

    // --- WebSocket Connection ---
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        try {
            ws = new WebSocket(wsUrl);
            ws.onopen = () => {
                gatewayStatus.classList.remove('offline');
                gatewayStatus.classList.add('online');
                gatewayStatusText.textContent = 'Universal Gateway Online';
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                } catch (e) {}
            };

            ws.onclose = () => {
                gatewayStatus.classList.remove('online');
                gatewayStatus.classList.add('offline');
                gatewayStatusText.textContent = 'Gateway Reconnecting...';
                setTimeout(connectWebSocket, 3000);
            };
        } catch (err) {
            console.warn('WebSocket connection not available:', err);
        }
    }

    function handleWebSocketMessage(data) {
        if (data.type === 'TX_STAGE') {
            highlightPipelineStep(data.stage);
        }
    }

    // --- API Calls ---
    async function loadConfig() {
        try {
            const res = await fetch('/api/v1/config');
            appConfig = await res.json();
        } catch (err) {
            console.error('Failed to load config:', err);
        }
    }

    async function loadAccounts() {
        try {
            const res = await fetch('/api/v1/accounts');
            const data = await res.json();
            accountsList = data.accounts.filter(a => a.status !== 'SYSTEM');
            
            senderAccountSelect.innerHTML = '';
            accountsList.forEach((acc, idx) => {
                const opt = document.createElement('option');
                opt.value = acc.id;
                opt.textContent = `${acc.name} (${acc.currency} • ${acc.bankName})`;
                senderAccountSelect.appendChild(opt);
            });

            if (accountsList.length > 0) {
                switchSenderAccount(accountsList[0].id);
            }
        } catch (err) {
            console.error('Failed to load accounts:', err);
        }
    }

    function switchSenderAccount(accId) {
        currentSenderAccount = accountsList.find(a => a.id === accId);
        if (!currentSenderAccount) return;

        senderCountry.value = currentSenderAccount.currency;
        senderSymbol.textContent = getSymbol(currentSenderAccount.currency);
        senderAvailableBalance.textContent = `Balance: ${getSymbol(currentSenderAccount.currency)}${currentSenderAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        // Avoid sender & receiver having the same currency initially
        if (receiverCountry.value === currentSenderAccount.currency) {
            receiverCountry.value = currentSenderAccount.currency === 'USD' ? 'INR' : 'USD';
        }

        renderMyQR();
        debounceUpdateQuote();
    }

    function getSymbol(curr) {
        if (!appConfig || !appConfig.currencies[curr]) {
            return curr === 'INR' ? '₹' : curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '$';
        }
        return appConfig.currencies[curr].symbol;
    }

    // --- Universal Proxy Resolution ---
    let resolveTimer;
    async function resolveRecipient(id) {
        clearTimeout(resolveTimer);
        if (!id || id.trim().length < 3) {
            recipientBadge.classList.add('hidden');
            checkReadyToConfirm();
            return;
        }

        resolveTimer = setTimeout(async () => {
            try {
                const res = await fetch('/api/v1/resolve-address', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier: id.trim() })
                });

                if (!res.ok) throw new Error('Resolution failed');
                const data = await res.json();

                recipName.textContent = data.name;
                recipDetails.textContent = `${data.bankName} • ${data.country}`;
                recipRailTag.textContent = data.rail;
                recipientBadge.classList.remove('hidden');

                // Auto-sync recipient currency if matching detected country
                if (data.currency && data.currency !== receiverCountry.value) {
                    receiverCountry.value = data.currency;
                    debounceUpdateQuote();
                }

                checkReadyToConfirm();
            } catch (err) {
                recipientBadge.classList.add('hidden');
                checkReadyToConfirm();
            }
        }, 350);
    }

    // --- Guaranteed FX Quote Lock ---
    let quoteDebounce;
    function debounceUpdateQuote() {
        clearTimeout(quoteDebounce);
        quoteDebounce = setTimeout(fetchGuaranteedQuote, 400);
    }

    async function fetchGuaranteedQuote() {
        const from = senderCountry.value;
        const to = receiverCountry.value;
        const amount = parseFloat(sendAmount.value);

        senderSymbol.textContent = getSymbol(from);

        if (isNaN(amount) || amount <= 0) {
            displayRate.textContent = '--';
            displayFee.textContent = '--';
            displayConverted.textContent = '--';
            stopQuoteTimer();
            btnConfirm.disabled = true;
            return;
        }

        displayRate.textContent = 'Calculating...';
        displayFee.textContent = '...';
        displayConverted.textContent = '...';

        try {
            const res = await fetch('/api/v1/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromCurrency: from,
                    toCurrency: to,
                    sendAmount: amount
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Quote failed');
            }

            currentQuote = await res.json();

            // Display breakdown
            displayRate.textContent = `1 ${from} = ${currentQuote.interbankRate.toFixed(4)} ${to}`;
            displayFee.textContent = `${currentQuote.senderSymbol}${currentQuote.totalFee.toFixed(2)} (${currentQuote.feePercentage})`;
            displayConverted.textContent = `${currentQuote.receiverSymbol}${currentQuote.recipientReceives.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

            startQuoteTimer(currentQuote.expirySeconds || 180);
            checkReadyToConfirm();
        } catch (err) {
            displayRate.textContent = 'Error';
            displayFee.textContent = '--';
            displayConverted.textContent = '--';
            stopQuoteTimer();
            btnConfirm.disabled = true;
        }
    }

    function startQuoteTimer(seconds) {
        stopQuoteTimer();
        quoteSecondsLeft = seconds;
        const totalDuration = seconds;
        quoteTimerBadge.classList.remove('hidden');
        quoteStatusBar.classList.remove('hidden');

        const updateDisplay = () => {
            const m = Math.floor(quoteSecondsLeft / 60);
            const s = quoteSecondsLeft % 60;
            quoteTimerText.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            const pct = (quoteSecondsLeft / totalDuration) * 100;
            quoteProgressFill.style.width = `${pct}%`;

            if (quoteSecondsLeft <= 0) {
                stopQuoteTimer();
                quoteTimerText.textContent = 'Expired';
                quoteProgressFill.style.width = '0%';
                debounceUpdateQuote(); // refresh automatically
            } else {
                quoteSecondsLeft--;
            }
        };

        updateDisplay();
        quoteInterval = setInterval(updateDisplay, 1000);
    }

    function stopQuoteTimer() {
        if (quoteInterval) {
            clearInterval(quoteInterval);
            quoteInterval = null;
        }
        quoteTimerBadge.classList.add('hidden');
        quoteStatusBar.classList.add('hidden');
    }

    function checkReadyToConfirm() {
        const amount = parseFloat(sendAmount.value);
        const hasValidAmount = !isNaN(amount) && amount > 0;
        const activeTab = document.querySelector('.tab-btn.active').dataset.target;
        const targetId = paymentId.value.trim();

        const hasRecipient = activeTab === 'manual-entry' ? (targetId.length > 0) : true;
        const hasQuote = currentQuote && currentQuote.status === 'ACTIVE' && quoteSecondsLeft > 0;

        btnConfirm.disabled = !(hasValidAmount && hasRecipient && hasQuote);
    }

    // --- MPIN Confirmation & Transfer Execution ---
    function openMpinModal() {
        if (!currentQuote) return;
        mpinModalAmount.textContent = `${currentQuote.senderSymbol}${currentQuote.sendAmount.toFixed(2)} ${currentQuote.fromCurrency}`;
        mpinInput.value = '';
        mpinModal.classList.remove('hidden');
        mpinInput.focus();
    }

    function closeMpinModal() {
        mpinModal.classList.add('hidden');
    }

    async function executeTransfer() {
        const pin = mpinInput.value.trim();
        if (pin.length < 4) {
            alert('Please enter a 4-digit MPIN (Demo PIN: 1234)');
            return;
        }

        closeMpinModal();

        // Show stage-by-stage pipeline animation
        resetPipelineAnimation();
        loadingFlow.classList.remove('hidden');

        const activeTab = document.querySelector('.tab-btn.active').dataset.target;
        const targetId = activeTab === 'manual-entry' ? paymentId.value.trim() : 'merchant.qr@universal';
        const idempotencyKey = 'idem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

        // Animate stage 1: Screening
        setPipelineStep('step-1', 'active');

        try {
            // Slight delay for step 1 visual
            await new Promise(r => setTimeout(r, 400));
            setPipelineStep('step-1', 'done');
            setPipelineStep('step-2', 'done');
            setPipelineStep('step-3', 'active');

            const res = await fetch('/api/v1/transfers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({
                    senderAccountId: currentSenderAccount ? currentSenderAccount.id : 'acc_us_001',
                    recipientVpa: targetId,
                    sendAmount: currentQuote.sendAmount,
                    sendCurrency: currentQuote.fromCurrency,
                    receiveCurrency: currentQuote.toCurrency,
                    quoteId: currentQuote.quoteId,
                    mpin: pin,
                    note: 'Universal UPI Payment'
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Transfer failed');
            }

            const data = await res.json();
            const tx = data.transaction;

            setPipelineStep('step-3', 'done');
            setPipelineStep('step-4', 'active');
            stepRailName.textContent = `4. ${tx.recipient.railName} Settlement`;

            await new Promise(r => setTimeout(r, 600));
            setPipelineStep('step-4', 'done');
            setPipelineStep('step-5', 'done');

            await new Promise(r => setTimeout(r, 500));
            loadingFlow.classList.add('hidden');

            showSuccessScreen(tx);
            await loadAccounts(); // reload balances
        } catch (err) {
            loadingFlow.classList.add('hidden');
            alert(`Transfer Failed: ${err.message}`);
        }
    }

    function resetPipelineAnimation() {
        for (let i = 1; i <= 5; i++) {
            const el = document.getElementById(`step-${i}`);
            if (el) {
                el.classList.remove('active', 'done');
            }
        }
    }

    function setPipelineStep(stepId, state) {
        const el = document.getElementById(stepId);
        if (el) {
            el.classList.remove('active', 'done');
            el.classList.add(state);
        }
    }

    function highlightPipelineStep(stage) {
        if (stage === 'INITIATED') setPipelineStep('step-1', 'active');
        if (stage === 'COMPLIANCE_SCREENED') setPipelineStep('step-1', 'done');
        if (stage === 'DEBITED') setPipelineStep('step-3', 'done');
        if (stage === 'RAIL_SETTLED') setPipelineStep('step-4', 'done');
    }

    function showSuccessScreen(tx) {
        document.getElementById('view-send').classList.add('hidden');
        finalAmount.textContent = `${getSymbol(tx.receiveCurrency)}${tx.receivedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        finalId.textContent = `${tx.recipient.name} (${tx.recipient.vpa})`;
        finalNetwork.textContent = tx.recipient.railName;
        finalTx.textContent = tx.id;
        finalRailTx.textContent = tx.railTxId || 'RAIL_PENDING';
        finalJournalId.textContent = tx.journalId || 'JRN_SEALED';
        finalTimestamp.textContent = new Date(tx.settledAt || Date.now()).toLocaleString();

        successFlow.classList.remove('hidden');
        lucide.createIcons();
    }

    // --- Generate Universal QR View ---
    async function renderMyQR() {
        if (!currentSenderAccount) return;
        myQrVpa.textContent = currentSenderAccount.vpa;
        myQrRail.textContent = `Connected Rail: ${currentSenderAccount.rail} (${currentSenderAccount.bankName})`;
        myQrSymbol.textContent = getSymbol(currentSenderAccount.currency);

        const customAmt = parseFloat(customQrAmount.value) || null;
        qrLoading.classList.remove('hidden');
        myQrImg.style.display = 'none';

        try {
            const res = await fetch('/api/v1/qr/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pa: currentSenderAccount.vpa,
                    pn: currentSenderAccount.name,
                    am: customAmt,
                    cu: currentSenderAccount.currency,
                    tn: 'Universal UPI Transfer'
                })
            });

            if (res.ok) {
                const qrData = await res.json();
                myQrImg.src = qrData.qrDataUrl;
                myQrImg.dataset.rawUri = qrData.rawPayload;
                myQrImg.style.display = 'block';
            }
        } catch (err) {
            console.error('QR generation error:', err);
        } finally {
            qrLoading.classList.add('hidden');
        }
    }

    // --- Transaction History ---
    async function loadTransactionHistory() {
        try {
            const res = await fetch('/api/v1/transfers');
            const data = await res.json();
            const txs = data.transactions || [];

            if (txs.length === 0) {
                historyList.innerHTML = '<p class="empty-state">No transactions yet. Send your first payment!</p>';
                return;
            }

            historyList.innerHTML = txs.map(tx => `
                <div class="history-item">
                    <div class="history-left">
                        <strong>${tx.recipient.name}</strong>
                        <span>${tx.recipient.vpa} • <span class="rail-tag">${tx.recipient.rail}</span></span>
                        <span>${new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Ref: ${tx.railTxId || tx.id}</span>
                    </div>
                    <div class="history-right">
                        <div class="history-amount">+${getSymbol(tx.receiveCurrency)}${tx.receivedAmount.toFixed(2)}</div>
                        <span style="font-size: 11px; color: var(--text-muted);">-(${getSymbol(tx.sendCurrency)}${tx.sendAmount.toFixed(2)})</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            historyList.innerHTML = '<p class="empty-state">Failed to load history</p>';
        }
    }

    // --- Double-Entry Ledger Explorer ---
    async function loadLedgerExplorer() {
        try {
            const res = await fetch('/api/v1/ledger');
            const data = await res.json();
            const entries = data.entries || [];

            if (entries.length === 0) {
                ledgerEntriesList.innerHTML = '<p class="empty-state">No ledger journals recorded yet.</p>';
                return;
            }

            ledgerEntriesList.innerHTML = entries.map(entry => `
                <div class="ledger-entry-card">
                    <div class="ledger-entry-head">
                        <span>Journal ID: <strong class="mono">${entry.journalId}</strong></span>
                        <span>${new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div class="ledger-legs">
                        ${entry.debits.map(d => `
                            <div class="ledger-leg debit">
                                <span>[DEBIT] ${d.accountName}</span>
                                <strong class="mono">-${getSymbol(d.currency)}${d.amount.toFixed(2)}</strong>
                            </div>
                        `).join('')}
                        ${entry.credits.map(c => `
                            <div class="ledger-leg credit">
                                <span>[CREDIT] ${c.accountName}</span>
                                <strong class="mono">+${getSymbol(c.currency)}${c.amount.toFixed(2)}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        } catch (err) {
            ledgerEntriesList.innerHTML = '<p class="empty-state">Failed to load ledger records</p>';
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        // Account switcher
        senderAccountSelect.addEventListener('change', (e) => {
            switchSenderAccount(e.target.value);
        });

        // Main Navigation (Send / QR / History / Ledger)
        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                navTabs.forEach(t => t.classList.remove('active'));
                viewPanels.forEach(p => p.classList.add('hidden'));

                tab.classList.add('active');
                const targetView = tab.dataset.view;
                const viewEl = document.getElementById(targetView);
                if (viewEl) viewEl.classList.remove('hidden');

                if (targetView === 'view-history') loadTransactionHistory();
                if (targetView === 'view-ledger') loadLedgerExplorer();
                if (targetView === 'view-generate-qr') renderMyQR();

                lucide.createIcons();
            });
        });

        // Target Section Tabs (Scan / Enter ID)
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetId = btn.dataset.target;
                document.getElementById(targetId).classList.add('active');

                if (targetId === 'qr-scan') {
                    startScanner();
                } else {
                    stopScanner();
                }
                checkReadyToConfirm();
            });
        });

        // Quick sample recipient button
        btnQuickSample.addEventListener('click', () => {
            paymentId.value = sampleRecipients[sampleIdx % sampleRecipients.length];
            sampleIdx++;
            resolveRecipient(paymentId.value);
            debounceUpdateQuote();
        });

        // Payment ID change
        paymentId.addEventListener('input', () => {
            resolveRecipient(paymentId.value);
        });

        // Currency selects & swap
        senderCountry.addEventListener('change', () => {
            senderSymbol.textContent = getSymbol(senderCountry.value);
            debounceUpdateQuote();
        });
        receiverCountry.addEventListener('change', debounceUpdateQuote);

        btnSwapCurrency.addEventListener('click', () => {
            const temp = senderCountry.value;
            senderCountry.value = receiverCountry.value;
            receiverCountry.value = temp;
            senderSymbol.textContent = getSymbol(senderCountry.value);
            debounceUpdateQuote();
        });

        sendAmount.addEventListener('input', debounceUpdateQuote);

        // QR Custom Amount & Copy
        btnRefreshQr.addEventListener('click', renderMyQR);
        btnCopyUpiUri.addEventListener('click', () => {
            const uri = myQrImg.dataset.rawUri;
            if (uri) {
                navigator.clipboard.writeText(uri);
                alert('Copied UPI Payment Link to clipboard!');
            }
        });

        // History & Ledger refreshes
        btnRefreshHistory.addEventListener('click', loadTransactionHistory);

        // File picker for QR upload
        const qrFileInput = document.getElementById('qr-file-input');
        if (qrFileInput) {
            qrFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const html5Qr = new Html5Qrcode('reader');
                    const qrText = await html5Qr.scanFile(file, true);
                    paymentId.value = qrText;
                    tabBtns[1].click();
                    resolveRecipient(qrText);
                    debounceUpdateQuote();
                } catch (err) {
                    alert('Could not decode QR code from image: ' + err);
                }
            });
        }

        // MPIN Modal buttons
        btnConfirm.addEventListener('click', openMpinModal);
        btnMpinCancel.addEventListener('click', closeMpinModal);
        btnMpinSubmit.addEventListener('click', executeTransfer);
        mpinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') executeTransfer();
        });

        // Reset & Print
        btnReset.addEventListener('click', () => {
            successFlow.classList.add('hidden');
            document.getElementById('view-send').classList.remove('hidden');
            sendAmount.value = '';
            paymentId.value = '';
            recipientBadge.classList.add('hidden');
            debounceUpdateQuote();
        });

        btnPrintReceipt.addEventListener('click', () => {
            window.print();
        });
    }

    // --- QR Scanner ---
    function startScanner() {
        if (!html5QrcodeScanner && document.getElementById('reader')) {
            try {
                html5QrcodeScanner = new Html5QrcodeScanner(
                    "reader",
                    { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
                    false
                );
                html5QrcodeScanner.render((decodedText) => {
                    paymentId.value = decodedText;
                    stopScanner();
                    tabBtns[1].click(); // Switch to manual tab
                    resolveRecipient(decodedText);
                    debounceUpdateQuote();
                }, () => {});
            } catch (err) {
                console.warn('Camera scanner initialization error:', err);
            }
        }
    }

    function stopScanner() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(() => {});
            html5QrcodeScanner = null;
        }
    }

    // Start App
    init();
});
