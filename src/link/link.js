export class Link {

    constructor(crosslinkViewer) {
        this.controller = crosslinkViewer;
        this.shown = false; //used to avoid some unnecessary manipulation of DOM
        this.isSelected = false;
    }

    mouseOut () {
        this.controller.model.setMarkedCrossLinks("highlights", []); // which pokes highlighted matches into changing too
        this.controller.model.get("tooltipModel").set("contents", null);
    }

    dashedLine(dash) {
        if (this.shown) {
            if (dash) {
                if (this.renderedFromProtein === this.renderedToProtein) {
                    this.line.setAttribute("stroke-dasharray", (4) + ", " + (4));
                } else {
                    this.line.setAttribute("stroke-dasharray", (4 * this.controller.z) + ", " + (4 * this.controller.z));
                }
            } else {
                this.line.removeAttribute("stroke-dasharray");
            }
        }
    }
}
