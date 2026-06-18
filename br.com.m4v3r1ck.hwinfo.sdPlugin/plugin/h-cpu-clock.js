/** History tile: CPU clock MHz (privileged helper; n/a without it). */
const { read } = require("./sensors"); const { createHistoryItem } = require("./history");
async function collect(){ const v = read().cpuClockMHz; return v==null ? {value:0,display:"n/a"} : {value:v, display:Math.round(v)+" MHz"}; }
module.exports = createHistoryItem({ intervalMs:2000, title:"CPU Clock", color:"#4CAF50", collect });
