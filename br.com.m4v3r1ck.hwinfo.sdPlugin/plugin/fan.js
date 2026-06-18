/** Gauge item: system fan RPM (privileged helper; n/a without it). Scaled to 6000 rpm. */
const { read } = require("./sensors"); const { createGaugeItem } = require("./gauge");
const MAX = 6000;
async function collect(){
  const rpm = read().fanRpm;
  if (rpm==null) return { value:0, display:"n/a", unit:"", label:"FAN" };
  return { value: Math.min(100, rpm/MAX*100), display:String(Math.round(rpm)), unit:"rpm", label:"FAN" };
}
module.exports = createGaugeItem({ intervalMs:2000, collect });
