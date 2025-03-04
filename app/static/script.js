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
  const NUM_STARS               = 1200; // number of base drifting stars
  const STAR_SPEED_BASE         = 0.06; // baseline star drift speed
  const STAR_SPEED_VARIATION    = 0.04; // random extra speed
  const CURSOR_REPULSION_RADIUS = 120;  // how close to the mouse we do repulsion
  const CURSOR_FORCE            = 0.08; // how strong the force is

  // Meteor & Comet config
  const METEOR_SPAWN_RATE       = 0.004; // chance per frame ( ~0.4% ) to spawn a meteor
  const METEOR_BASE_SPEED       = 1.7;   // base speed for meteors
  const COMET_SPAWN_RATE        = 0.002; // chance to spawn a comet (~0.2% / frame)
  const COMET_BASE_SPEED        = 0.4;   // slower than meteors
  const COMET_TRAIL_LENGTH      = 100;   // how many positions to store for a comet's tail

  // Star Flicker config
  const STAR_TWINKLE_CHANCE     = 0.01;  // chance star changes brightness each frame
  const STAR_MAX_BRIGHTNESS     = 1.0;   // maximum brightness factor
  const STAR_MIN_BRIGHTNESS     = 0.3;   // minimum brightness factor

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
     Small static star that drifts slowly. Also can flicker twinkle & do mouse repulsion.
  */
  class Star {
    constructor() {
      this.reset();
    }

    // random initial position & velocity
    reset() {
      this.x = rand(0, width);
      this.y = rand(0, height);
      // radius of star is typically small
      this.r = rand(1, 2);

      // velocity
      const baseSpeed = STAR_SPEED_BASE + Math.random() * STAR_SPEED_VARIATION;
      const angle = Math.random() * 2 * Math.PI;
      this.vx = Math.cos(angle) * baseSpeed;
      this.vy = Math.sin(angle) * baseSpeed;

      // brightness for star
      this.brightness = rand(STAR_MIN_BRIGHTNESS, STAR_MAX_BRIGHTNESS);
    }

    update() {
      // basic drifting
      this.x += this.vx;
      this.y += this.vy;

      // if star goes out of screen, re-randomize it
      if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
        this.reset();
        return;
      }

      // optional flicker / twinkle
      if (Math.random() < STAR_TWINKLE_CHANCE) {
        // randomly alter brightness a little
        this.brightness += rand(-0.1, 0.1);
        if (this.brightness > STAR_MAX_BRIGHTNESS) {
          this.brightness = STAR_MAX_BRIGHTNESS;
        } else if (this.brightness < STAR_MIN_BRIGHTNESS) {
          this.brightness = STAR_MIN_BRIGHTNESS;
        }
      }

      // mouse repulsion if user is moving
      if (isMouseMoving) {
        const dx = this.x - mouseX;
        const dy = this.y - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < CURSOR_REPULSION_RADIUS) {
          // scale
          const force = (CURSOR_REPULSION_RADIUS - dist) / CURSOR_REPULSION_RADIUS;
          const angle = Math.atan2(dy, dx);
          // adjust position based on force
          this.x += Math.cos(angle) * force * CURSOR_FORCE * 4;
          this.y += Math.sin(angle) * force * CURSOR_FORCE * 4;
        }
      }
    }

    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255,255,255,${this.brightness})`;
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
      // pick a random edge to spawn from: 0=left,1=right,2=top,3=bottom
      const edge = Math.floor(rand(0,4));
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

      // velocity => aim somewhat toward center or random
      const angleToCenter = Math.atan2((height/2) - this.y, (width/2) - this.x);
      const speed = METEOR_BASE_SPEED + Math.random() * 1.0;
      this.vx = Math.cos(angleToCenter)*speed;
      this.vy = Math.sin(angleToCenter)*speed;

      // length is how big the tail is
      this.length = rand(80, 180);
      // lifespan in frames
      this.life = rand(80, 200);

      // color => random bright hue
      this.color = `hsl(${rand(0,360)},100%,75%)`;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.life--;

      // if out of life or offscreen => reset
      if (this.life < 0) {
        this.reset();
      }
      if (this.x < -100 || this.x>width+100 || this.y< -100 || this.y>height+100) {
        this.reset();
      }
    }

    draw(ctx) {
      // line from current pos to the older pos
      const tx = this.x - this.vx * this.length;
      const ty = this.y - this.vy * this.length;

      ctx.strokeStyle = this.color;
      ctx.lineWidth   = 2;
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
      // also pick random edge
      const edge = Math.floor(rand(0,4));
      if (edge===0) {
        this.x= -50; this.y= rand(0,height);
      } else if (edge===1) {
        this.x= width+50; this.y= rand(0,height);
      } else if (edge===2) {
        this.x= rand(0,width); this.y= -50;
      } else {
        this.x= rand(0,width); this.y= height+50;
      }

      this.angle= rand(0, 2*Math.PI);
      const speed= COMET_BASE_SPEED + Math.random()*0.4;
      this.vx= Math.cos(this.angle)* speed;
      this.vy= Math.sin(this.angle)* speed;

      this.trail= [];
      this.trailMaxLen= COMET_TRAIL_LENGTH;

      // color => typically a bluish or aqua
      const hue= rand(180, 280);
      this.color= `hsla(${hue},100%,70%,0.8)`;
      this.r= rand(3,6);
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      // store pos in trail
      this.trail.push({ x:this.x, y:this.y });
      if(this.trail.length>this.trailMaxLen) {
        this.trail.shift(); // remove oldest
      }

      // if offscreen => reset
      if (this.x< -100 || this.x>width+100 || this.y< -100 || this.y>height+100) {
        this.reset();
      }
    }

    draw(ctx) {
      // draw the trail
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

      // nucleus
      ctx.beginPath();
      ctx.arc(this.x,this.y,this.r,0,2*Math.PI);
      ctx.fillStyle= this.color;
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
    async function fetchGraphData(itemName, timeRange = 'all') {
      try {
        const res = await fetch(`/graph-data?item=${itemName}&range=${timeRange}`);
        if (!res.ok) throw new Error("Failed to fetch data");
        graphHistoryData = await res.json();
    
        // Add this check:
        if (!graphHistoryData.length) {
          console.warn("No data for this time range");
          resultDiv.innerHTML = `<p>No data found for ${timeRange}.</p>`;
          if (chart) chart.destroy();
          return;
        }
        updateChart();
      } catch (err) {
        console.error("Error:", err);
      }
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
      const buyDataPoints = graphHistoryData.map(h => ({
        x: new Date(h.timestamp * 1000).toISOString(),  // Parse as UTC
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
              time:{ unit:'auto', tooltipFormat:'Pp' },
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

})(); // end IIFE
