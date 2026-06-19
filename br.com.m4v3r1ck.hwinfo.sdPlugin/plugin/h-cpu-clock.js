/** History tile: CPU clock MHz. macOS needs the helper; Windows reads it no-admin. */
const { read } = require("./sensors"); const { createHistoryItem } = require("./history");
async function collect(){
  let v = read().cpuClockMHz;
  if (v == null && process.platform === "win32") v = (await require("./winmetrics").snapshot()).cpuClockMHz || null;
  return v==null ? {value:0,display:"n/a"} : {value:v, display:Math.round(v)+" MHz"};
}
module.exports = createHistoryItem({ intervalMs:2000, title:"CPU Clock", color:"#4CAF50", collect });
