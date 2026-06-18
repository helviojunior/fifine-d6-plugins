/** History tile: CPU package power W (privileged helper; n/a without it). */
const { read } = require("./sensors"); const { createHistoryItem } = require("./history");
async function collect(){ const v = read().cpuPowerW; return v==null ? {value:0,display:"n/a"} : {value:v, display:v.toFixed(0)+" W"}; }
module.exports = createHistoryItem({ intervalMs:2000, title:"CPU PWR", color:"#4CAF50", collect });
