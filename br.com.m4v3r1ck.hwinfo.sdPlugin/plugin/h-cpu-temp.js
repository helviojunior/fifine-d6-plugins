/** History tile: CPU die temperature °C. Helper preferred; Windows falls back to ACPI. */
const { read } = require("./sensors"); const { createHistoryItem } = require("./history");
async function collect(){
  let v = read().cpuTempC;
  if (v == null && process.platform === "win32") v = (await require("./winmetrics").snapshot()).cpuTempC;
  return v==null ? {value:0,display:"n/a"} : {value:v, display:v.toFixed(0)+" °C"};
}
module.exports = createHistoryItem({ intervalMs:2000, title:"CPU Temp", color:"#4CAF50", collect });
