import d3 from "d3";
import {Interactor} from "./interactor";
import {CrosslinkViewer} from "../crosslink-viewer-BB";
import {makeTooltipContents, makeTooltipTitle} from "../../../xi3/js/make-tooltip";

export class Group extends Interactor {
    constructor(id, participantIds, xlvController) {
        super();

        this.id = id;
        this.name = id;
        this.controller = xlvController;

        this.renderedParticipants = [];
        for (let pId of participantIds) {
            this.renderedParticipants.push(this.controller.renderedProteins.get(pId));
        }
        this.parentGroups = new Set();
        this.subgroups = [];

        this.expanded = true;
        this.hidden = false;
        this.type = 'group';

        this.padding = 45; // used by cola.js

        this.upperGroup = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.upperGroup.setAttribute("class", "protein upperGroup");

        //make highlight
        this.highlight = document.createElementNS(CrosslinkViewer.svgns, "rect");
        this.highlight.setAttribute("class", "highlightedProtein");
        this.highlight.setAttribute("stroke-width", "3");
        this.highlight.setAttribute("fill", "none");
        this.highlight.setAttribute("stroke-opacity", "0");
        // this.highlight.setAttribute("stroke", "white");

        //create label - we will move this svg element around when expand / collapse
        this.labelSVG = document.createElementNS(CrosslinkViewer.svgns, "text");
        this.labelSVG.setAttribute("fill", "black")
        this.labelSVG.setAttribute("x", "0");
        this.labelSVG.setAttribute("y", "0");
        this.labelSVG.setAttribute("class", "xlv_text proteinLabel");
        // this.labelSVG.setAttribute("alignment-baseline", "central");
        // this.labelSVG.setAttribute("text-anchor", "middle");
        this.labelSVG.setAttribute("text-decoration", "underline");
        this.labelText = this.name;
        this.labelTextNode = document.createTextNode(this.labelText);
        this.labelSVG.appendChild(this.labelTextNode);

        //make blob
        this.outline = document.createElementNS(CrosslinkViewer.svgns, "rect");
        this.outline.setAttribute("stroke", "white");
        this.outline.setAttribute("stroke-width", "3");
        this.outline.setAttribute("stroke-opacity", "1");
        this.outline.setAttribute("fill-opacity", "0.5");
        this.outline.setAttribute("fill", "#cccccc");

        this.upperGroup.appendChild(this.outline);
        this.upperGroup.appendChild(this.highlight);
        this.upperGroup.appendChild(this.labelSVG);

        //need to change this if default is unexpanded
        this.controller.groupsSVG.appendChild(this.upperGroup);

        const self = this;
        //    this.upperGroup.setAttribute('pointer-events','all');
        this.upperGroup.onmousedown = function (evt) {
            self.mouseDown(evt);
        };
        this.upperGroup.onmouseover = function (evt) {
            self.mouseOver(evt);
        };
        this.upperGroup.onmouseout = function (evt) {
            self.mouseOut(evt);
        };

        Object.defineProperty(this, "width", {
            get: function width() {
                return this.upperGroup.getBBox().width + 10;
            }
        });
        Object.defineProperty(this, "height", {
            get: function height() {
                return 60;//this.upperGroup.getBBox().height + 10;
            }
        });
    }


    getBlobRadius() {
        return 25;
    }

//only output the info needed to reproduce the layout, used by save layout function
    toJSON() {
        const participantIds = [];
        for (let rp of this.renderedParticipants) {
            participantIds.push(rp.participant.id);
        }
        return {
            id: this.id,
            x: this.ix,
            y: this.iy,
            expanded: this.expanded,
            participantIds: participantIds
        };
    }

    unhiddenParticipantCount() {
        let count = 0;
        for (let renderedParticipant of this.renderedParticipants) {
            if (!renderedParticipant.participant.hidden) {
                count++;
            }
        }
        return count;
    }

// result depends on whats hidden
    isSubsetOf (anotherGroup) {
        for (let renderedParticipant of this.renderedParticipants) {
            if (!renderedParticipant.participant.hidden && anotherGroup.renderedParticipants.indexOf(renderedParticipant) === -1) {
                return false;
            }
        }
        return true;
    }

    contains(renderedProtein) {
        for (let rp of this.renderedParticipants) {
            if (rp === renderedProtein) {
                return true;
            }
        }
        return false;
    }

    containsInSubgroup(renderedProtein) {
        for (let subgroup of this.subgroups) {
            if (subgroup.contains(renderedProtein)) {
                return true;
            }
        }
        return false;
    }

    isOverlappingGroup() {
        for (let renderedParticipant of this.renderedParticipants) {
            if (!renderedParticipant.participant.hidden && renderedParticipant.parentGroups.size > 1) {
                return true;
            }
        }
        return false;
    }

    init() {
        this.controller.groupsSVG.appendChild(this.upperGroup);
        this.setExpanded(this.expanded);
    }

    mouseDown(evt) {
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.dragStart = evt;
        this.controller.mouseMoved = false;
        return false;
    }

    mouseOver(evt) {
        this.showHighlight(true);
        const toHighlight = [];
        for (let rp of this.renderedParticipants) {
            toHighlight.push(rp.participant);
        }
        this.controller.model.setHighlightedProteins(toHighlight);
        const p = this.controller.getEventPoint(evt);
        this.controller.model.get("tooltipModel")
            .set("header", makeTooltipTitle.complex(this))
            .set("contents", makeTooltipContents.complex(this))
            .set("location", {
                pageX: p.x,
                pageY: p.y
            });
    }

    mouseOut(evt) {
        this.showHighlight(false);
        Interactor.prototype.mouseOut.call(this, evt);
    }

    getAverageParticipantPosition() {
        let xSum = 0,
            ySum = 0;
        const rpCount = this.renderedParticipants.length;
        for (let rp of this.renderedParticipants) {
            xSum += rp.ix;
            ySum += rp.iy;
        }
        return [xSum / rpCount, ySum / rpCount];
    }

    /* leave this.x and this.y as they were set by cola,
        calculate centre of interactor's glyph,
        call setPosition with those
    */
    setPositionFromCola() {
        this.px = this.x;
        this.py = this.y;
        // let xOffset = 0;
        // if (!this.hidden) { // todo - hacky
        //     xOffset = (this.width / 20); // - (this.getBlobRadius()) + 5)
        //     // if (this.expanded) {
        //     //   xOffset = xOffset + (this.participant.size / 2 * this.stickZoom );
        //     // }
        // }
        this.setPosition(this.x /*- xOffset*/, this.y);
    }

    /* calculate top left of interactor's glyph,
    set this.x and this.y as cola would have them,
        call setPosition with same params this received
    */
    setPositionFromXinet(ix, iy) {
        this.px = this.x;
        this.py = this.y;
        let xOffset = 0;
        if (!this.hidden) { // todo - hacky
            xOffset = (this.width / 2); // - (this.getBlobRadius()) + 5)
            // if (this.expanded) {
            //   xOffset = xOffset + (this.participant.size / 2 * this.stickZoom );
            // }
        }
        this.x = ix - xOffset;
        this.y = iy;
        this.setPosition(ix, iy);
    }

//also setting size of collapsed group symbol; scaling line widths, corner radii
    setPosition(ix, iy) { //todo - array for coordinate param?
        if (!this.expanded) {
            this.ix = ix;
            this.iy = iy;
            const symbolWidth = 20;
            const x = this.ix - (symbolWidth * this.controller.z);
            const y = this.iy - (symbolWidth * this.controller.z);
            const scaledWidth = 2 * (symbolWidth * this.controller.z);
            const cornerRadii = 5 * this.controller.z;

            const updateOutline = function (svgElement) {
                svgElement.setAttribute("x", x);
                svgElement.setAttribute("y", y);
                svgElement.setAttribute("width", scaledWidth);
                svgElement.setAttribute("height", scaledWidth);
                svgElement.setAttribute("rx", cornerRadii);
                svgElement.setAttribute("ry", cornerRadii);
            };

            updateOutline(this.outline);
            // this.outline.setAttribute("stroke-width", 3 * this.controller.z);

            updateOutline(this.highlight);
            // this.highlight.setAttribute("stroke-width", 9 * this.controller.z);

            this.labelSVG.setAttribute("transform", "translate(" + this.ix + " " + this.iy + ")" +
                " scale(" + (this.controller.z) + ")");

            for (let group of this.parentGroups) {
                if (group.expanded && !this.hidden) {
                    group.updateExpandedGroup();
                }
            }
            for (let ggLink of this.controller.g_gLinks.values()) {
                ggLink.setLineCoordinates();
            }
            if (this.selfLink != null) {
                if (typeof this.selfLink.thickLine !== 'undefined') {
                    this.selfLink.thickLine.setAttribute("transform", "translate(" + this.ix +
                        " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
                }
                this.selfLink.line.setAttribute("transform", "translate(" + this.ix +
                    " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
                this.selfLink.highlightLine.setAttribute("transform", "translate(" + this.ix +
                    " " + this.iy + ")" + " scale(" + (this.controller.z) + ")");
            }

        } else {
            console.log("error - calling setPosition on unexpanded Group");
        }
    }

    updateExpandedGroup() {
        let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        const z = this.controller.z, pad = 5 * z, self = this;

        for (let rp of this.renderedParticipants) {
            if (!rp.hidden && !this.containsInSubgroup(rp)) {
                const rpBbox = rp.upperGroup.getBBox();
                if (!x1 || (rpBbox.x * z) + rp.ix < x1) {
                    x1 = (rpBbox.x * z) + rp.ix;
                }
                if (!y1 || (rpBbox.y * z) + rp.iy < y1) {
                    y1 = (rpBbox.y * z) + rp.iy;
                }
                if (!x2 || ((rpBbox.x + rpBbox.width) * z) + rp.ix > x2) {
                    x2 = ((rpBbox.x + rpBbox.width) * z) + rp.ix;
                }
                if (!y2 || ((rpBbox.y + rpBbox.height) * z) + rp.iy > y2) {
                    y2 = ((rpBbox.y + rpBbox.height) * z) + rp.iy;
                }
            }
        }

        for (let sg of this.subgroups) {
            // sg.updateExpandedGroup();
            const sgBbox = sg.upperGroup.getBBox();
            if (!x1 || (sgBbox.x) < x1) {
                x1 = (sgBbox.x);
            }
            if (!y1 || (sgBbox.y) < y1) {
                y1 = (sgBbox.y);
            }
            if (!x2 || ((sgBbox.x + sgBbox.width)) > x2) {
                x2 = ((sgBbox.x + sgBbox.width));
            }
            if (!y2 || ((sgBbox.y + sgBbox.height)) > y2) {
                y2 = ((sgBbox.y + sgBbox.height));
            }
        }

        const updateOutline = function (svgElement) {
            svgElement.setAttribute("x", x1 - pad);
            svgElement.setAttribute("y", y1 - pad);
            svgElement.setAttribute("width", x2 - x1 + (2 * pad));
            svgElement.setAttribute("height", y2 - y1 + (2 * pad));
            svgElement.setAttribute("rx", pad);
            svgElement.setAttribute("ry", pad);
        }

        updateOutline(this.outline);
        // this.outline.setAttribute("stroke-width", 3 * this.controller.z);

        updateOutline(this.highlight);
        // this.highlight.setAttribute("stroke-width", 9 * this.controller.z);

        //move label
        this.labelSVG.setAttribute("transform", "translate(" + (x1 - (1 * pad)) + " " + (y1 - (1 * pad)) + ")" +
            " scale(" + (this.controller.z) + ")");

        for (let group of this.parentGroups) {
            if (group.expanded && !this.hidden) {
                group.updateExpandedGroup();
            }
        }
    }

    setHidden(bool) {
        d3.select(this.upperGroup).style("display", bool ? "none" : null);
        d3.select(this.labelSVG).style("display", bool ? "none" : null);
        this.hidden = !!bool;
    }

    updateHighlight() {
        // for (let rp of this.renderedParticipants) {
        //     if (rp.isHighlighted) {
        //         this.dashedOutline(false);
        //         this.showHighlight(true);
        //         return;
        //     }
        // }
        // this.updateSelected();
        // this.showHighlight(false);

        let someHighlighted = false, allHighlighted = true;
        for (let rp of this.renderedParticipants) {
            if (rp.isHighlighted) {
                someHighlighted = true;
            } else {
                allHighlighted = false;
            }
        }
        if (someHighlighted) {
            if (!allHighlighted) {
                this.dashedOutline(true);
            } else {
                this.dashedOutline(false);
            }
            this.showHighlight(true);
        } else {
            this.dashedOutline(false);
            this.showHighlight(false);
            this.updateSelected();
        }
    }

    updateSelected() {
        let someSelected = false, allSelected = true;
        for (let rp of this.renderedParticipants) {
            if (rp.isSelected) {
                someSelected = true;
            } else {
                allSelected = false;
            }
        }
        if (someSelected) {
            if (!allSelected) {
                this.dashedOutline(true);
            }
            this.setSelected(true);
        } else {
            this.dashedOutline(false);
            this.setSelected(false);
        }
    }

    /*
    xiNET.Group.prototype.showHighlight = function (show) {
        const d3HighSel = d3.select(this.highlight);
        if (show === true) {
            d3HighSel
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true)
                .attr("stroke-opacity", "1");
        } else {
            if (!this.isSelected) {
                d3HighSel.attr("stroke-opacity", "0");
            }
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false);
        }
        this.isHighlighted = !!show; // mjg apr 18
    };

    xiNET.Group.prototype.setSelected = function (select) {
        const d3HighSel = d3.select(this.highlight);
        if (select === true) {
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false)
                .attr("stroke-opacity", "1");
        } else {
            d3HighSel
                .attr("stroke-opacity", "0")
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true);
        }
        this.isSelected = !!select;
    };
    */

    dashedOutline (dash) {
        if (dash) {
            this.highlight.setAttribute("stroke-dasharray", (4 * this.controller.z) + ", " + (4 * this.controller.z));
        } else {
            this.highlight.removeAttribute("stroke-dasharray");
        }
    }

    setExpanded (expanded) {
        this.expanded = !!expanded;
        const expandedGroupLabels = this.controller.model.get("xinetShowExpandedGroupLabels"); // todo - will need to look at this again (for anim)
        if (!expanded) { // is collapsing
            this.labelSVG.setAttribute("dominant-baseline", "central");
            this.labelSVG.setAttribute("text-anchor", "middle");

            this.hideSubgroups();

            this.controller.proteinUpper.appendChild(this.upperGroup);
            if (!expandedGroupLabels) {
                this.upperGroup.appendChild(this.labelSVG);
            }

            this.outline.setAttribute("fill-opacity", "1");

            const pPos = this.getAverageParticipantPosition(); // todo - use svgP?
            this.setPositionFromXinet(pPos[0], pPos[1]);
            for (let rp of this.renderedParticipants) {
                 // rp.setPositionFromXinet(pPos[0], pPos[1]);
                 rp.setAllLinkCoordinates();
                 rp.setHidden(true);
                 //rp.checkLinks();
             }

        } else { // is expanding
            this.labelSVG.setAttribute("dominant-baseline", null);
            this.labelSVG.setAttribute("text-anchor", null);

            this.showSubgroups();

            this.controller.groupsSVG.appendChild(this.upperGroup);
            if (!expandedGroupLabels) {
                if (this.upperGroup.contains(this.labelSVG)) {
                    this.upperGroup.removeChild(this.labelSVG);
                }
            } else { // this is a mess? todo
                this.upperGroup.appendChild(this.labelSVG);
            }

            this.outline.setAttribute("fill-opacity", "0.5");

            for (let rp of this.renderedParticipants) {
                rp.setAllLinkCoordinates();
                rp.setHidden(rp.participant.hidden || rp.inCollapsedGroup());
                //rp.checkLinks();
            }

            this.updateExpandedGroup();
        }

    }

    hideSubgroups() {
        for (let subgroup of this.subgroups) {
            subgroup.hideSubgroups();
            // if (subgroup.upperGroup.parentNode) {
            //      subgroup.upperGroup.parentNode.removeChild(subgroup.upperGroup);
            // }
            subgroup.setHidden(true);
        }
    }

    showSubgroups() {
        for (let subgroup of this.subgroups) {
            // subgroup.setExpanded(subgroup.expanded);
            subgroup.setHidden(false);
            subgroup.showSubgroups();
        }
    }

// update all lines (e.g after a move)
    setAllLinkCoordinates() {
        for (let rp of this.renderedParticipants) {
            rp.setAllLinkCoordinates();
        }
    }
}