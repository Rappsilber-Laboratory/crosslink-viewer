//		xiNET
//
//		Colin Combe, Martin Graham, Rappsilber Laboratory, 2015
//
//		CrosslinkViewerBB.js


//~ this.marquee = document.createElementNS(xiNET.svgNS, 'rect');
	//~ this.marquee.setAttribute('class', 'marquee');
	//~ this.marquee.setAttribute('fill', 'red');


(function(win) {
	"use strict";

	win.CLMS = win.CLMS || {};
	win.CLMS.xiNET = {}; //crosslinkviewer's javascript namespace

	win.CLMS.xiNET.CrosslinkViewer = Backbone.View.extend({
		tagName: "div",
		//className: "dynDiv",
		events: {
			// following line commented out, mouseup sometimes not called on element if pointer drifts outside element
			// and dragend not supported by zepto, fallback to d3 instead (see later)
			// "mouseup .dynDiv_resizeDiv_tl, .dynDiv_resizeDiv_tr, .dynDiv_resizeDiv_bl, .dynDiv_resizeDiv_br": "relayout",    // do resize without dyn_div alter function
			"click .downloadButton": "downloadSVG"
		},

		initialize: function (viewOptions) {
			//~ console.log("arg options", viewOptions);



			var defaultOptions = {
				//~ xlabel: "Distance",
				//~ ylabel: "Count",
				//~ seriesName: "Cross Links",
				//~ chartTitle: "Distogram",
				//~ maxX: 80
			};
			this.options = _.extend(defaultOptions, viewOptions.myOptions);

			this.displayEventName = viewOptions.displayEventName;

			var self = this;

			// this.el is the dom element this should be getting added to, replaces targetDiv
			var mainDivSel = d3.select(this.el);

			mainDivSel.selectAll("*").remove();//avoids prob with 'save - web page complete'

			//this is neded to allow the SVG export
			var containingDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
			containingDiv.setAttribute("style", "width:100%;height:100%;display:block;");
			mainDivSel.node().appendChild(containingDiv);

			//create SVG elemnent
			this.svgElement = document.createElementNS(CLMS.xiNET.svgns, "svg");
			this.svgElement.setAttribute('id', 'networkSVG');
			this.svgElement.setAttribute("width", "100%");
			this.svgElement.setAttribute("height", "100%");
			//~ this.svgElement.setAttribute("preserveAspectRatio", "xMinYMin meet");
			//~ this.svgElement.setAttribute("viewBox", "0 0 " + targetDiv.clientWidth + " " + targetDiv.clientHeight);
			//~ this.svgElement.setAttribute("style", "display:block;");
			// disable right click context menu (we wish to put right click to our own purposes)
			this.svgElement.oncontextmenu = function() {
				return false;
			};

			//add listeners
			var self = this;
			this.svgElement.onmousedown = function(evt) { self.mouseDown(evt); };
			this.svgElement.onmousemove = function(evt) { self.mouseMove(evt); };
			this.svgElement.onmouseup = function(evt) { self.mouseUp(evt); };
			this.svgElement.onmouseout = function(evt) { self.hideTooltip(evt); };
			var mousewheelevt= (/Firefox/i.test(navigator.userAgent))? "DOMMouseScroll" : "mousewheel" //FF doesn't recognize mousewheel as of FF3.x
			if (document.attachEvent){ //if IE (and Opera depending on user setting)
				this.svgElement.attachEvent("on"+mousewheelevt, function(evt) {self.mouseWheel(evt);});
			}
			else if (document.addEventListener) { //WC3 browsers
				this.svgElement.addEventListener(mousewheelevt, function(evt) {self.mouseWheel(evt);}, false);
			}
			this.lastMouseUp = new Date().getTime();
			this.svgElement.ontouchstart = function(evt) { self.touchStart(evt); };
			this.svgElement.ontouchmove = function(evt) { self.touchMove(evt); };
			this.svgElement.ontouchend = function(evt) { self.touchEnd(evt); };
			//selection and highlight callbacks
			this.linkSelectionCallbacks = [];
			this.linkHighlightsCallbacks = [];
			//legend changed callbacks
			this.legendCallbacks = new Array();

			containingDiv.appendChild(this.svgElement);

			//these attributes are used by checkboxes to hide self links or ambiguous links
			this.selfLinksShown = true;
			this.ambigShown = true;

			// filled background needed, else cannot click/drag background
			// size is that of large monitor, potentially needs to be bigger coz browser can be zoomed
			// TODO: dynamically resize background to match screen bounding box
			var background = document.createElementNS(CLMS.xiNET.svgns, "rect");
			background.setAttribute("id", "background_fill");
			background.setAttribute("x", 0);
			background.setAttribute("y", 0);
			background.setAttribute("width", 2560 * 2);
			background.setAttribute("height", 2048 * 2);
			background.setAttribute("fill-opacity", "1");
			background.setAttribute("fill", "#FFFFFF");
			this.svgElement.appendChild(background);
			// various groups needed
			this.container = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.container.setAttribute("id", "container");

			this.p_pLinksWide = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.p_pLinksWide.setAttribute("id", "p_pLinksWide");
			this.container.appendChild(this.p_pLinksWide);

			this.proteinLower = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.proteinLower.setAttribute("id", "proteinLower");
			this.container.appendChild(this.proteinLower);

			this.highlights = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.highlights.setAttribute("class", "highlights");//proteins also contain highlight groups
			this.container.appendChild(this.highlights);

			this.res_resLinks = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.res_resLinks.setAttribute("id", "res_resLinks");
			this.container.appendChild(this.res_resLinks);

			this.p_pLinks = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.p_pLinks.setAttribute("id", "p_pLinks");
			this.container.appendChild(this.p_pLinks);

			this.proteinUpper = document.createElementNS(CLMS.xiNET.svgns, "g");
			this.proteinUpper.setAttribute("id", "proteinUpper");
			this.container.appendChild(this.proteinUpper);

			this.svgElement.appendChild(this.container);
			//showing title as tooltips is NOT part of svg spec (even though browsers do this)
			//also more repsonsive / more control if we do our own
			this.tooltip = document.createElementNS(CLMS.xiNET.svgns, "text");
			this.tooltip.setAttribute('x', 0);
			this.tooltip.setAttribute('y', 0);
			var tooltipTextNode = document.createTextNode('tooltip');
			this.tooltip.appendChild(tooltipTextNode);

			this.tooltip_bg = document.createElementNS(CLMS.xiNET.svgns, "rect");
			this.tooltip_bg.setAttribute('class', 'tooltip_bg');

			this.tooltip_bg.setAttribute('fill-opacity', 0.75);
			this.tooltip_bg.setAttribute('stroke-opacity', 1);
			this.tooltip_bg.setAttribute('stroke-width', 1);

			this.tooltip_subBg = document.createElementNS(CLMS.xiNET.svgns, "rect");
			this.tooltip_subBg.setAttribute('fill', 'white');
			this.tooltip_subBg.setAttribute('stroke', 'white');
			this.tooltip_subBg.setAttribute('class', 'tooltip_bg');
			this.tooltip_subBg.setAttribute('opacity', 1);
			this.tooltip_subBg.setAttribute('stroke-width', 1);

			this.svgElement.appendChild(this.tooltip_subBg);
			this.svgElement.appendChild(this.tooltip_bg);
			this.svgElement.appendChild(this.tooltip);

			//~ this.xiNET_storage = new xiNET_Storage(this);
			this.clear();
			this.initProteins();
			this.initLayout();

			//~ this.residueLinks = d3.map();
			var crossLinks = this.model.get("clmsModel").get("crossLinks").values();
			for(var crossLink of crossLinks){

				var resLink = new CLMS.xiNET.RenderedCrossLink(crossLink, this);
				this.residueLinks.set(crossLink.id, resLink);

			}



			this.listenTo (this.model.get("filterModel"), "change", this.render);    // any property changing in the filter model means rerendering this view
			this.listenTo (this.model.get("rangeModel"), "change:scale", this.relayout);

			if (viewOptions.displayEventName) {
				this.listenTo (CLMSUI.vent, viewOptions.displayEventName, this.setVisible);
			}
		},

		clear: function () {

			this.sequenceInitComplete = false;
			if (this.force) {
				this.force.stop();
			}
			this.force = null;
			d3.select(this.p_pLinksWide).selectAll("*").remove();
			d3.select(this.highlights).selectAll("*").remove();
			d3.select(this.p_pLinks).selectAll("*").remove();
			d3.select(this.res_resLinks).selectAll("*").remove();
			d3.select(this.proteinLower).selectAll("*").remove();
			d3.select(this.proteinUpper).selectAll("*").remove();

			//are we panning?
			this.panning = false;
			// if we are dragging something at the moment - this will be the element that is draged
			this.dragElement = null;
			// are we dragging at the moment?
			this.dragging = false;
			// from where did we start dragging
			this.dragStart = {};
			// are we rotating at the moment
			this.rotating = false;

			this.renderedProteins = d3.map();
			this.residueLinks = d3.map();
			this.matches = [];
			this.groups = d3.set();
			this.subgraphs = [];
			this.layoutXOffset = 0;

			this.proteinCount = 0;
			this.unambigLinkFound = false;
			this.maxBlobRadius = 30;
			//~ CLMS.xiNET.RenderedProtein.MAXSIZE = 100; **??

			this.layout = null;
			this.z = 1;
			this.scores = null;
			this.selectedLinks = d3.map();

			this.hideTooltip();

			this.resetZoom();
			this.state = CLMS.xiNET.Controller.MOUSE_UP;

		},

		checkLinks: function() {
			var links = this.residueLinks.values();
			var linkCount = links.length;
			for (var l = 0; l < linkCount; l++) {
				links[l].check();
			}
			//this.linkSelectionChanged();
		},

		initLayout: function (){
			var prots = this.renderedProteins.values();
			var protCount = prots.length;
			CLMS.xiNET.RenderedProtein.MAXSIZE = 400;
			for (var i = 0; i < protCount; i++){//< this isn't happening
				var protSize = prots[i].size;
				if (protSize > CLMS.xiNET.RenderedProtein.MAXSIZE){
					console.log("MX:"+CLMS.xiNET.RenderedProtein.MAXSIZE);
					CLMS.xiNET.RenderedProtein.MAXSIZE = protSize;
				}
			}
			//this.maxBlobRadius = Math.sqrt(Protein.MAXSIZE / Math.PI);
			var width = this.svgElement.parentNode.clientWidth;
			CLMS.xiNET.RenderedProtein.UNITS_PER_RESIDUE = ((width / 2)
			- CLMS.xiNET.RenderedProtein.LABELMAXLENGTH) / CLMS.xiNET.RenderedProtein.MAXSIZE;

			var groupCount = this.groups.values().length;
			if (groupCount > 1 && groupCount < 5) {
				//can now choose link colours for comparing sets
				var catCount = this.groups.values().length;
				//~ if (catCount > 1 && catCount < 6) {
				//~ if (catCount < 3){catCount = 3;}
				// if (catCount < 21) {
					//~ if (catCount < 9) {
						//~ var reversed = colorbrewer.Accent[3];
						this.linkColours = d3.scale.ordinal().range(colorbrewer.Dark2[5]);
					//~ }
					//~ else if (catCount < 13) {
						//~ var reversed = colorbrewer.Set3[catCount];
						//~ this.linkColours = d3.scale.ordinal().range(reversed);
					//~ }
					//~ else {
						//~ this.linkColours = d3.scale.category20();
					//~ }
				//}
					var groups = this.groups.values();
					for (var g = 0; g < groupCount; g++) {
						this.linkColours(groups[g]);
					}
					this.legendChanged();
				//~ }
			}
			if (typeof this.layout !== 'undefined' && this.layout != null) {
				this.loadLayout();
			} else {
				var proteins = this.renderedProteins.values();
				var proteinCount = proteins.length;
				for (var p = 0; p < proteinCount; p++) {
					var prot = proteins[p];
					this.proteinLower.appendChild(prot.lowerGroup);
					this.proteinUpper.appendChild(prot.upperGroup);
				}
				this.autoLayout();
			}
		},

		initProteins: function () {
			var interactors = this.model.get("clmsModel").get("interactors").values();
			CLMS.xiNET.RenderedProtein.MAXSIZE = 0;
			for (var interactor of interactors) {

				var newProt = new CLMS.xiNET.RenderedProtein(interactor, this);
				//~ newProt.setSequence(interactor.sequence);
				// newProt.init();
				this.renderedProteins.set(interactor.id, newProt);

				var protSize = interactor.size;
				if (protSize > CLMS.xiNET.RenderedProtein.MAXSIZE){
					CLMS.xiNET.RenderedProtein.MAXSIZE = protSize;
				}
			}
			//this.maxBlobRadius = Math.sqrt(Protein.MAXSIZE / Math.PI);
			var width = this.svgElement.parentNode.clientWidth;
			CLMS.xiNET.RenderedProtein.UNITS_PER_RESIDUE = ((width / 2)
					- CLMS.xiNET.RenderedProtein.LABELMAXLENGTH) / CLMS.xiNET.RenderedProtein.MAXSIZE;
			var prots = this.renderedProteins.values();
			var protCount = prots.length;
			for (var i = 0; i < protCount; i++){
				prots[i].init();
			}
			this.sequenceInitComplete = true;
			//~ if (protCount < 3) {
				//~ for (var j =0; j < protCount; j++){
					//~ prots[j].busy = false;
					//~ prots[j].setForm(1);
				//~ }
			//~ }
			if (this.annotationSet){
				this.setAnnotations(this.annotationSet);
			}
			else {
				this.setAnnotations('CUSTOM');
			}
		},

reset: function() {
	this.resetZoom();
	var proteins = this.renderedProteins.values();
	var proteinCount = proteins.length;
	for (var p = 0; p < proteinCount; p++) {
		var prot = proteins[p];
		if (prot.isParked === false) {
			prot.setForm(0);
		}
	}
	this.autoLayout();
},


		resetZoom: function () {
			this.container.setAttribute("transform", "scale(1)");
			this.scale();
			//~ var proteins = this.renderedProteins.values();
			//~ var proteinCount = proteins.length;
			//~ for (var p = 0; p < proteinCount; p++) {
				//~ var prot = proteins[p];
				//~ prot.stickZoom = 1;
				//~ prot.scale();
			//~ }
		},

		scale: function () {
			//~ //if (this.sequenceInitComplete) {
				//~ this.z = this.container.getScreenCTM().inverse().a;
//~
				//~ var proteins = this.renderedProteins.values();
				//~ var proteinCount = proteins.length;
				//~ for (var p = 0; p < proteinCount; p++) {
					//~ var prot = proteins[p];
					//~ prot.setPosition(prot.x, prot.y); // this rescales the protein //TODO: check if this always need to happen
					//~ if (prot.form !== 0)
						//~ prot.setAllLineCoordinates();
				//~ }
//~
				//~ var links = this.proteinLinks.values();
				//~ var linkCount = links.length;
				//~ for (var l = 0; l < linkCount; l++) {
					//~ var protLink = links[l];
					//~ if (protLink.fromProtein !== protLink.toProtein && protLink.toProtein !== null) {
						//~ if (!protLink.fromProtein.isParked && !protLink.toProtein.isParked) {
							//~ if (protLink.fromProtein.form === 0 && protLink.toProtein.form === 0) {
								//~ protLink.line.setAttribute("stroke-width", this.z * xiNET.linkWidth);
								//~ protLink.highlightLine.setAttribute("stroke-width", this.z * 10);
								//~ protLink.fatLine.setAttribute("stroke-width", this.z * protLink.w);
								//~ if (protLink.ambig) {
									//~ protLink.dashedLine(true); //rescale spacing of dashes
								//~ }
							//~ }
							//~ else {
								//~ //inter protein res links
								//~ var c2 = protLink.residueLinks.keys().length;
								//~ for (var rl = 0; rl < c2; rl++) {
									//~ var resLink = protLink.residueLinks.values()[rl];
									//~ if (resLink.check()) {
										//~ protLink.residueLinks.values()[rl].line.setAttribute("stroke-width", this.z * xiNET.linkWidth);
										//~ protLink.residueLinks.values()[rl].highlightLine.setAttribute("stroke-width", this.z * 10);
										//~ if (resLink.ambig) {
											//~ resLink.dashedLine(true); //rescale spacing of dashes
										//~ }
									//~ }
								//~ }
							//~ }
						//~ }
					//~ }
				//~ }
			//~ //}
		},

		setAnnotations: function (annotationChoice) {
			this.annotationChoice = annotationChoice;
			//clear all annot's
			var mols = this.renderedProteins.values();
			var molCount = mols.length;
			for (var m = 0; m < molCount; m++) {
				mols[m].clearPositionalFeatures();
			}
			this.domainColours = null;
			this.legendChanged();
			if (this.sequenceInitComplete) { //dont want to be changing annotations while still waiting on sequence
				var self = this;
				if (annotationChoice.toUpperCase() === "CUSTOM"){
					for (m = 0; m < molCount; m++) {
						var mol = mols[m];
						mol.setPositionalFeatures(mol.customAnnotations);
					}
					chooseColours();
				}
				else if (annotationChoice.toUpperCase() === "LYSINES") {
					for (m = 0; m < molCount; m++) {
						var mol = mols[m];
						var seq = mol.sequence;
						var annots = [];
						for (var i =0; i < mol.size; i++){
							var aa = seq[i];
							if (aa === 'K'){
								annots.push(new Annotation ("Lysine", i+1, i+1));
							}

						}
						mol.setPositionalFeatures(annots);
					}
					chooseColours();
				}
				else if (annotationChoice.toUpperCase() === "SUPERFAM" || annotationChoice.toUpperCase() === "SUPERFAMILY"){
					var molsAnnotated = 0;
					for (m = 0; m < molCount; m++) {
						var mol = mols[m];
						this.xiNET_storage.getSuperFamFeatures(mol.id, function (id, fts){
							var m = self.proteins.get(id);
							m.setPositionalFeatures(fts);
							molsAnnotated++;
							if (molsAnnotated === molCount) {
								chooseColours();
							}
						});
					}
				}
				else if (annotationChoice.toUpperCase() === "UNIPROT" || annotationChoice.toUpperCase() === "UNIPROTKB") {
					var molsAnnotated = 0;
					for (m = 0; m < molCount; m++) {
						var mol = mols[m];
						this.xiNET_storage.getUniProtFeatures(mol.id, function (id, fts){
							var m = self.proteins.get(id);
							if (m.accession.indexOf("-") === -1 || m.accession === "P02768-A") {
								if (m.accession === "P02768-A") {
									var offset = -24;
									for (var f = 0; f < fts.length; f++) {
										var feature = fts[f];
										feature.start = feature.start + offset;
										feature.end = feature.end + offset;
									}
								}
								m.setPositionalFeatures(fts);
							}
							molsAnnotated++;
							if (molsAnnotated === molCount) {
								chooseColours();
							}
						});
					}
				}
			}

			function chooseColours(){
				var categories = d3.set();
				for (m = 0; m < molCount; m++) {
					var mol = mols[m];
					for (var a = 0; a < mol.annotations.length; a++){
						categories.add(mol.annotations[a].name);
					}
				}
				var catCount = categories.values().length;
				if (catCount < 3){catCount = 3;}
				//~ if (catCount < 21) {
					if (catCount < 9) {
						var reversed = colorbrewer.Accent[catCount].slice().reverse();
						self.domainColours = d3.scale.ordinal().range(reversed);
					}
					else if (catCount < 13) {
						var reversed = colorbrewer.Set3[catCount].slice().reverse();
						self.domainColours = d3.scale.ordinal().range(reversed);
					}
					else {
						self.domainColours = d3.scale.category20();
					}
					for (m = 0; m < molCount; m++) {
						var mol = mols[m];
						for (a = 0; a < mol.annotations.length; a++) {
							var anno = mol.annotations[a];
							var c = self.domainColours(anno.name);
							anno.pieSlice.setAttribute("fill", c);
							anno.pieSlice.setAttribute("stroke", c);
							anno.colouredRect.setAttribute("fill", c);
							anno.colouredRect.setAttribute("stroke", c);
						}
					}
				//~ }
				self.legendChanged();
			}

		},

		legendChanged: function () {
			var callbacks = this.legendCallbacks;
			var count = callbacks.length;
			for (var i = 0; i < count; i++) {
				callbacks[i](this.linkColours, this.domainColours);
			}
		},


setCTM: function(element, matrix) {
	var s = "matrix(" + matrix.a + "," + matrix.b + "," + matrix.c + "," + matrix.d + "," + matrix.e + "," + matrix.f + ")";
	element.setAttribute("transform", s);
},



/**
 * Handle mousedown event.
 */
mouseDown: function(evt) {
	//prevent default, but allow propogation
	evt.preventDefault();
	//evt.returnValue = false;
	//stop force layout
	if (typeof this.force !== 'undefined' && this.force != null) {
		this.force.stop();
	}

	var p = this.getEventPoint(evt);// seems to be correct, see below
	this.dragStart = this.mouseToSVG(p.x, p.y);

	var rightClick; //which button has just been raised
	if (evt.which)
		rightClick = (evt.which === 3);
	else if (evt.button)
		rightClick = (evt.button === 2);

	if (evt.ctrlKey === true || evt.shiftKey === true || rightClick) {
//        alert("here");
//        this.state = xiNET.Controller.SELECTING;
////        //      marquee.style.strokeDashoffset=0;
//               this.marquee.setAttribute('x', 100);
//    this.marquee.setAttribute('y', 100);
//    this.marquee.setAttribute('width', 100);
//    this.marquee.setAttribute('height', 100);
//   this.svgElement.appendChild(this.marquee);
// //        this.updateMarquee(this.marquee, this.dragStart);
//////      var offset = 0, marcher = setInterval(function(){
//////        marquee.style.strokeDashoffset = offset--;
//////      },30);
////        //clear selection if ctrl not pressed
////        if (evt.ctrlKey === false) {
////            this.clearSelection();
////        }
	} else {
	this.state = CLMS.xiNET.Controller.PANNING;
	this.panned = false;
	}
	return false;
},

// dragging/rotation/panning/selecting
mouseMove: function(evt) {
	//~ this.preventDefaultsAndStopPropagation(evt);
  //  if (this.sequenceInitComplete) { // just being cautious
		var p = this.getEventPoint(evt);// seems to be correct, see below
		var c = this.mouseToSVG(p.x, p.y);

		if (this.dragElement != null) { //dragging or rotating
			this.hideTooltip();
			var dx = this.dragStart.x - c.x;
			var dy = this.dragStart.y - c.y;

			if (this.state === CLMS.xiNET.Controller.DRAGGING) {
				// we are currently dragging things around
				var ox, oy, nx, ny;
				if (typeof this.dragElement.x === 'undefined') { // if not a protein
					//its a link - drag whole connected subgraph
					var prot;
					if (this.dragElement.fromProtein)
						prot = this.dragElement.fromProtein;
					else
						prot = this.dragElement.proteinLink.fromProtein;
					var prots = this.renderedProteins.values();
					var protCount = prots.length;
					for (var p = 0; p < protCount; p++) {
						prots[p].subgraph = null;
					}
					var subgraph = prot.getSubgraph();
					var nodes = subgraph.nodes.values();
					var nodeCount = nodes.length;
					for (var i = 0; i < nodeCount; i++) {
						var protein = nodes[i];
						ox = protein.x;
						oy = protein.y;
						nx = ox - dx;
						ny = oy - dy;
						protein.setPosition(nx, ny);
						protein.setAllLineCoordinates();
					}
					for (i = 0; i < nodeCount; i++) {
						nodes[i].setAllLineCoordinates();
					}
				} else {
					//its a protein - drag it TODO: DRAG SELECTED
					ox = this.dragElement.x;
					oy = this.dragElement.y;
					nx = ox - dx;
					ny = oy - dy;
					this.dragElement.setPosition(nx, ny);
					this.dragElement.setAllLineCoordinates();
				}
				this.dragStart = c;
			}

			else if (this.state === CLMS.xiNET.Controller.ROTATING) {
				// Distance from mouse x and center of stick.
				var _dx = c.x - this.dragElement.x
				// Distance from mouse y and center of stick.
				var _dy = c.y - this.dragElement.y;
				//see http://en.wikipedia.org/wiki/Atan2#Motivation
				var centreToMouseAngleRads = Math.atan2(_dy, _dx);
				if (this.whichCLMS.xiNET.Rotator === 0) {
					centreToMouseAngleRads = centreToMouseAngleRads + Math.PI;
				}
				var centreToMouseAngleDegrees = centreToMouseAngleRads * (360 / (2 * Math.PI));
				this.dragElement.setRotation(centreToMouseAngleDegrees);
				this.dragElement.setAllLineCoordinates();
			}
			else { //not dragging or rotating yet, maybe we should start
				// don't start dragging just on a click - we need to move the mouse a bit first
				if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) {
					this.state = CLMS.xiNET.Controller.DRAGGING;

				}
			}
		}

//    else if (this.state === xiNET.Controller.SELECTING) {
//        this.updateMarquee(this.marquee, c);
//    }
		else if (this.state === CLMS.xiNET.Controller.PANNING) {
		   this.setCTM(this.container, this.container.getCTM().translate(c.x - this.dragStart.x, c.y - this.dragStart.y));
		}
		else {
			this.showTooltip(p);
		}
   // }
	return false;
},


// this ends all dragging and rotating
mouseUp: function(evt) {
	var time = new Date().getTime();
	//console.log("Mouse up: " + evt.srcElement + " " + (time - this.lastMouseUp));
	this.preventDefaultsAndStopPropagation(evt);
	//eliminate some spurious mouse up events
	if ((time - this.lastMouseUp) > 150){

		var rightclick, middleclick; //which button has just been raised
		if (evt.which)
			rightclick = (evt.which === 3);
		else if (evt.button)
			rightclick = (evt.button === 2);
		if (evt.which)
			middleclick = (evt.which === 2);
		else if (evt.button)
			middleclick = (evt.button === 1);

		var p = this.getEventPoint(evt);// seems to be correct, see below
		var c = this.mouseToSVG(p.x, p.y);

		if (this.dragElement != null) {
			if (!(this.state === CLMS.xiNET.Controller.DRAGGING || this.state === CLMS.xiNET.Controller.ROTATING)) { //not dragging or rotating
				if (rightclick) { // RIGHT click
					if (typeof this.dragElement.x === 'undefined') {//if not protein or p.group
						if (this.dragElement.selfLink() == true) {//if internal link
							if (this.dragElement.proteinLink)//its a residueLink
								this.dragElement.proteinLink.fromProtein.toggleFlipped();
						} else {
							if (this.dragElement.hidden !== undefined) {//if CLMS.xiNET.RenderedProteinLink
								this.dragElement.hidden = true;
							} else {//its a residue link
								this.dragElement.proteinLink.hidden = true;
							}
							this.dragElement.highlightLine.setAttribute("stroke-opacity", "0");
							this.checkLinks();
						}
					} else {//right click on protein
						this.dragElement.setParked(!this.dragElement.isParked, c);
					}
				}
				else if (middleclick) {
					//can't be used? problem with IE (scroll thingy)
				}
				else { //left click; show matches for link, toggle form for protein, switch stick scale
					if (typeof this.dragElement.x === 'undefined') { //if not protein
						//~ this.dragElement.showID();
					} else if (evt.shiftKey) { //if shift key
						this.dragElement.switchStickScale(c);
					} else {
						if (this.sequenceInitComplete === true){
							if (this.dragElement.form === 1) {
								this.dragElement.setForm(0, c);
							} else {
								this.dragElement.setForm(1, c);
							}
						}
					}
				}
				//~ this.checkLinks();
			}
			else if (this.state === CLMS.xiNET.Controller.ROTATING) {
				//round protein rotation to nearest 5 degrees (looks neater)
				this.dragElement.setRotation(Math.round(this.dragElement.rotation / 5) * 5);
			}
			else {
			} //end of protein drag; do nothing
		}
		else if (rightclick) { //right click on background; show all hidden links
			var links = this.proteinLinks.values();
			var linkCount = links.length;
			for (var l = 0; l < linkCount; l++) {
				var link = links[l];
				link.hidden = false;
			}
			this.checkLinks();
		} else if (/*this.state !== xiNET.Controller.PANNING &&*/ evt.ctrlKey === false) {
			//~ this.clearSelection();
		}

		if (this.state === CLMS.xiNET.Controller.SELECTING) {
			clearInterval(this.marcher);
			this.svgElement.removeChild(this.marquee);
		}
	}

	this.dragElement = null;
	this.whichRotator = -1;
	this.state = CLMS.xiNET.Controller.MOUSE_UP;

	this.lastMouseUp = time;
	return false;
},


//~ updateMarquee: function(rect, p1) {
	//~ var p0 = this.dragStart;
	//~ var xs = [p0.x, p1.x].sort(sortByNumber),
			//~ ys = [p0.y, p1.y].sort(sortByNumber);
	//~ rect.setAttribute('x', xs[0]);
	//~ rect.setAttribute('y', ys[0]);
	//~ rect.setAttribute('width', xs[1] - xs[0]);
	//~ rect.setAttribute('height', ys[1] - ys[0]);
//~ },


//~ function sortByNumber(a, b) {
	//~ return a - b
//~ }

/**
 * Handle mouse wheel event.
 */
mouseWheel: function(evt) {
	this.preventDefaultsAndStopPropagation(evt);
	var delta;
	//see http://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
	if (evt.wheelDelta) {
		delta = evt.wheelDelta / 3600; // Chrome/Safari
	}
	else {
		delta = evt.detail / -90; // Mozilla
	}
	var z = 1 + delta;
	var g = this.container;
	var p = this.getEventPoint(evt);// seems to be correct, see above
	var c = this.mouseToSVG(p.x, p.y);
	var k = this.svgElement.createSVGMatrix().translate(c.x, c.y).scale(z).translate(-c.x, -c.y);
	this.setCTM(g, g.getCTM().multiply(k));
	this.scale();
	return false;
},

//gets mouse position
getEventPoint: function(evt) {
	var p = this.svgElement.createSVGPoint();
	var element = this.svgElement.parentNode;
	var top = 0, left = 0;
	do {
		top += element.offsetTop  || 0;
		left += element.offsetLeft || 0;
		element = element.offsetParent;
   } while(element);
	p.x = evt.pageX - left;
	p.y = evt.pageY - top;
	return p;
},

// transform the mouse-position into a position on the svg
mouseToSVG: function(x, y) {
	var p = this.svgElement.createSVGPoint();
	p.x = x;
	p.y = y;
	var p = p.matrixTransform(this.container.getCTM().inverse());
	return p;
},

//stop event propogation and defaults; only do what we ask
preventDefaultsAndStopPropagation: function(evt) {
	if (evt.stopPropagation)
		evt.stopPropagation();
	if (evt.cancelBubble != null)
		evt.cancelBubble = true;
	if (evt.preventDefault)
		evt.preventDefault();
	// evt.returnValue = false;
},

		showTooltip: function(p) {
			var ttX, ttY;
			var length = this.tooltip.getComputedTextLength() + 16;
			var width = this.svgElement.parentNode.clientWidth;
			var height = this.svgElement.parentNode.clientHeight;
			if (p.x + 20 + length < width) {
				ttX = p.x;
			}
			else {
				ttX = width - length - 20;
			}

			if (p.y + 60 < height) {
				ttY = p.y;
			}
			else {
				ttY = height - 60;
			}
			this.tooltip.setAttribute("x", ttX + 22);
			this.tooltip.setAttribute("y", ttY + 47);
			this.tooltip_bg.setAttribute("x", ttX + 16);
			this.tooltip_bg.setAttribute("y", ttY + 28);
			this.tooltip_subBg.setAttribute("x", ttX + 16);
			this.tooltip_subBg.setAttribute("y", ttY + 28);
		},

		setTooltip: function(text, colour) {
			if (text) {
				this.tooltip.firstChild.data = text.toString().replace(/&(quot);/g, '"');
				this.tooltip.setAttribute("display","block");
				var length = this.tooltip.getComputedTextLength();
					this.tooltip_bg.setAttribute("width",length+16);
					this.tooltip_subBg.setAttribute("width",length+16);
				if (typeof colour !== 'undefined' && colour != null){
					this.tooltip_bg.setAttribute('fill', colour);
					this.tooltip_bg.setAttribute('stroke', colour);
					this.tooltip_bg.setAttribute('fill-opacity', '0.5');
				} else {
					this.tooltip_bg.setAttribute('fill','white');
					this.tooltip_bg.setAttribute('stroke','grey');
				}
				this.tooltip_bg.setAttribute('height', 28);
				this.tooltip_subBg.setAttribute('height', 28);
				this.tooltip_bg.setAttribute("display","block");
				this.tooltip_subBg.setAttribute("display","block");
			}
			else {
				this.hideTooltip();
			}
		},

 		hideTooltip: function () {
			this.tooltip.setAttribute("display","none");
			this.tooltip_bg.setAttribute("display","none");
			this.tooltip_subBg.setAttribute("display","none");
		},


autoLayout: function() {
	if (this.force) {this.force.stop();}
	var width = this.svgElement.parentNode.clientWidth;
	var height = this.svgElement.parentNode.clientHeight;
	var self = this;
	var prots = this.renderedProteins.values();
	var proteinCount = prots.length;
	//clear subgraphs
	this.subgraphs.length = 0;
	for (var p = 0; p < proteinCount; p++) {
		prots[p].interactor.subgraph = null;
	}
	//~ for (var p = 0; p < proteinCount; p++) {
		//~ var prot = prots[p];
		//~ var park = true;
		//~ for (var ppl = 0; ppl < prot.proteinLinks.values().length; ppl++){
			//~ var protLink = prot.proteinLinks.values()[ppl];
			//~ if (protLink.getFilteredMatches().length > 0){
				//~ if (this.intraHidden === false ||
					//~ (this.intraHidden === true && protLink.intra != true)) {
						//~ park = false;
					//~ }
			//~ }
		//~ }
		//~ // for (var ppl = 0; ppl < prot.proteinLinks.values().length; ppl++){
			//~ // var protLink = prot.proteinLinks.values()[ppl];
			//~ // if (protLink.getFilteredMatches().length > 0){
				//~ // park = false;
			//~ // }
		//~ // }
		//~ prot.setParked(park);
	//~ }
	//init subgraphs
	for (var p = 0; p < proteinCount; p++) {
		prots[p].interactor.getSubgraph();//adds new subgraphs to this.subgraphs
	}
	//sort subgraphs by size
	this.subgraphs.sort(function(a, b) {
		return a.nodes.values().length - b.nodes.values().length;
	});

	if (proteinCount === 1) {
		var protein = prots[0];
		protein.setPosition(width / 2, height / 2);
		return;
	}
	else if (proteinCount === 2) {
		var p1 = prots[0];
		p1.setPosition(width / 2, height * 0.3);
		p1.setAllLineCoordinates();
		var p2 = prots[1];
		p2.setPosition(width / 2, height * 0.6);
		p2.setAllLineCoordinates();
		return;
	}
	else {
		  //Sort subgraphs into linear and non-linear sets
		var linearGraphs = [];
		var nonLinearGraphs = [];
		var graphCount = this.subgraphs.length;
		for (var g = 0; g < graphCount; g++) {
			var graph = this.subgraphs[g];
			var nodes = graph.nodes.values();
			var nodeCount = nodes.length;
			var isLinear = true;
			if (nodeCount === 1) {
				isLinear = true;
			}
			else {
				var endFound = false;
				for (var n = 0; n < nodeCount; n++) {
					if (nodes[n].countExternalLinks() > 2) {
						isLinear = false;
						break;
					}
					else if (nodes[n].countExternalLinks() < 2) {
						endFound = true;
					}
				}
				//check not circular
				if (!endFound) {
					isLinear = false;
				}
			}
			if (isLinear === true) {
				linearGraphs.push(graph);
			} else {
				nonLinearGraphs.push(graph);
			}
		}
		//Grid layout linear graphs
		var column = 0, row = 0, parkedRow = 0, parkedColumn = -1;
		if (linearGraphs.length > 0) {
			column++;
			for (var g = 0; g < linearGraphs.length; g++) {
				var nodes = linearGraphs[g].nodes.keys(); //
				var nodeCount = nodes.length;
				if (nodeCount > 2) {
					nodes = reorderedNodes(linearGraphs[g]);
				}
				for (var n = 0; n < nodeCount; n++) {
					var p = this.renderedProteins.get(nodes[n]);
					var x, y;
					if (p.isParked === true) {
						parkedRow++;
						x = xForColumn(parkedColumn);
						y = yForRow(parkedRow);
						if (y > height) {
							parkedColumn--;
							parkedRow = 1;
							x = xForColumn(parkedColumn);
							y = yForRow(parkedRow);
						}
					}
					else {
						row++;
						if (proteinCount < 60 || nodeCount > 1) {
						row++;
						}
						x = xForColumn(column);
						y = yForRow(row);
						var lastNodeY = yForRow(row + ((nodeCount - 1 - n) * 2));
						if ((lastNodeY + this.maxBlobRadius) > height) {
							column++;
							row = 1;
							if (proteinCount < 60) {
								row++;
							}
							x = xForColumn(column);
							y = yForRow(row);
						}
					}
					p.setPosition(x, y);
//                p.fixed = true;
					//~ this.proteinUpper.appendChild(p.upperGroup);//TODO: why is this here?
					p.setAllLineCoordinates();
				}
			}
		}
		//remember edge of gridded proteins
		this.layoutXOffset = xForColumn(column + 0.5);
		//if force is null choose nice starting points for nodes
		if (typeof this.force === 'undefined' || this.force == null) {
			//Get starting position for force layout by using d3 packed circles layout
			var layoutObj = {};
			var children = [];
			layoutObj.NAME = "ALL";
			layoutObj.children = children;
			for (var g = 0; g < nonLinearGraphs.length; g++) {
				var nodes = nonLinearGraphs[g].nodes.values();
				var nodeCount = nodes.length;
				for (var n = 0; n < nodeCount; n++) {
					var prot = this.renderedProteins.get(nodes[n].id);
					var nodeObj = {};
					nodeObj.id = prot.id;
					nodeObj.x = prot.x - this.layoutXOffset;
					nodeObj.y = prot.y;
					nodeObj.px = prot.x - this.layoutXOffset;
					nodeObj.py = prot.y;
					nodeObj.linkCount = prot.proteinLinks.keys().length;
					nodeObj.size = 30;
					layoutObj.children.push(nodeObj);
				}
			}
			var packLayout = d3.layout.pack()
					.size([width - this.layoutXOffset, height])
					.value(function(d) {
						return d.size;
					})
					.sort(function comparator(a, b) {
						return (b.linkCount) - (a.linkCount);
					});
			var nodes = packLayout.nodes(layoutObj);
			var nodeCount = nodes.length;
			for (var n = 1; n < nodeCount; n++) {
				var node = nodes[n];
				var protein = this.renderedProteins.get(node.id);
				var nx = node.x;
				var ny = node.y;
				var rotated = Protein.rotatePointAboutPoint([nx, ny],
					[(width - this.layoutXOffset / 2), height / 2], 90)
				protein.setPosition(rotated[0] + this.layoutXOffset, rotated[1]);
				protein.setAllLineCoordinates(false);
			}
		}
		//do force directed layout
		var gWidth = width - this.layoutXOffset;
		if (gWidth < 200) {
			gWidth = width;
		}
		var linkDistance = 60;
		layoutObj = {};
		layoutObj.nodes = [];
		layoutObj.links = [];
		var protLookUp = {};
		var pi = 0;

		for (var g = 0; g < nonLinearGraphs.length; g++) {
			var nodes = nonLinearGraphs[g].nodes.values();
			var nodeCount = nodes.length;
			for (var n = 0; n < nodeCount; n++) {
				var prot = this.renderedProteins.get(nodes[n].id);
//        if (prot.fixed === false) {
				protLookUp[prot.id] = pi;
				pi++;
				var nodeObj = {};
				nodeObj.id = prot.id;
				nodeObj.x = prot.x - this.layoutXOffset;
				nodeObj.y = prot.y;
				nodeObj.px = prot.x - this.layoutXOffset;
				nodeObj.py = prot.y;
				layoutObj.nodes.push(nodeObj);
			}
//        }
		}
		for (var g = 0; g < nonLinearGraphs.length; g++) {
			var links = nonLinearGraphs[g].links.values();
			var linkCount = links.length;
			for (var l = 0; l < linkCount; l++) {
				var link = links[l];
				var fromProt = link.fromProtein;
				var toProt = link.toProtein;
				if (toProt) {
					var source = protLookUp[fromProt.id];
					var target = protLookUp[toProt.id];

					if (source !== target) {

						if (typeof source !== 'undefined' && typeof target !== 'undefined') {
							var linkObj = {};
							linkObj.source = source;
							linkObj.target = target;
							linkObj.id = link.id;
							layoutObj.links.push(linkObj);
						}
						else {
							alert("NOT RIGHT");
						}
					}
				}
			}
		}
		var k = Math.sqrt(layoutObj.nodes.length / ((gWidth) * height));
// mike suggests:
//    .charge(-10 / k)
//    .gravity(100 * k)
		this.force = d3.layout.force()
				.nodes(layoutObj.nodes)
				.links(layoutObj.links)
				.gravity(85 * k)
				.linkDistance(linkDistance)
				.charge(-30 / k)
				.size([gWidth, height]);
		var nodeCount = this.force.nodes().length;
		var forceLinkCount = this.force.links().length;
		this.force.on("tick", function(e) {
			var nodes = self.force.nodes();
			for (var n = 0; n < nodeCount; n++) {
				var node = nodes[n];
				var protein = self.proteins.get(node.id);
				var nx = node.x;
				var ny = node.y;
				protein.setPosition(nx + self.layoutXOffset, ny);
				protein.setAllLineCoordinates();
			}
		});
		this.force.start();
	}

	function reorderedNodes(linearGraph) {
		var reorderedNodes = [];
		appendNode(getStartNode());
		return reorderedNodes;

		function getStartNode() {
			var ns = linearGraph.nodes.values();
			var count = ns.length;
			//                    alert (nodeCount);
			for (var n = 0; n < count; n++) {
				if (ns[n].countExternalLinks() < 2) {
					//                            alert("got start");
					return ns[n];
				}
			}
			console.error("missed linear subgraph start");
			return null;
		}

		function appendNode(currentNode) {
			reorderedNodes.push(currentNode.id);
			for (var l = 0; l < currentNode.proteinLinks.values().length; l++) {
				var link = currentNode.proteinLinks.values()[l];
				if (link.check() === true) {
					var nextNode = link.getOtherEnd(currentNode);
					if (reorderedNodes.indexOf(nextNode.id) === -1) {
						//                    alert("here");
						appendNode(nextNode);
						break;
					}
				}
			}
		}
	}

	//functions used...
	function xForColumn(c) {
		return (c * ((2 * 30) + Protein.LABELMAXLENGTH)) - 30;
	}
	;

	function yForRow(r) {
		return (r * 30);
	}
	;
},

		downloadSVG: function () {
			//~ var svgString = CLMSUI.utils.getSVG(d3.select(this.el).select("svg"));
			//~ download(svgString, 'application/svg', 'distogram.svg');
		},

		hideView: function () {
			win.CLMSUI.vent.trigger (this.displayEventName, false);
		},

		setVisible: function (show) {
			console.log("event display in distogram", show);
			d3.select(this.el).style('display', show ? 'block' : 'none');

			if (show) {
				this
					.relayout() // need to resize first sometimes so render gets correct width/height coords
					.render()
				;
			}
		},

		render: function () {

			console.log ("re rendering cross-link viewer");
			this.checkLinks();
			//this.stage.handleResize();

			return this;
		},


		// removes view
		// not really needed unless we want to do something extra on top of the prototype remove function (like destroy c3 view just to be sure)
		remove: function () {
			// this line destroys the c3 chart and it's events and points the this.chart reference to a dead end
			this.chart = this.chart.destroy();

			// remove drag listener
			d3.select(this.el).selectAll(".dynDiv_resizeDiv_tl, .dynDiv_resizeDiv_tr, .dynDiv_resizeDiv_bl, .dynDiv_resizeDiv_br").on(".drag", null);

			// this line destroys the containing backbone view and it's events
			Backbone.View.prototype.remove.call(this);
		}

	});

} (this));


CLMS.xiNET.svgns = "http://www.w3.org/2000/svg";// namespace for svg elements
CLMS.xiNET.xlinkNS = "http://www.w3.org/1999/xlink";// namespace for xlink, for use/defs elements
CLMS.xiNET.linkWidth = 1.3;// default line width
CLMS.xiNET.homodimerLinkWidth = 1.3;// have considered varying this line width
// highlight and selection colours are global
// (because all instances of CLMS.xiNET should use same colours for this)
CLMS.xiNET.highlightColour = new RGBColor("#fdc086");
CLMS.xiNET.selectedColour = new RGBColor("#ffff99");
CLMS.xiNET.defaultSelfLinkColour = new RGBColor("#9970ab");
CLMS.xiNET.defaultInterLinkColour = new RGBColor("#35978f");
CLMS.xiNET.homodimerLinkColour = new RGBColor("#a50f15");

//static var's signifying Controller's status
CLMS.xiNET.Controller = {};
CLMS.xiNET.Controller.MOUSE_UP = 0;//start state, also set when mouse up on svgElement
CLMS.xiNET.Controller.PANNING = 1;//set by mouse down on svgElement - left button, no shift or ctrl
CLMS.xiNET.Controller.DRAGGING = 2;//set by mouse down on Protein or Link
CLMS.xiNET.Controller.ROTATING = 3;//set by mouse down on CLMS.xiNET.Rotator, drag?
CLMS.xiNET.Controller.SCALING_PROTEIN = 4;//set by mouse down on CLMS.xiNET.Rotator, drag?
CLMS.xiNET.Controller.SCALING_ALL_PROTEINS = 5;//set by mouse down on CLMS.xiNET.Rotator, drag?
CLMS.xiNET.Controller.SELECTING = 6;//set by mouse down on svgElement- right button or left button shift or ctrl, drag