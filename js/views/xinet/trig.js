export function trig(radius, angleDegrees) { //TODO: change theta arg to radians not degrees
    //x = rx + radius * cos(theta) and y = ry + radius * sin(theta)
    const radians = (angleDegrees / 360) * Math.PI * 2;
    return {
        x: (radius * Math.cos(radians)),
        y: (radius * Math.sin(radians))
    };
}

export function rotatePointAboutPoint(p, o, theta) { // todo: change format of p and o to be {x,y}?
    theta = (theta / 360) * Math.PI * 2; //TODO: change theta arg to radians not degrees
    const rx = Math.cos(theta) * (p[0] - o[0]) - Math.sin(theta) * (p[1] - o[1]) + o[0];
    const ry = Math.sin(theta) * (p[0] - o[0]) + Math.cos(theta) * (p[1] - o[1]) + o[1];
    return [rx, ry];
}