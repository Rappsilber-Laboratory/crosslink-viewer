import d3 from "d3";
import {trig} from "../trig";

export class Interactor {

    constructor(controller) {
        this.controller = controller;
        this.selfLink = null;
        this.parentGroups = new Set();

        this._selected = false;
        this._highlight = false;
    }

    get symbolRadius() {
        return 25;
    }

    mouseDown(evt) {
        this.controller.preventDefaultsAndStopPropagation(evt);
        this.controller.d3cola.stop();
        this.controller.dragElement = this;
        this.controller.dragStart = evt;
        this.controller.mouseMoved = false;
        return false;
    }

    mouseOut() {
        //this.controller.preventDefaultsAndStopPropagation(evt); // isn't stopping mouseOut in controller getting called
        this.controller.model.setHighlightedProteins([]);
        this.controller.model.get("tooltipModel").set("contents", null);
    }

    set highlighted(show) {
        if (show === true && !this._highlight) {
            const d3HighSel = d3.select(this.highlight);
            d3HighSel
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true)
                .attr("stroke-opacity", "1");
        } else if (show === false && this._highlight) {
            const d3HighSel = d3.select(this.highlight);
            if (!this._selected) {
                d3HighSel.attr("stroke-opacity", "0");
            }
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false);
        }
        this._highlight = !!show;
    }

    get highlighted() {
        return this._highlight;
    }

    set selected(select) {
        const d3HighSel = d3.select(this.highlight);
        if (select === true && !this._selected) {
            d3HighSel
                .classed("selectedProtein", true)
                .classed("highlightedProtein", false)
                .attr("stroke-opacity", "1");
        } else if (select === false && this._selected) {
            d3HighSel
                .attr("stroke-opacity", "0")
                .classed("selectedProtein", false)
                .classed("highlightedProtein", true);
        }
        this._selected = !!select;
    }

    get selected() {
        return this._selected;
    }

    getAggregateSelfLinkPath() {
        const intraR = this.symbolRadius + 7;
        const sectorSize = 45;
        const arcStart = trig(intraR, 25 + sectorSize);
        const arcEnd = trig(intraR, -25 + sectorSize);
        const cp1 = trig(intraR, 40 + sectorSize);
        const cp2 = trig(intraR, -40 + sectorSize);
        return "M 0,0 " +
            "Q " + cp1.x + "," + -cp1.y + " " + arcStart.x + "," + -arcStart.y +
            " A " + intraR + " " + intraR + " 0 0 1 " + arcEnd.x + "," + -arcEnd.y +
            " Q " + cp2.x + "," + -cp2.y + " 0,0";
    }

    // update all lines (e.g after a move)
    setAllLinkCoordinates() {
        for (let pl of this.renderedP_PLinks) {
            pl.setLineCoordinates(this);
        }
        for (let rcl of this.renderedCrosslinks) {
            rcl.setLineCoordinates(this);
        }
        // yes... the group-to-group links are updated separately
    }

    showLabel(show) {
        d3.select(this.labelSVG).attr("display", show ? null : "none");
    }

    getRenderedInteractor() {
        // get highest collapsed group
        for (let pg of this.parentGroups.values()) {
            if (!pg.expanded) {
                return pg.getRenderedInteractor();
            }
        }
        return this;
    }

    inCollapsedGroup() {
        // noinspection LoopStatementThatDoesntLoopJS
        for (let pg of this.parentGroups.values()) {
            if (!pg.expanded) {
                return true;
            }
        }
        return false;
    }

    getSubgraph () {
        if (this.subgraph == null) {
            const subgraph = {
                nodes: new Map(),
                links: new Map()
            };
            const thisNode = this.getRenderedInteractor();
            subgraph.nodes.set(thisNode.id, thisNode);
            this.subgraph = this.addConnectedNodes(subgraph);
            thisNode.subgraph = subgraph;
            this.controller.subgraphs.push(subgraph);
        }
        return this.subgraph;
    }
}
