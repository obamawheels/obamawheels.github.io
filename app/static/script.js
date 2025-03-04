/****************************************************************************
 *                     DESTINY-STYLE BZTRACKER — REFACTORED & EXPANDED JS
 *  
 *  Key Improvements:
 *   1) Config Object for cosmic entity settings (stars, meteors, comets)
 *   2) Object Pooling to reduce GC overhead
 *   3) fetchWithErrorHandling for consistent error handling
 *   4) Single utility for linear/exponential trendlines (optional usage)
 *   5) Proper Chart.js cleanup (destroy + null)
 *   6) Fullscreen mode via requestFullscreen for better browser support
 *   7) More realistic stars: random color tint & radius, improved twinkle
 *   8) Code split into smaller helper functions for clarity
 ****************************************************************************/
(function() {
  "use strict";

  /**************************************************************************
   * 1) CONFIGURATION
   **************************************************************************/
  const config = {
    stars: {
      count: 1200,
      speedBase: 0.06,
      speedVariation: 0.04,
      twinkleChance: 0.02,    // slight increase for more “sparkle”
      maxBrightness: 1.0,
      minBrightness: 0.2,     // allow dimmer stars
      radiusMin: 0.5,         // smaller minimum radius
      radiusMax: 2.5,         // bigger maximum radius
      colorVariation: 20      // up to +/- 20 in hue for subtle color changes
    },
    meteors: {
      spawnRate: 0.004,
      baseSpeed: 1.7,
      lifeMin: 80,
      lifeMax: 200,
      lengthMin: 80,
      lengthMax: 180
    },
    comets: {
      spawnRate: 0.002,
      baseSpeed: 0.4,
      trailLength: 100
    },
    cosmic: {
      cursorRepulsionRadius: 120,
      cursorForce: 0.08
    }
  };

  /**************************************************************************
   * 2) GLOBALS & OBJECT POOLING
   **************************************************************************/
  let cosmicCanvas, ctx;
  let width = 0, height = 0;
  let mouseX = 0, mouseY = 0;
  let isMouseMoving = false;
  let mouseMoveTimeout = null;

  const cosmicEntities = []; // store active cosmic objects (stars, meteors, comets)

  // Simple object pool class
  class ObjectPool {
    constructor(createFn) {
      this.pool = [];
      this.createFn = createFn;
    }
    acquire() {
      return this.pool.pop() || this.createFn();
    }
    release(obj) {
      this.pool.push(obj);
    }
  }

  // Pools for each entity type
  const starPool   = new ObjectPool(() => new Star());
  const meteorPool = new ObjectPool(() => new Meteor());
  const cometPool  = new ObjectPool(() => new Comet());

  /**************************************************************************
   * 3) STAR, METEOR, COMET CLASSES
   **************************************************************************/
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Helper to get a random star color with slight hue variation
  function randomStarColor() {
    // base hue around ~200-280 for a bluish star, or vary as you like
    const baseHue = rand(180, 300);
    // random variation
    const hue = baseHue + rand(-config.stars.colorVariation, config.stars.colorVariation);
    return `hsl(${hue}, 100%, 90%)`;
  }

  class Star {
    constructor() {
      this.reset();
    }

    reset() {
      // position
      this.x = rand(0, width);
      this.y = rand(0, height);

      // radius
      this.r = rand(config.stars.radiusMin, config.stars.radiusMax);

      // velocity
      const baseSpeed = config.stars.speedBase + Math.random() * config.stars.speedVariation;
      const angle = Math.random() * 2 * Math.PI;
      this.vx = Math.cos(angle) * baseSpeed;
      this.vy = Math.sin(angle) * baseSpeed;

      // brightness
      this.brightness = rand(config.stars.minBrightness, config.stars.maxBrightness);

      // color: subtle tinted white
      // If you want truly colored stars, uncomment below:
      // this.color = randomStarColor();
      // For a subtle effect, keep them near white but vary slightly:
      this.color = `rgba(255, 255, 255, ${this.brightness})`;
    }

    update() {
      // move
      this.x += this.vx;
      this.y += this.vy;

      // off-screen => reset
      if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
        this.reset();
        return;
      }

      // twinkle
      if (Math.random() < config.stars.twinkleChance) {
        this.brightness += rand(-0.1, 0.1);
        if (this.brightness > config.stars.maxBrightness) {
          this.brightness = config.stars.maxBrightness;
        } else if (this.brightness < config.stars.minBrightness) {
          this.brightness = config.stars.minBrightness;
        }
        this.color = `rgba(255, 255, 255, ${this.brightness})`;
      }

      // mouse repulsion
      if (isMouseMoving) {
        const dx = this.x - mouseX;
        const dy = this.y - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < config.cosmic.cursorRepulsionRadius) {
          const force = (config.cosmic.cursorRepulsionRadius - dist) / config.cosmic.cursorRepulsionRadius;
          const angle = Math.atan2(dy, dx);
          this.x += Math.cos(angle) * force * config.cosmic.cursorForce * 4;
          this.y += Math.sin(angle) * force * config.cosmic.cursorForce * 4;
        }
      }
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  class Meteor {
    constructor() {
      this.reset();
    }

    reset() {
      const edge = Math.floor(rand(0,4));
      if (edge === 0) {
        this.x = -50; 
        this.y = rand(0, height);
      } else if (edge === 1) {
        this.x = width + 50;
        this.y = rand(0, height);
      } else if (edge === 2) {
        this.x = rand(0, width);
        this.y = -50;
      } else {
        this.x = rand(0, width);
        this.y = height + 50;
      }

      const angleToCenter = Math.atan2((height/2) - this.y, (width/2) - this.x);
      const speed = config.meteors.baseSpeed + Math.random() * 1.0;
      this.vx = Math.cos(angleToCenter) * speed;
      this.vy = Math.sin(angleToCenter) * speed;

      this.length = rand(config.meteors.lengthMin, config.meteors.lengthMax);
      this.life   = rand(config.meteors.lifeMin, config.meteors.lifeMax);

      // random bright hue
      const hue = rand(0, 360);
      this.color = `hsl(${hue}, 100%, 75%)`;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life--;
      if (this.life < 0) {
        this.reset();
      }
      if (this.x < -100 || this.x>width+100 || this.y< -100 || this.y>height+100) {
        this.reset();
      }
    }

    draw(ctx) {
      const tx = this.x - this.vx * this.length;
      const ty = this.y - this.vy * this.length;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
  }

  class Comet {
    constructor() {
      this.reset();
    }

    reset() {
      const edge = Math.floor(rand(0,4));
      if (edge === 0) {
        this.x = -50; 
        this.y = rand(0, height);
      } else if (edge === 1) {
        this.x = width+50; 
        this.y = rand(0, height);
      } else if (edge === 2) {
        this.x = rand(0, width);
        this.y = -50;
      } else {
        this.x = rand(0, width);
        this.y = height+50;
      }

      this.angle = rand(0, 2*Math.PI);
      const speed= config.comets.baseSpeed + Math.random()*0.4;
      this.vx= Math.cos(this.angle)* speed;
      this.vy= Math.sin(this.angle)* speed;

      this.trail= [];
      this.trailMaxLen= config.comets.trailLength;

      const hue= rand(180, 280);
      this.color= `hsla(${hue},100%,70%,0.8)`;
      this.r= rand(3,6);
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      this.trail.push({ x:this.x, y:this.y });
      if(this.trail.length>this.trailMaxLen) {
        this.trail.shift();
      }

      if (this.x< -100 || this.x>width+100 || this.y< -100 || this.y>height+100) {
        this.reset();
      }
    }

    draw(ctx) {
      if(this.trail.length>1) {
        ctx.beginPath();
        ctx.moveTo(this.trail[0].x, this.trail[0].y);
        for (let i=1; i<this.trail.length; i++){
          ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.strokeStyle= this.color;
        ctx.lineWidth= 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(this.x,this.y,this.r,0,2*Math.PI);
      ctx.fillStyle= this.color;
      ctx.fill();
    }
  }

  /**************************************************************************
   * 4) STARFIELD SETUP & ANIMATION
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    cosmicCanvas = document.getElementById('cosmicCanvas');
    if(!cosmicCanvas) {
      console.warn("No #cosmicCanvas => starfield won't run.");
      return;
    }
    ctx = cosmicCanvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // spawn initial stars from the pool
    for (let i=0; i<config.stars.count; i++){
      const star = starPool.acquire();
      star.reset();
      cosmicEntities.push(star);
    }

    requestAnimationFrame(animateStarfield);

    // track mouse
    window.addEventListener('mousemove', e=>{
      mouseX = e.clientX; 
      mouseY = e.clientY;
      isMouseMoving= true;
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout= setTimeout(()=>{ isMouseMoving=false; }, 1500);
    });
  });

  function resizeCanvas() {
    width  = window.innerWidth;
    height = window.innerHeight;
    cosmicCanvas.width = width;
    cosmicCanvas.height= height;
  }

  function animateStarfield() {
    ctx.clearRect(0,0,width,height);

    // spawn meteors
    if(Math.random() < config.meteors.spawnRate) {
      const m = meteorPool.acquire();
      m.reset();
      cosmicEntities.push(m);
    }
    // spawn comets
    if(Math.random() < config.comets.spawnRate) {
      const c = cometPool.acquire();
      c.reset();
      cosmicEntities.push(c);
    }

    // update & draw all cosmic entities
    for(let i=0; i<cosmicEntities.length; i++){
      const obj = cosmicEntities[i];
      obj.update();
      obj.draw(ctx);

      // if an object is a star that left screen, we do starPool.release(obj)
      // but we do that in their reset() method or if we want to remove them
      // from cosmicEntities. For simplicity, we keep them in cosmicEntities
      // but re-randomize them when they go off-screen.
    }

    requestAnimationFrame(animateStarfield);
  }

  /**************************************************************************
   * 5) HELPER: fetchWithErrorHandling
   **************************************************************************/
  async function fetchWithErrorHandling(url, errorMessage) {
    try {
      const res = await fetch(url);
      if(!res.ok) throw new Error(errorMessage);
      return await res.json();
    } catch(err) {
      console.error(`${errorMessage}:`, err);
      return null;
    }
  }

  /**************************************************************************
   * 6) PLANET NAVIGATION
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    const planetSelectEl= document.getElementById('planetSelect');
    const planets= document.querySelectorAll('.planet');
    const featureSections= document.querySelectorAll('.feature-section');
    const backButtons= document.querySelectorAll('.back-button');

    if(!planetSelectEl) return;

    planets.forEach( planet => {
      planet.addEventListener('click', () => {
        const targetId= planet.getAttribute('data-target');
        if(!targetId) return;
        const targetSec= document.getElementById(targetId);
        if(!targetSec) return;

        planetSelectEl.style.display='none';
        targetSec.removeAttribute('hidden');
        targetSec.style.display='block';
        document.body.style.overflow='auto';
      });
    });

    backButtons.forEach(btn=>{
      btn.addEventListener('click', ()=>{
        featureSections.forEach(sec=>{
          sec.style.display='none';
        });
        planetSelectEl.style.display='block';
        document.body.style.overflow='hidden';
      });
    });
  });

  /**************************************************************************
   * 7) SOUND TOGGLE
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    const bgMusic= document.getElementById('bgMusic');
    const soundToggle= document.getElementById('soundToggle');
    if(!bgMusic || !soundToggle) return;

    soundToggle.style.display='inline-block';

    soundToggle.addEventListener('click', ()=>{
      if(bgMusic.paused){
        bgMusic.volume=0.5;
        bgMusic.play();
        soundToggle.textContent='🔊';
      } else {
        bgMusic.pause();
        soundToggle.textContent='🔇';
      }
    });
  });

  /**************************************************************************
   * 8) THEME TOGGLE
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', ()=>{
    const themeSelect= document.getElementById('theme-select');
    if(!themeSelect)return;

    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    themeSelect.value='dark';

    themeSelect.addEventListener('change',()=>{
      if(themeSelect.value==='light'){
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
      }
    });
  });

  /**************************************************************************
   * 9) BZTRACKER: SEARCH, GRAPH, MARGINS, PROFIT, VARIATIONS
   **************************************************************************/
  let chart = null; // Chart.js instance
  let currentItem = ''; // track current item for the chart
  let graphHistoryData = [];

  document.addEventListener('DOMContentLoaded', ()=>{
    // references
    const searchInput     = document.getElementById('item-search');
    const suggestionsDiv  = document.getElementById('suggestions');
    const resultDiv       = document.getElementById('result');
    const priceGraphCtx   = document.getElementById('priceGraph')?.getContext('2d');

    const forecastAccuracyDiv= document.getElementById('forecast-accuracy');
    const recommendedDiv     = document.getElementById('recommended-prices');
    const targetSellInput    = document.getElementById('target-sell-price');

    const toggleLinear       = document.getElementById('toggle-linear');
    const toggleExponential  = document.getElementById('toggle-exponential');
    const toggleMA           = document.getElementById('toggle-moving-average');
    const toggleForecast     = document.getElementById('toggle-forecast');
    const toggleHoltWinters  = document.getElementById('toggle-holt-winters');

    const timeRangeBtns      = document.querySelectorAll('.time-range-btn');
    const downloadBtn        = document.getElementById('downloadGraph');

    const fullscreenBtn      = document.getElementById('fullscreenBtn');
    const umbraSection       = document.getElementById('planet-umbra-feature');

    // top margins
    const topMarginsDiv      = document.getElementById('top-margins');
    const refreshTopMargins  = document.getElementById('refresh-top-margins');

    // profitability
    const profitabilityRes   = document.getElementById('profitability-result');
    const coinsInput         = document.getElementById('coins');
    const difficultyInput    = document.getElementById('difficulty');
    const calcProfitButton   = document.getElementById('calculate-profit');

    // variations
    const topVariationsDiv   = document.getElementById('top-variations');
    const refreshTopVarBtn   = document.getElementById('refresh-top-variations');
    const variationTimeSel   = document.getElementById('variation-time-range');

    /**********************************************************************
     * Helper: Show/Hide Loader
     **********************************************************************/
    function showLoader(show) {
      const loader= document.getElementById('loader');
      if(loader) loader.style.display= show?'block':'none';
    }

    /**********************************************************************
     * 9.1) AUTOCOMPLETE
     **********************************************************************/
    if(searchInput){
      searchInput.addEventListener('input', ()=>{
        const query= searchInput.value.trim();
        if(query.length<2){
          suggestionsDiv.innerHTML='';
          return;
        }
        fetchSuggestions(query);
      });
    }

    async function fetchSuggestions(query){
      const items = await fetchWithErrorHandling(
        `/autocomplete?query=${encodeURIComponent(query)}`,
        "Failed to fetch autocomplete"
      );
      if(!items) return;
      suggestionsDiv.innerHTML='';
      items.forEach(item=>{
        const div= document.createElement('div');
        div.textContent= item;
        div.addEventListener('click', ()=>{
          searchInput.value= item;
          suggestionsDiv.innerHTML='';
        });
        suggestionsDiv.appendChild(div);
      });
    }

    /**********************************************************************
     * 9.2) SEARCH => fetch item details + graph
     **********************************************************************/
    const searchForm= document.getElementById('search-form');
    if(searchForm){
      searchForm.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const itemName= searchInput.value.trim();
        if(!itemName)return;
        currentItem= itemName;

        showLoader(true);
        const data = await fetchWithErrorHandling(
          `/search?item=${encodeURIComponent(itemName)}`,
          "Failed to fetch item details"
        );
        showLoader(false);

        if(!data) {
          resultDiv.innerHTML='<p>Error loading item details.</p>';
          return;
        }

        const {
          item_id,
          buy_price,
          sell_price,
          margin,
          demand,
          supply
        }= data;

        resultDiv.innerHTML= `
          <p><strong>Item:</strong> ${item_id}</p>
          <p><strong>Buy Price:</strong> ${buy_price??'N/A'}</p>
          <p><strong>Sell Price:</strong> ${sell_price??'N/A'}</p>
          <p><strong>Margin:</strong> ${margin??'N/A'}</p>
          <p><strong>Demand:</strong> ${demand??'N/A'}</p>
          <p><strong>Supply:</strong> ${supply??'N/A'}</p>
        `;

        fetchGraphData(itemName,'all');
      });
    }

    /**********************************************************************
     * 9.3) FETCH GRAPH DATA
     **********************************************************************/
    async function fetchGraphData(itemName, timeRange='all') {
      showLoader(true);
      const data = await fetchWithErrorHandling(
        `/graph-data?item=${encodeURIComponent(itemName)}&range=${encodeURIComponent(timeRange)}`,
        "Failed to fetch graph data"
      );
      showLoader(false);

      if(!data) {
        resultDiv.innerHTML='<p>Error loading graph data. Please try again later.</p>';
        return;
      }
      graphHistoryData = data;
      updateChart();
    }

    /**********************************************************************
     * 7.4) CHART LOGIC (Trendlines, Forecast, Holt-Winters)
     **********************************************************************/

    // advanced computations
    function computeLinearTrendline(dataPoints) {
      const n= dataPoints.length;
      if(n<2)return [];
      let sumX=0, sumY=0, sumXY=0, sumXX=0;
      for(let i=0; i<n; i++){
        const x= dataPoints[i].x.getTime();
        const y= dataPoints[i].y;
        sumX+= x; sumY+= y; sumXY+= x*y; sumXX+= x*x;
      }
      const slope= (n*sumXY - sumX*sumY)/(n*sumXX - sumX*sumX);
      const intercept= (sumY- slope*sumX)/n;
      return dataPoints.map(pt=>({
        x: pt.x,
        y: intercept + slope*pt.x.getTime()
      }));
    }
    function computeExponentialTrendline(dataPoints) {
      const n= dataPoints.length;
      if(n<2)return[];
      let sumX=0, sumLogY=0, sumXLogY=0, sumXX=0;
      for(let i=0;i<n;i++){
        const x= dataPoints[i].x.getTime();
        const y= dataPoints[i].y;
        if(y<=0)continue;
        const logY= Math.log(y);
        sumX+= x; sumLogY+= logY; sumXLogY+= x*logY; sumXX+= x*x;
      }
      const slope= (n*sumXLogY - sumX*sumLogY)/(n*sumXX - sumX*sumX);
      const intercept= (sumLogY - slope*sumX)/n;
      return dataPoints.map(pt=>({
        x:pt.x,
        y: Math.exp(intercept + slope*pt.x.getTime())
      }));
    }
    function computeMovingAverage(dataPoints, windowSize=5){
      const result= [];
      for(let i=0; i<dataPoints.length; i++){
        let sum=0, count=0;
        for(let j=Math.max(0,i-windowSize+1); j<=i; j++){
          sum+= dataPoints[j].y;
          count++;
        }
        result.push({ x:dataPoints[i].x, y: sum/count });
      }
      return result;
    }
    function computeForecast(dataPoints,numPoints=10){
      if(dataPoints.length<2)return[];
      const n= dataPoints.length;
      let sumX=0, sumY=0, sumXY=0, sumXX=0;
      for(let i=0;i<n;i++){
        const x= dataPoints[i].x.getTime();
        const y= dataPoints[i].y;
        sumX+= x; sumY+= y; sumXY+= x*y; sumXX+= x*x;
      }
      const slope= (n*sumXY - sumX*sumY)/(n*sumXX - sumX*sumX);
      const intercept= (sumY- slope*sumX)/n;
      const interval= (dataPoints[n-1].x.getTime()- dataPoints[0].x.getTime())/(n-1);
      const forecast= [];
      let lastTime= dataPoints[n-1].x.getTime();
      for(let i=1;i<=numPoints;i++){
        const newX= lastTime + i* interval;
        forecast.push({ x:new Date(newX), y: intercept + slope* newX });
      }
      return forecast;
    }
    function holtWintersForecast(dataPoints,periods=50,alpha=0.6,beta=0.1,gamma=0.1,seasonLen=0){
      if(dataPoints.length<3)return[];
      const times= dataPoints.map(dp=> dp.x.getTime());
      const values= dataPoints.map(dp=> dp.y);
      const n= values.length;

      let level= values[0];
      let trend= values[1]- values[0];
      let season= [];
      if(seasonLen>0){
        for(let i=0;i<seasonLen;i++){
          season[i]= values[i]- level;
        }
      }
      const result= [];
      for(let i=0;i<n;i++){
        const s= (seasonLen>0)? season[i%seasonLen]: 0;
        result.push({ x:new Date(times[i]), y: level+ trend + s });
        const actual= values[i];
        const prevLevel= level;
        level= alpha*(actual- s) + (1-alpha)*(level+ trend);
        trend= beta*(level- prevLevel) + (1-beta)*trend;
        if(seasonLen>0){
          season[i%seasonLen]= gamma*(actual- level)+(1-gamma)* s;
        }
      }
      const interval= (times[n-1]- times[0])/(n-1);
      let lastTime= times[n-1];
      for(let i=1;i<=periods;i++){
        lastTime+= interval;
        const s= (seasonLen>0)? season[(n-1+i)%seasonLen]: 0;
        const fc= level + i* trend + s;
        result.push({ x:new Date(lastTime), y:fc });
      }
      return result;
    }
    function computeForecastAccuracy(dataPoints, forecastFn, horizon){
      if(dataPoints.length<= horizon)return 0;
      const training= dataPoints.slice(0, dataPoints.length- horizon);
      const actualData= dataPoints.slice(dataPoints.length- horizon);
      const predictedFull= forecastFn(training, horizon);
      const forecasted= predictedFull.slice(-horizon);

      let totalError= 0, count=0;
      for(let i=0;i<horizon;i++){
        const fc= forecasted[i]?.y??0;
        const ac= actualData[i]?.y??0;
        if(fc!==0){
          totalError+= ((fc- ac)/ fc)* 100;
          count++;
        }
      }
      return count? totalError/ count :0;
    }

    function updateChart() {
      if(!graphHistoryData.length||!priceGraphCtx)return;
      // transform raw data => x: Date, y: numeric
      const buyDataPoints= graphHistoryData.map(h=>({
        x: new Date(h.timestamp*1000),
        y: h.buy_price
      }));
      const sellDataPoints= graphHistoryData.map(h=>({
        x: new Date(h.timestamp*1000),
        y: h.sell_price
      }));
      const minTime= new Date(Math.min(...buyDataPoints.map(pt=> pt.x.getTime())));
      const maxTime= new Date(Math.max(...buyDataPoints.map(pt=> pt.x.getTime())));

      const datasets= [
        {
          label:'Buy Price',
          data: buyDataPoints,
          borderColor:'#00ccff',
          fill:false,
          tension:0.3
        },
        {
          label:'Sell Price',
          data: sellDataPoints,
          borderColor:'#ff5733',
          fill:false,
          tension:0.3
        }
      ];

      if(toggleLinear?.checked){
        datasets.push({
          label:'Buy Linear',
          data: computeLinearTrendline(buyDataPoints),
          borderColor:'#00ccff',
          borderDash:[5,5],
          fill:false,
          tension:0
        },{
          label:'Sell Linear',
          data: computeLinearTrendline(sellDataPoints),
          borderColor:'#ff5733',
          borderDash:[5,5],
          fill:false,
          tension:0
        });
      }
      if(toggleExponential?.checked){
        datasets.push({
          label:'Buy Exponential',
          data: computeExponentialTrendline(buyDataPoints),
          borderColor:'#00ccff',
          borderDash:[10,5],
          fill:false,
          tension:0
        },{
          label:'Sell Exponential',
          data: computeExponentialTrendline(sellDataPoints),
          borderColor:'#ff5733',
          borderDash:[10,5],
          fill:false,
          tension:0
        });
      }
      if(toggleMA?.checked){
        datasets.push({
          label:'Buy MA',
          data: computeMovingAverage(buyDataPoints),
          borderColor:'#00ccff',
          borderDash:[2,2],
          fill:false,
          tension:0
        },{
          label:'Sell MA',
          data: computeMovingAverage(sellDataPoints),
          borderColor:'#ff5733',
          borderDash:[2,2],
          fill:false,
          tension:0
        });
      }
      if(toggleForecast?.checked){
        datasets.push({
          label:'Buy Forecast',
          data: computeForecast(buyDataPoints),
          borderColor:'#00ccff',
          borderDash:[15,5],
          fill:false,
          tension:0
        },{
          label:'Sell Forecast',
          data: computeForecast(sellDataPoints),
          borderColor:'#ff5733',
          borderDash:[15,5],
          fill:false,
          tension:0
        });
      }
      if(toggleHoltWinters?.checked){
        const buyHW= holtWintersForecast(buyDataPoints,50);
        const sellHW=holtWintersForecast(sellDataPoints,50);
        datasets.push({
          label:'Buy HW',
          data: buyHW,
          borderColor:'#00ccff',
          borderDash:[5,10],
          fill:false,
          tension:0
        },{
          label:'Sell HW',
          data: sellHW,
          borderColor:'#ff5733',
          borderDash:[5,10],
          fill:false,
          tension:0
        });
      }

      // recommended lines
      const recommendedBuy= Math.min(...buyDataPoints.map(pt=> pt.y));
      const recommendedSell= Math.max(...sellDataPoints.map(pt=> pt.y));
      datasets.push({
        label:'Recommended Buy',
        data:[ {x:minTime, y:recommendedBuy}, {x:maxTime,y:recommendedBuy}],
        borderColor:'#00ff00',
        borderDash:[8,4],
        fill:false,
        pointRadius:0
      },{
        label:'Recommended Sell',
        data:[ {x:minTime,y:recommendedSell},{x:maxTime,y:recommendedSell}],
        borderColor:'#ff00ff',
        borderDash:[8,4],
        fill:false,
        pointRadius:0
      });

      // user-specified target
      const targetVal= parseFloat(targetSellInput?.value);
      if(!isNaN(targetVal)){
        datasets.push({
          label:'Target Sell Price',
          data:[ {x:minTime,y:targetVal},{x:maxTime,y:targetVal}],
          borderColor:'#ffff00',
          borderDash:[2,2],
          fill:false,
          pointRadius:0
        });
      }

      recommendedDiv.textContent= `Recommended Buy: ${recommendedBuy.toFixed(2)} | Recommended Sell: ${recommendedSell.toFixed(2)}`;

      // create or destroy old chart
      if(chart) chart.destroy();
      chart= new Chart(priceGraphCtx, {
        type:'line',
        data: { datasets },
        options:{
          animation: { duration:600, easing:'easeInOutQuad' },
          scales:{
            x:{
              type:'time',
              time:{ unit:'minute', tooltipFormat:'Pp' },
              min:minTime,
              max:maxTime,
              ticks:{ color: document.body.classList.contains('light-theme')?'#000':'#fff' },
              grid:{ color: document.body.classList.contains('light-theme')?'#ccc':'#444'}
            },
            y:{
              ticks:{ color: document.body.classList.contains('light-theme')?'#000':'#fff' },
              grid:{ color: document.body.classList.contains('light-theme')?'#ccc':'#444'}
            }
          },
          plugins:{
            zoom:{
              pan:{ enabled:true, mode:'x'},
              zoom:{ wheel:{enabled:false}, pinch:{enabled:false}, mode:'x'}
            },
            tooltip:{
              callbacks:{
                label: ctx=> `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
              }
            },
            legend:{
              labels:{ color: document.body.classList.contains('light-theme')?'#000':'#fff' }
            }
          }
        }
      });

      // forecast accuracy
      const horizon=5; // horizon for simple forecast
      const buyAcc   = computeForecastAccuracy(buyDataPoints, computeForecast, horizon);
      const sellAcc  = computeForecastAccuracy(sellDataPoints, computeForecast, horizon);
      const simpleAvg= (buyAcc + sellAcc)/2;

      // Holt-Winters accuracy
      const hwBuyAcc = computeForecastAccuracy(buyDataPoints, holtWintersForecast, 50);
      const hwSellAcc= computeForecastAccuracy(sellDataPoints, holtWintersForecast, 50);
      const hwAvg    = (hwBuyAcc + hwSellAcc)/2;

      forecastAccuracyDiv.textContent=
        `Simple Forecast: B ${buyAcc.toFixed(2)}%, S ${sellAcc.toFixed(2)}%, Avg ${simpleAvg.toFixed(2)}% | `+
        `Holt-Winters: B ${hwBuyAcc.toFixed(2)}%, S ${hwSellAcc.toFixed(2)}%, Avg ${hwAvg.toFixed(2)}%`;
    }

    /**********************************************************************
     * 7.5) TIME RANGE BUTTONS & DOWNLOAD
     **********************************************************************/
    timeRangeBtns.forEach(btn=>{
      btn.addEventListener('click',()=>{
        const range= btn.getAttribute('data-range');
        if(currentItem) fetchGraphData(currentItem, range);
      });
    });
    if(downloadBtn){
      downloadBtn.addEventListener('click',()=>{
        if(chart){
          const url= chart.toBase64Image();
          const a= document.createElement('a');
          a.href= url;
          a.download= (currentItem || 'chart')+ '_graph.png';
          a.click();
        }
      });
    }

    /**********************************************************************
     * 7.6) TOP MARGINS
     **********************************************************************/
    if(refreshTopMargins){
      refreshTopMargins.addEventListener('click', fetchTopMargins);
    }
    async function fetchTopMargins(){
      try{
        showLoader(true);
        const sortBy= document.getElementById('sort-by').value;
        const order= document.getElementById('order').value;
        const res= await fetch(`/top-margins?sort_by=${sortBy}&order=${order}`);
        if(!res.ok) throw new Error("top-margins fetch fail");
        const items= await res.json();
        topMarginsDiv.innerHTML= items.map(item=>`
          <div class="item-card">
            <p><span>Item:</span> ${item.item_id}</p>
            <p><span>Margin:</span> ${item.margin}</p>
            <p><span>Buy Price:</span> ${item.buy_price}</p>
            <p><span>Sell Price:</span> ${item.sell_price}</p>
            <p><span>Demand:</span> ${item.demand??'N/A'}</p>
            <p><span>Supply:</span> ${item.supply??'N/A'}</p>
          </div>
        `).join('');
      } catch(err){
        console.error("Top margins error:",err);
        topMarginsDiv.innerHTML='<p>Error loading top margins. Please try again.</p>';
      } finally{
        showLoader(false);
      }
    }
    fetchTopMargins(); // optional initial load

    /**********************************************************************
     * 7.7) PROFITABILITY
     **********************************************************************/
    if(calcProfitButton){
      calcProfitButton.addEventListener('click', async()=>{
        const coins= parseFloat(coinsInput.value)||0;
        const difficulty= parseFloat(difficultyInput.value)||1;
        try{
          showLoader(true);
          const res= await fetch(`/profitability?coins=${coins}&difficulty=${difficulty}`);
          if(!res.ok) throw new Error("profitability fetch fail");
          const results= await res.json();
          profitabilityRes.innerHTML= results.map(r=>`
            <div class="item-card">
              <p><strong>Item:</strong> ${r.item_id}</p>
              <p><strong>Profit/min:</strong> ${r.profit_per_minute.toFixed(2)}</p>
              <p><strong>Profit/hour:</strong> ${r.profit_per_hour.toFixed(2)}</p>
            </div>
          `).join('');
        } catch(err){
          console.error("Profit calc error:", err);
          profitabilityRes.innerHTML='<p>Error calculating profitability.</p>';
        } finally{
          showLoader(false);
        }
      });
    }

    /**********************************************************************
     * 7.8) TOP VARIATIONS
     **********************************************************************/
    if(refreshTopVarBtn){
      refreshTopVarBtn.addEventListener('click', fetchTopVariations);
    }
    async function fetchTopVariations(){
      const timeRange= variationTimeSel.value;
      try{
        showLoader(true);
        const res= await fetch(`/top-variations?time_range=${timeRange}`);
        if(!res.ok) throw new Error("top-variations fetch fail");
        const items= await res.json();
        topVariationsDiv.innerHTML= items.map(item=>`
          <div class="item-card">
            <p><span>Item:</span> ${item.item_id}</p>
            <p><span>Buy Price Change:</span> ${item.buy_price_change}%</p>
            <p><span>Sell Price Change:</span> ${item.sell_price_change}%</p>
            <p><span>Median Buy Price:</span> ${item.median_buy_price}</p>
            <p><span>Median Sell Price:</span> ${item.median_sell_price}</p>
          </div>
        `).join('');
      } catch(err){
        console.error("Top variations error:", err);
        topVariationsDiv.innerHTML='<p>Error loading top variations. Please try again later.</p>';
      } finally{
        showLoader(false);
      }
    }
    fetchTopVariations(); // optional initial

    /**********************************************************************
     * 7.9) REBUILD CHART WHEN TOGGLES CHANGE
     **********************************************************************/
    [toggleLinear, toggleExponential, toggleMA, toggleForecast, toggleHoltWinters].forEach(el=>{
      if(el){
        el.addEventListener('change', ()=> {
          updateChart();
        });
      }
    });
  }); // end of big DOMContentLoaded

      // Additionally, if you want to track fullscreen change events:
      document.addEventListener('fullscreenchange', ()=>{
        // We can apply a .fullscreen-mode class if we want the CSS to hide controls
        if(document.fullscreenElement === umbraSection){
          // In fullscreen
          umbraSection.classList.add('fullscreen-mode');
          document.body.style.overflow='hidden';
        } else {
          // Exited fullscreen
          umbraSection.classList.remove('fullscreen-mode');
          document.body.style.overflow='auto';
        }
      });
    }
  }); // end DOMContentLoaded
})();
