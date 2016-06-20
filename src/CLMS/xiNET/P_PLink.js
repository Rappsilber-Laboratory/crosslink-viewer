//	xiNET Cross-link Viewer
//	Copyright 2013 Rappsilber Laboratory
//
//	author: Colin Combe
//
//	CLMS.xiNET.P_PLink.js
// 	the class representing a protein-protein link

CLMS.xiNET.P_PLink = function (p_pId, crossLink, crosslinkViewer) {
	
	this.crosslinkViewer = crosslinkViewer;
	this.crossLinks = new Set();
	
	this.renderedFromProtein =
					this.crosslinkViewer.renderedProteins.get(crossLink.fromProtein.id);
	this.renderedFromProtein.renderedP_PLinks.set(p_pId, this);				
	
	this.renderedToProtein =
					this.crosslinkViewer.renderedProteins.get(crossLink.toProtein.id);
	this.renderedToProtein.renderedP_PLinks.set(p_pId, this);				
		
	this.name = crossLink.fromProtein.name + " - " + crossLink.toProtein.name;
	//used to avoid some unnecessary manipulation of DOM
	this.shown = false;
	//layout stuff
	this.hidden = false;

	if (crossLink.isSelfLink() === false) {
		this.line = document.createElementNS(CLMS.xiNET.svgns, "line");
		this.highlightLine = document.createElementNS(CLMS.xiNET.svgns, "line");
		this.thickLine = document.createElementNS(CLMS.xiNET.svgns, "line");
	} else {
		this.renderedFromProtein.selfLink = this;
		
		this.line = document.createElementNS(CLMS.xiNET.svgns, "path");
		this.highlightLine = document.createElementNS(CLMS.xiNET.svgns, 'path');
		this.thickLine = document.createElementNS(CLMS.xiNET.svgns, 'path');
	}
	
	this.line.setAttribute("class", "link");
	this.line.setAttribute("fill", "none");
	this.line.setAttribute("stroke", "black");
	this.line.setAttribute("stroke-width", 1);
	this.line.setAttribute("stroke-linecap", "round");
	
	this.highlightLine.setAttribute("class", "link");
	this.highlightLine.setAttribute("fill", "none");
	this.highlightLine.setAttribute("stroke", CLMS.xiNET.highlightColour.toRGB());
	this.highlightLine.setAttribute("stroke-width", "10");
	this.highlightLine.setAttribute("stroke-linecap", "round");
	this.highlightLine.setAttribute("stroke-opacity", "0");
	
	this.thickLine.setAttribute("class", "link");
	this.thickLine.setAttribute("fill", "none");
	this.thickLine.setAttribute("stroke", "lightgray");
	this.thickLine.setAttribute("stroke-linecap", "round");
	this.thickLine.setAttribute("stroke-linejoin", "round");
	
	//set the events for it
	var self = this;
	this.line.onmousedown = function(evt) {
		self.mouseDown(evt);
	};
	this.line.onmouseover = function(evt) {
		self.mouseOver(evt);
	};
	this.line.onmouseout = function(evt) {
		self.mouseOut(evt);
	};
	this.line.ontouchstart = function(evt) {
		self.touchStart(evt);
	};

	this.highlightLine.onmousedown = function(evt) {
		self.mouseDown(evt);
	};
	this.highlightLine.onmouseover = function(evt) {
		self.mouseOver(evt);
	};
	this.highlightLine.onmouseout = function(evt) {
		self.mouseOut(evt);
	};
	this.highlightLine.ontouchstart = function(evt) {
		self.touchStart(evt);
	};

	this.thickLine.onmousedown = function(evt) {
		self.mouseDown(evt);
	};
	this.thickLine.onmousedown = function(evt) {
		self.mouseDown(evt);
	};
	this.thickLine.onmouseover = function(evt) {
		self.mouseOver(evt);
	};
	this.thickLine.onmouseout = function(evt) {
		self.mouseOut(evt);
	};
	this.thickLine.ontouchstart = function(evt) {
		self.touchStart(evt);
	};

	this.isSelected = false;
}


//static variable used to calculate width of the background line
CLMS.xiNET.P_PLink.maxNoCrossLinks = 0;

CLMS.xiNET.P_PLink.prototype = new CLMS.xiNET.RenderedLink();

CLMS.xiNET.P_PLink.prototype.initSelfLinkSVG = function() {
	var path = this.renderedFromProtein.getAggregateSelfLinkPath();
	this.line.setAttribute('d', path);
	this.highlightLine.setAttribute('d', path);
	this.thickLine.setAttribute('d', path);
};

CLMS.xiNET.P_PLink.prototype.showHighlight = function(show, andAlternatives) {
	if (typeof andAlternatives === 'undefined') {
		andAlternatives = false;
	}
	if (this.shown) {
		if (show) {
			this.highlightLine.setAttribute("stroke", CLMS.xiNET.highlightColour.toRGB());
			this.highlightLine.setAttribute("stroke-opacity", "1");
		} else {
			this.highlightLine.setAttribute("stroke", CLMS.xiNET.selectedColour.toRGB());
			if (this.isSelected == false) {
				this.highlightLine.setAttribute("stroke-opacity", "0");
			}

		}
	}
	if (andAlternatives && this.ambig) {
		//TODO: we want to highlight smallest possible set of alternatives
		var rc = this.residueLinks.values().length;
		for (var rl = 0; rl < rc; rl++) {
			var resLink = this.residueLinks.values()[rl];
			var mc = resLink.matches.length;
			for (var m = 0; m < mc; m++) {
				var match = resLink.matches[m][0];
				if (match.isAmbig()) {
					var mrc = match.residueLinks.length;
					for (var mrl = 0; mrl < mrc; mrl++) {
						var resLink = match.residueLinks[mrl];
						if (resLink.shown === true) {
							if (resLink.isSelected == false) {
								resLink.showHighlight(show, false);
							}
						}
						if (resLink.proteinLink.shown === true) {
							{
								resLink.proteinLink.showHighlight(show, false);
							}
						}
					}
				}

			}
		}
	}
};

CLMS.xiNET.P_PLink.prototype.setSelected = function(select) {
	if (select === true && this.isSelected === false) {
		this.crosslinkViewer.selectedLinks.set(this.id, this);//ok,
		this.isSelected = true;
		this.highlightLine.setAttribute("stroke", CLMS.xiNET.selectedColour.toRGB());
		this.highlightLine.setAttribute("stroke-opacity", "1");
		this.crosslinkViewer.linkSelectionChanged();
	}
	else if (select === false && this.isSelected === true) {
		this.crosslinkViewer.selectedLinks.remove(this.id);
		this.isSelected = false;
		this.highlightLine.setAttribute("stroke-opacity", "0");
		this.highlightLine.setAttribute("stroke", CLMS.xiNET.highlightColour.toRGB());
		this.crosslinkViewer.linkSelectionChanged();
	}
};



//its an array of match id's its going to return
//~ CLMS.xiNET.P_PLink.prototype.getFilteredMatches = function() {
	//~ var resLinks = this.residueLinks.values();
	//~ var resLinkCount = resLinks.length;
	//~ var filteredMatches = d3.map();
	//~ for (var i = 0; i < resLinkCount; i++) {
		//~ var resLink = resLinks[i];
		//~ var mCount = resLink.matches.length;
		//~ for (var m = 0; m < mCount; m++) {
			//~ var match = resLink.matches[m];
			//~ if (match.meetsFilterCriteria()) {
				//~ filteredMatches.set(match.id);
			//~ }
		//~ }
	//~ }
	//~ return filteredMatches.keys();
//~ };

CLMS.xiNET.P_PLink.prototype.check = function() {
	if (this.renderedFromProtein.isParked || this.renderedToProtein.isParked
			|| this.renderedFromProtein.form == 1 || this.renderedToProtein.form == 1) {
		this.hide();
		return false;
	}
	
	this.ambig = true;
	this.hd = false;
	
	var filteredCrossLinks = new Set();
	var filteredMatches = new Map ();
	
	for (crossLink of this.crossLinks) {
		if (crossLink.filteredMatches.length > 0) {
			filteredCrossLinks.add(crossLink);
		}
		for (match of crossLink.filteredMatches) {
			match = match[0]; // arrrgg
			filteredMatches.set(match.id, match);
			if (match.hd === true) {
				this.hd = true;
			}
			if (match.crossLinks.length === 1) {
				this.ambig = false;
			}
		}
	}
	
	var filteredCrossLinkCount = filteredCrossLinks.size;
	if (filteredCrossLinkCount > 0) {
		this.tooltip = this.id + ', ' + filteredCrossLinkCount + ' unique cross-link';
		if (filteredCrossLinkCount > 1) {
			this.tooltip += 's';
		}
		this.tooltip += ' (' + filteredMatches.keys().length;
		if (filteredMatches.keys().length === 1) {
			this.tooltip += ' match)';
		} else {
			this.tooltip += ' matches)';
		}
		//this.w = filteredResLinkCount * (45 / CLMS.xiNET.P_PLink.maxNoCLMS.xiNET.RenderedCrossLinks);
		//acknowledge following line is a bit strange
		//this.ambig = (this.ambig && (altCLMS.xiNET.P_PLinks.keys().length > 1));
		this.dashedLine(this.ambig);

/*
		if (this.crosslinkViewer.groups.values().length > 1 && this.crosslinkViewer.groups.values().length < 5) {
			var groupCheck = d3.set();
			var matchArray = filteredMatches.values();
			var countFilteredMatches = matchArray.length;
			for (var i=0; i < countFilteredMatches; i++) {
				var match = matchArray[i];
				groupCheck.add(match.group);
			}
			if (groupCheck.values().length == 1){
				var c = this.crosslinkViewer.linkColours(groupCheck.values()[0]);
				//~ //console.log(">"+groupCheck.values()[0] + "\t" + c);
				this.line.setAttribute("stroke", c);
			}
			else  {
				this.line.setAttribute("stroke", "#000000");
			}
			//else this.line.setAttribute("stroke", "purple");//shouldn't happen
		}
		else if (this.selfLink()) {
			if (this.hd) {
				this.line.setAttribute("stroke", xiNET.homodimerLinkColour.toRGB());
				this.line.setAttribute("stroke-width", xiNET.homodimerLinkWidth);
			}
			else {
				this.line.setAttribute("stroke", "black");
				this.line.setAttribute("stroke-width", 1);
			}
		}*/
		this.show();
		return true;
	}
	else {
		this.hide();
		return false;
	}
};

CLMS.xiNET.P_PLink.prototype.dashedLine = function(dash) {
	if (this.crosslinkViewer.unambigLinkFound == true) {
		if (dash){
			if (this.selfLink() === true) {
				this.line.setAttribute("stroke-dasharray", (4) + ", " + (4));
			} else {
				this.line.setAttribute("stroke-dasharray", (4 * this.crosslinkViewer.z) + ", " + (4 * this.crosslinkViewer.z));
			}
		}
		else if (!dash){
			this.line.removeAttribute("stroke-dasharray");
		}
	}
};

CLMS.xiNET.P_PLink.prototype.show = function() {
		if (!this.shown) {
			this.shown = true;
			if (this.renderedFromProtein === this.renderedToProtein) {
				//~ if (CLMS.xiNET.P_PLink.maxNoCrossLinks > 1) {
					//~ this.thickLine.setAttribute("transform", "translate(" +
						//~ this.fromProtein.x + " " + this.fromProtein.y + ")"  // possibly not neccessary
						//~ + " scale(" + (this.crosslinkViewer.z) + ")");
					//~ this.crosslinkViewer.p_pLinksWide.appendChild(this.thickLine);
				//~ }
				this.line.setAttribute("transform", "translate(" + this.renderedFromProtein.x
						+ " " + this.renderedFromProtein.y + ")" + " scale(" + (this.crosslinkViewer.z) + ")");
				this.highlightLine.setAttribute("transform", "translate(" + this.renderedFromProtein.x
						+ " " + this.renderedFromProtein.y + ")" + " scale(" + (this.crosslinkViewer.z) + ")");

				this.crosslinkViewer.highlights.appendChild(this.highlightLine);
				this.crosslinkViewer.p_pLinks.appendChild(this.line);
			}
			else {
				this.line.setAttribute("stroke-width", this.crosslinkViewer.z * 1);
				this.highlightLine.setAttribute("stroke-width", this.crosslinkViewer.z * 10);
				this.setLineCoordinates(this.renderedFromProtein);
				this.setLineCoordinates(this.renderedToProtein);
				//~ if (CLMS.xiNET.P_PLink.maxNoCrossLinks > 1) {
					//~ this.crosslinkViewer.p_pLinksWide.appendChild(this.thickLine);
				//~ }
				this.crosslinkViewer.highlights.appendChild(this.highlightLine);
				this.crosslinkViewer.p_pLinks.appendChild(this.line);
			}
		}
		//~ if (CLMS.xiNET.P_PLink.maxNoCrossLinks > 1) {
			//~ if (this.selfLink()) {
				//~ this.thickLine.setAttribute("stroke-width", this.w);
			//~ } else {
				//~ this.thickLine.setAttribute("stroke-width", this.crosslinkViewer.z * this.w);
			//~ }
		//~ }
};

CLMS.xiNET.P_PLink.prototype.hide = function() {
	if (this.shown) {
		this.shown = false;
		if (this.renderedFromProtein === this.renderedToProtein) {
			//TODO: be more selective about when to show 'thickLine'
			//~ if (CLMS.xiNET.P_PLink.maxNoCLMS.xiNET.RenderedCrossLinks > 1) {
				//~ this.crosslinkViewer.p_pLinksWide.removeChild(this.thickLine);
			//~ }
			this.crosslinkViewer.highlights.removeChild(this.highlightLine);
			this.crosslinkViewer.p_pLinks.removeChild(this.line);
		} else {
			//~ if (CLMS.xiNET.P_PLink.maxNoCLMS.xiNET.RenderedCrossLinks > 1) {
				//~ this.crosslinkViewer.p_pLinksWide.removeChild(this.thickLine);
			//~ }
			this.crosslinkViewer.highlights.removeChild(this.highlightLine);
			this.crosslinkViewer.p_pLinks.removeChild(this.line);
		}
	}
};

CLMS.xiNET.P_PLink.prototype.setLineCoordinates = function(interactor) {
	if (this.renderedFromProtein != this.renderedToProtein){
		if (this.shown) {
			if (this.renderedFromProtein === interactor) {
						this.line.setAttribute("x1", interactor.x);
						this.line.setAttribute("y1", interactor.y);
						this.highlightLine.setAttribute("x1", interactor.x);
						this.highlightLine.setAttribute("y1", interactor.y);
						this.thickLine.setAttribute("x1", interactor.x);
						this.thickLine.setAttribute("y1", interactor.y);
			}
			else if (this.renderedToProtein === interactor) {
						this.line.setAttribute("x2", interactor.x);
						this.line.setAttribute("y2", interactor.y);
						this.highlightLine.setAttribute("x2", interactor.x);
						this.highlightLine.setAttribute("y2", interactor.y);
						this.thickLine.setAttribute("x2", interactor.x);
						this.thickLine.setAttribute("y2", interactor.y);
			}
		}
	}
}

CLMS.xiNET.P_PLink.prototype.getOtherEnd = function(protein) {
	if (this.fromProtein === protein) {
		return this.toProtein;
	}
	else {
		return this.fromProtein;
	}
};