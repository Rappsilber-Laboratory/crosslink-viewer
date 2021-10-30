import "../css/xiNET.css";

import * as d3 from "d3";
import * as _ from "underscore";
import Backbone from "backbone";
import * as cola from "../vendor/cola";


import {svgUtils} from "../../xi3/vendor/svgexp";
import {filterStateToString, makeLegalFileName, searchesToString} from "../../xi3/js/utils";
import {download} from "../../xi3/js/downloads";

import {RenderedProtein} from "./interactor/rendered-protein";
import {RenderedCrosslink} from "./link/rendered-crosslink";
import {Group} from "./interactor/group";
import {P_PLink} from "./link/p_p-link";
import {G_GLink} from "./link/g_g-link";

export class CrosslinkViewer extends Backbone.View {

    constructor(attributes, options) {
        super(_.extend(attributes, {
            events: {
                "click .collapse": "collapseParticipant",
                "click .collapse-group": "collapseParticipant",
                "click .cant-collapse-group": "cantCollapseGroup",
                "click .ungroup": "ungroup"
            }
        }), options);
    }

    initialize() {
        // this.debug = true;
        this.fixedSize = this.model.get("xinetFixedSize");
        const self = this;

        //avoids prob with 'save - web page complete'
        d3.select(this.el).selectAll("*").remove();

        //protein context menu
        const customMenuSel = d3.select(this.el)
            .append("div").classed("custom-menu-margin", true)
            .append("div").classed("custom-menu", true)
            .append("ul");
        customMenuSel.append("li").classed("collapse", true).text("Collapse");
        const scaleButtonsListItemSel = customMenuSel.append("li").text("Scale: ");
        const scaleButtons = scaleButtonsListItemSel.selectAll("ul.custom-menu")
            .data(CrosslinkViewer.barScales)
            .enter()
            .append("div")
            .attr("class", "barScale")
            .append("label");
        scaleButtons.append("span")
            .text(function (d) {
                if (d === 8) return "AA";
                else return d;
            });
        scaleButtons.append("input")
            // .attr ("id", function(d) { return d*100; })
            .attr("class", function (d) {
                return "scaleButton scaleButton_" + (d * 100);
            })
            .attr("name", "scaleButtons")
            .attr("type", "radio")
            .on("change", function (d) {
                self.contextMenuParticipant.setStickScale(d, self.contextMenuPoint);
            });
        const contextMenu = d3.select(".custom-menu-margin").node();
        const contextMenuMouseOut = function (evt) {
            let e = evt.toElement || evt.relatedTarget;
            do {
                if (e === this) return;
                e = e.parentNode;
            } while (e);
            self.contextMenuParticipant = null;
            d3.select(this).style("display", "none");
        };
        contextMenu.onmouseout = contextMenuMouseOut;

        //group context menu
        const groupCustomMenuSel = d3.select(this.el)
            .append("div").classed("group-custom-menu-margin", true)
            .append("div").classed("custom-menu", true)
            .append("ul");
        groupCustomMenuSel.append("li").classed("cant-collapse-group", true).text("Can't Collapse (members overlap)");
        groupCustomMenuSel.append("li").classed("collapse-group", true).text("Collapse");
        groupCustomMenuSel.append("li").classed("ungroup", true).text("Ungroup");
        // groupCustomMenuSel.append("li").classed("ungroupAll", true).text("Clear All Groups");
        const groupContextMenu = d3.select(".group-custom-menu-margin").node();
        groupContextMenu.onmouseout = contextMenuMouseOut;

        //create SVG elemnent
        this.svgElement = d3.select(this.el).append("div").style("height", "100%").append("svg").node(); //document.createElementNS(CrosslinkViewer.svgns, "svg");
        this.svgElement.setAttribute("width", "100%");
        this.svgElement.setAttribute("height", "100%");
        this.svgElement.setAttribute("style", "pointer-events:visible");
        //add listeners

        this.svgElement.onmousedown = function (evt) {
            self.mouseDown(evt);
        };
        this.svgElement.onmousemove = function (evt) {
            self.mouseMove(evt);
        };
        this.svgElement.onmouseup = function (evt) {
            self.mouseUp(evt);
        };
        this.svgElement.onmouseout = function (evt) {
            self.mouseOut(evt);
        };

        this.el.oncontextmenu = function (evt) {
            if (evt.preventDefault) { // necessary for addEventListener, works with traditional
                evt.preventDefault();
            }
            // if (evt.stopPropogation) {
            //     evt.stopPropagation();
            // }
            evt.returnValue = false; // necessary for attachEvent, works with traditional
            return false; // works with traditional, not with attachEvent or addEventListener
        };

        const mouseWheelEvt = (/Firefox/i.test(navigator.userAgent)) ? "DOMMouseScroll" : "mousewheel"; //FF doesn't recognize mousewheel as of FF3.x
        // if (document.attachEvent) { //if IE (and Opera depending on user setting)
        //     this.svgElement.attachEvent("on" + mouseWheelEvt, function (evt) {
        //         self.mouseWheel(evt);
        //     });
        // } else if (document.addEventListener) { //WC3 browsers
        this.svgElement.addEventListener(mouseWheelEvt, function (evt) {
            self.mouseWheel(evt);
        }, false);
        // }

        this.lastMouseUp = new Date().getTime();

        // various SVG groups needed
        this.wrapper = document.createElementNS(CrosslinkViewer.svgns, "g"); //in effect, a hack for fact firefox doesn't support getCTM on svgElement
        const identM = this.svgElement.createSVGMatrix();
        const s = "matrix(" + identM.a + "," + identM.b + "," + identM.c + "," + identM.d + "," + identM.e + "," + identM.f + ")";
        this.wrapper.setAttribute("transform", s);
        this.container = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.container.setAttribute("id", "container");
        this.wrapper.appendChild(this.container);

        this.groupsSVG = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.groupsSVG.setAttribute("id", "groupsSVG");
        this.container.appendChild(this.groupsSVG);

        this.p_pLinksWide = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.p_pLinksWide.setAttribute("id", "p_pLinksWide");
        this.container.appendChild(this.p_pLinksWide);

        this.proteinLower = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.proteinLower.setAttribute("id", "proteinLower");
        this.container.appendChild(this.proteinLower);

        this.highlights = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.highlights.setAttribute("class", "highlights"); //proteins also contain highlight groups
        this.container.appendChild(this.highlights);

        this.res_resLinks = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.res_resLinks.setAttribute("id", "res_resLinks");
        this.container.appendChild(this.res_resLinks);

        this.p_pLinks = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.p_pLinks.setAttribute("id", "p_pLinks");
        this.container.appendChild(this.p_pLinks);

        this.proteinUpper = document.createElementNS(CrosslinkViewer.svgns, "g");
        this.proteinUpper.setAttribute("id", "proteinUpper");
        this.container.appendChild(this.proteinUpper);

        this.svgElement.appendChild(this.wrapper);

        //is a d3 selection unlike those above
        this.selectionRectSel = d3.select(this.svgElement).append("rect")
            .attr("x", 10)
            .attr("y", 10)
            .attr("width", 50)
            .attr("height", 100)
            .attr("stroke", "red")
            .attr("stroke-dasharray", "4,4")
            .attr("stroke-dashoffset", "32")
            .style("animation", "dash 2s linear infinite")
            .attr("fill", "none")
            .attr("display", "none");

        this.d3cola = cola.d3adaptor()
            .groupCompactness(1e-5)
            .avoidOverlaps(true);

        this.dragElement = null;
        this.dragStart = null;

        this.renderedProteins = new Map();
        this.renderedCrosslinks = new Map();
        this.renderedP_PLinks = new Map();
        // all xiNET.Groups in play
        this.groupMap = new Map();
        this.g_gLinks = new Map();
        this.toSelect = []; // used by right click drag
        this.z = 1;
        this.container.setAttribute("transform", "scale(1)");
        this.state = CrosslinkViewer.STATES.MOUSE_UP;

        this.firstRender = true;

        // calculate default bar scale
        let maxSeqLength = 0;
        for (let participant of this.model.get("clmsModel").get("participants").values()) {
            if (participant.is_decoy === false && this.renderedProteins.has(participant.id) === false) {
                const newProt = new RenderedProtein(participant, this);
                this.renderedProteins.set(participant.id, newProt);

                const protSize = participant.size;
                if (protSize > maxSeqLength) {
                    maxSeqLength = protSize;
                }
            }
        }
        const width = this.svgElement.parentNode.clientWidth;
        const defaultPixPerRes = ((width * 0.8) - RenderedProtein.LABELMAXLENGTH) / maxSeqLength;

        // https://stackoverflow.com/questions/12141150/from-list-of-integers-get-number-closest-to-a-given-value/12141511#12141511
        function takeClosest(myList, myNumber) {
            const bisect = d3.bisector(function (d) {
                return d;
            }).left;
            const pos = bisect(myList, myNumber);
            if (pos === 0 || pos === 1) {
                return myList[1]; // don't return smallest scale as default
            }
            if (pos === myList.length) {
                return myList[myList.length - 1];
            }
            return myList[pos - 1];
        }

        this.defaultBarScale = takeClosest(CrosslinkViewer.barScales, defaultPixPerRes);

        const expand = this.renderedProteins.size < 5;
        for (let rp of this.renderedProteins.values()) {
            //to do - should this really be here
            this.proteinLower.appendChild(rp.lowerGroup);
            this.proteinUpper.appendChild(rp.upperGroup);
            if (!rp.stickZoom) {
                rp.stickZoom = this.defaultBarScale;
            }
            rp.scale();
            // rp.width;// cause it to store a constant value for unexpanded width?
            if (expand) {
                rp.toStickNoTransition();
            }
        }

        for (let crosslink of this.model.get("clmsModel").get("crosslinks").values()) {
            if (!crosslink.isDecoyLink() && !crosslink.isLinearLink()) {
                if (!this.renderedCrosslinks.has(crosslink.id)) {
                    const renderedCrossLink = new RenderedCrosslink(crosslink, this);
                    this.renderedCrosslinks.set(crosslink.id, renderedCrossLink);
                    const toId = crosslink.toProtein ? crosslink.toProtein.id : "null";
                    const p_pId = crosslink.fromProtein.id + "-" + toId;
                    let p_pLink = this.renderedP_PLinks.get(p_pId);
                    if (typeof p_pLink == "undefined") {
                        p_pLink = new P_PLink(p_pId, crosslink, this);
                        this.renderedP_PLinks.set(p_pId, p_pLink);
                    }
                    p_pLink.crosslinks.push(crosslink);

                    crosslink.p_pLink = p_pLink;
                }
            }
        }

        this.listenTo(this.model, "filteringDone", this.render);
        this.listenTo(this.model, "hiddenChanged", this.hiddenProteinsChanged);
        this.listenTo(this.model, "change:groups", this.groupsChanged);

        this.listenTo(this.model, "change:highlights", this.highlightedLinksChanged);
        this.listenTo(this.model, "change:selection", this.selectedLinksChanged);

        this.listenTo(this.model, "change:linkColourAssignment currentColourModelChanged", this.render);
        this.listenTo(this.model, "change:proteinColourAssignment currentProteinColourModelChanged", this.proteinMetadataUpdated);

        this.listenTo(this.model.get("annotationTypes"), "change:shown", this.setAnnotations);
        this.listenTo(this.model.get("alignColl"), "bulkAlignChange", this.setAnnotations);
        this.listenTo(this.model, "change:selectedProteins", this.selectedProteinsChanged);
        this.listenTo(this.model, "change:highlightedProteins", this.highlightedProteinsChanged);

        this.listenTo(window.vent, "proteinMetadataUpdated", this.proteinMetadataUpdated);

        this.listenTo(window.vent, "xinetSvgDownload", this.downloadSVG);
        this.listenTo(window.vent, "xinetAutoLayout", this.autoLayout);
        this.listenTo(window.vent, "xinetLoadLayout", this.loadLayout);
        this.listenTo(window.vent, "xinetSaveLayout", this.saveLayout);

        this.listenTo(window.vent, "collapseGroups", this.collapseGroups);
        this.listenTo(window.vent, "expandGroups", this.expandGroups);

        this.listenTo(this.model, "change:xinetShowLabels", this.showLabels);
        this.listenTo(this.model, "change:xinetShowExpandedGroupLabels", this.showExpandedGroupLabels);
        this.listenTo(this.model, "change:xinetFixedSize", this.setFixedSize);
        this.listenTo(this.model, "change:xinetThickLinks", this.render);
        this.listenTo(this.model, "change:xinetPpiSteps", this.render);

        return this;
    }

    groupsChanged() {
        console.log("xiNET GROUPS CHANGED");
        this.d3cola.stop();

        // a Map with group id as key and Set of protein ids to group as value
        const modelGroups = this.model.get("groups");

        //clear out old groups -- https://stackoverflow.com/questions/9882284/looping-through-array-and-removing-items-without-breaking-for-loop
        const groupIdsToremove = [];
        for (let group of this.groupMap.values()) {
            if (!modelGroups.has(group.id)) {
                groupIdsToremove.push(group.id);

                group.parentGroups = new Set();//[]; //don't think necessary but just in case
                group.subroups = [];
                for (let rp of group.renderedParticipants) {
                    rp.parentGroups.delete(group);
                }

                if (group.expanded) {
                    this.groupsSVG.removeChild(group.upperGroup);
                } else {
                    this.proteinUpper.removeChild(group.upperGroup);
                }
            }
        }
        for (let rgId of groupIdsToremove) {
            this.groupMap.delete(rgId);
        }

        //init
        for (let g of modelGroups.entries()) {
            if (!this.groupMap.has(g[0])) {
                const group = new Group(g[0], g[1], this);
                group.init(); // z ordering... later (todo), so is by count of visible participants
                this.groupMap.set(group.id, group);
            }
        }
        this.scale();//just to update groups selection highlights
        this.hiddenProteinsChanged();
        this.render();
    }

    // handle changes to manually hidden proteins,
    // but also deal with stuff to do with groups / group hierarchy
    // specifically subgroups could change as result of things being hidden so this is here
    // (i.e overlapping group becomes subgroup)
    hiddenProteinsChanged() {
        console.log("xiNET HIDDEN PROTEINS CHANGED");
        this.d3cola.stop();

        // parent groups may change, so clear
        for (let g of this.groupMap.values()) {
            g.subgroups = []; // subgroups as xiNET.Groups
            g.parentGroups = new Set();
            g.leaves = []; // different from g.renderedParticipants coz only contains ungrouped RenderedProteins, used by cola.js
            g.groups = []; // indexes of subgroups in resulting groupArr, used by cola.js // needed? prob not coz groups already refered to by index

            for (let rp of g.renderedParticipants) {
                rp.parentGroups.delete(g); // sometimes it won't have contained g as parentGroup
            }
        }

        //sort it by count not hidden (not manually hidden and not filtered)
        const sortedGroupMap = new Map([...this.groupMap.entries()].sort((a, b) => a[1].unhiddenParticipantCount() - b[1].unhiddenParticipantCount()));

        // get maximal set of possible subgroups
        const groups = Array.from(sortedGroupMap.values());
        const gCount = groups.length; // contains xiNET.Groups
        for (let gi = 0; gi < gCount - 1; gi++) {
            const group1 = groups[gi];
            if (group1.unhiddenParticipantCount() > 0) {
                for (let gj = gi + 1; gj < gCount; gj++) {
                    const group2 = groups[gj];
                    if (group1.isSubsetOf(group2)) {
                        group2.subgroups.push(group1);
                        console.log(group1.name, "is SUBSET of", group2.name);
                    }
                }
            }
        }

        //remove obselete subgroups
        for (let gi = 0; gi < gCount; gi++) {
            const group1 = groups[gi];
            //if subgroup has parent also in group1.subgroups then remove it
            const subgroupCount = group1.subgroups.length;
            const subgroupsToRemove = [];
            for (let gj = 0; gj < subgroupCount - 1; gj++) {
                const subgroup1 = group1.subgroups[gj];
                for (let gk = gj + 1; gk < subgroupCount; gk++) {
                    const subgroup2 = group1.subgroups[gk];
                    if (subgroup1.isSubsetOf(subgroup2)) {
                        subgroupsToRemove.push(subgroup2);
                    }
                }
            }
            for (let sgToremove of subgroupsToRemove) {
                const index = group1.subgroups.indexOf(sgToremove);
                group1.subgroups = group1.subgroups.splice(index, 1);
            }
        }

        for (let g of groups) {
            g.leaves = []; // clear this, its used by cola, gets filled by auto
            for (let rp of g.renderedParticipants) {
                let inSubGroup = false;
                for (let subgroup of g.subgroups) {
                    if (subgroup.contains(rp)) {
                        inSubGroup = true;
                        break;
                    }
                }
                if (!inSubGroup) {
                    rp.parentGroups.add(g);
                }
            }
        }

        //sort out parentGroups
        for (let group1 of groups.reverse()) {
            if (group1.upperGroup.parentNode) {
                const pn = group1.upperGroup.parentNode;
                pn.removeChild(group1.upperGroup);
                pn.appendChild(group1.upperGroup);
            }
            for (let group2 of group1.subgroups) {
                group2.parentGroups.add(group1);
            }
        }

        let manuallyHidden = 0;
        for (let renderedParticipant of this.renderedProteins.values()) {
            if (renderedParticipant.participant.manuallyHidden === true) {
                manuallyHidden++;
            }
            if (renderedParticipant.inCollapsedGroup() === false) {
                renderedParticipant.setHidden(renderedParticipant.participant.hidden);
            } else {
                renderedParticipant.setHidden(true);
            }
        }

        if (manuallyHidden === 0) {
            d3.select("#hiddenProteinsMessage").style("display", "none");
        } else {
            const pSel = d3.select("#hiddenProteinsText");
            pSel.text((manuallyHidden > 1) ? (manuallyHidden + " Hidden Proteins") : (manuallyHidden + " Hidden Protein"));
            const messgeSel = d3.select("#hiddenProteinsMessage");
            messgeSel.style("display", "block");
        }


        for (let group of groups) {
            if (!group.expanded && group.isOverlappingGroup()) {
                group.setExpanded(true);
            }
        }
        for (let group of groups) { // todo z-ordering
            let hasVisible = false;
            for (let p of group.renderedParticipants) {
                if (p.participant.hidden === false) {
                    hasVisible = true;
                }
            }
            if (!hasVisible || group.inCollapsedGroup()) {
                group.setHidden(true);
            } else {
                group.setHidden(false);
                if (group.expanded) {
                    group.updateExpandedGroup();
                }
            }
        }
        return this;
    }

    render() {
        console.log("xiNET RENDER");
        this.d3cola.stop();
        if (this.firstRender) { // first render
            this.firstRender = false;
            if (this.model.get("clmsModel").get("xiNETLayout")) {
                this.loadLayout(this.model.get("clmsModel").get("xiNETLayout").layout);
            } else {
                this.autoLayout([]); //layout all
            }
        }

        for (let ppLink of this.renderedP_PLinks.values()) {


            ppLink.hd = false;
            const filteredCrossLinks = new Set();
            const filteredMatches = new Set();
            const altP_PLinks = new Set();
            for (let crosslink of ppLink.crosslinks) {
                if (crosslink.filteredMatches_pp.length > 0) {
                    filteredCrossLinks.add(crosslink.id);
                    for (let m of crosslink.filteredMatches_pp) {
                        const match = m.match; // oh dear, this...
                        filteredMatches.add(match.id);
                        if (match.hd === true) {
                            ppLink.hd = true;
                        }
                        if (match.crosslinks.length > 1) {
                            for (let matchCrossLink of match.crosslinks) {
                                if (!matchCrossLink.isDecoyLink()) {
                                    altP_PLinks.add(matchCrossLink.p_pLink.id);
                                }
                            }
                        }
                    }
                }
            }
            ppLink.filteredMatchCount = filteredMatches.size;
            ppLink.filteredCrossLinkCount = filteredCrossLinks.size;
            ppLink.ambiguous = altP_PLinks.size > 1;

            if (!ppLink.renderedToProtein || // not linear
                //or either end hidden hidden
                ppLink.renderedFromProtein.participant.hidden ||
                ppLink.renderedToProtein.participant.hidden) {
                ppLink.hide();
            } else {
                const fromProtInCollapsedGroup = ppLink.renderedFromProtein.inCollapsedGroup();
                const toProtInCollapsedGroup = ppLink.renderedToProtein.inCollapsedGroup();

                if (// or is self link in collapsed group
                    (ppLink.crosslinks[0].isSelfLink() && fromProtInCollapsedGroup) ||
                    // or either end is expanded to bar and not in collapsed group
                    (ppLink.renderedFromProtein.expanded && !fromProtInCollapsedGroup) ||
                    (ppLink.renderedToProtein.expanded && !toProtInCollapsedGroup) ||
                    (fromProtInCollapsedGroup && toProtInCollapsedGroup)
                ) {
                    ppLink.hide();
                } else {
                    if (ppLink.filteredCrossLinkCount === 0) {
                        ppLink.hide();
                    } else {
                        ppLink.ambiguous = altP_PLinks.size > 1;
                        if (fromProtInCollapsedGroup && toProtInCollapsedGroup) {
                            const source = ppLink.renderedFromProtein.getRenderedParticipant();
                            const target = ppLink.renderedToProtein.getRenderedParticipant();
                            let ggId;
                            if (source.id < target.id) {
                                ggId = source.id + "_" + target.id;
                            } else {
                                ggId = target.id + "_" + source.id;
                            }
                            let ggLink = ppLink.controller.g_gLinks.get(ggId);
                            if (!ggLink) {
                                if (source.id < target.id) {
                                    ggLink = new G_GLink(ggId, source, target, this);
                                } else {
                                    ggLink = new G_GLink(ggId, target, source, this);
                                }
                                this.g_gLinks.set(ggId, ggLink);
                            }
                            ggLink.p_pLinks.set(ppLink.id, ppLink);
                            ppLink.hide();
                        } else {
                            ppLink.show();
                        }
                    }
                }
            }
        }
        for (let cLink of this.renderedCrosslinks.values()) {
            cLink.check();
        }
        const ggLinkIdsToRemove = [];
        for (let ggLink of this.g_gLinks.values()) {
            if (ggLink.group1.expanded === false && ggLink.group2.expanded === false && ggLink.check()
                && this.groupMap.has(ggLink.group1.id) && this.groupMap.has(ggLink.group2.id)
                && !(ggLink.group1.inCollapsedGroup() || ggLink.group2.inCollapsedGroup)) {
                ggLink.show();
                //set line coord?
            } else {
                ggLinkIdsToRemove.push(ggLink.id);
                ggLink.hide();
            }
        }
        for (let id of ggLinkIdsToRemove) {
            this.g_gLinks.delete(id);
        }
    }

    autoLayout(fixedParticipants) {
        console.log("xiNET AUTO LAYOUT");
        this.d3cola.stop();
        if (fixedParticipants.length === 0) {
            this.container.setAttribute("transform", "scale(" + 1 + ")");// translate(" + ((width / scaleFactor) - bbox.width - bbox.x) + " " + -bbox.y + ")");
            this.scale();
        }

        for (let renderedProtein of this.renderedProteins.values()) {
            if (fixedParticipants.length === 0) {
                delete renderedProtein.x;
                delete renderedProtein.y;
                delete renderedProtein.px; // todo - check if this is necessary
                delete renderedProtein.py;
            }
            renderedProtein.fixed = fixedParticipants.indexOf(renderedProtein.participant) !== -1;
            delete renderedProtein.index;
        }
        for (let g of this.groupMap.values()) {
            if (fixedParticipants.length === 0) { // todo - some issues here (select a collpased group and select fixed selected)
                delete g.x;
                delete g.y;
                delete g.px; // todo - check if this is necessary
                delete g.py;
            }
            delete g.index;
            delete g.parent;
            g.leaves = []; // clear this, its used by cola, gets filled by auto
        }

        const linkLength = (this.renderedProteins.size < 20) ? 40 : 20;
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;
        this.d3cola.size([height - 40, width - 40]).symmetricDiffLinkLengths(linkLength);

        const self = this;

        // function makeLinks(){
        const links = new Map();
        const nodeSet = new Set();
        for (let crosslink of self.model.getFilteredCrossLinks()) {
            if (crosslink.toProtein) { //?
                const source = self.renderedProteins.get(crosslink.fromProtein.id).getRenderedParticipant();
                const target = self.renderedProteins.get(crosslink.toProtein.id).getRenderedParticipant();
                nodeSet.add(source);
                const fromId = crosslink.fromProtein.id;
                const toId = crosslink.toProtein.id;
                const linkId = fromId + "-" + toId;
                if (!links.has(linkId)) {
                    const linkObj = {};
                    // todo - maybe do use indexes, might avoid probs in cola
                    linkObj.source = source;
                    linkObj.target = target;
                    nodeSet.add(target);
                    linkObj.id = linkId;
                    links.set(linkId, linkObj);
                }
            }
        }
        const nodeArr = Array.from(nodeSet);
        const linkArr = Array.from(links.values());
        //     return {nodeArr, linkArr};
        // }
        //
        // const {nodeArr, linkArr} = makeLinks();
        // doLayout(nodeArr, linkArr, true); // run it first without the groups, this had beneficial effects for layout in complexviewer
        doLayout(nodeArr, linkArr, false);

        function doLayout(nodes, links, preRun) {
            //don't know how necessary these deletions are
            delete self.d3cola._lastStress;
            delete self.d3cola._alpha;
            delete self.d3cola._descent;
            delete self.d3cola._rootGroup;

            // self.d3cola.nodes(nodes).links(links);


            //
            // if (preRun) {
            //     self.d3cola.groups([]).start(23, 10, 0, 0, false);
            // } else {
            const groups = [];
            if (self.groupMap) {
                for (let g of self.groupMap.values()) {
                    // delete g.index;
                    if (!g.hidden && g.expanded) {
                        g.groups = [];
                        // put any rp not contained in a subgroup(recursive) in group1.leaves

                        for (let rp of g.renderedParticipants) {
                            if (!rp.hidden) {
                                let inSubGroup = false;
                                for (let subgroup of g.subgroups) {
                                    // UR HERE
                                    if (subgroup.contains(rp)) {
                                        inSubGroup = true;
                                        // break; ?
                                    }
                                }
                                if (!inSubGroup) {
                                    g.leaves.push(nodeArr.indexOf(rp)); /// URHERE - MOVE UP? **** leaves ends up with way to many things in
                                }
                            }
                        }
                        groups.push(g);
                    }
                }
                //need to use indexes of groups
                for (let g of groups) {
                    for (let i = 0; i < g.subgroups.length; i++) {
                        if (g.subgroups[i].expanded) {
                            g.groups[i] = groups.indexOf(g.subgroups[i]);
                        } else {
                            g.leaves.push(g.subgroups[i]);
                        }
                    }
                }
            }
            let participantDebugSel, groupDebugSel;
            if (self.debug) {
                participantDebugSel = d3.select(this.groupsSVG).selectAll(".node")
                    .data(nodeArr);
                participantDebugSel.enter().append("rect")
                    .classed("node", true)
                    .attr({
                        rx: 5,
                        ry: 5
                    })
                    .style("stroke", "red")
                    .style("fill", "none");
                groupDebugSel = d3.select(this.groupsSVG).selectAll(".group")
                    .data(groups);
                groupDebugSel.enter().append("rect")
                    .classed("group", true)
                    .attr({
                        rx: 5,
                        ry: 5
                    })
                    .style("stroke", "blue")
                    .style("fill", "none");
                groupDebugSel.exit().remove();
                participantDebugSel.exit().remove();
            }
            self.d3cola.nodes(nodes).groups(groups).links(links).start(23, 10, 1, 0, true).on("tick", function () { //.start(23, 10, 1, 0, true)
                for (let node of self.d3cola.nodes()) {
                    node.setPositionFromCola(node.x, node.y);
                    node.setAllLinkCoordinates();
                }
                for (let g of self.d3cola.groups()) { // todo -  seems a bit of a weird way to have done this?
                    if (g.expanded) {
                        g.updateExpandedGroup();
                    }
                }
                if (fixedParticipants.length === 0) {
                    self.zoomToFullExtent();
                }

                if (self.debug) {
                    groupDebugSel.attr({
                        x: function (d) {
                            return d.bounds.x;
                        },
                        y: function (d) {
                            return d.bounds.y;
                        },
                        width: function (d) {
                            return d.bounds.width();
                        },
                        height: function (d) {
                            return d.bounds.height();
                        }
                    });
                    participantDebugSel.attr({
                        x: function (d) {
                            return d.bounds.x;
                        },
                        y: function (d) {
                            return d.bounds.y;
                        },
                        width: function (d) {
                            return d.bounds.width();
                        },
                        height: function (d) {
                            return d.bounds.height();
                        }
                    });
                }
            });
            //}
        }
    }

    saveLayout(callback) {
        const layout = {};
        layout.groups = Array.from(this.groupMap.values());
        layout.proteins = Array.from(this.renderedProteins.values());
        const myJSONText = JSON.stringify(layout, null);
        console.log("SAVING", layout);
        callback(myJSONText.replace(/\\u0000/gi, ""));
    }

    //todo - this is becoming about config of all xiVIEw not just config of xiNET, should be moved
    loadLayout(layout) {
        console.log("xiNET LOAD LAYOUT", layout);
        let proteinPositions, groups;
        // for backwards compatibility (after groups added to layout)
        if (layout.proteins) {
            proteinPositions = layout.proteins;
            groups = layout.groups;
        } else {
            proteinPositions = layout;
        }
        let layoutIsDodgy = false;
        let namesChanged = false;
        for (let protLayout of proteinPositions) {
            const protein = this.renderedProteins.get(protLayout.id);
            if (protein !== undefined) {
                protein.setPositionFromXinet(protLayout["x"], protLayout["y"]);
                if (typeof protLayout["rot"] !== "undefined") {
                    protein.rotation = protLayout["rot"] - 0;
                }
                protein.ix = protLayout["x"];
                protein.iy = protLayout["y"];
                protein.newForm = protLayout["expanded"];
                if (CrosslinkViewer.barScales.indexOf(+protLayout["stickZoom"]) > -1) {
                    protein.stickZoom = protLayout["stickZoom"];
                }
                protein.rotation = protLayout["rot"] - 0;
                protein.flipped = protLayout["flipped"];
                protein.participant.manuallyHidden = protLayout["manuallyHidden"];

                if (protLayout["name"]) {
                    protein.participant.name = protLayout["name"];
                    namesChanged = true;
                }

            } else {
                layoutIsDodgy = true;
                console.log("! protein in layout but not search:" + protLayout.id);
            }
        }

        for (let rp of this.renderedProteins.values()) {
            rp.setEverything();
        }

        if (groups && typeof groups[Symbol.iterator] === "function") {
            const modelGroupMap = new Map();
            for (const savedGroup of groups) {
                //gonna need to check for proteins now missing from results
                const presentProteins = new Set();
                for (let pId of savedGroup.participantIds) {
                    if (this.renderedProteins.get(pId)) {
                        presentProteins.add(pId);
                    }
                }
                modelGroupMap.set(savedGroup.id, presentProteins);
            }
            this.model.set("groups", modelGroupMap);
            this.model.trigger("change:groups");

            for (const savedGroup of groups) {
                const xiNetGroup = this.groupMap.get(savedGroup.id);
                if (savedGroup.expanded === false) {
                    xiNetGroup.setExpanded(savedGroup.expanded);
                    xiNetGroup.setPositionFromXinet(savedGroup.x, savedGroup.y);
                }
            }
        }

        this.model.get("filterModel").trigger("change", this.model.get("filterModel"));

        this.zoomToFullExtent();

        if (layoutIsDodgy) {
            alert("Looks like something went wrong with the saved layout, if you can't see your proteins click Auto layout");
        }

        if (namesChanged) {
            // vent.trigger("proteinMetadataUpdated", {}); //aint gonna work
            for (let renderedParticipant of this.renderedProteins.values()) {
                renderedParticipant.updateName();
            }
        }
    }

    downloadSVG() {
        const svgArr = [this.svgElement];
        const svgStrings = svgUtils.capture(svgArr);
        let svgXML = svgUtils.makeXMLStr(new XMLSerializer(), svgStrings[0]);
        //bit of a hack
        const bBox = this.svgElement.getBoundingClientRect();
        const width = Math.round(bBox.width);
        const height = Math.round(bBox.height);
        svgXML = svgXML.replace("width=\"100%\"", "width=\"" + width + "px\"");
        svgXML = svgXML.replace("height=\"100%\"", "height=\"" + height + "px\"");
        const fileName = makeLegalFileName(searchesToString() + "--xiNET--" + filterStateToString());
        download(svgXML, "application/svg", fileName + ".svg");
    }

    highlightedLinksChanged() {
        for (let p_pLink of this.renderedP_PLinks.values()) {
            p_pLink.showHighlight(false);
        }
        const highlightedCrossLinks = this.model.getMarkedCrossLinks("highlights");
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (highlightedCrossLinks.indexOf(renderedCrossLink.crosslink) !== -1) {
                if (renderedCrossLink.renderedFromProtein.expanded ||
                    !renderedCrossLink.renderedToProtein || renderedCrossLink.renderedToProtein.expanded) {
                    renderedCrossLink.showHighlight(true);
                } else if (renderedCrossLink.renderedToProtein) {
                    const p_pLink = this.renderedP_PLinks.get(
                        renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
                    p_pLink.showHighlight(true);
                }
            } else {
                renderedCrossLink.showHighlight(false);
            }
        }
        for (let gg of this.g_gLinks.values()) {
            gg.checkHighlight();
        }
        return this;
    }

    selectedLinksChanged() {
        for (let p_pLink of this.renderedP_PLinks.values()) {
            p_pLink.setSelected(false);
        }
        const selectedCrossLinks = this.model.getMarkedCrossLinks("selection");
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (selectedCrossLinks.indexOf(renderedCrossLink.crosslink) !== -1) {
                renderedCrossLink.setSelected(true);
                if (renderedCrossLink.renderedToProtein) {
                    const p_pLink = this.renderedP_PLinks.get(
                        renderedCrossLink.renderedFromProtein.participant.id + "-" + renderedCrossLink.renderedToProtein.participant.id);
                    p_pLink.setSelected(true);
                }
            } else {
                renderedCrossLink.setSelected(false);
            }
        }
        for (let gg of this.g_gLinks.values()) {
            gg.checkSelected();
        }
        return this;
    }

    selectedProteinsChanged() {
        const selectedProteins = this.model.get("selectedProteins");
        for (let renderedProtein of this.renderedProteins.values()) {
            if (selectedProteins.indexOf(renderedProtein.participant) === -1 && renderedProtein.isSelected === true) {
                renderedProtein.setSelected(false);
            }
        }
        for (let selectedProtein of selectedProteins) {
            if (selectedProtein.is_decoy !== true) {
                const renderedProtein = this.renderedProteins.get(selectedProtein.id);
                if (renderedProtein.isSelected === false) {
                    renderedProtein.setSelected(true);
                }
            }
        }
        if (this.groupMap) {
            for (let g of this.groupMap.values()) {
                g.updateSelected();
            }
        }
        return this;
    }

    highlightedProteinsChanged() {
        const highlightedProteins = this.model.get("highlightedProteins");
        for (let renderedProtein of this.renderedProteins.values()) {
            if (highlightedProteins.indexOf(renderedProtein.participant) === -1 && renderedProtein.isHighlighted === true) {
                renderedProtein.showHighlight(false);
                renderedProtein.isHighlighted = false; // todo - this is a bit wierd
            }
        }
        for (let highlightedProtein of highlightedProteins) {
            if (highlightedProtein.is_decoy !== true) {
                const renderedProtein = this.renderedProteins.get(highlightedProtein.id);
                if (renderedProtein.isHighlighted === false) {
                    renderedProtein.showHighlight(true);
                }
            }
        }
        if (this.groupMap) {
            for (let g of this.groupMap.values()) {
                g.updateHighlight();
            }
        }
        return this;
    }

    // updates protein names and colours
    proteinMetadataUpdated() {
        const proteinColourModel = window.compositeModelInst.get("proteinColourAssignment");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.updateName();
            if (proteinColourModel) {
                d3.select(renderedParticipant.outline)
                    .attr("fill", proteinColourModel.getColour(renderedParticipant.participant));
                d3.select(renderedParticipant.background)
                    .attr("fill", proteinColourModel.getColour(renderedParticipant.participant));
            }
        }
        return this;
    }

    showLabels() {
        const show = this.model.get("xinetShowLabels");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.showLabel(show);
        }
        return this;
    }

    showExpandedGroupLabels() {
        for (let group of this.groupMap.values()) {
            group.setExpanded(group.expanded);
        }
        return this;
    }

    setFixedSize() {
        this.fixedSize = this.model.get("xinetFixedSize");
        for (let renderedParticipant of this.renderedProteins.values()) {
            renderedParticipant.resize();
        }
        return this;
    }

    collapseParticipant() {
        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
        this.contextMenuParticipant.setExpanded(false, this.contextMenuPoint);
        if (this.contextMenuParticipant.type === "group") {
            this.render();
        }
        this.hiddenProteinsChanged();
        this.render();
        this.contextMenuParticipant = null;
    }

    cantCollapseGroup() {
        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
    }

    ungroup() {
        d3.select(".group-custom-menu-margin").style("display", "none");
        this.model.get("groups").delete(this.contextMenuParticipant.id);
        this.model.trigger("change:groups");
        this.contextMenuParticipant = null;
    }

    collapseGroups(){
        for (let group of this.groupMap.values()) {
            if (group.expanded === true && !group.isOverlappingGroup()){
                group.setExpanded(false);
            }
        }
        this.render();
    }

    expandGroups(){
        for (let group of this.groupMap.values()) {
            if (group.expanded === false) {
                group.setExpanded(true);
            }
        }
        this.render();
    }

    zoomToFullExtent() {
        // this.container.setAttribute("transform", "scale(1)");
        const width = this.svgElement.parentNode.clientWidth;
        const height = this.svgElement.parentNode.clientHeight;
        const bbox = this.container.getBBox();
        let xr = (width / bbox.width).toFixed(4);
        let yr = (height / bbox.height).toFixed(4);
        let scaleFactor;
        if (yr < xr) {
            scaleFactor = yr;
        } else {
            scaleFactor = xr;
        }
        // if (scaleFactor > 1) {
        //     scaleFactor = scaleFactor / 0.8;
        // // }
        this.container.setAttribute("transform", "scale(" + scaleFactor + ") translate(" + ((width / scaleFactor) - bbox.width - bbox.x) + " " + -bbox.y + ")");
        this.scale();
    }

    scale() {
        this.z = this.container.getCTM().inverse().a;
        for (let prot of this.renderedProteins.values()) {
            prot.setPositionFromXinet(prot.ix, prot.iy); // this rescales the protein
            if (prot.expanded)
                prot.setAllLinkCoordinates();
        }
        for (let renderedCrossLink of this.renderedCrosslinks.values()) {
            if (renderedCrossLink.shown && renderedCrossLink.crosslink.isSelfLink() === false && renderedCrossLink.crosslink.toProtein) {
                renderedCrossLink.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                renderedCrossLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                if (renderedCrossLink.crosslink.ambiguous === true) {
                    renderedCrossLink.dashedLine(true); //rescale spacing of dashes
                }
            }
        }
        for (let p_pLink of this.renderedP_PLinks.values()) {
            if (p_pLink.renderedToProtein && p_pLink.renderedFromProtein !== p_pLink.renderedToProtein &&
                !p_pLink.renderedFromProtein.expanded && !p_pLink.renderedToProtein.expanded) {
                if (p_pLink.line) {
                    p_pLink.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                    p_pLink.highlightLine.setAttribute("stroke-width", this.z * 10);
                    p_pLink.updateThickLineWidth();
                    if (p_pLink.ambiguous) {
                        p_pLink.dashedLine(true); //rescale spacing of dashes
                    }
                }
            }
        }
        for (let gg of this.g_gLinks.values()) {
            if (gg.group1 !== gg.group2) {
                //     if (p_pLink.line) {
                gg.line.setAttribute("stroke-width", this.z * CrosslinkViewer.linkWidth);
                gg.highlightLine.setAttribute("stroke-width", this.z * 10);
                gg.updateThickLineWidth();
                // if (p_pLink.ambiguous) {
                //     p_pLink.dashedLine(true); //rescale spacing of dashes
                // }
                // }
            }
        }
        for (let g of this.groupMap.values()) {
            if (!g.hidden) {
                g.outline.setAttribute("stroke-width", this.z * 5);
                g.highlight.setAttribute("stroke-width", this.z * 5);
                if (g.expanded) {
                    g.updateExpandedGroup();
                } else {
                    g.setPositionFromXinet(g.ix, g.iy);
                }
                g.updateSelected();
            }
        }
    }

    setAnnotations() {
        for (let renderedProtein of this.renderedProteins.values()) {
            renderedProtein.setPositionalFeatures();
        }
    }

    setCTM(element, matrix) {
        const s = "matrix(" + matrix.a + "," + matrix.b + "," + matrix.c + "," + matrix.d + "," + matrix.e + "," + matrix.f + ")";
        element.setAttribute("transform", s);
    }

    mouseDown(evt) {
        //prevent default, but allow propogation
        evt.preventDefault();
        //stop layout
        this.d3cola.stop();
        this.dragStart = evt;
        this.state = CrosslinkViewer.STATES.SELECT_PAN;
        this.mouseMoved = false;
        this.toSelect = [];
        d3.select(".custom-menu-margin").style("display", "none");
        d3.select(".group-custom-menu-margin").style("display", "none");
    }

    // dragging/rotation/panning/selecting
    mouseMove(evt) {
        if (this.dragStart) {
            const p = this.getEventPoint(evt); // seems to be correct, see below
            const c = p.matrixTransform(this.container.getCTM().inverse());
            const ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
            const dx = ds.x - c.x;
            const dy = ds.y - c.y;
            if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) {
                this.mouseMoved = true;
            }
            if (this.dragElement != null && evt.which !== 3) { //dragging or rotating / not right click mouse down
                //remove tooltip
                this.model.get("tooltipModel").set("contents", null);
                if (this.state === CrosslinkViewer.STATES.DRAGGING) {
                    // we are currently dragging things around
                    let ox, oy, nx, ny;
                    if (this.dragElement.participant) {
                        //its a protein - drag it, or drag all selcted if it is selected
                        let toDrag;
                        if (this.dragElement.isSelected === false) {
                            toDrag = [this.dragElement.participant];
                        } else {
                            toDrag = this.model.get("selectedProteins");
                        }

                        for (let d = 0; d < toDrag.length; d++) {
                            const renderedProtein = this.renderedProteins.get(toDrag[d].id);
                            ox = renderedProtein.ix;
                            oy = renderedProtein.iy;
                            nx = ox - dx;
                            ny = oy - dy;
                            renderedProtein.setPositionFromXinet(nx, ny);
                            renderedProtein.setAllLinkCoordinates();
                        }
                    } else if (this.dragElement.type === "group") {
                        if (this.dragElement.expanded) {
                            const toDrag = this.dragElement.renderedParticipants;
                            for (let d = 0; d < toDrag.length; d++) {
                                const renderedProtein = toDrag[d];
                                ox = renderedProtein.ix;
                                oy = renderedProtein.iy;
                                nx = ox - dx;
                                ny = oy - dy;
                                renderedProtein.setPositionFromXinet(nx, ny);
                                renderedProtein.setAllLinkCoordinates();
                            }
                            for (let g of this.dragElement.subgroups) {
                                if (!g.expanded) {
                                    ox = g.ix;
                                    oy = g.iy;
                                    nx = ox - dx;
                                    ny = oy - dy;
                                    g.setPositionFromXinet(nx, ny);
                                    g.setAllLinkCoordinates();
                                }
                            }
                            this.dragElement.updateExpandedGroup();
                        } else {
                            ox = this.dragElement.ix;
                            oy = this.dragElement.iy;
                            nx = ox - dx;
                            ny = oy - dy;
                            this.dragElement.setPositionFromXinet(nx, ny);
                            this.dragElement.setAllLinkCoordinates();
                        }
                    }
                    this.dragStart = evt;
                } else if (this.state === CrosslinkViewer.STATES.ROTATING) {
                    // Distance from mouse x and center of stick.
                    const _dx = c.x - this.dragElement.ix;
                    // Distance from mouse y and center of stick.
                    const _dy = c.y - this.dragElement.iy;
                    //see http://en.wikipedia.org/wiki/Atan2#Motivation
                    let centreToMouseAngleRads = Math.atan2(_dy, _dx);
                    if (this.whichRotator === 0) {
                        centreToMouseAngleRads = centreToMouseAngleRads + Math.PI;
                    }
                    const centreToMouseAngleDegrees = centreToMouseAngleRads * (360 / (2 * Math.PI));
                    this.dragElement.setRotation(centreToMouseAngleDegrees);
                    this.dragElement.setAllLinkCoordinates();
                } else { //not dragging or rotating yet, maybe we should start
                    // don't start dragging just on a click - we need to move the mouse a bit first
                    if (Math.sqrt(dx * dx + dy * dy) > (5 * this.z)) { //this.mouseMoved?
                        this.state = CrosslinkViewer.STATES.DRAGGING;

                    }
                }
            } else if (this.state === CrosslinkViewer.STATES.SELECT_PAN) {
                if (evt.which === 3) {
                    //SELECT
                    const ds = this.getEventPoint(this.dragStart).matrixTransform(this.wrapper.getCTM().inverse());
                    // var dx = c.x - ds.x;
                    // var dy = c.y - ds.y;

                    const sx = p.x - ds.x;
                    const sy = p.y - ds.y;

                    let rectX = ds.x;
                    if (sx < 0) {
                        rectX += sx;
                    }
                    let rectY = ds.y;
                    if (sy < 0) {
                        rectY += sy;
                    }

                    this.selectionRectSel.attr("display", "inline")
                        .attr("x", rectX)
                        .attr("y", rectY)
                        .attr("width", Math.abs(sx))
                        .attr("height", Math.abs(sy));

                    this.toSelect = [];

                    for (let renderedParticipant of this.renderedProteins.values()) {
                        if (renderedParticipant.hidden !== true) {
                            const svgRect = this.svgElement.createSVGRect();
                            svgRect.x = rectX;
                            svgRect.y = rectY;
                            svgRect.width = Math.abs(sx);
                            svgRect.height = Math.abs(sy);
                            const intersects = this.svgElement.getIntersectionList(svgRect, renderedParticipant.upperGroup);
                            if (intersects.length > 0) {
                                renderedParticipant.showHighlight(true);
                                this.toSelect.push(renderedParticipant.participant);
                            } else {
                                renderedParticipant.showHighlight(false);
                            }
                        }

                    }


                } else {
                    //PAN
                    const ds = this.getEventPoint(this.dragStart).matrixTransform(this.container.getCTM().inverse());
                    const dx = c.x - ds.x;
                    const dy = c.y - ds.y;

                    this.setCTM(this.container,
                        this.container.getCTM()
                            .translate(dx, dy)
                    );
                    this.dragStart = evt;
                }
            }
        }
    }

    // this ends all dragging and rotating
    mouseUp(evt) {
        this.preventDefaultsAndStopPropagation(evt);
        //remove selection rect, may not be shown but just do this now
        this.selectionRectSel.attr("display", "none");
        //eliminate some spurious mouse up events - a simple version of debouncing but it seems to work better than for e.g. _.debounce
        const time = new Date().getTime();
        if ((time - this.lastMouseUp) > 150) {
            const rightClick = (evt.button === 2);
            const add = evt.ctrlKey || evt.shiftKey;
            const p = this.getEventPoint(evt);
            const c = p.matrixTransform(this.container.getCTM().inverse());

            if (this.state === CrosslinkViewer.STATES.ROTATING) {
                //round protein rotation to nearest 5 degrees (looks neater)
                this.dragElement.setRotation(Math.round(this.dragElement.rotation / 5) * 5);
                this.dragElement.setAllLinkCoordinates();

            } else {
                if (this.dragElement) { // issue re selection drag that started on group, in this case drag element is set
                    if (rightClick) {
                        if (this.mouseMoved) { // move and right click
                            // ADD TO SELECT POST RIGHT CLICK DRAG -- RIGHT CLICK, HAS MOVED, NO DRAG ELEMENT
                            this.model.setSelectedProteins(this.toSelect, add);
                        }
                        // EXPANDING / COLLAPSING -- RIGHT CLICK, NO MOVE, IS A DRAG ELEMENT
                        if (this.dragElement.ix || this.dragElement.type === "group") {
                            if (!this.dragElement.expanded) {
                                //expand the collapsed
                                this.dragElement.setExpanded(true, c);
                                if (this.dragElement.type === "group") {
                                    this.hiddenProteinsChanged();
                                    this.render();
                                    /*
                                                                        const fixed = [];
                                                                        for (let rp of this.renderedProteins.values()) {
                                                                            if (this.dragElement.renderedParticipants.indexOf(rp) == -1) {
                                                                                fixed.push(rp.participant)
                                                                            }
                                                                        }
                                                                        this.autoLayout(fixed); //pass in those NOT to autolayout
                                    */
                                }
                            } else {
                                //give context menu that allows collapsing the expanded...
                                this.model.get("tooltipModel").set("contents", null);
                                this.contextMenuParticipant = this.dragElement;
                                this.contextMenuPoint = c;

                                if (this.dragElement.type !== "group") {
                                    //...for proteins
                                    const menu = d3.select(".custom-menu-margin");
                                    menu.style("top", (evt.pageY - 20) + "px").style("left", (evt.pageX - 20) + "px").style("display", "block");
                                    d3.select(".scaleButton_" + (this.dragElement.stickZoom * 100)).property("checked", true);
                                } else {
                                    // for groups

                                    const overlapping = this.dragElement.isOverlappingGroup();
                                    const canny = d3.select(".cant-collapse-group");
                                    canny.style("display", (overlapping ? null : "none"));
                                    d3.select(".collapse-group").style("display", (overlapping ? "none" : null));

                                    const menu = d3.select(".group-custom-menu-margin");
                                    menu.style("top", (evt.pageY - 20) + "px").style("left", (evt.pageX - 20) + "px").style("display", "block");
                                }
                            }
                        }

                    } else if (this.dragElement.participant && !this.mouseMoved) { // its a protein

                        // ADD SINGLE PROTEIN TO SELECTION - LEFT CLICK, NO MOVE, IS A DRAG ELEMENT
                        this.model.setSelectedProteins([this.dragElement.participant], add);

                    } else if (this.dragElement.type === "group" && !this.mouseMoved) { // was left click on a group, no move mouse
                        //add all group proteins to selection
                        const participants = [];
                        for (let rp of this.dragElement.renderedParticipants) {
                            participants.push(rp.participant);
                        }
                        this.model.setSelectedProteins(participants, add);
                    }

                } else { //no drag element
                    if (rightClick) {
                        if (this.mouseMoved) { // move and right click
                            // ADD TO SELECT POST RIGHT CLICK DRAG -- RIGHT CLICK, HAS MOVED, NO DRAG ELEMENT
                            this.model.setSelectedProteins(this.toSelect, add);
                        }
                    } else if (!this.mouseMoved) {

                        //UNSELECT - EITHER MOUSE BUTTON, NO MOVE, NO DRAG ELEMENT
                        this.model.setMarkedCrossLinks("selection", [], false, add);
                        this.model.setSelectedProteins([]);

                    }
                }
            }

            this.dragElement = null;
            this.whichRotator = -1;
            this.state = CrosslinkViewer.STATES.MOUSE_UP;
            this.mouseMoved = false;
        }
        this.lastMouseUp = time;
        return false;
    }

    mouseWheel(evt) {
        this.preventDefaultsAndStopPropagation(evt);
        this.d3cola.stop();
        let delta;
        //see http://stackoverflow.com/questions/5527601/normalizing-mousewheel-speed-across-browsers
        if (evt.wheelDelta) {
            delta = evt.wheelDelta / 3600; // Chrome/Safari
        } else {
            delta = evt.detail / -90; // Mozilla
        }
        const z = 1 + delta;
        const g = this.container;
        const p = this.getEventPoint(evt);
        const c = p.matrixTransform(g.getCTM().inverse());
        const k = this.svgElement.createSVGMatrix().translate(c.x, c.y).scale(z).translate(-c.x, -c.y);
        this.setCTM(g, g.getCTM().multiply(k));
        this.scale();
        return false;
    }

    mouseOut(evt) { //todo
        // don't, causes prob's - RenderedInteractor mouseOut getting propogated?
        // d3.select(".custom-menu-margin").style("display", "none");
        // d3.select(".group-custom-menu-margin").style("display", "none");
    }

    getEventPoint(evt) {
        const p = this.svgElement.createSVGPoint();
        let element = this.svgElement.parentNode;
        let top = 0,
            left = 0;
        do {
            top += element.offsetTop || 0;
            left += element.offsetLeft || 0;
            element = element.offsetParent;
        } while (element);
        p.x = evt.clientX - left; //crossBrowserElementX(evt);//, this.svgElement);
        p.y = evt.clientY - top; //crossBrowserElementY(evt);//, this.svgElement);
        return p;
    }

    //stop event propogation and defaults; only do what we ask
    preventDefaultsAndStopPropagation(evt) {
        if (evt.stopPropagation)
            evt.stopPropagation();
        if (evt.cancelBubble != null)
            evt.cancelBubble = true;
        if (evt.preventDefault)
            evt.preventDefault();
    }
}

CrosslinkViewer.removeDomElement = function (child) {
    if (child && child.parentNode) {
        child.parentNode.removeChild(child);
    }
};

CrosslinkViewer.svgns = "http://www.w3.org/2000/svg"; // namespace for svg elements
CrosslinkViewer.linkWidth = 1.7; // default line width
//static values signifying Controller's status
CrosslinkViewer.STATES = {
    MOUSE_UP: 0,
    SELECT_PAN: 1,
    DRAGGING: 2,
    ROTATING: 3
};

CrosslinkViewer.barScales = [0.01, 0.2, 0.5, 0.8, 1, 2, 4, 8];
