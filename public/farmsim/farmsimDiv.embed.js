/// Farm simulator implementation without PIXI.js (only with div and style)
var FarmsimDiv = new (function(){
'use strict';

// Together Farm palette (tailwind.config.js)
var TF_BORDER = '#4a3737';
var TF_INK = '#5a514c';
var TF_CREAM = '#F3F5FA';
var TF_PEACH = '#CFDEF6';
var TF_MINT = '#91D9AE';
var TF_SKY = '#7EBAE8';
var TF_LAVENDER = '#D2C2F4';
var TF_YELLOW = '#F2F8D0';
var TF_PINK = '#ACA0DC';

/** Prefijo para assets cuando el sim corre en la SPA (React); vacío en embed.html. */
function tfU(rel){
	var b = typeof window.__TOGETHER_FARMSIM_BASE__ === 'string' ? window.__TOGETHER_FARMSIM_BASE__ : '';
	return b + rel;
}
function tfUrl(rel){
	return 'url("' + tfU(rel) + '")';
}

// Idioma: japonés si el navegador está en ja; en caso contrario español (app Together Farm).
var navLang = (window.navigator.language || window.navigator.userLanguage || "").substr(0, 2);
var gameLng = navLang === "ja" ? "ja" : "es";

i18n.init({lng: gameLng, fallbackLng: "en", resStore: resources, getAsync: false});

function pad2(n) {
	return (n < 10 ? "0" : "") + n;
}
function formatGameDate(date) {
	return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
}

var game;
var simRafId = null;
var container;
var table;
var tileElems;
var rainElems = [];
var scrollPos = [0, 0];
var selectedTile = null;
var selectedCoords = null;
var viewPortWidth;
var viewPortHeight;
var width;
var height;
var cursorElem;
var infoElem;
var tipElem; // Tooltip window
var pauseOverlay;
var overlayMode = null;

var toolBarElem;
var toolElems = [];
var controlBarElem;
var controlElems = [];

var gstatusTime;
var gstatusText;
var gstatusWPBar;
var gstatusCashText;
var gstatusWeatherText;

// Constants
var tilesize = 32;
var statusBarWidth = 200;


var weatherIcons = [
	{caption: i18n.t("Sunny"), texture: tfUrl("assets/sunny.png")},
	{caption: i18n.t("Partly cloudy"), texture: tfUrl("assets/partlycloudy.png")},
	{caption: i18n.t("Cloudy"), texture: tfUrl("assets/cloudy.png")},
	{caption: i18n.t("Rainy"), texture: tfUrl("assets/rainy.png")}
];
var weatherSprites = [];

var weedsTextures = [
	tfUrl("assets/weeds1.png"),
	tfUrl("assets/weeds2.png"),
	tfUrl("assets/weeds3.png"),
	tfUrl("assets/weeds4.png"),
	tfUrl("assets/weeds5.png"),
	tfUrl("assets/weeds6.png"),
	tfUrl("assets/weeds7.png"),
];

var weedsThresholds = [];
for(var i = 0; i < weedsTextures.length; i++)
	weedsThresholds.push((i + 1) / weedsTextures.length);

var toolDefs = [
	{img: tfU('assets/plow.png'), caption: i18n.t('Plow'), click: 'plow'},
	{img: tfU('assets/seed.png'), caption: i18n.t('Corn'), click: 'seed'},
	{img: tfU('assets/potatoSeed.png'), caption: i18n.t('Potato'), click: 'seedTuber'},
	{img: tfU('assets/harvest.png'), caption: i18n.t('Harvest'), click: 'harvest'},
	{img: tfU('assets/water.png'), caption: i18n.t('Water'), click: 'water'},
	{img: tfU('assets/weeding.png'), caption: i18n.t('Weed'), click: 'weeding'},
	{img: tfU('assets/mulch.png'), caption: i18n.t('Mulch'), click: 'mulching'},
	{img: tfU('assets/fertilizer.png'), caption: i18n.t('Fertilize'), click: 'fertilize'},
];

var currentTool = -1;

/** Rompe el patrón de mosaico obvio: desfase y escala ligeramente distintos por casilla del mundo. */
function setGroundTextureAppearance(elem, worldX, worldY){
	var px = ((worldX * 17 + worldY * 31) % 20);
	var py = ((worldX * 23 + worldY * 19) % 20);
	elem.style.backgroundSize = '36px 36px';
	elem.style.backgroundPosition = px + 'px ' + py + 'px';
	elem.style.backgroundRepeat = 'repeat';
	elem.style.imageRendering = 'pixelated';
}

function ensureFarmsimStyles(){
	if(document.getElementById('tf-farmsim-styles')) return;
	var st = document.createElement('style');
	st.id = 'tf-farmsim-styles';
	st.textContent =
		'@keyframes tf-cursor-glow{' +
		'0%,100%{box-shadow:0 0 0 2px rgba(126,186,232,0.35),inset 0 0 0 1px rgba(255,255,255,0.35);}' +
		'50%{box-shadow:0 0 10px 3px rgba(126,186,232,0.5),inset 0 0 0 1px rgba(255,255,255,0.45);}' +
		'}' +
		'.tf-farmsim-field{' +
		'border-radius:10px;overflow:hidden;' +
		'box-shadow:0 4px 16px rgba(74,55,55,0.16),inset 0 1px 0 rgba(255,255,255,0.22);' +
		'border:2px solid ' + TF_BORDER + ';' +
		'box-sizing:border-box;' +
		'}' +
		'.tf-farmsim-cursor{' +
		'border:2px solid ' + TF_SKY + ' !important;' +
		'border-radius:4px;' +
		'animation:tf-cursor-glow 2.2s ease-in-out infinite;' +
		'z-index:40;' +
		'box-sizing:border-box;' +
		'}';
	document.head.appendChild(st);
}

function bootTogetherFarm(saveJson){
	window.__TOGETHER_EMBED__ = true;
	window.__TOGETHER_SAVE__ = saveJson || null;
	width = 640;
	height = 480;
	viewPortWidth = 16;
	viewPortHeight = 12;
	init();
}

window.addEventListener('message', function(ev){
	if(!ev.data || ev.data.source !== 'together-farm-parent' || ev.data.type !== 'init') return;
	bootTogetherFarm(ev.data.saveJson);
});

function coordOfElem(elem){
	var idx = tileElems.indexOf(elem);
	if(0 <= idx)
		return [ idx % viewPortWidth - scrollPos[0], Math.floor(idx / viewPortWidth) - scrollPos[1]];
	else
		return null;
}

function elemAt(x, y){
	if(x instanceof Array){
		y = x[1];
		x = x[0];
	}
	if(0 <= x && x < viewPortWidth && 0 <= y && y < viewPortHeight)
		return tileElems[x + y * viewPortWidth];
	else
		return null;
}

function init(){
	if(simRafId !== null){
		cancelAnimationFrame(simRafId);
		simRafId = null;
	}
	game = new FarmGame(width / 32, height / 32);
	window.__togetherGame = game;

	game.onAutoSave = function(str){
		if(window.parent !== window){
			window.parent.postMessage({ source: 'together-farm', type: 'autosave', payload: str }, '*');
		} else {
			window.postMessage({ source: 'together-farm', type: 'autosave', payload: str }, '*');
		}
		var el = document.getElementById('autoSaveText');
		if(el) el.value = str;
	}

	generateBoard();

	var cornTextures = [
		tfUrl("assets/corn0.png"),
		tfUrl("assets/corn1.png"),
		tfUrl("assets/corn2.png"),
		tfUrl("assets/corn3.png"),
		tfUrl("assets/corn4.png"),
		tfUrl("assets/corn5.png"),
	];
	var cornThresholds = [
		0.0, 0.25, 0.50, 0.75, 1.0, 2.0
	];
	var potatoTextures = [
		tfUrl("assets/potato0.png"),
		tfUrl("assets/potato1.png"),
		tfUrl("assets/potato2.png"),
		tfUrl("assets/potato3.png"),
		tfUrl("assets/potato4.png"),
		tfUrl("assets/potato5.png"),
	];
	var potatoThresholds = [
		0.0, 0.25, 0.50, 0.75, 1.0, 2.0
	];

	game.onUpdateCell = function(cell,x,y){
		if(cell.elem === undefined){
			cell.elem = elemAt(x,y);
		}

		if(cell.elem){
			for(var weedsIndex = 0; weedsIndex < weedsTextures.length; weedsIndex++){
				if(cell.weeds < weedsThresholds[weedsIndex])
					break;
			}
			if(0 < weedsIndex){
				if(cell.weedsSprite === undefined){
					var weedsSprite = document.createElement('div');
					weedsSprite.style.position = 'absolute';
					weedsSprite.style.width = '32px';
					weedsSprite.style.height = '32px';
					weedsSprite.style.backgroundImage = weedsTextures[weedsIndex - 1];
					cell.elem.appendChild(weedsSprite);
					cell.weedsSprite = weedsSprite;
				}
				else
					cell.weedsSprite.style.backgroundImage = weedsTextures[weedsIndex - 1];
			}
			else if(cell.weedsSprite !== undefined){
				cell.elem.removeChild(cell.weedsSprite);
				cell.weedsSprite = undefined;
			}

			// Mulching sheet sprite
			if(cell.mulch){
				if(cell.mulchSprite === undefined){
					var mulchSprite = document.createElement('div');
					mulchSprite.style.position = 'absolute';
					mulchSprite.style.width = '32px';
					mulchSprite.style.height = '32px';
					mulchSprite.style.backgroundImage = tfUrl('assets/mulch.png');
					mulchSprite.style.zIndex = 1;
					cell.elem.appendChild(mulchSprite);
					cell.mulchSprite = mulchSprite;
				}
				else
					cell.mulchSprite.style.display = cell.mulch ? 'block' : 'none';
			}
			else if(cell.mulchSprite !== undefined){
				cell.elem.removeChild(cell.mulchSprite);
				cell.mulchSprite = undefined;
			}

			// Crop layer sprite
			var cornIndex = 0;
			var textures = cornTextures;
			var thresholds = cornThresholds;
			if(cell.crop){
				if(cell.crop.type === "Potato"){
					textures = potatoTextures;
					thresholds = potatoThresholds;
				}
				for(; cornIndex < textures.length; cornIndex++){
					if(cell.crop.amount < thresholds[cornIndex])
						break;
				}
			}

			if(0 < cornIndex){
				if(cell.cornSprite === undefined){
					var cornSprite = document.createElement('div');
					cornSprite.style.position = 'absolute';
					cornSprite.style.width = '32px';
					cornSprite.style.height = '32px';
					cornSprite.style.backgroundImage = textures[cornIndex - 1];

					// We do not want mulch sheet graphics drawn over crops, so we set z-index styles accordingly.
					cornSprite.style.zIndex = 2;
					cell.elem.appendChild(cornSprite);
					cell.cornSprite = cornSprite;
				}
				else
					cell.cornSprite.style.backgroundImage = textures[cornIndex - 1];
			}
			else if(cell.cornSprite !== undefined){
				cell.elem.removeChild(cell.cornSprite);
				cell.cornSprite = undefined;
			}

			// Growth bar
			const barMargin = 2;
			const barWidth = tilesize - barMargin * 2;
			const barHeight = 4;
			if(overlayMode !== null && 0 < overlayMode(cell)){
				var outerBarElem, innerBarElem;
				if(cell.outerBarElem === undefined){
					outerBarElem = document.createElement('div');
					outerBarElem.style.position = 'absolute';
					outerBarElem.style.top = (tilesize - barHeight - barMargin) + 'px';
					outerBarElem.style.left = barMargin + 'px';
					outerBarElem.style.width = barWidth + 'px';
					outerBarElem.style.height = barHeight + 'px';
					outerBarElem.style.zIndex = 10;
					innerBarElem = document.createElement('div');
					innerBarElem.style.position = 'absolute';
					innerBarElem.style.height = '100%';
					outerBarElem.appendChild(innerBarElem);
					cell.elem.appendChild(outerBarElem);
					cell.outerBarElem = outerBarElem;
					cell.innerBarElem = innerBarElem;
				}
				else{
					outerBarElem = cell.outerBarElem;
					innerBarElem = cell.innerBarElem;
				}
				var f = overlayMode(cell);
				if(f < 1.){
					outerBarElem.style.backgroundColor = '#d97777';
					innerBarElem.style.backgroundColor = TF_MINT;
				}
				else if(f < 2.){
					outerBarElem.style.backgroundColor = TF_MINT;
					innerBarElem.style.backgroundColor = '#c9b858';
				}
				else{
					outerBarElem.style.backgroundColor = '#c9b858';
					innerBarElem.style.backgroundColor = '#c9b858';
				}
				innerBarElem.style.width = barWidth * (f % 1.) + 'px';
			}
			else if(cell.outerBarElem !== undefined){
				cell.elem.removeChild(cell.outerBarElem);
				cell.outerBarElem = undefined;
				cell.innerBarElem = undefined;
			}

			cell.elem.style.backgroundImage = cell.plowed ? tfUrl('assets/ridge.png') : tfUrl('assets/dirt.png');
			setGroundTextureAppearance(cell.elem, x, y);
		}
	};

	game.init();

	// Variable to remember the last time of animation frame.
	var lastTime = null;

	function animate(timestamp) {
		// Calculate the delta-time of this frame for game update process.
		if(lastTime === null)
			lastTime = timestamp;
		var deltaTime = timestamp - lastTime;
		lastTime = timestamp;

		game.update(deltaTime);

		updateInfo();

		var days = Math.floor(game.frameCount) * game.daysPerFrame;
		var date = new Date(days * 24 * 60 * 60 * 1000); // Starts with 1970-01-01
		var rainLevel = Math.floor(game.weather * weatherIcons.length);
		gstatusTime.innerHTML = i18n.t("Date") + ": " + formatGameDate(date);
		gstatusText.innerHTML = i18n.t("Working Power") + ": " + Math.floor(game.workingPower);
		gstatusWPBar.style.width = (game.workingPower / 100) * statusBarWidth + 'px';
		gstatusCashText.innerHTML = i18n.t("Cash") + ": $" + Math.floor(game.cash);
		gstatusWeatherText.innerHTML = i18n.t("Weather") + ": " + Math.floor(game.weather * 100) + " °C<br>"
			+ weatherIcons[rainLevel].caption;
		for(var i = 0; i < weatherSprites.length; i++)
			weatherSprites[i].style.display = i / weatherSprites.length <= game.weather && game.weather < (i+1) / weatherSprites.length ? 'block' : 'none';

		for(var i = 0; i < rainElems.length; i++)
			rainElems[i].style.display = game.rainThreshold < game.weather ? 'block' : 'none';

		simRafId = requestAnimationFrame(animate);
	}

	simRafId = requestAnimationFrame(animate);
}

function generateBoard(){
	createElements();
}

function createElements(){
	ensureFarmsimStyles();
	tileElems = new Array(viewPortWidth * viewPortHeight);

	// The containers are nested so that the inner container can be easily
	// discarded to recreate the whole game.
	var outerContainer = document.getElementById("together-farm-sim-root") || document.getElementById("container");
	if(!outerContainer)
		return;
	if(container)
		outerContainer.removeChild(container);
	container = document.createElement("div");
	outerContainer.appendChild(container);
	if(cursorElem)
		cursorElem = null;
	controlElems = [];

	const colGap = 8;

	const tableWidth = (viewPortWidth * tilesize);
	/* Dos columnas de botones cuadrados + padding del panel */
	const toolbarWidth = 176;
	const totalWidth = tableWidth + colGap + toolbarWidth;

	container.style.position = 'relative';
	container.style.display = 'grid';
	container.style.gridTemplateColumns = tableWidth + 'px ' + toolbarWidth + 'px';
	container.style.gridTemplateRows = (tilesize + 8) + 'px ' + (viewPortHeight * tilesize) + 'px auto';
	container.style.columnGap = colGap + 'px';
	container.style.rowGap = '12px';
	container.style.alignItems = 'start';
	container.style.width = totalWidth + 'px';
	container.style.marginLeft = 'auto';
	container.style.marginRight = 'auto';
	container.style.boxSizing = 'border-box';

	table = document.createElement("div");
	table.className = 'tf-farmsim-field';
	table.style.position = 'relative';
	table.style.gridColumn = '1';
	table.style.gridRow = '2';
	table.style.width = tableWidth + 'px';
	table.style.height = (viewPortHeight * tilesize) + 'px';
	table.style.justifySelf = 'center';

	// Barra superior (pausa, overlays): columna del tablero, fila 1
	controlBarElem = document.createElement('div');
	controlBarElem.className = 'tf-farmsim-control-bar noselect';
	controlBarElem.style.gridColumn = '1';
	controlBarElem.style.gridRow = '1';
	controlBarElem.style.justifySelf = 'center';
	controlBarElem.style.alignSelf = 'center';
	controlBarElem.style.width = '100%';
	controlBarElem.style.maxWidth = tableWidth + 'px';
	controlBarElem.style.boxSizing = 'border-box';
	container.appendChild(controlBarElem);
	function addControlButton(img, onclick, updateState, desc){
		var button = document.createElement('button');
		button.type = 'button';
		button.className = 'tf-farmsim-control-btn noselect';
		button.style.backgroundImage = img;
		button.updateState = updateState;
		button.addEventListener('click', onclick);
		button.addEventListener('click', function(){
			for(var i = 0; i < controlElems.length; i++){
				controlElems[i].updateState();
			}
		});
		button.onmouseover = function(e){
			tipElem.innerHTML = i18n.t(desc);
			tipElem.className = 'tf-farmsim-tip tf-farmsim-tip--controls noselect';
			tipElem.style.display = 'block';
			tipElem.style.width = '';
			tipElem.style.left = '50%';
			tipElem.style.marginLeft = '0';
			tipElem.style.transform = 'translateX(-50%)';
			tipElem.style.top = (e.currentTarget.getBoundingClientRect().bottom + 4 - container.getBoundingClientRect().top) + 'px';
		};
		button.onmouseleave = function(){
			tipElem.style.display = 'none';
		};
		controlBarElem.appendChild(button);
		controlElems.push(button);
	}
	addControlButton(tfUrl('assets/pause.png'), function(){
		game.pause();
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', !!game.paused);
	}, "Pause");

	function growthCallback(cell){
		return cell.crop && cell.crop.amount;
	}
	addControlButton(tfUrl('assets/potato4.png'), function(){
		overlayMode = overlayMode !== growthCallback ? growthCallback : null;
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', overlayMode === growthCallback);
	}, "Show Crop Growth");

	function fertilityCallback(cell){
		return cell.fertility;
	}
	addControlButton(tfUrl('assets/fertilizer.png'), function(){
		overlayMode = overlayMode !== fertilityCallback ? fertilityCallback : null;
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', overlayMode === fertilityCallback);
	}, "Show Fertility");

	function weedCallback(cell){
		return cell.weeds;
	}
	addControlButton(tfUrl('assets/weedGrass.png'), function(){
		overlayMode = overlayMode !== weedCallback ? weedCallback : null;
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', overlayMode === weedCallback);
	}, "Show Weed Density");

	function waterCallback(cell){
		return cell.humidity;
	}
	addControlButton(tfUrl('assets/water.png'), function(){
		overlayMode = overlayMode !== waterCallback ? waterCallback : null;
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', overlayMode === waterCallback);
	}, "Show Humidity");

	function potatoPestCallback(cell){
		return cell.potatoPest;
	}
	addControlButton(tfUrl('assets/potatoSeed.png'), function(){
		overlayMode = overlayMode !== potatoPestCallback ? potatoPestCallback : null;
	}, function(){
		this.classList.toggle('tf-farmsim-control-btn--on', overlayMode === potatoPestCallback);
	}, "Show Potato Pest Level");

	container.appendChild(table);
	for(var iy = 0; iy < viewPortHeight; iy++){
		for(var ix = 0; ix < viewPortWidth; ix++){
			var tileElem = document.createElement("div");
			tileElems[ix + iy * viewPortWidth] = tileElem;
			tileElem.innerHTML = "";
			tileElem.style.width = '32px';
			tileElem.style.height = '32px';
			tileElem.style.position = 'absolute';
			tileElem.style.top = (tilesize * iy) + 'px';
			tileElem.style.left = (tilesize * ix) + 'px';
			tileElem.className = 'tf-farmsim-tile';
			tileElem.style.backgroundImage = tfUrl('assets/dirt.png');
			setGroundTextureAppearance(tileElem, ix + scrollPos[0], iy + scrollPos[1]);
			tileElem.onmousedown = function(e){
				var idx = tileElems.indexOf(this);
				var xy = coordOfElem(this);
				var cell = game.cells[xy[0]][xy[1]];
				if(cell && 0 <= currentTool && currentTool < toolDefs.length){
					var methodName = toolDefs[currentTool].click;
					if(methodName in game)
						game[methodName](cell);
				}
			}

			tileElem.onmousemove = function(){
				selectTile(this);
			}

			table.appendChild(tileElem);
		}
	}

	for(var i = 0; i < 2; i++){
		var rainElem = document.createElement("div");
		rainElem.setAttribute('class', 'noselect');
		rainElem.style.display = 'none';
		rainElem.style.position = 'absolute';
		rainElem.style.zIndex = 50; // Some very high value, because we don't want crops to be dawn on top of pause overlay.
		rainElem.style.pointerEvents = 'none';
		rainElem.style.left = '0px';
		rainElem.style.top = '0px';
		rainElem.style.width = table.style.width;
		rainElem.style.height = table.style.height;
		rainElem.style.backgroundImage = tfUrl('assets/rain.png');
		rainElem.style.animation = i ? 'rain2' : 'rain';
		rainElem.style.animationDuration = (0.7153 + i * 0.765) + 's';
		rainElem.style.animationIterationCount = 'infinite';
		rainElem.style.animationTimingFunction = 'linear';
		table.appendChild(rainElem);
		rainElems.push(rainElem);
	}

	pauseOverlay = document.createElement("div");
	pauseOverlay.setAttribute('name', 'pauseOverlay');
	pauseOverlay.setAttribute('class', 'noselect');
	pauseOverlay.style.display = 'none';
	pauseOverlay.style.position = 'absolute';
	pauseOverlay.style.zIndex = 100; // Some very high value, because we don't want crops to be dawn on top of pause overlay.
	pauseOverlay.style.pointerEvents = 'none';
	pauseOverlay.style.left = '0px';
	pauseOverlay.style.top = '0px';
	pauseOverlay.style.width = table.style.width;
	pauseOverlay.style.height = table.style.height;
	pauseOverlay.style.backgroundColor = 'rgba(74,55,55,0.28)';
	for(var i = 0; i < 2; i++){
		pauseOverlay.appendChild((function (left){
			var elem = document.createElement("div");
			elem.style.position = 'absolute';
			elem.style.left = (viewPortWidth * tilesize) * (left / 16) + 'px';
			elem.style.top = (viewPortHeight * tilesize) * (1 / 4) + 'px';
			elem.style.width = (viewPortWidth * tilesize) * (1 / 8) + 'px';
			elem.style.height = (viewPortHeight * tilesize) * (1 / 2) + 'px';
			elem.style.backgroundColor = 'rgba(74,55,55,0.42)';
			return elem;
		})([5,9][i]));
	}
	table.appendChild(pauseOverlay);
	game.onPausedChange = (function(paused){pauseOverlay.style.display = paused ? 'block' : 'none'});

	function selectTool(idx){
		// Selecting the same tool twice means deselecting
		if(currentTool === idx)
			idx = -1;
		for(var i = 0; i < toolElems.length; i++){
			toolElems[i].classList.remove('tf-farmsim-tool--active');
		}
		if(0 <= idx && idx < toolElems.length){
			toolElems[idx].classList.add('tf-farmsim-tool--active');
		}
		currentTool = idx;
	}

	// Reset the state before initializing toolbar elements
	toolElems = [];
	currentTool = -1;
//	currentRotation = 0;

	// Barra de herramientas (columna derecha, filas 1–2)
	toolBarElem = document.createElement('div');
	toolBarElem.className = 'tf-farmsim-toolbar noselect';
	toolBarElem.style.gridColumn = '2';
	toolBarElem.style.gridRow = '1 / 3';
	toolBarElem.style.alignSelf = 'stretch';
	toolBarElem.style.boxSizing = 'border-box';
	toolBarElem.style.width = '100%';
	toolBarElem.style.minWidth = '0';
	container.appendChild(toolBarElem);
	for(var i = 0; i < toolDefs.length; i++){
		var toolElem = document.createElement('button');
		toolElem.type = 'button';
		toolElem.className = 'tf-farmsim-tool noselect';

		var toolIcon = document.createElement('img');
		toolIcon.className = 'tf-farmsim-tool-icon';
		toolIcon.alt = '';
		toolIcon.src = toolDefs[i].img;
		toolElem.appendChild(toolIcon);
		var toolCaption = document.createElement('span');
		toolCaption.className = 'tf-farmsim-tool-label noselect';
		toolCaption.textContent = toolDefs[i].caption;
		toolElem.appendChild(toolCaption);

		toolElem.addEventListener('click', function(){
			selectTool(toolElems.indexOf(this));
		});

		toolElem.addEventListener('mouseover', function(e){
			var el = e.currentTarget;
			var ti = toolElems.indexOf(el);
			if(0 <= ti && ti < toolDefs.length){
				var methodName = toolDefs[ti].click;
				if(methodName in game){
					tipElem.innerHTML = game[methodName].description();
					tipElem.className = 'tf-farmsim-tip tf-farmsim-tip--tools noselect';
					tipElem.style.display = 'block';
					tipElem.style.width = '';
					tipElem.style.transform = 'none';
					tipElem.style.left = '8px';
					tipElem.style.marginLeft = '0';
					var rect = el.getBoundingClientRect();
					var crect = container.getBoundingClientRect();
					tipElem.style.top = (rect.top - crect.top) + 'px';
					return;
				}
			}
			tipElem.style.display = 'none';
		});

		toolElem.addEventListener('mouseleave', function(){
			tipElem.style.display = 'none';
		});

		toolBarElem.appendChild(toolElem);
		toolElems.push(toolElem);
	}

	var bottomPanel = document.createElement('div');
	bottomPanel.className = 'tf-farmsim-bottom noselect';
	bottomPanel.style.gridColumn = '1 / 3';
	bottomPanel.style.gridRow = '3';
	bottomPanel.style.width = '100%';
	container.appendChild(bottomPanel);

	var slotBox = document.createElement('div');
	slotBox.className = 'tf-farmsim-info-box noselect';
	var slotTitle = document.createElement('div');
	slotTitle.className = 'tf-farmsim-panel-title noselect';
	slotTitle.textContent = i18n.t('Slot info');
	slotBox.appendChild(slotTitle);
	infoElem = document.createElement('div');
	infoElem.className = 'tf-farmsim-panel-body noselect';
	infoElem.style.lineHeight = '1.4';
	slotBox.appendChild(infoElem);
	bottomPanel.appendChild(slotBox);

	var dayBox = document.createElement('div');
	dayBox.className = 'tf-farmsim-info-box tf-farmsim-info-box--day noselect';
	var dayTitle = document.createElement('div');
	dayTitle.className = 'tf-farmsim-panel-title noselect';
	dayTitle.textContent = i18n.t('Day info');
	dayBox.appendChild(dayTitle);
	var dayBody = document.createElement('div');
	dayBody.className = 'tf-farmsim-panel-body noselect';
	dayBody.style.position = 'relative';
	dayBody.style.lineHeight = '1.4';
	gstatusTime = document.createElement('div');
	gstatusTime.style.fontFamily = 'Sans-serif';
	gstatusTime.style.left = '5px';
	gstatusTime.style.top = '5px';
	dayBody.appendChild(gstatusTime);
	gstatusText = document.createElement('div');
	gstatusText.style.fontFamily = 'Sans-serif';
	gstatusText.style.left = '5px';
	gstatusText.style.top = '5px';
	dayBody.appendChild(gstatusText);
	var gstatusWPBarContainer = document.createElement('div');
	dayBody.appendChild(gstatusWPBarContainer);
	gstatusWPBarContainer.style.backgroundColor = '#e2e6ef';
	gstatusWPBarContainer.style.border = '2px solid ' + TF_BORDER;
	gstatusWPBarContainer.style.width = statusBarWidth + 'px';
	gstatusWPBarContainer.style.height = '8px';
	gstatusWPBar = document.createElement('div');
	gstatusWPBarContainer.appendChild(gstatusWPBar);
	gstatusWPBar.style.backgroundColor = TF_LAVENDER;
	gstatusWPBar.style.width = statusBarWidth + 'px';
	gstatusWPBar.style.height = '8px';
	gstatusCashText = document.createElement('div');
	gstatusCashText.style.fontFamily = 'Sans-serif';
	gstatusCashText.style.left = '5px';
	gstatusCashText.style.top = '30px';
	dayBody.appendChild(gstatusCashText);
	var weatherRow = document.createElement('div');
	weatherRow.style.display = 'flex';
	weatherRow.style.alignItems = 'flex-start';
	weatherRow.style.gap = '10px';
	weatherRow.style.marginTop = '4px';
	gstatusWeatherText = document.createElement('div');
	gstatusWeatherText.style.fontFamily = 'Sans-serif';
	gstatusWeatherText.style.flex = '1';
	gstatusWeatherText.style.minWidth = '0';
	weatherRow.appendChild(gstatusWeatherText);
	var weatherIconHost = document.createElement('div');
	weatherIconHost.style.position = 'relative';
	weatherIconHost.style.width = '32px';
	weatherIconHost.style.height = '32px';
	weatherIconHost.style.flexShrink = '0';
	for(var i = 0; i < weatherIcons.length; i++){
		var sprite = document.createElement('div');
		sprite.style.position = 'absolute';
		sprite.style.left = '0';
		sprite.style.top = '0';
		sprite.style.backgroundImage = weatherIcons[i].texture;
		sprite.style.width = '32px';
		sprite.style.height = '32px';
		weatherSprites.push(sprite);
		weatherIconHost.appendChild(sprite);
	}
	weatherRow.appendChild(weatherIconHost);
	dayBody.appendChild(weatherRow);
	dayBox.appendChild(dayBody);
	bottomPanel.appendChild(dayBox);

	tipElem = document.createElement('div');
	tipElem.className = 'tf-farmsim-tip noselect';
	tipElem.style.display = 'none';
	tipElem.style.position = 'absolute';
	tipElem.style.pointerEvents = 'none';
	tipElem.style.whiteSpace = 'pre-wrap';
	tipElem.style.zIndex = '200';
	container.appendChild(tipElem);
}

function selectTile(sel){
	selectedTile = sel;
	var idx = tileElems.indexOf(sel);
	var vx = idx % viewPortWidth;
	var vy = Math.floor(idx / viewPortWidth);
	var ix = vx + scrollPos[0];
	var iy = vy + scrollPos[1];
	selectedCoords = [ix, iy];
	if(ix < width && iy < height){
		if(!cursorElem){
			cursorElem = document.createElement('div');
			cursorElem.className = 'tf-farmsim-cursor noselect';
			cursorElem.style.pointerEvents = 'none';
			table.appendChild(cursorElem);
		}
		cursorElem.style.position = 'absolute';
		cursorElem.style.top = (tilesize * vy) + 'px';
		cursorElem.style.left = (tilesize * vx) + 'px';
		cursorElem.style.width = tilesize + 'px';
		cursorElem.style.height = tilesize + 'px';
		updateInfo();
//		updateInventory();
	}

}

function updateInfo(){
	if(!selectedCoords){
		infoElem.innerHTML = 'Empty tile';
		return;
	}
	if(viewPortWidth <= selectedCoords[0] && viewPortHeight <= selectedCoords[1])
		return;
	var cell = game.cells[selectedCoords[0]][selectedCoords[1]];
	if(!cell){
		infoElem.innerHTML = 'Empty cell<br>';
		return;
	}

	var crop = '';
	if(cell.crop){
		crop =
			i18n.t(cell.crop.type) + " " + i18n.t("age") + ": " + Math.floor((game.frameCount - cell.crop.plantDate) * game.daysPerFrame) + " " + i18n.t("days") + "<br>" +
			i18n.t(cell.crop.type) + " " + i18n.t("growth") + ": " + Math.floor(cell.crop.amount * 100) + " % <br>" +
			i18n.t(cell.crop.type) + " " + i18n.t("quality") + ": " + Math.floor(cell.crop.getQuality() * 100) + " % <br>" +
			i18n.t(cell.crop.type) + " " + i18n.t("value") + ": $" + Math.floor(cell.crop.eval());
	}

	infoElem.innerHTML = i18n.t("Pos") + ": " + selectedCoords[0] + ", " + selectedCoords[1] + "<br>" +
		i18n.t("Weeds") + ": " + Math.floor(100 * cell.weeds) + " (" + Math.floor(100 * cell.weedRoots) + ")<br>" +
		i18n.t("Plowed") + ": " + (cell.plowed ? i18n.t("Yes") : i18n.t("No")) + "<br>" +
		i18n.t("Humidity") + ": " + Math.floor(cell.humidity * 100) + "<br>" +
		i18n.t("Mulch") + ": " + (cell.mulch ? i18n.t("Yes") : i18n.t("No")) + "<br>" +
		i18n.t("Fertility") + ": " + Math.floor(cell.fertility * 100) + "<br>" +
		i18n.t("Potato Pest") + ": " + Math.floor(100 * cell.potatoPest) + "<br>" +
		crop;
}

window.__togetherFarmTeardown = function(){
	if(simRafId !== null){
		cancelAnimationFrame(simRafId);
		simRafId = null;
	}
	try{
		if(game && game.onPausedChange)
			game.onPausedChange = null;
	}catch(e){}
	game = null;
	var root = document.getElementById("together-farm-sim-root") || document.getElementById("container");
	if(root)
		root.innerHTML = '';
	container = null;
	try{ delete window.__togetherGame; }catch(e1){ window.__togetherGame = undefined; }
};


})();
