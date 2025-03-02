// 1. SIDEBAR TOGGLE & OVERLAY
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
});
overlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
});
document.querySelectorAll('#sidebar a').forEach(link => {
  link.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
});

// 2. BACKGROUND MUSIC TOGGLE
const bgMusic = document.getElementById('bgMusic');
const soundToggle = document.getElementById('soundToggle');
soundToggle.addEventListener('click', () => {
  if (bgMusic.paused) {
    bgMusic.volume = 0.5;
    bgMusic.play();
    soundToggle.textContent = '🔊';
  } else {
    bgMusic.pause();
    soundToggle.textContent = '🔇';
  }
});

// 3. THEME TOGGLE & ICICLES MANAGEMENT
const bodyEl = document.body;
const themeSelect = document.getElementById('theme-select');
themeSelect.value = 'dark';
themeSelect.addEventListener('change', () => {
  if (themeSelect.value === 'light') {
    bodyEl.classList.remove('dark-theme');
    bodyEl.classList.add('light-theme');
  } else {
    bodyEl.classList.remove('light-theme');
    bodyEl.classList.add('dark-theme');
  }
});

// 4. PARTICLE ANIMATION (Snow for Ice, Ambient for Dark)
(function() {
  const container = document.getElementById('particle-container');
  if (!container) return;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let width = window.innerWidth, height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  });
  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.size = 2 + Math.random() * 3;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI);
      const themeColor = getComputedStyle(document.body).getPropertyValue('--particle-color').trim();
      ctx.fillStyle = themeColor || 'rgba(138,43,226,0.5)';
      ctx.fill();
    }
  }
  const particles = [];
  const NUM_PARTICLES = 40;
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push(new Particle());
  }
  let mouseX = width / 2, mouseY = height / 2;
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      if (document.body.classList.contains('light-theme')) {
        // Falling snow with gentle breeze
        p.y += 1;
        p.x += Math.sin(Date.now() / 1000 + p.x) * 0.5;
        if (p.y > height) {
          p.y = 0;
          p.x = Math.random() * width;
        }
        p.draw();
      } else {
        // Ambient movement with mouse repulsion for dark theme
        p.update();
        const dx = p.x - mouseX, dy = p.y - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const repelRadius = 80;
        if (dist < repelRadius) {
          const angle = Math.atan2(dy, dx);
          const force = (repelRadius - dist) / repelRadius;
          p.x += Math.cos(angle) * force * 2;
          p.y += Math.sin(angle) * force * 2;
        }
        p.draw();
      }
    });
    requestAnimationFrame(animate);
  }
  animate();
})();

// 5. GRAPH FUNCTIONALITY WITH TRENDLINES, FORECASTS, RECOMMENDED PRICES & ACCURACY
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('item-search');
  const suggestionsDiv = document.getElementById('suggestions');
  const resultDiv = document.getElementById('result');
  const loaderDiv = document.getElementById('loader');
  const priceGraphCtx = document.getElementById('priceGraph').getContext('2d');
  const topMarginsDiv = document.getElementById('top-margins');
  const profitabilityRes = document.getElementById('profitability-result');
  const calcProfitButton = document.getElementById('calculate-profit');
  const topVariationsDiv = document.getElementById('top-variations');
  const refreshTopVarBtn = document.getElementById('refresh-top-variations');
  const variationTimeSel = document.getElementById('variation-time-range');
  const toggleLinear = document.getElementById('toggle-linear');
  const toggleExponential = document.getElementById('toggle-exponential');
  const toggleMA = document.getElementById('toggle-moving-average');
  const toggleForecast = document.getElementById('toggle-forecast');
  const toggleHoltWinters = document.getElementById('toggle-holt-winters');
  const downloadBtn = document.getElementById('downloadGraph');
  const forecastAccuracyDiv = document.getElementById('forecast-accuracy');
  const recommendedDiv = document.getElementById('recommended-prices');
  const targetSellInput = document.getElementById('target-sell-price');
  let currentItem = '';
  let chart;
  let graphHistoryData = [];

  // Helper Functions
  function computeLinearTrendline(dataPoints) {
    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      const x = dataPoints[i].x.getTime(), y = dataPoints[i].y;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return dataPoints.map(pt => ({ x: pt.x, y: intercept + slope * pt.x.getTime() }));
  }

  function computeExponentialTrendline(dataPoints) {
    const n = dataPoints.length;
    let sumX = 0, sumLogY = 0, sumXLogY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      const x = dataPoints[i].x.getTime(), y = dataPoints[i].y;
      if (y <= 0) continue;
      const logY = Math.log(y);
      sumX += x;
      sumLogY += logY;
      sumXLogY += x * logY;
      sumXX += x * x;
    }
    const slope = (n * sumXLogY - sumX * sumLogY) / (n * sumXX - sumX * sumX);
    const intercept = (sumLogY - slope * sumX) / n;
    return dataPoints.map(pt => ({ x: pt.x, y: Math.exp(intercept + slope * pt.x.getTime()) }));
  }

  function computeMovingAverage(dataPoints, windowSize = 5) {
    const result = [];
    for (let i = 0; i < dataPoints.length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
        sum += dataPoints[j].y;
        count++;
      }
      result.push({ x: dataPoints[i].x, y: sum / count });
    }
    return result;
  }

  function computeForecast(dataPoints, numPoints = 10) {
    if (dataPoints.length < 2) return [];
    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      const x = dataPoints[i].x.getTime(), y = dataPoints[i].y;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const interval = (dataPoints[n - 1].x.getTime() - dataPoints[0].x.getTime()) / (n - 1);
    const forecast = [];
    let lastTime = dataPoints[n - 1].x.getTime();
    for (let i = 1; i <= numPoints; i++) {
      const x = lastTime + i * interval;
      forecast.push({ x: new Date(x), y: intercept + slope * x });
    }
    return forecast;
  }

  function holtWintersForecast(dataPoints, periods = 100, alpha = 0.6, beta = 0.1, gamma = 0.1, seasonLength = 0) {
    if (dataPoints.length < 3) return [];
    const times = dataPoints.map(dp => dp.x.getTime());
    const values = dataPoints.map(dp => dp.y);
    const n = values.length;
    let level = values[0], trend = values[1] - values[0];
    let season = [];
    if (seasonLength > 0) {
      for (let i = 0; i < seasonLength; i++) {
        season[i] = values[i] - level;
      }
    }
    const result = [];
    for (let i = 0; i < n; i++) {
      let s = (seasonLength > 0) ? season[i % seasonLength] : 0;
      result.push({ x: new Date(times[i]), y: level + trend + s });
      const actual = values[i];
      const prevLevel = level;
      level = alpha * (actual - s) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      if (seasonLength > 0) {
        season[i % seasonLength] = gamma * (actual - level) + (1 - gamma) * s;
      }
    }
    const interval = (times[n - 1] - times[0]) / (n - 1);
    let lastTime = times[n - 1];
    for (let i = 1; i <= periods; i++) {
      lastTime += interval;
      let s = (seasonLength > 0) ? season[(n - 1 + i) % seasonLength] : 0;
      const fc = level + i * trend + s;
      result.push({ x: new Date(lastTime), y: fc });
    }
    return result;
  }

  // Compute forecast accuracy as ((forecast - actual) / forecast) * 100
  function computeForecastAccuracy(dataPoints, forecastFn, forecastHorizon) {
    if (dataPoints.length <= forecastHorizon) return 0;
    const trainingData = dataPoints.slice(0, dataPoints.length - forecastHorizon);
    const actualData = dataPoints.slice(dataPoints.length - forecastHorizon);
    const predictedFull = forecastFn(trainingData, forecastHorizon);
    const forecasted = predictedFull.slice(-forecastHorizon);
    let totalError = 0, count = 0;
    for (let i = 0; i < forecastHorizon; i++) {
      const forecastValue = forecasted[i].y;
      const actualValue = actualData[i].y;
      if (forecastValue !== 0) {
        totalError += ((forecastValue - actualValue) / forecastValue) * 100;
        count++;
      }
    }
    return count ? totalError / count : 0;
  }

  // Main chart update function (includes horizontal panning via zoom plugin)
  function updateChart() {
    if (!graphHistoryData.length) return;
    const buyDataPoints = graphHistoryData.map(h => ({ x: new Date(h.timestamp * 1000), y: h.buy_price }));
    const sellDataPoints = graphHistoryData.map(h => ({ x: new Date(h.timestamp * 1000), y: h.sell_price }));
    const minTime = new Date(Math.min(...buyDataPoints.map(pt => pt.x.getTime())));
    const maxTime = new Date(Math.max(...buyDataPoints.map(pt => pt.x.getTime())));
    const datasets = [
      {
        label: 'Buy Price',
        data: buyDataPoints,
        borderColor: '#00ccff',
        fill: false,
        tension: 0.3
      },
      {
        label: 'Sell Price',
        data: sellDataPoints,
        borderColor: '#ff5733',
        fill: false,
        tension: 0.3
      }
    ];

    if (toggleLinear.checked) {
      datasets.push({
        label: 'Buy Linear Trendline',
        data: computeLinearTrendline(buyDataPoints),
        borderColor: '#00ccff',
        borderDash: [5, 5],
        fill: false,
        tension: 0
      });
      datasets.push({
        label: 'Sell Linear Trendline',
        data: computeLinearTrendline(sellDataPoints),
        borderColor: '#ff5733',
        borderDash: [5, 5],
        fill: false,
        tension: 0
      });
    }
    if (toggleExponential.checked) {
      datasets.push({
        label: 'Buy Exponential Trendline',
        data: computeExponentialTrendline(buyDataPoints),
        borderColor: '#00ccff',
        borderDash: [10, 5],
        fill: false,
        tension: 0
      });
      datasets.push({
        label: 'Sell Exponential Trendline',
        data: computeExponentialTrendline(sellDataPoints),
        borderColor: '#ff5733',
        borderDash: [10, 5],
        fill: false,
        tension: 0
      });
    }
    if (toggleMA.checked) {
      datasets.push({
        label: 'Buy Moving Average',
        data: computeMovingAverage(buyDataPoints),
        borderColor: '#00ccff',
        borderDash: [2, 2],
        fill: false,
        tension: 0
      });
      datasets.push({
        label: 'Sell Moving Average',
        data: computeMovingAverage(sellDataPoints),
        borderColor: '#ff5733',
        borderDash: [2, 2],
        fill: false,
        tension: 0
      });
    }
    if (toggleForecast.checked) {
      datasets.push({
        label: 'Buy Forecast',
        data: computeForecast(buyDataPoints),
        borderColor: '#00ccff',
        borderDash: [15, 5],
        fill: false,
        tension: 0
      });
      datasets.push({
        label: 'Sell Forecast',
        data: computeForecast(sellDataPoints),
        borderColor: '#ff5733',
        borderDash: [15, 5],
        fill: false,
        tension: 0
      });
    }
    if (toggleHoltWinters.checked) {
      const periods = 100;
      const buyHW = holtWintersForecast(buyDataPoints, periods);
      const sellHW = holtWintersForecast(sellDataPoints, periods);
      datasets.push({
        label: 'Buy (Holt‑Winters)',
        data: buyHW,
        borderColor: '#00ccff',
        borderDash: [5, 10],
        fill: false,
        tension: 0
      });
      datasets.push({
        label: 'Sell (Holt‑Winters)',
        data: sellHW,
        borderColor: '#ff5733',
        borderDash: [5, 10],
        fill: false,
        tension: 0
      });
    }

    // Compute Recommended Prices
    const recommendedBuyPrice = Math.min(...buyDataPoints.map(pt => pt.y));
    const recommendedSellPrice = Math.max(...sellDataPoints.map(pt => pt.y));
    datasets.push({
      label: 'Recommended Buy Price',
      data: [{ x: minTime, y: recommendedBuyPrice }, { x: maxTime, y: recommendedBuyPrice }],
      borderColor: '#00ff00',
      borderDash: [8, 4],
      fill: false,
      pointRadius: 0
    });
    datasets.push({
      label: 'Recommended Sell Price',
      data: [{ x: minTime, y: recommendedSellPrice }, { x: maxTime, y: recommendedSellPrice }],
      borderColor: '#ff00ff',
      borderDash: [8, 4],
      fill: false,
      pointRadius: 0
    });
    // Check for custom target sell price input
    const targetSellPrice = parseFloat(targetSellInput.value);
    if (!isNaN(targetSellPrice)) {
      datasets.push({
        label: 'Target Sell Price',
        data: [{ x: minTime, y: targetSellPrice }, { x: maxTime, y: targetSellPrice }],
        borderColor: '#ffff00',
        borderDash: [2, 2],
        fill: false,
        pointRadius: 0
      });
    }
    // Update Recommended Prices Display
    recommendedDiv.textContent = `Recommended Buy Price: ${recommendedBuyPrice.toFixed(2)} | Recommended Sell Price: ${recommendedSellPrice.toFixed(2)}`;
    // Create/Update the Chart with horizontal panning enabled
    if (chart) chart.destroy();
    chart = new Chart(priceGraphCtx, {
      type: 'line',
      data: { datasets },
      options: {
        animation: { duration: 500, easing: 'easeInOutQuad' },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'minute', tooltipFormat: 'Pp' },
            min: minTime,
            max: maxTime,
            ticks: { color: document.body.classList.contains('light-theme') ? '#333' : '#fff' },
            grid: { color: document.body.classList.contains('light-theme') ? '#ddd' : '#555' }
          },
          y: {
            ticks: { color: document.body.classList.contains('light-theme') ? '#333' : '#fff' },
            grid: { color: document.body.classList.contains('light-theme') ? '#ddd' : '#555' }
          }
        },
        plugins: {
          zoom: {
            pan: {
              enabled: true,
              mode: 'x'
            },
            zoom: {
              wheel: { enabled: false },
              pinch: { enabled: false },
              mode: 'x'
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
            }
          },
          legend: {
            labels: { color: document.body.classList.contains('light-theme') ? '#333' : '#fff' }
          }
        }
      }
    });
    // Always compute and display forecast accuracies
    const simpleHorizon = 5;
    const simpleAccBuy = computeForecastAccuracy(buyDataPoints, computeForecast, simpleHorizon);
    const simpleAccSell = computeForecastAccuracy(sellDataPoints, computeForecast, simpleHorizon);
    const simpleAvg = (simpleAccBuy + simpleAccSell) / 2;
    const holtAccBuy = computeForecastAccuracy(buyDataPoints, holtWintersForecast, 100);
    const holtAccSell = computeForecastAccuracy(sellDataPoints, holtWintersForecast, 100);
    const holtAvg = (holtAccBuy + holtAccSell) / 2;
    forecastAccuracyDiv.textContent =
      `Simple Forecast Accuracy: Buy: ${simpleAccBuy.toFixed(2)}%, Sell: ${simpleAccSell.toFixed(2)}%, Avg: ${simpleAvg.toFixed(2)}% | ` +
      `Holt‑Winters Forecast Accuracy: Buy: ${holtAccBuy.toFixed(2)}%, Sell: ${holtAccSell.toFixed(2)}%, Avg: ${holtAvg.toFixed(2)}%`;
  }

  function showLoader(show) {
    loaderDiv.style.display = show ? 'block' : 'none';
  }

  // AUTOCOMPLETE LOGIC
  async function fetchSuggestions(query) {
    try {
      const response = await fetch(`/autocomplete?query=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch suggestions.');
      const items = await response.json();
      suggestionsDiv.innerHTML = '';
      items.forEach(item => {
        const suggestion = document.createElement('div');
        suggestion.textContent = item;
        suggestion.addEventListener('click', () => {
          searchInput.value = item;
          suggestionsDiv.innerHTML = '';
        });
        suggestionsDiv.appendChild(suggestion);
      });
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  }
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query.length < 2) { suggestionsDiv.innerHTML = ''; return; }
    fetchSuggestions(query);
  });

  // FETCH GRAPH DATA & UPDATE CHART
  async function fetchGraphData(itemName, timeRange = 'all') {
    try {
      showLoader(true);
      const url = `/graph-data?item=${encodeURIComponent(itemName)}&range=${timeRange}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch graph data.');
      graphHistoryData = await response.json();
      updateChart();
    } catch (error) {
      console.error('Graph error:', error);
      resultDiv.innerHTML = '<p>Error loading graph data. Please try again later.</p>';
    } finally {
      showLoader(false);
    }
  }

  // FETCH TOP MARGINS
  async function fetchTopMargins() {
    const sortBy = document.getElementById('sort-by').value;
    const order = document.getElementById('order').value;
    try {
      showLoader(true);
      const response = await fetch(`/top-margins?sort_by=${sortBy}&order=${order}`);
      if (!response.ok) throw new Error('Failed to fetch top margins.');
      const items = await response.json();
      topMarginsDiv.innerHTML = items.map(item => `
        <div class="item-card">
          <p><span>Item:</span> ${item.item_id}</p>
          <p><span>Margin:</span> ${item.margin}</p>
          <p><span>Buy Price:</span> ${item.buy_price}</p>
          <p><span>Sell Price:</span> ${item.sell_price}</p>
          <p><span>Demand:</span> ${item.demand ?? 'N/A'}</p>
          <p><span>Supply:</span> ${item.supply ?? 'N/A'}</p>
        </div>
      `).join('');
    } catch (error) {
      console.error('Top margins error:', error);
      topMarginsDiv.innerHTML = '<p>Error loading top items. Please try again later.</p>';
    } finally {
      showLoader(false);
    }
  }
  document.getElementById('refresh-top-margins').addEventListener('click', fetchTopMargins);
  setInterval(fetchTopMargins, 60000);
  fetchTopMargins();

  // PROFITABILITY CALCULATION
  calcProfitButton.addEventListener('click', async () => {
    const coins = parseFloat(document.getElementById('coins').value);
    const difficulty = parseFloat(document.getElementById('difficulty').value);
    try {
      showLoader(true);
      const response = await fetch(`/profitability?coins=${coins}&difficulty=${difficulty}`);
      if (!response.ok) throw new Error('Failed to fetch profitability.');
      const results = await response.json();
      profitabilityRes.innerHTML = results.map(r => `
        <div class="item-card">
          <p><strong>Item:</strong> ${r.item_id}</p>
          <p><strong>Profit per Minute:</strong> ${r.profit_per_minute.toFixed(2)}</p>
          <p><strong>Profit per Hour:</strong> ${r.profit_per_hour.toFixed(2)}</p>
        </div>
      `).join('');
    } catch (error) {
      console.error('Profitability error:', error);
      profitabilityRes.innerHTML = '<p>Error calculating profitability. Please try again later.</p>';
    } finally {
      showLoader(false);
    }
  });

  // GRAPH TIME RANGE BUTTONS
  document.querySelectorAll('.time-range-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const timeRange = this.getAttribute('data-range');
      if (currentItem) fetchGraphData(currentItem, timeRange);
    });
  });

  // EXTRA GRAPH CONTROL: DOWNLOAD GRAPH
  downloadBtn.addEventListener('click', () => {
    if (chart) {
      const url = chart.toBase64Image();
      const a = document.createElement('a');
      a.href = url;
      a.download = currentItem + '_graph.png';
      a.click();
    }
  });

  // FETCH TOP VARIATIONS
  async function fetchTopVariations() {
    const timeRange = variationTimeSel.value;
    try {
      showLoader(true);
      const response = await fetch(`/top-variations?time_range=${timeRange}`);
      if (!response.ok) throw new Error("Failed to fetch top variations.");
      const items = await response.json();
      topVariationsDiv.innerHTML = items.map(item => `
        <div class="item-card">
          <p><span>Item:</span> ${item.item_id}</p>
          <p><span>Buy Price Change:</span> ${item.buy_price_change}%</p>
          <p><span>Sell Price Change:</span> ${item.sell_price_change}%</p>
          <p><span>Median Buy Price:</span> ${item.median_buy_price}</p>
          <p><span>Median Sell Price:</span> ${item.median_sell_price}</p>
        </div>
      `).join('');
    } catch (error) {
      console.error('Top variations error:', error);
      topVariationsDiv.innerHTML = '<p>Error loading top variations. Please try again later.</p>';
    } finally {
      showLoader(false);
    }
  }
  refreshTopVarBtn.addEventListener('click', fetchTopVariations);
  fetchTopVariations();

  // Update chart if any toggle changes
  [toggleLinear, toggleExponential, toggleMA, toggleForecast, toggleHoltWinters].forEach(el =>
    el.addEventListener('change', updateChart)
  );

  // SEARCH -> FETCH ITEM DETAILS
  document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const itemName = searchInput.value.trim();
    if (!itemName) return;
    currentItem = itemName;
    try {
      showLoader(true);
      const response = await fetch(`/search?item=${encodeURIComponent(itemName)}`);
      if (!response.ok) throw new Error('Failed to fetch item details.');
      const data = await response.json();
      resultDiv.innerHTML = `
        <p><strong>Item:</strong> ${data.item_id}</p>
        <p><strong>Buy Price:</strong> ${data.buy_price ?? 'N/A'}</p>
        <p><strong>Sell Price:</strong> ${data.sell_price ?? 'N/A'}</p>
        <p><strong>Margin:</strong> ${data.margin ?? 'N/A'}</p>
        <p><strong>Demand:</strong> ${data.demand ?? 'N/A'}</p>
        <p><strong>Supply:</strong> ${data.supply ?? 'N/A'}</p>
      `;
      fetchGraphData(itemName);
    } catch (error) {
      console.error('Item details error:', error);
      resultDiv.innerHTML = '<p>Error loading item details. Please try again later.</p>';
    } finally {
      showLoader(false);
    }
  });
});
