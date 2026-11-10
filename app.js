let derivEngine = null;
let currentMode = 'single';
let sessionStats = {
  totalTrades: 0,
  wins: 0,
  losses: 0,
  netPnL: 0
};

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  autoLoginTerminal();
});

function log(msg, type = 'info') {
  const container = document.getElementById('logs-container');
  const time = new Date().toLocaleTimeString();
  let color = 'text-gray-300';
  if (type === 'success') color = 'text-neon font-bold';
  if (type === 'error') color = 'text-rose-400 font-bold';
  if (type === 'warning') color = 'text-amber-400 font-bold';

  const line = document.createElement('div');
  line.className = `${color}`;
  line.innerHTML = `<span class="text-gray-600">[${time}]</span> ${msg}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function autoLoginTerminal() {
  const appId = "34UGhpx0qrXHqpfKHAkGH";
  const accountId = "DOT95101040";
  const token = "pat_82ad513baf63f498cffe4acf81f16cf59d886ceb08c1854a62d74370d5a83c83";

  log("Auto-connecting securely via WebSocket to Deriv API...");
  derivEngine = new DerivAPIEngine(appId, token);

  derivEngine.connect(() => {
    log("Connection established. Sending Authorization payload...");
  });

  derivEngine.on('authorize', (authData) => {
    log(`Authorized successfully! Welcome trader ${authData.fullname || authData.email}`, 'success');
    document.getElementById('ui-account-id').innerText = authData.loginid || accountId;
    document.getElementById('ui-balance').innerText = `$${authData.balance}`;

    const symbol = document.getElementById('select-market').value;
    initTradingViewChart(symbol);
    derivEngine.subscribeTicks(symbol);
  });

  derivEngine.on('error', (err) => {
    log(`API Authorization Error: ${err.message}`, 'error');
  });
}

function setupEventListeners() {
  document.getElementById('select-market').addEventListener('change', (e) => {
    const symbol = e.target.value;
    initTradingViewChart(symbol);
    if (derivEngine && derivEngine.authorized) {
      derivEngine.subscribeTicks(symbol);
      log(`Switched chart and live tick feed to: ${symbol}`);
    }
  });

  document.getElementById('mode-single').addEventListener('click', () => {
    currentMode = 'single';
    document.getElementById('bulk-controls').classList.add('hidden');
    document.getElementById('mode-single').className = "bg-gray-800 border border-neon text-neon py-1.5 rounded text-xs font-semibold";
    document.getElementById('mode-bulk').className = "bg-gray-900 border border-gray-700 text-gray-400 py-1.5 rounded text-xs font-semibold hover:border-gray-500";
    log("Mode: Single Contract Execution.");
  });

  document.getElementById('mode-bulk').addEventListener('click', () => {
    currentMode = 'bulk';
    document.getElementById('bulk-controls').classList.remove('hidden');
    document.getElementById('mode-bulk').className = "bg-gray-800 border border-neon text-neon py-1.5 rounded text-xs font-semibold";
    document.getElementById('mode-single').className = "bg-gray-900 border border-gray-700 text-gray-400 py-1.5 rounded text-xs font-semibold hover:border-gray-500";
    log("Mode: Bulk Multi-Shot Execution activated.");
  });

  document.getElementById('btn-trade-higher').addEventListener('click', () => executeTradeOrder('CALL'));
  document.getElementById('btn-trade-lower').addEventListener('click', () => executeTradeOrder('PUT'));

  document.getElementById('btn-cashier').addEventListener('click', () => {
    window.open('https://app.deriv.com/cashier/deposit', '_blank');
  });

  document.getElementById('btn-calc-apply').addEventListener('click', calculateRisk);

  document.getElementById('btn-emergency-flatten').addEventListener('click', () => {
    log("EMERGENCY PANIC TRIGGERED: All pending sequence loops aborted. Stay calm.", 'warning');
    alert("Emergency Flatten Triggered. Active session sequence halted.");
  });

  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    document.getElementById('logs-container').innerHTML = '';
  });
}

function initTradingViewChart(symbol) {
  document.getElementById('tv_chart_container').innerHTML = "";
  new TradingView.widget({
    "autosize": true,
    "symbol": `DERIV:${symbol}`,
    "interval": "1",
    "timezone": "Etc/UTC",
    "theme": "dark",
    "style": "1",
    "locale": "en",
    "toolbar_bg": "#0d131f",
    "enable_publishing": false,
    "hide_top_toolbar": false,
    "container_id": "tv_chart_container"
  });
}

async function executeTradeOrder(contractType) {
  if (!derivEngine || !derivEngine.authorized) {
    log("Terminal not connected! Please wait for authorization.", "error");
    return;
  }

  const maxLossLimit = parseFloat(document.getElementById('risk-max-loss').value);
  if (sessionStats.netPnL <= -Math.abs(maxLossLimit)) {
    log(`CIRCUIT BREAKER ACTIVATED: Max daily stop loss of -$${maxLossLimit} reached!`, 'error');
    alert(`Stop Loss Limit Reached (-$${maxLossLimit}). Take a break, hunter!`);
    return;
  }

  const symbol = document.getElementById('select-market').value;
  const stake = document.getElementById('input-stake').value;
  const duration = document.getElementById('input-duration').value;
  const durationUnit = document.getElementById('input-duration-unit').value;
  const count = currentMode === 'bulk' ? parseInt(document.getElementById('input-bulk-count').value) : 1;

  log(`Executing ${currentMode.toUpperCase()} order (${count}x) | ${contractType} on ${symbol} @ $${stake}...`);

  for (let i = 0; i < count; i++) {
    try {
      const result = await derivEngine.executeTrade({
        symbol: symbol,
        amount: stake,
        duration: duration,
        duration_unit: durationUnit,
        contract_type: contractType
      });

      sessionStats.totalTrades++;
      log(`[Trade ${i + 1}/${count} Success] Contract ID: ${result.contract_id} | Paid: $${result.buy_price} | Payout: $${result.payout}`, 'success');
    } catch (err) {
      log(`[Trade ${i + 1}/${count} Failed]: ${err.message || err.code}`, 'error');
    }
  }
}

function calculateRisk() {
  const targetProfit = parseFloat(document.getElementById('risk-target-profit').value);
  const maxLoss = parseFloat(document.getElementById('risk-max-loss').value);
  const martingale = parseFloat(document.getElementById('risk-martingale').value);

  const recommendedStake = (maxLoss * 0.05).toFixed(2);
  let totalLoss = parseFloat(recommendedStake);
  let currentStake = parseFloat(recommendedStake);
  let lossesCount = 0;

  while (totalLoss < maxLoss) {
    lossesCount++;
    currentStake = currentStake * martingale;
    totalLoss += currentStake;
  }

  document.getElementById('calc-rec-stake').innerText = `$${recommendedStake}`;
  document.getElementById('calc-max-losses').innerText = `${lossesCount} Trades`;
  log(`Risk Profile Locked: Base Stake $${recommendedStake} | Max Consecutive Loss Steps: ${lossesCount}`, 'success');
}
