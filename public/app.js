const screens = {
  dashboard: document.getElementById('dashboard-screen'),
  farmer: document.getElementById('farmer-screen'),
  weighing: document.getElementById('weighing-screen'),
  price: document.getElementById('price-screen'),
  confirmation: document.getElementById('confirmation-screen'),
  success: document.getElementById('success-screen'),
  history: document.getElementById('history-screen')
};

const state = {
  currentStep: 'dashboard',
  scale: {
    status: 'IDLE',
    timer: null,
    readings: [],
    referenceWeight: null,
    qualifyingCount: 0,
    stableWeight: null,
    lastWeight: 0.0
  },
  form: {
    buying_center: '',
    farmer_name: '',
    farmer_phone: '',
    weight_kg: '',
    weight_source: 'MANUAL',
    price_per_kg_tzs: ''
  },
  history: [],
  processing: false,
  latestTransaction: null
};

const timeoutMessage = 'Hali ya muamala haijathibitishwa. Angalia Transaction History kabla ya kujaribu tena.';

const elements = {
  farmerForm: document.getElementById('farmer-form'),
  buyingCenter: document.getElementById('buying-center'),
  farmerName: document.getElementById('farmer-name'),
  farmerPhone: document.getElementById('farmer-phone'),
  scaleStatus: document.getElementById('scale-status'),
  scaleWeight: document.getElementById('scale-weight'),
  referenceReading: document.getElementById('reference-reading'),
  qualifyingCount: document.getElementById('qualifying-count'),
  lockWeightBtn: document.getElementById('lock-weight-btn'),
  manualWeightBtn: document.getElementById('manual-weight-btn'),
  manualWeightBox: document.getElementById('manual-weight-box'),
  manualWeightInput: document.getElementById('manual-weight'),
  priceWeightDisplay: document.getElementById('price-weight-display'),
  priceSourceDisplay: document.getElementById('price-source-display'),
  priceForm: document.getElementById('price-form'),
  pricePerKg: document.getElementById('price-per-kg'),
  totalDisplay: document.getElementById('total-display'),
  confirmFarmer: document.getElementById('confirm-farmer'),
  confirmPhone: document.getElementById('confirm-phone'),
  confirmWeight: document.getElementById('confirm-weight'),
  confirmSource: document.getElementById('confirm-source'),
  confirmPrice: document.getElementById('confirm-price'),
  confirmTotal: document.getElementById('confirm-total'),
  confirmButton: document.getElementById('confirm-button'),
  confirmationError: document.getElementById('confirmation-error'),
  successReference: document.getElementById('success-reference'),
  successTotal: document.getElementById('success-total'),
  successSms: document.getElementById('success-sms'),
  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),
  historyLink: document.getElementById('history-link')
};

function formatNum(value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safeValue.toFixed(2);
}

function formatTanzaniaDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(String(value).replace(' ', 'T') + 'Z');

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function formatCurrency(value) {
  return `TZS ${Number(value || 0).toLocaleString('en-US')}`;
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle('hidden', key !== name);
  });
  state.currentStep = name;
}

function resetScaleSimulator() {
  if (state.scale.timer) {
    clearInterval(state.scale.timer);
    state.scale.timer = null;
  }

  state.scale = {
    status: 'IDLE',
    timer: null,
    readings: [],
    referenceWeight: null,
    qualifyingCount: 0,
    stableWeight: null,
    lastWeight: 0.0
  };

  elements.scaleStatus.textContent = 'IDLE';
  elements.scaleWeight.textContent = '0.00 KG';
  elements.referenceReading.textContent = '0.00 KG';
  elements.qualifyingCount.textContent = '0';
  elements.lockWeightBtn.disabled = true;
}

function updateScaleUi() {
  elements.scaleStatus.textContent = state.scale.status;
  elements.scaleWeight.textContent = `${formatNum(state.scale.lastWeight)} KG`;
  elements.referenceReading.textContent = `${formatNum(state.scale.referenceWeight ?? 0)} KG`;
  elements.qualifyingCount.textContent = String(state.scale.qualifyingCount);
  elements.lockWeightBtn.disabled = state.scale.status !== 'STABLE';
}

function stopScaleSimulator() {
  if (state.scale.timer) {
    clearInterval(state.scale.timer);
    state.scale.timer = null;
  }

  state.scale.status = 'LOCKED';
  state.scale.readings = [];
  state.scale.qualifyingCount = 5;
  updateScaleUi();
}

function startScaleSimulator() {
  resetScaleSimulator();
  state.form.weight_source = 'SCALE_SIMULATOR';
  state.scale.status = 'WEIGHING';
  state.scale.referenceWeight = null;
  state.scale.qualifyingCount = 0;
  state.scale.stableWeight = null;

  const simulationStart = Date.now();

  const simulateReading = () => {
    if (state.currentStep !== 'weighing' || state.scale.status === 'LOCKED') {
      if (state.scale.timer) {
        clearInterval(state.scale.timer);
      }
      state.scale.timer = null;
      return;
    }

    let candidate;

    if (state.scale.referenceWeight === null) {
      const baseWeight = 30 + Math.random() * 30;
      candidate = Number((baseWeight + (Math.random() - 0.5) * 0.2).toFixed(2));
      state.scale.referenceWeight = candidate;
      state.scale.lastWeight = candidate;
      state.scale.readings = [candidate];
      state.scale.status = 'WEIGHING';
      updateScaleUi();
      return;
    }

    const elapsedMs = Date.now() - simulationStart;
    const settlingPhaseMs = 30000;
    const isSettling = elapsedMs < settlingPhaseMs;
    const floatAmplitude = isSettling ? 0.8 : 0.04;
    const drift = (Math.random() - 0.5) * floatAmplitude;

    candidate = Number((state.scale.referenceWeight + drift).toFixed(2));
    const delta = Math.abs(candidate - state.scale.referenceWeight);

    if (delta <= 0.05) {
      state.scale.readings.push(candidate);
      state.scale.qualifyingCount += 1;
      state.scale.lastWeight = candidate;
      state.scale.stableWeight = candidate;
      state.scale.status = 'STABILIZING';

      if (state.scale.qualifyingCount >= 5) {
        state.scale.status = 'STABLE';
        state.form.weight_kg = Number(candidate.toFixed(2));
      }
    } else {
      state.scale.referenceWeight = candidate;
      state.scale.readings = [candidate];
      state.scale.qualifyingCount = 0;
      state.scale.stableWeight = null;
      state.scale.status = 'WEIGHING';
      state.scale.lastWeight = candidate;
    }

    updateScaleUi();
  };

  state.scale.timer = setInterval(simulateReading, 500);
  updateScaleUi();
}

function updatePriceUi() {
  const weightValue = Number(state.form.weight_kg || 0);
  const priceValue = Number(state.form.price_per_kg_tzs || 0);
  const total = weightValue * priceValue;

  elements.priceWeightDisplay.textContent = `${formatNum(weightValue)} KG`;
  elements.priceSourceDisplay.textContent = state.form.weight_source || 'MANUAL';
  elements.totalDisplay.textContent = formatCurrency(total);
  elements.confirmWeight.textContent = `${formatNum(weightValue)} KG`;
  elements.confirmSource.textContent = state.form.weight_source || 'MANUAL';
  elements.confirmPrice.textContent = formatCurrency(priceValue);
  elements.confirmTotal.textContent = formatCurrency(total);
}

function updateConfirmationUi() {
  const farmerName = state.form.farmer_name || '';
  const phone = state.form.farmer_phone || '';

  elements.confirmFarmer.textContent = farmerName;
  elements.confirmPhone.textContent = phone;
  elements.confirmWeight.textContent = `${formatNum(state.form.weight_kg || 0)} KG`;
  elements.confirmSource.textContent = state.form.weight_source || 'MANUAL';
  elements.confirmPrice.textContent = formatCurrency(Number(state.form.price_per_kg_tzs || 0));
  elements.confirmTotal.textContent = formatCurrency(Number(state.form.weight_kg || 0) * Number(state.form.price_per_kg_tzs || 0));
}

function showConfirmationError(message) {
  if (!message) {
    elements.confirmationError.classList.add('hidden');
    elements.confirmationError.textContent = '';
    return;
  }

  elements.confirmationError.textContent = message;
  elements.confirmationError.classList.remove('hidden');
}

function openNewTransaction() {
  state.form = {
    buying_center: '',
    farmer_name: '',
    farmer_phone: '',
    weight_kg: '',
    weight_source: 'MANUAL',
    price_per_kg_tzs: ''
  };

  elements.farmerForm.reset();
  elements.priceForm.reset();
  elements.manualWeightInput.value = '';
  elements.manualWeightBox.classList.add('hidden');
  elements.manualWeightBtn.textContent = 'Manual Weight';
  showConfirmationError('');
  resetScaleSimulator();
  showScreen('dashboard');
}

function goToFarmerScreen() {
  showScreen('farmer');
  window.setTimeout(() => elements.buyingCenter.focus(), 150);
}

function validateFarmerForm() {
  const buyingCenter = elements.buyingCenter.value.trim();
  const farmerName = elements.farmerName.value.trim();
  const farmerPhone = elements.farmerPhone.value.trim();

  if (!buyingCenter || buyingCenter.length < 2) {
    return false;
  }

  if (!farmerName || farmerName.length < 2) {
    return false;
  }

  if (!farmerPhone || farmerPhone.replace(/\D/g, '').length < 9) {
    return false;
  }

  state.form.buying_center = buyingCenter;
  state.form.farmer_name = farmerName;
  state.form.farmer_phone = farmerPhone;
  return true;
}

function validatePriceForm() {
  const price = Number(elements.pricePerKg.value);
  const weight = Number(state.form.weight_kg || 0);

  if (!Number.isFinite(price) || price <= 0) {
    return false;
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    return false;
  }

  state.form.price_per_kg_tzs = price;
  updatePriceUi();
  return true;
}

function setProcessingState(isProcessing) {
  state.processing = isProcessing;
  elements.confirmButton.disabled = isProcessing;
  elements.confirmButton.textContent = isProcessing ? 'Saving transaction...' : 'Confirm Transaction';
}

async function saveTransaction() {
  if (state.processing) {
    return;
  }

  setProcessingState(true);
  showConfirmationError('');

  const payload = {
    buying_center: state.form.buying_center,
    farmer_name: state.form.farmer_name,
    farmer_phone: state.form.farmer_phone,
    weight_kg: Number(state.form.weight_kg),
    weight_source: state.form.weight_source,
    price_per_kg_tzs: Number(state.form.price_per_kg_tzs)
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Duplicate transaction detected within the previous 5 minutes.');
      }
      if (response.status === 422) {
        throw new Error(data.error || 'Validation failed.');
      }
      if (response.status === 400) {
        throw new Error(data.error || 'Malformed request.');
      }
      throw new Error(data.error || 'Unable to process the transaction at the moment.');
    }

    state.latestTransaction = data.transaction;
    showScreen('success');
    elements.successReference.textContent = `Reference: ${data.transaction.transaction_ref}`;
    elements.successTotal.textContent = formatCurrency(data.transaction.total_tzs);
    elements.successSms.textContent = `SMS status: ${data.transaction.sms_status}`;
    await loadHistory();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      showConfirmationError('Transaction status could not be confirmed. Please check Transaction History before trying again.');
    } else {
      const message = error && error.message ? error.message : 'Unable to process the transaction at the moment.';
      showConfirmationError(message);
    }
  } finally {
    clearTimeout(timeoutId);
    setProcessingState(false);
  }
}

async function loadHistory() {
  elements.historyEmpty.classList.add('hidden');
  elements.historyList.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading transactions...</div>';

  try {
    const response = await fetch('/api/transactions');
    const data = await response.json();
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];

    state.history = transactions;

    if (transactions.length === 0) {
      elements.historyEmpty.classList.remove('hidden');
      elements.historyList.innerHTML = '';
      return;
    }

    elements.historyEmpty.classList.add('hidden');
    elements.historyList.innerHTML = transactions.map((item) => `
      <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${item.transaction_ref}</p>
            <p class="mt-1 font-semibold text-slate-900">${item.farmer_name}</p>
          </div>
          <span class="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">${item.status}</span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
          <p>Weight: <span class="font-semibold text-slate-900">${formatNum(item.weight_kg)} KG</span></p>
          <p>Total: <span class="font-semibold text-slate-900">${formatCurrency(item.total_tzs)}</span></p>
          <p>Phone: <span class="font-semibold text-slate-900">${item.farmer_phone}</span></p>
          <p>Date: <span class="font-semibold text-slate-900">${formatTanzaniaDateTime(item.created_at)}</span></p>
        </div>
      </div>
    `).join('');
  } catch (_error) {
    elements.historyEmpty.classList.remove('hidden');
    elements.historyList.innerHTML = '';
  }
}

function goToHistoryScreen() {
  loadHistory();
  showScreen('history');
}

function handleManualWeightToggle() {
  const shouldShow = elements.manualWeightBox.classList.contains('hidden');

  if (shouldShow) {
    elements.manualWeightBox.classList.remove('hidden');
    elements.manualWeightBtn.textContent = 'Use Manual Weight';
    elements.manualWeightInput.focus();
    return;
  }

  const value = Number(elements.manualWeightInput.value);
  if (!Number.isFinite(value) || value <= 0 || value > 5000) {
    elements.manualWeightInput.focus();
    return;
  }

  state.form.weight_kg = Number(value.toFixed(2));
  state.form.weight_source = 'MANUAL';
  elements.manualWeightBox.classList.add('hidden');
  elements.manualWeightBtn.textContent = 'Manual Weight';
  showScreen('price');
  updatePriceUi();
}

document.getElementById('new-transaction-btn').addEventListener('click', () => goToFarmerScreen());
document.getElementById('history-link').addEventListener('click', () => goToHistoryScreen());
document.getElementById('history-new-transaction').addEventListener('click', () => goToFarmerScreen());
document.getElementById('done-button').addEventListener('click', () => openNewTransaction());
document.getElementById('success-history-button').addEventListener('click', () => goToHistoryScreen());

document.getElementById('farmer-back').addEventListener('click', () => showScreen('dashboard'));
document.getElementById('weighing-back').addEventListener('click', () => showScreen('farmer'));
document.getElementById('price-back').addEventListener('click', () => showScreen('weighing'));
document.getElementById('confirmation-back').addEventListener('click', () => showScreen('price'));

document.getElementById('farmer-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateFarmerForm()) {
    return;
  }

  showScreen('weighing');
  startScaleSimulator();
});


document.getElementById('manual-weight-btn').addEventListener('click', handleManualWeightToggle);
document.getElementById('lock-weight-btn').addEventListener('click', () => {
  if (state.scale.status !== 'STABLE') {
    return;
  }

  const lockedWeight = Number((state.scale.stableWeight ?? 0).toFixed(2));
  if (!Number.isFinite(lockedWeight) || lockedWeight <= 0) {
    return;
  }

  state.form.weight_kg = lockedWeight;
  state.form.weight_source = 'SCALE_SIMULATOR';
  state.scale.status = 'LOCKED';
  state.scale.lastWeight = lockedWeight;
  state.scale.stableWeight = lockedWeight;
  if (state.scale.timer) {
    clearInterval(state.scale.timer);
    state.scale.timer = null;
  }
  updateScaleUi();
  showScreen('price');
  updatePriceUi();
});

document.getElementById('price-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validatePriceForm()) {
    return;
  }

  updateConfirmationUi();
  showScreen('confirmation');
});

document.getElementById('confirm-button').addEventListener('click', saveTransaction);

document.getElementById('price-per-kg').addEventListener('input', () => {
  const value = Number(elements.pricePerKg.value || 0);
  elements.totalDisplay.textContent = formatCurrency((Number(state.form.weight_kg || 0) * value));
});

window.addEventListener('DOMContentLoaded', async () => {
  resetScaleSimulator();
  await loadHistory();
  showScreen('dashboard');
});
