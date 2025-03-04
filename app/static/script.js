/****************************************************************************
 *                     DESTINY-STYLE BZTRACKER — ULTRA EXPANDED JS
 *  No mock data, advanced starfield, planet-based nav, chart toggles, etc.
 *  
 *  Overview of This Massive File:
 *   1) Global Vars & Config
 *   2) Starfield Classes & Setup (Stars, Meteors, Comets)
 *   3) Planet Navigation / Hidden Features
 *   4) Sound Toggle
 *   5) Theme Toggle
 *   6) BZTracker: Search, Graph, Top Margins, Profitability, Variations
 *      - Real Endpoints ("/search", "/graph-data", "/top-margins", etc.)
 *      - No mock data: All fetch calls must match your backend routes
 *   7) Chart.js Logic (Trendlines, Forecast, Holt-Winters, etc.)
 *   8) Extra Helper Functions & Possibly Repeated Commentary
 *
 *  The script is wrapped in an IIFE to avoid global scope pollution.
 ****************************************************************************/
(function() {
  "use strict";

  /**************************************************************************
   * 1) GLOBAL VARS & CONFIG
   **************************************************************************/

  /* These global references and constants define the starfield:
     - canvas element
     - star arrays
     - spawn rates, speeds
     - user input tracking (mouse)
  */
  let cosmicCanvas, ctx;
  let width = 0, height = 0;        // canvas dimensions
  const cosmicEntities = [];        // holds all Star, Meteor, Comet objects
  let mouseX = 0, mouseY = 0;       // track mouse position
  let isMouseMoving = false;        // we only do advanced repulsion if user is active
  let mouseMoveTimeout = null;      // used to set isMouseMoving=false after inactivity

  // Star system config
  const NUM_STARS               = 10000; // number of base drifting stars
  const STAR_SPEED_BASE         = 0.02; // baseline star drift speed
  const STAR_SPEED_VARIATION    = 0.01; // random extra speed
  const CURSOR_REPULSION_RADIUS = 120;  // how close to the mouse we do repulsion
  const CURSOR_FORCE            = 0.02; // how strong the force is

  // Meteor & Comet config
  const METEOR_SPAWN_RATE       = 0.00004; // chance per frame ( ~0.4% ) to spawn a meteor
  const METEOR_BASE_SPEED       = 0.1;   // base speed for meteors
  const COMET_SPAWN_RATE        = 0.0001; // chance to spawn a comet (~0.2% / frame)
  const COMET_BASE_SPEED        = 0.4;   // slower than meteors
  const COMET_TRAIL_LENGTH      = 100;   // how many positions to store for a comet's tail

  // Star Flicker config
  const STAR_TWINKLE_CHANCE     = 0.051;  // chance star changes brightness each frame
  const STAR_MAX_BRIGHTNESS     = 3;   // maximum brightness factor
  const STAR_MIN_BRIGHTNESS     = 0.01;   // minimum brightness factor

  // BZTracker references
  let currentItem       = '';       // which item is selected for the graph, etc.
  let graphHistoryData  = [];       // data from /graph-data
  let chart             = null;     // Chart.js instance if we have a graph

  /**************************************************************************
   * 2) STARFIELD CLASSES: STAR, METEOR, COMET
   **************************************************************************/
  /*
    We define three classes for cosmic entities. Each has:
    - constructor
    - reset() method to randomize or place them at screen edges
    - update() method called each frame
    - draw() method to render on the canvas
  */
// Utility for random numbers
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/* CLASS: Star
   Small static star that drifts slowly. Also can flicker (twinkle) & do mouse repulsion.
*/
class Star {
  constructor() {
    // Store a base brightness, biased toward dimmer stars.
    this.baseBrightness = STAR_MIN_BRIGHTNESS + (STAR_MAX_BRIGHTNESS - STAR_MIN_BRIGHTNESS) * Math.pow(Math.random(), 16);
    this.reset();
  }

  // Random initial position & velocity
  reset() {
    this.x = rand(0, width);
    this.y = rand(0, height);
    // Radius of star is typically small.
    this.r = rand(1, 2);

    // Velocity
    const baseSpeed = STAR_SPEED_BASE + Math.random() * STAR_SPEED_VARIATION;
    const angle = Math.random() * 2 * Math.PI;
    this.vx = Math.cos(angle) * baseSpeed;
    this.vy = Math.sin(angle) * baseSpeed;
  }

  update() {
    // Basic drifting.
    this.x += this.vx;
    this.y += this.vy;

    // Instead of resetting when offscreen, pull the star back toward the center.
    if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = centerX - this.x;
      const dy = centerY - this.y;
      // Apply a small attraction force (adjust 0.005 as needed)
      this.x += dx * 0.005;
      this.y += dy * 0.005;
    }

    // Mouse repulsion
    if (isMouseMoving) {
      const dx = this.x - mouseX;
      const dy = this.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CURSOR_REPULSION_RADIUS) {
        const force = (CURSOR_REPULSION_RADIUS - dist) / CURSOR_REPULSION_RADIUS;
        const angle = Math.atan2(dy, dx);
        this.x += Math.cos(angle) * force * CURSOR_FORCE * 4;
        this.y += Math.sin(angle) * force * CURSOR_FORCE * 4;
      }
    }
  }

  draw(ctx) {
    // Start with the base brightness.
    let currentBrightness = this.baseBrightness;
    // With a chance, apply a temporary twinkle effect (increase or decrease brightness).
    if (Math.random() < STAR_TWINKLE_CHANCE) {
      currentBrightness += rand(-0.1, 0.1);
      currentBrightness = Math.max(STAR_MIN_BRIGHTNESS, Math.min(currentBrightness, STAR_MAX_BRIGHTNESS));
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${currentBrightness})`;
    ctx.fill();
  }
}

/* CLASS: Meteor
   A shooting star that spawns at screen edges and moves quickly across, 
   leaving a line from current position to its previous position minus some length factor.
*/
class Meteor {
  constructor() {
    this.reset();
  }

  reset() {
    // Pick a random edge to spawn from: 0=left,1=right,2=top,3=bottom
    const edge = Math.floor(rand(0, 4));
    if (edge === 0) { 
      // left
      this.x = -50;
      this.y = rand(0, height);
    } else if (edge === 1) { 
      // right
      this.x = width + 50;
      this.y = rand(0, height);
    } else if (edge === 2) {
      // top
      this.x = rand(0, width);
      this.y = -50;
    } else {
      // bottom
      this.x = rand(0, width);
      this.y = height + 50;
    }

    // Velocity => aim somewhat toward center or random
    const angleToCenter = Math.atan2((height / 2) - this.y, (width / 2) - this.x);
    const speed = METEOR_BASE_SPEED + Math.random() * 1.0;
    this.vx = Math.cos(angleToCenter) * speed;
    this.vy = Math.sin(angleToCenter) * speed;

    // Length is how big the tail is.
    this.length = rand(80, 180);
    // Lifespan in frames.
    this.life = rand(80, 200);

    // Color => random bright hue.
    this.color = `hsl(${rand(0, 360)},100%,75%)`;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;

    // If out of life or offscreen => reset.
    if (this.life < 0) {
      this.reset();
    }
    if (this.x < -100 || this.x > width + 100 || this.y < -100 || this.y > height + 100) {
      this.reset();
    }
  }

  draw(ctx) {
    // Line from current position to an older position.
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

/* CLASS: Comet
   Slower moving than a meteor, but it has a bright nucleus and a trailing set of 
   points in "this.trail" that we connect for a tail effect.
*/
class Comet {
  constructor() {
    this.reset();
  }

  reset() {
    // Also pick random edge.
    const edge = Math.floor(rand(0, 4));
    if (edge === 0) {
      this.x = -50; this.y = rand(0, height);
    } else if (edge === 1) {
      this.x = width + 50; this.y = rand(0, height);
    } else if (edge === 2) {
      this.x = rand(0, width); this.y = -50;
    } else {
      this.x = rand(0, width); this.y = height + 50;
    }

    this.angle = rand(0, 2 * Math.PI);
    const speed = COMET_BASE_SPEED + Math.random() * 0.4;
    this.vx = Math.cos(this.angle) * speed;
    this.vy = Math.sin(this.angle) * speed;

    this.trail = [];
    this.trailMaxLen = COMET_TRAIL_LENGTH;

    // Color => typically a bluish or aqua.
    const hue = rand(180, 280);
    this.color = `hsla(${hue},100%,70%,0.8)`;
    this.r = rand(3, 6);
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;

    // Store position in trail.
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMaxLen) {
      this.trail.shift(); // remove oldest
    }

    // If offscreen => reset.
    if (this.x < -100 || this.x > width + 100 || this.y < -100 || this.y > height + 100) {
      this.reset();
    }
  }

  draw(ctx) {
    // Draw the trail.
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw the comet nucleus.
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}


  /**************************************************************************
   * 3) STARFIELD SETUP
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    cosmicCanvas = document.getElementById('cosmicCanvas');
    if(!cosmicCanvas) {
      console.warn("No #cosmicCanvas found => starfield won't run!");
      return;
    }
    ctx = cosmicCanvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // spawn stars
    for (let i=0; i<NUM_STARS; i++){
      cosmicEntities.push(new Star());
    }

    // start animation
    requestAnimationFrame(animateStarfield);

    // mouse events
    window.addEventListener('mousemove', e=>{
      mouseX = e.clientX; mouseY = e.clientY;
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
    // clear
    ctx.clearRect(0,0,width,height);

    // random chance to spawn meteor
    if(Math.random()<METEOR_SPAWN_RATE){
      cosmicEntities.push(new Meteor());
    }
    // random chance to spawn comet
    if(Math.random()<COMET_SPAWN_RATE){
      cosmicEntities.push(new Comet());
    }

    // update & draw
    for(let i=0; i<cosmicEntities.length; i++){
      cosmicEntities[i].update();
      cosmicEntities[i].draw(ctx);
    }

    requestAnimationFrame(animateStarfield);
  }

  /**************************************************************************
   * 4) PLANET NAVIGATION: Hiding the star map / showing features
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    const planetSelectEl= document.getElementById('planetSelect');
    if(!planetSelectEl){
      console.warn("No #planetSelect => planet nav won't work.");
      return;
    }
    const planets= document.querySelectorAll('.planet');
    const featureSections= document.querySelectorAll('.feature-section');
    const backButtons= document.querySelectorAll('.back-button');

    // on planet click => hide planetSelect, show the relevant feature
    planets.forEach( planet => {
      planet.addEventListener('click', () => {
        const targetId= planet.getAttribute('data-target');
        if(!targetId) return;
        const targetSec= document.getElementById(targetId);
        if(!targetSec) return;

        planetSelectEl.style.display='none';
        targetSec.removeAttribute('hidden');
        targetSec.style.display='block';

        // allow scroll for content
        document.body.style.overflow='auto';
      });
    });

    // on back button => hide that feature, re-show planet selection
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
   * 5) SOUND TOGGLE
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', () => {
    const bgMusic= document.getElementById('bgMusic');
    const soundToggle= document.getElementById('soundToggle');
    if(!bgMusic||!soundToggle) return;

    // we can reveal the button if we want it hidden initially
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
   * 6) THEME TOGGLE (DARK vs. LIGHT)
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', ()=>{
    const themeSelect= document.getElementById('theme-select');
    if(!themeSelect)return;
    // default to dark
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
   * 7) BZTRACKER: SEARCH, GRAPH, MARGINS, PROFIT, VARIATIONS
   **************************************************************************/
  document.addEventListener('DOMContentLoaded', ()=>{
    /* 
      We'll gather references to the form fields, toggles, etc. 
      Then define fetch calls to /search, /graph-data, /top-margins, etc. 
      Also define chart update logic with advanced toggles & forecast.
    */

    // references
    const searchInput     = document.getElementById('item-search');
    const suggestionsDiv  = document.getElementById('suggestions');
    const resultDiv       = document.getElementById('result');
    const priceGraphCtx   = document.getElementById('priceGraph')?.getContext('2d');

    const topMarginsDiv   = document.getElementById('top-margins');
    const profitabilityRes= document.getElementById('profitability-result');
    const topVariationsDiv= document.getElementById('top-variations');

    // toggle references
    const toggleLinear       = document.getElementById('toggle-linear');
    const toggleExponential  = document.getElementById('toggle-exponential');
    const toggleMA           = document.getElementById('toggle-moving-average');
    const toggleForecast     = document.getElementById('toggle-forecast');
    const toggleHoltWinters  = document.getElementById('toggle-holt-winters');

    // time range & download
    const timeRangeBtns= document.querySelectorAll('.time-range-btn');
    const downloadBtn  = document.getElementById('downloadGraph');

    // chart info
    const forecastAccuracyDiv= document.getElementById('forecast-accuracy');
    const recommendedDiv     = document.getElementById('recommended-prices');
    const targetSellInput    = document.getElementById('target-sell-price');

    // top margins
    const refreshTopMargins = document.getElementById('refresh-top-margins');

    // profitability
    const coinsInput       = document.getElementById('coins');
    const difficultyInput  = document.getElementById('difficulty');
    const calcProfitButton = document.getElementById('calculate-profit');

    // variations
    const refreshTopVarBtn = document.getElementById('refresh-top-variations');
    const variationTimeSel = document.getElementById('variation-time-range');

    /* Helper function: show/hide loader */
    function showLoader(show) {
      const loader= document.getElementById('loader');
      if(loader) loader.style.display= show?'block':'none';
    }

    /**********************************************************************
     * 7.1) AUTOCOMPLETE
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
      try{
        const res= await fetch(`/autocomplete?query=${encodeURIComponent(query)}`);
        if(!res.ok) throw new Error("autocomplete fetch fail");
        const items= await res.json();
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
      } catch(err){
        console.error("Autocomplete error:",err);
      }
    }

    /**********************************************************************
     * 7.2) SEARCH => fetch item details + graph
     **********************************************************************/
    const searchForm= document.getElementById('search-form');
    if(searchForm){
      searchForm.addEventListener('submit', async(e)=>{
        e.preventDefault();
        const itemName= searchInput.value.trim();
        if(!itemName)return;
        currentItem= itemName;
        try{
          showLoader(true);
          const res= await fetch(`/search?item=${encodeURIComponent(itemName)}`);
          if(!res.ok)throw new Error("search fetch fail");
          const data= await res.json();
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
        } catch(err){
          console.error("Item details error:",err);
          resultDiv.innerHTML='<p>Error loading item details.</p>';
        } finally{
          showLoader(false);
        }
      });
    }

    /**********************************************************************
     * 7.3) GRAPH DATA
     **********************************************************************/
    async function fetchGraphData(itemName, timeRange='all') {
      try{
        showLoader(true);
        const url= `/graph-data?item=${encodeURIComponent(itemName)}&range=${encodeURIComponent(timeRange)}`;
        const res= await fetch(url);
        if(!res.ok)throw new Error("graph-data fetch fail");
        graphHistoryData= await res.json();
        updateChart();
      } catch(err){
        console.error("Graph data error:",err);
        resultDiv.innerHTML='<p>Error loading graph data. Please try again later.</p>';
      } finally{
        showLoader(false);
      }
    }

    /**********************************************************************
     * 7.4) CHART LOGIC (Basic line chart)
     **********************************************************************/
    function updateChart() {
      if(!graphHistoryData.length||!priceGraphCtx) {
        console.warn("No graph history or canvas!");
        return;
      }

      // transform raw data => x: Date, y: numeric
      const buyDataPoints = graphHistoryData.map(h => ({
        x: new Date(h.timestamp * 1000),  // Timestamps are in seconds
        y: h.buy_price
      }));

      const sellDataPoints = graphHistoryData.map(h => ({
        x: new Date(h.timestamp * 1000),  // Timestamps are in seconds
        y: h.sell_price
      }));

      const minTime = new Date(Math.min(...buyDataPoints.map(pt => pt.x.getTime())));
      const maxTime = new Date(Math.max(...buyDataPoints.map(pt => pt.x.getTime())));

      const datasets = [
        {
          label: 'Buy Price',
          data: buyDataPoints,
          borderColor: '#00ccff',
          fill: false,
          tension: 0.3,
          spanGaps: true
        },
        {
          label: 'Sell Price',
          data: sellDataPoints,
          borderColor: '#ff5733',
          fill: false,
          tension: 0.3,
          spanGaps: true
        }
      ];

      if (!buyDataPoints.length && !sellDataPoints.length) {
        console.warn("No data points for chart!");
        return;
      }

      const recommendedBuy= Math.min(...buyDataPoints.map(pt=> pt.y));
      const recommendedSell= Math.max(...sellDataPoints.map(pt=> pt.y));
      recommendedDiv.textContent= `Recommended Buy: ${recommendedBuy.toFixed(2)} | Recommended Sell: ${recommendedSell.toFixed(2)}`;
      // create or destroy old chart
      if(chart) chart.destroy();
      chart = new Chart(priceGraphCtx, {
        type: 'line',
        data: { datasets },
        options: {
          animation: { duration:600, easing:'easeInOutQuad' },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'minute', tooltipFormat: 'Pp' },
              min: minTime,
              max: maxTime,
              ticks: { color: document.body.classList.contains('light-theme') ? '#000' : '#fff' },
              grid: { color: document.body.classList.contains('light-theme') ? '#ccc' : '#444' }
            },
            y: {
              ticks: { color: document.body.classList.contains('light-theme') ? '#000' : '#fff' },
              grid: { color: document.body.classList.contains('light-theme') ? '#ccc' : '#444' }
            }
          },
          plugins: {
            zoom: {
              pan: { enabled: true, mode: 'x' },
              zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: 'x' }
            },
            tooltip: {
              callbacks: {
                label: ctx=> `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}`
              }
            },
            legend: {
              labels: { color: document.body.classList.contains('light-theme') ? '#000' : '#fff' }
            }
          }
        }
      });
    }

    /**********************************************************************
     * 7.5) TIME RANGE BUTTONS
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
     * 7.7) REBUILD CHART WHEN TOGGLES CHANGE
     **********************************************************************/
    []/*The other extra options were removed to make the code as simple as possible*/.forEach(el=>{
      if(el){
        el.addEventListener('change', ()=> {
          updateChart();
        });
      }
    });
  }); // end of big DOMContentLoaded

})(); // end IIFE
