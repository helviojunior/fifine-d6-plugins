/** History tile: CPU die temperature °C (privileged helper; n/a without it). */
const { read } = require("./sensors"); const { createHistoryItem } = require("./history");
async function collect(){ const v = read().cpuTempC; return v==null ? {value:0,display:"n/a"} : {value:v, display:v.toFixed(0)+" °C"}; }
module.exports = createHistoryItem({ intervalMs:2000, title:"CPU Temp", color:"#4CAF50", collect });
